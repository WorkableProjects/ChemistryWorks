// Payload building and dual submission (Apps Script + Netlify Forms) with an offline outbox.
// submitResults / flushOutbox never throw.
import { netlifyFormsEnabled } from '../config.js';
import { load, save } from './storage.js';

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
    started_at: start.toISOString(),
    submitted_at: end.toISOString(),
    duration_seconds: Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000)),
    flags: {
      // Accept camelCase (runner) or snake_case (payload) flag names.
      tab_switches: Number(f.tab_switches ?? f.tabSwitches) || 0,
      auto_submitted: Boolean(f.auto_submitted ?? f.autoSubmitted),
      mode: f.mode === 'scroll' ? 'scroll' : 'focus',
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
    responses_json: JSON.stringify(payload.responses ?? []),
    flags_json: JSON.stringify(payload.flags ?? {}),
    submitted_at: String(payload.submitted_at ?? ''),
  };
}

async function sendGas(payload, config, fetchImpl) {
  if (!config?.GAS_WEB_APP_URL) return 'skipped';
  try {
    await fetchImpl(config.GAS_WEB_APP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    return 'sent';
  } catch {
    return 'failed';
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

async function sendAll(payload, config, fetchImpl, hostname) {
  const [gas, netlify] = await Promise.all([
    sendGas(payload, config, fetchImpl),
    sendNetlify(payload, config, fetchImpl, hostname),
  ]);
  return { gas, netlify };
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

export async function submitResults(payload, { config, fetchImpl, hostname } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const host = hostname ?? (typeof location !== 'undefined' ? location.hostname : '');
  let result = { gas: 'failed', netlify: 'failed' };
  try {
    if (!doFetch) throw new Error('fetch unavailable');
    result = await sendAll(payload, config, doFetch, host);
  } catch {
    result = { gas: config?.GAS_WEB_APP_URL ? 'failed' : 'skipped', netlify: 'failed' };
  }
  let queued = false;
  try {
    const local = upsert(readList(LOCAL_RESULTS_KEY), payload);
    save(LOCAL_RESULTS_KEY, local.slice(-LOCAL_RESULTS_CAP));
    if (allFailed(result)) {
      save(OUTBOX_KEY, upsert(readList(OUTBOX_KEY), payload));
      queued = true;
    }
  } catch {
    /* storage problems must not break submission */
  }
  return { ...result, queued };
}

export async function flushOutbox({ config, fetchImpl, hostname } = {}) {
  let sent = 0;
  try {
    const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!doFetch) return 0;
    const host = hostname ?? (typeof location !== 'undefined' ? location.hostname : '');
    const pending = readList(OUTBOX_KEY);
    const done = new Set();
    for (const payload of pending) {
      try {
        const r = await sendAll(payload, config, doFetch, host);
        if (anySent(r)) {
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
