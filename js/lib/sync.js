// V5-02 progress sync: queues attempt + XP/badge deltas and sends them with `syncProgress`.
// Never blocks the UI and never throws. Throttle: at most one flush per 30 s, plus immediately on a mode switch and on
// `pagehide`. Failures retry with backoff (30 s, 60 s ... 5 min). No backend / demo sign-in / old backend -> state
// 'offline' and nothing is sent. The queue is kept in localStorage (`syncq:<email>`) so it survives a reload.
// Contract: docs/ARCHITECTURE.md -> V5 contracts -> Student home + profile.

import { load, save, remove } from './storage.js';
import { syncProgress } from './api.js';
import { CONFIG } from '../config.js';
import { getUser } from './auth.js';

export const SYNC_INTERVAL = 30000;
export const SYNC_MAX_BACKOFF = 300000;
export const syncQueueKey = (email) => `syncq:${String(email || '').toLowerCase()}`;

/** 'synced' | 'syncing' | 'offline' | 'error' (the sync chip's data-state). */
let state = 'offline';
const listeners = new Set();
const setState = (s) => { if (s !== state) { state = s; listeners.forEach((fn) => { try { fn(s); } catch (e) { console.error(e); } }); } };

const runtime = new Map(); // email -> { lastAt, failures, busy, nextAt }
const timers = new Map();

// Injectable for tests. Reset with configureSync().
const defaults = () => ({
  call: syncProgress,
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t) => clearTimeout(t),
  gasUrl: () => CONFIG.GAS_WEB_APP_URL,
  canSync: (email) => { const u = getUser(); return !!(u && u.provider !== 'demo' && String(u.email || '').toLowerCase() === String(email || '').toLowerCase()); },
});
let deps = defaults();
export function configureSync(overrides = {}) {
  for (const t of timers.values()) deps.clearTimer(t);
  timers.clear(); runtime.clear();
  deps = { ...defaults(), ...overrides };
}

const rt = (email) => { const k = String(email || '').toLowerCase(); if (!runtime.has(k)) runtime.set(k, { lastAt: 0, failures: 0, busy: false, nextAt: 0 }); return runtime.get(k); };

export const getSyncState = () => state;
/** Subscribe to chip state changes. Returns an unsubscribe function. */
export function onSyncState(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const emptyQ = () => ({ attempts: {}, xp: null });
export function readQueue(email) {
  const q = load(syncQueueKey(email), null);
  return q && typeof q === 'object' ? { attempts: q.attempts && typeof q.attempts === 'object' ? q.attempts : {}, xp: q.xp || null } : emptyQ();
}
const writeQueue = (email, q) => {
  if (!Object.keys(q.attempts).length && !q.xp) remove(syncQueueKey(email)); else save(syncQueueKey(email), q);
};
/** True when something is waiting to be sent. */
export const hasPending = (email) => { const q = readQueue(email); return !!(q.xp || Object.keys(q.attempts).length); };

/** Queue the latest state of one attempt: { code, mode, answeredCount, total, answers? }. Latest per code wins. */
export function queueAttempt(email, a, { flush: now = false } = {}) {
  if (!email || !a || !a.code || !deps.canSync(email)) return false;
  const q = readQueue(email);
  q.attempts[a.code] = { code: String(a.code), mode: String(a.mode || 'study'), answeredCount: Number(a.answeredCount) || 0, total: Number(a.total) || 0, ...(a.answers ? { answers: a.answers } : {}) };
  writeQueue(email, q);
  schedule(email, { force: now });
  return true;
}

/** Queue an XP/badge delta: { delta, badges?: [id], streakDays?, lastActiveDate? }. Deltas add up; badges union. */
export function queueXp(email, x, { flush: now = false } = {}) {
  if (!email || !x || !deps.canSync(email)) return false;
  const q = readQueue(email);
  const cur = q.xp || { delta: 0, badges: [] };
  q.xp = {
    delta: Math.max(0, Math.floor(Number(cur.delta) || 0) + Math.max(0, Math.floor(Number(x.delta) || 0))),
    badges: [...new Set([...(cur.badges || []), ...(x.badges || [])])],
    ...(x.streakDays != null ? { streakDays: Number(x.streakDays) || 0 } : cur.streakDays != null ? { streakDays: cur.streakDays } : {}),
    ...(x.lastActiveDate ? { lastActiveDate: String(x.lastActiveDate) } : cur.lastActiveDate ? { lastActiveDate: cur.lastActiveDate } : {}),
  };
  writeQueue(email, q);
  schedule(email, { force: now });
  return true;
}

function schedule(email, { force = false } = {}) {
  const r = rt(email); const k = String(email).toLowerCase();
  if (force) { deps.clearTimer(timers.get(k)); timers.delete(k); flush(email, { force: true }); return; }
  if (timers.has(k)) return;
  const wait = Math.max(0, Math.max(r.lastAt + SYNC_INTERVAL, r.nextAt) - deps.now());
  timers.set(k, deps.setTimer(() => { timers.delete(k); flush(email); }, wait));
}

const backoff = (r) => { r.failures++; r.nextAt = deps.now() + Math.min(SYNC_MAX_BACKOFF, SYNC_INTERVAL * 2 ** (r.failures - 1)); };

function subtractXp(cur, sent) {
  if (!cur) return null;
  const delta = Math.max(0, (Number(cur.delta) || 0) - (Number(sent.delta) || 0));
  const badges = (cur.badges || []).filter((b) => !(sent.badges || []).includes(b));
  return delta || badges.length ? { ...cur, delta, badges } : null;
}

/**
 * Send what is queued. Resolves { sent, state, profile? } and never throws.
 * Without `force` it respects the 30 s throttle and backoff (resolves { sent: 0, throttled: true } and reschedules).
 */
export async function flush(email, { force = false } = {}) {
  const r = rt(email);
  try {
    if (!email || !deps.canSync(email) || !deps.gasUrl()) { setState('offline'); return { sent: 0, state }; }
    if (r.busy) return { sent: 0, busy: true, state };
    const q = readQueue(email);
    const codes = Object.keys(q.attempts);
    if (!codes.length && !q.xp) return { sent: 0, state };
    const t = deps.now();
    if (!force && (t < r.lastAt + SYNC_INTERVAL || t < r.nextAt)) { schedule(email); return { sent: 0, throttled: true, state }; }
    r.busy = true; setState('syncing');
    const jobs = codes.map((c) => ({ attempt: q.attempts[c] }));
    if (q.xp) { if (jobs.length) jobs[0].xp = q.xp; else jobs.push({ xp: q.xp }); }
    let sent = 0; let profile = null;
    for (const job of jobs) {
      const res = await deps.call({ gasUrl: deps.gasUrl(), attempt: job.attempt, xp: job.xp });
      if (!res || !res.ok) {
        r.busy = false; r.lastAt = deps.now();
        if (res && res.unavailable) { r.nextAt = deps.now() + SYNC_MAX_BACKOFF; setState('offline'); } else { backoff(r); setState('error'); }
        schedule(email);
        return { sent, state };
      }
      sent++;
      profile = (res.data && res.data.profile) || profile;
      // Drop only what was sent (a newer queued version of the same attempt stays).
      const cur = readQueue(email);
      if (job.attempt && JSON.stringify(cur.attempts[job.attempt.code]) === JSON.stringify(job.attempt)) delete cur.attempts[job.attempt.code];
      if (job.xp) cur.xp = subtractXp(cur.xp, job.xp);
      writeQueue(email, cur);
    }
    r.busy = false; r.failures = 0; r.nextAt = 0; r.lastAt = deps.now();
    setState('synced');
    if (hasPending(email)) schedule(email);
    return { sent, state, profile };
  } catch (e) {
    r.busy = false; backoff(r);
    setState('error');
    return { sent: 0, state, error: String((e && e.message) || e) };
  }
}

/**
 * Hook an open attempt into sync: saves queue its latest state (throttled), a mode switch flushes now, and `pagehide`
 * flushes best effort (api.js has no beacon transport, so this is a normal fetch). Returns an unsubscribe function.
 * Preview attempts are never synced.
 */
export function attachAttempt(attempt) {
  if (!attempt || attempt.preview || !attempt.email) return () => {};
  const snap = () => ({ code: attempt.test.code, mode: attempt.lastMode, answeredCount: attempt.answeredCount, total: attempt.total });
  const off = attempt.subscribe((ev) => {
    if (ev.type === 'save' || ev.type === 'reset') queueAttempt(attempt.email, snap());
    else if (ev.type === 'mode') queueAttempt(attempt.email, snap(), { flush: true });
  });
  const onHide = () => { if (attempt.state.done) return; queueAttempt(attempt.email, snap()); flush(attempt.email, { force: true }); };
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onHide);
  return () => { off(); if (typeof window !== 'undefined') window.removeEventListener('pagehide', onHide); };
}

/** Flush now for a student (sign-out, tests). */
export const flushNow = (email) => flush(email, { force: true });
