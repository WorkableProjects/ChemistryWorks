// Payload building and submission (Apps Script, plus Netlify Forms until it is removed) with an offline outbox.
// The Apps Script reply is read: success is done, a final error is shown and not queued, anything else stays queued.
// submitResults / flushOutbox never throw.
import { netlifyFormsEnabled } from '../config.js';
import { load, save } from './storage.js';
import { getIdToken, getFreshIdToken } from './auth.js';

export const SUBMIT_TIMEOUT_MS = 15000;

/** Backend errors that will never succeed on a resend: show them, do not queue. */
const FINAL_ERRORS = new Set(['closed', 'not_open', 'not_on_roster', 'single_submission', 'submission_too_large', 'invalid_request', 'invalid_email', 'unauthorized']);
export function isFinalError(code) {
  const c = String(code || '');
  return FINAL_ERRORS.has(c) || c.startsWith('missing_');
}

/** The reply text for a final error. */
export function finalMessage(code) {
  const c = String(code || '');
  if (c === 'closed') return 'This test is closed, so your answers were not accepted.';
  if (c === 'not_open') return 'This test is not open yet, so your answers were not accepted.';
  if (c === 'not_on_roster') return 'You are not on the roster for this test, so your answers were not accepted.';
  if (c === 'single_submission') return 'You have already submitted this test, so this attempt was not accepted.';
  if (c === 'submission_too_large') return 'This submission is too large to send. Tell your teacher.';
  if (c === 'unauthorized') return 'Sign in with your Google account to submit this test.';
  return 'The server did not accept this submission. Tell your teacher.';
}

// The verified ID token rides along at send time only (never stored in the outbox): roster / identity checks.
async function currentToken() {
  try { return getIdToken() || await getFreshIdToken(3000); } catch { return null; }
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
    // v4: per-student instance (seed, drawn pool questions) and the time limit actually applied (accommodations).
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
      // V4-05: { questionId: optionalNote } for questions the student flagged for the teacher (omitted when none).
      ...(cleanFlagNotes(f.questions) ? { questions: cleanFlagNotes(f.questions) } : {}),
    },
  };
}

export function toNetlifyFields(payload) {
  return {
    'form-name': 'chemistryworks-submissions',
    submission_id: String(payload.submission_id ?? ''),
    student_name: String(payload.student_name ?? ''),
    student_email: String(payload.student_email ?? ''),
    test_code: String(payload.test_code ?? ''),
    test_title: String(payload.test_title ?? ''),
    score_achieved: String(payload.score_achieved ?? ''),
    score_total: String(payload.score_total ?? ''),
    percentage: String(payload.percentage ?? ''),
    duration_seconds: String(payload.duration_seconds ?? ''),
    needs_grading: String(!!payload.needs_grading),
    single_submission: String(!!payload.single_submission),
    responses_json: JSON.stringify(payload.responses ?? []),
    flags_json: JSON.stringify(payload.flags ?? {}),
    submitted_at: String(payload.submitted_at ?? ''),
  };
}

function withTimeout(promise, ms, controller) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { try { controller?.abort(); } catch { /* ignore */ } reject(new Error('timeout')); }, ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function postGas(payload, config, fetchImpl, token, timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const res = await withTimeout(fetchImpl(config.GAS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(token ? { ...payload, idToken: token } : payload),
    ...(controller ? { signal: controller.signal } : {}),
  }), timeoutMs, controller);
  if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : 'error'}`);
  return withTimeout(res.json(), timeoutMs);
}

/** -> { state: 'sent' | 'final' | 'failed' | 'skipped', error? }. 'failed' is retryable. */
async function sendGas(payload, config, fetchImpl, timeoutMs = SUBMIT_TIMEOUT_MS) {
  if (!config?.GAS_WEB_APP_URL) return { state: 'skipped' };
  try {
    let token = await currentToken();
    let d = await postGas(payload, config, fetchImpl, token, timeoutMs);
    if (d && d.result === 'error' && d.error === 'invalid_token' && token) {
      // One silent refresh, then resend; still invalid means it waits in the outbox until the student signs in.
      const fresh = await getFreshIdToken(4000).catch(() => null);
      if (fresh && fresh !== token) d = await postGas(payload, config, fetchImpl, fresh, timeoutMs);
    }
    if (d && d.result === 'success') return { state: 'sent' };
    const error = (d && d.error) || 'server_error';
    return isFinalError(error) ? { state: 'final', error } : { state: 'failed', error };
  } catch {
    return { state: 'failed', error: 'network' };
  }
}

async function sendNetlify(payload, config, fetchImpl, hostname) {
  let enabled = false;
  try {
    enabled = netlifyFormsEnabled(config, hostname);
  } catch {
    enabled = false;
  }
  if (!enabled) return 'skipped';
  try {
    const res = await fetchImpl('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(toNetlifyFields(payload)).toString(),
    });
    return res && res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

async function sendAll(payload, config, fetchImpl, hostname, timeoutMs) {
  const [g, netlify] = await Promise.all([
    sendGas(payload, config, fetchImpl, timeoutMs),
    sendNetlify(payload, config, fetchImpl, hostname),
  ]);
  return { gas: g.state, netlify, ...(g.state === 'final' ? { error: g.error } : {}) };
}

function anySent(r) {
  return r.gas === 'sent' || r.netlify === 'sent';
}

function allFailed(r) {
  const used = [r.gas, r.netlify].filter((s) => s !== 'skipped');
  return used.length > 0 && used.every((s) => s === 'failed');
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

export async function submitResults(payload, { config, fetchImpl, hostname, timeoutMs } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const host = hostname ?? (typeof location !== 'undefined' ? location.hostname : '');
  let result = { gas: 'failed', netlify: 'failed' };
  try {
    if (!doFetch) throw new Error('fetch unavailable');
    result = await sendAll(payload, config, doFetch, host, timeoutMs);
  } catch {
    result = { gas: config?.GAS_WEB_APP_URL ? 'failed' : 'skipped', netlify: 'failed' };
  }
  let queued = false;
  try {
    if (result.gas !== 'final') { // a refused submission is not a submission
      const local = upsert(readList(LOCAL_RESULTS_KEY), payload);
      save(LOCAL_RESULTS_KEY, local.slice(-LOCAL_RESULTS_CAP));
    }
    if (allFailed(result)) {
      save(OUTBOX_KEY, upsert(readList(OUTBOX_KEY), payload));
      queued = true;
    }
  } catch {
    /* storage problems must not break submission */
  }
  return { ...result, queued, ...(result.gas === 'final' ? { finalError: result.error } : {}) };
}

/**
 * Resend everything in the outbox with the same submission_id. A success or a final error removes the item; anything
 * else stays queued. -> { sent, final: [{ submission_id, error }] }. Never throws.
 */
export async function flushOutboxResult({ config, fetchImpl, hostname, timeoutMs } = {}) {
  const out = { sent: 0, final: [] };
  try {
    const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!doFetch) return out;
    const host = hostname ?? (typeof location !== 'undefined' ? location.hostname : '');
    const pending = readList(OUTBOX_KEY);
    const done = new Set();
    for (const payload of pending) {
      try {
        const r = await sendAll(payload, config, doFetch, host, timeoutMs);
        if (anySent(r)) {
          done.add(payload.submission_id);
          out.sent++;
        } else if (r.gas === 'final') {
          done.add(payload.submission_id);
          out.final.push({ submission_id: payload.submission_id, error: r.error });
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
  return out;
}

export async function flushOutbox(opts = {}) {
  return (await flushOutboxResult(opts)).sent;
}

export function getOutbox() {
  return readList(OUTBOX_KEY);
}

export function getLocalResults() {
  return readList(LOCAL_RESULTS_KEY);
}

/** V3-02: true when this device already holds a submission (sent or queued) for this email + test code. */
export function hasLocalSubmission(email, code) {
  const e = String(email || '').trim().toLowerCase();
  const c = String(code || '').trim().toUpperCase();
  if (!e || !c) return false;
  const match = (p) => p && String(p.student_email || '').trim().toLowerCase() === e && String(p.test_code || '').trim().toUpperCase() === c;
  return getLocalResults().some(match) || getOutbox().some(match);
}
