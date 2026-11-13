// Payload building and submission to Apps Script with an offline outbox.
// submitResults / flushOutbox never throw.
import { load, save } from './storage.js';
import { getIdToken } from './auth.js';

function withToken(payload) {
  let t = null;
  try { t = getIdToken(); } catch { t = null; }
  return t ? { ...payload, idToken: t } : payload;
}

const OUTBOX_KEY = 'outbox';
const LOCAL_RESULTS_KEY = 'localResults';
const LOCAL_RESULTS_CAP = 500;

function uuid() {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch {
    /* fall through */
  }
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-a${hex().slice(1)}-${hex()}${hex()}${hex()}`;
}

function toDate(v) {
  const d = v instanceof Date ? v : new Date(v ?? Date.now());
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Keep only { id: note } string entries (note trimmed to 200 chars); null when nothing is left. */
export function cleanFlagNotes(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [id, note] of Object.entries(raw)) if (id) out[String(id)] = String(note ?? '').trim().slice(0, 200);
  return Object.keys(out).length ? out : null;
}

export function buildPayload({ test, grade, user, startedAt, submittedAt, flags } = {}) {
  const end = toDate(submittedAt);
  const start = toDate(startedAt ?? end);
  const f = flags || {};
  return {
    submission_id: uuid(),
    student_name: user?.name || '',
    student_email: user?.email || '',
    test_code: test?.code || '',
    test_title: test?.title || '',
    score_achieved: Number(grade?.scoreAchieved) || 0,
    score_total: Number(grade?.scoreTotal) || 0,
    percentage: String(grade?.percentage ?? '0.00'),
    responses: grade?.results || [],
    needs_grading: Number(grade?.pendingCount) > 0,
    single_submission: !!test?.singleSubmission,
    // Per-student instance (seed, drawn pool questions) and the time limit actually applied (accommodations).
    ...(test?.instance ? { instance: { seed: test.instance.seed || '', drawn: Array.isArray(test.instance.drawn) ? test.instance.drawn : [] } } : {}),
    ...(test?.instance && test.instance.timeLimitApplied ? { time_limit_applied: test.instance.timeLimitApplied } : {}),
    started_at: start.toISOString(),
    submitted_at: end.toISOString(),
    duration_seconds: Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000)),
    flags: {
      // Accept camelCase (runner) or snake_case (payload) flag names.
      tab_switches: Number(f.tab_switches ?? f.tabSwitches) || 0,
      auto_submitted: Boolean(f.auto_submitted ?? f.autoSubmitted),
      mode: f.mode === 'scroll' ? 'scroll' : 'focus',
      // { questionId: optionalNote } for questions the student flagged for the teacher (omitted when none).
      ...(cleanFlagNotes(f.questions) ? { questions: cleanFlagNotes(f.questions) } : {}),
    },
  };
}

const SEND_TIMEOUT_MS = 20000;

/** Posts to Apps Script with normal CORS (text/plain avoids a preflight) and reads the reply.
 *  'sent' only when the backend answered success; anything else stays in the outbox. */
async function sendGas(payload, config, fetchImpl) {
  if (!config?.GAS_WEB_APP_URL) return { status: 'skipped' };
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(config.GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      // The verified ID token rides along at send time only (never stored in the outbox).
      body: JSON.stringify(withToken(payload)),
      ...(ctrl ? { signal: ctrl.signal } : {}),
    });
    let reply = null;
    try { reply = await res.json(); } catch { reply = null; }
    if (reply && reply.result === 'success') return { status: 'sent', reply };
    return { status: 'failed', error: reply?.error || (res && res.status ? `http_${res.status}` : 'no_reply') };
  } catch {
    return { status: 'failed', error: 'network' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readList(key) {
  const v = load(key, []);
  return Array.isArray(v) ? v : [];
}

function upsert(list, payload) {
  const i = list.findIndex((p) => p && p.submission_id === payload.submission_id);
  if (i >= 0) list[i] = payload;
  else list.push(payload);
  return list;
}

export async function submitResults(payload, { config, fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  let result = { gas: 'failed' };
  try {
    if (!doFetch) throw new Error('fetch unavailable');
    const r = await sendGas(payload, config, doFetch);
    result = { gas: r.status, ...(r.error ? { error: r.error } : {}), ...(r.reply?.extra_attempt ? { extraAttempt: true } : {}) };
  } catch {
    result = { gas: config?.GAS_WEB_APP_URL ? 'failed' : 'skipped' };
  }
  let queued = false;
  try {
    const local = upsert(readList(LOCAL_RESULTS_KEY), payload);
    save(LOCAL_RESULTS_KEY, local.slice(-LOCAL_RESULTS_CAP));
    if (result.gas === 'failed') {
      save(OUTBOX_KEY, upsert(readList(OUTBOX_KEY), payload));
      queued = true;
    }
  } catch {
    /* storage problems must not break submission */
  }
  return { ...result, queued };
}

export async function flushOutbox({ config, fetchImpl } = {}) {
  let sent = 0;
  try {
    const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!doFetch) return 0;
    const pending = readList(OUTBOX_KEY);
    const done = new Set();
    for (const payload of pending) {
      try {
        const r = await sendGas(payload, config, doFetch);
        if (r.status === 'sent') {
          done.add(payload.submission_id);
          sent++;
        }
      } catch {
        /* keep queued */
      }
    }
    if (done.size) {
      // Re-read so entries queued while we were sending are preserved.
      save(OUTBOX_KEY, readList(OUTBOX_KEY).filter((p) => !done.has(p.submission_id)));
    }
  } catch {
    /* never throw */
  }
  return sent;
}

export function getOutbox() {
  return readList(OUTBOX_KEY);
}

export function getLocalResults() {
  return readList(LOCAL_RESULTS_KEY);
}

/** True when this device already holds a submission (sent or queued) for this email + test code. */
export function hasLocalSubmission(email, code) {
  const e = String(email || '').trim().toLowerCase();
  const c = String(code || '').trim().toUpperCase();
  if (!e || !c) return false;
  const match = (p) => p && String(p.student_email || '').trim().toLowerCase() === e && String(p.test_code || '').trim().toUpperCase() === c;
  return getLocalResults().some(match) || getOutbox().some(match);
}
