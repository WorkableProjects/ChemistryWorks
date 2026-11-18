// Progress sync: queue merge, 30 s throttle, backoff, offline states, pagehide flush.
const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear(),
  };
};
globalThis.localStorage = memory();
globalThis.sessionStorage = memory();
const listeners = {};
globalThis.window = {
  addEventListener: (type, fn) => { (listeners[type] ||= new Set()).add(fn); },
  removeEventListener: (type, fn) => { listeners[type]?.delete(fn); },
};
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const sync = await import('../../js/lib/sync.js');
const { SYNC_INTERVAL, SYNC_MAX_BACKOFF, configureSync, queueAttempt, queueXp, flush, flushNow, readQueue, hasPending, getSyncState, onSyncState, attachAttempt, syncQueueKey } = sync;

const EMAIL = 'Kid@School.org';
let t;
let calls;
let timers;
let reply;
let gas;

const att = (code, extra = {}) => ({ code, mode: 'study', answeredCount: 1, total: 5, ...extra });

beforeEach(() => {
  globalThis.localStorage.clear();
  for (const k of Object.keys(listeners)) listeners[k].clear();
  t = 1_000_000;
  calls = [];
  timers = [];
  reply = () => ({ ok: true, data: { profile: { xp: 10 } } });
  gas = 'https://script.example/exec';
  configureSync({
    call: async (req) => { calls.push(req); return reply(req); },
    now: () => t,
    setTimer: (fn, ms) => { const h = { fn, ms, cleared: false }; timers.push(h); return h; },
    clearTimer: (h) => { if (h) h.cleared = true; },
    gasUrl: () => gas,
    canSync: (email) => String(email).toLowerCase() === EMAIL.toLowerCase(),
  });
});

const pendingTimers = () => timers.filter((h) => !h.cleared);

test('queueAttempt stores the latest state per code in a per-student queue', () => {
  assert.equal(queueAttempt(EMAIL, att('T1', { answeredCount: 1 })), true);
  assert.equal(queueAttempt(EMAIL, att('T1', { answeredCount: 3, answers: { q1: 'a' } })), true);
  assert.equal(queueAttempt(EMAIL, att('T2', { mode: 'classic' })), true);
  const q = readQueue(EMAIL);
  assert.deepEqual(Object.keys(q.attempts).sort(), ['T1', 'T2']);
  assert.equal(q.attempts.T1.answeredCount, 3, 'latest per code wins');
  assert.deepEqual(q.attempts.T1.answers, { q1: 'a' });
  assert.equal(q.attempts.T2.mode, 'classic');
  assert.ok(globalThis.localStorage.getItem(`cw:${syncQueueKey(EMAIL)}`), 'kept in localStorage so it survives a reload');
  assert.equal(syncQueueKey('A@B.org'), 'syncq:a@b.org');
  assert.equal(hasPending(EMAIL), true);
});

test('queueing is refused for nobody, a bad attempt, or a student who cannot sync', () => {
  assert.equal(queueAttempt('', att('T1')), false);
  assert.equal(queueAttempt(EMAIL, null), false);
  assert.equal(queueAttempt(EMAIL, { mode: 'study' }), false);
  assert.equal(queueAttempt('other@school.org', att('T1')), false);
  assert.equal(queueXp('other@school.org', { delta: 5 }), false);
  assert.equal(hasPending(EMAIL), false);
});

test('queueXp adds deltas, unions badges and keeps the latest streak', () => {
  queueXp(EMAIL, { delta: 10, badges: ['first_round'], streakDays: 2, lastActiveDate: '2026-01-01' });
  queueXp(EMAIL, { delta: 15.9, badges: ['first_round', 'perfect_round'] });
  queueXp(EMAIL, { delta: -5 });
  const { xp } = readQueue(EMAIL);
  assert.equal(xp.delta, 25, 'deltas add up, negatives count as zero, fractions drop');
  assert.deepEqual(xp.badges, ['first_round', 'perfect_round']);
  assert.equal(xp.streakDays, 2, 'an earlier streak stays when a later delta has none');
  assert.equal(xp.lastActiveDate, '2026-01-01');
  queueXp(EMAIL, { delta: 0, streakDays: 5, lastActiveDate: '2026-01-02' });
  assert.equal(readQueue(EMAIL).xp.streakDays, 5);
});

test('the first flush sends at once and clears what was sent', async () => {
  queueAttempt(EMAIL, att('T1'));
  queueXp(EMAIL, { delta: 20, badges: ['first_round'] });
  const res = await flush(EMAIL);
  assert.equal(res.state, 'synced');
  assert.equal(res.sent, 1, 'the xp rides along with the first attempt');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].gasUrl, gas);
  assert.equal(calls[0].attempt.code, 'T1');
  assert.deepEqual(calls[0].xp, { delta: 20, badges: ['first_round'] });
  assert.deepEqual(res.profile, { xp: 10 });
  assert.equal(hasPending(EMAIL), false);
  assert.equal(globalThis.localStorage.getItem(`cw:${syncQueueKey(EMAIL)}`), null, 'an empty queue is removed');
  assert.equal(getSyncState(), 'synced');
});

test('xp with no attempt is sent on its own; an empty queue sends nothing', async () => {
  assert.equal((await flush(EMAIL)).sent, 0);
  queueXp(EMAIL, { delta: 5 }, { flush: false });
  await flush(EMAIL, { force: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].attempt, undefined);
  assert.equal(calls[0].xp.delta, 5);
});

test('throttle: a second flush inside 30 seconds waits, then the timer sends it', async () => {
  queueAttempt(EMAIL, att('T1'));
  pendingTimers()[0].fn(); // the first timer is due at once
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.length, 1);
  queueAttempt(EMAIL, att('T1', { answeredCount: 2 }));
  const early = await flush(EMAIL);
  assert.deepEqual([early.sent, early.throttled], [0, true]);
  assert.equal(calls.length, 1);
  const waiting = pendingTimers().at(-1);
  assert.equal(waiting.ms, SYNC_INTERVAL);
  t += SYNC_INTERVAL;
  waiting.fn();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].attempt.answeredCount, 2);
});

test('queueing many times inside the window sets one timer', () => {
  queueAttempt(EMAIL, att('T1', { answeredCount: 1 }));
  queueAttempt(EMAIL, att('T1', { answeredCount: 2 }));
  queueAttempt(EMAIL, att('T1', { answeredCount: 3 }));
  assert.equal(pendingTimers().length, 1);
  assert.equal(readQueue(EMAIL).attempts.T1.answeredCount, 3);
});

test('flush: true sends straight away, ignoring the throttle', async () => {
  queueAttempt(EMAIL, att('T1'));
  await flush(EMAIL);
  queueAttempt(EMAIL, att('T1', { mode: 'tower' }), { flush: true });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].attempt.mode, 'tower');
  assert.equal((await flushNow(EMAIL)).sent, 0, 'nothing left to send');
});

test('a newer version queued while sending is kept, only what was sent is dropped', async () => {
  queueAttempt(EMAIL, att('T1', { answeredCount: 1 }));
  reply = () => { queueAttempt(EMAIL, att('T1', { answeredCount: 4 })); return { ok: true, data: {} }; };
  await flush(EMAIL);
  assert.equal(readQueue(EMAIL).attempts.T1.answeredCount, 4);
  assert.equal(hasPending(EMAIL), true);
});

test('backoff doubles from 30 seconds up to 5 minutes and resets on success', async () => {
  reply = () => ({ ok: false });
  queueAttempt(EMAIL, att('T1'));
  let res = await flush(EMAIL, { force: true });
  assert.equal(res.state, 'error');
  assert.equal(getSyncState(), 'error');
  for (const wait of [30000, 60000, 120000, 240000, 300000, 300000]) {
    t += wait - 1;
    const before = calls.length;
    assert.equal((await flush(EMAIL)).throttled, true, `still waiting ${wait} ms`);
    assert.equal(calls.length, before);
    t += 1;
    res = await flush(EMAIL);
    assert.equal(calls.length, before + 1, `tries again after ${wait} ms`);
    assert.equal(res.state, 'error');
  }
  assert.equal(hasPending(EMAIL), true, 'nothing is lost on failure');
  reply = () => ({ ok: true, data: {} });
  t += SYNC_MAX_BACKOFF;
  assert.equal((await flush(EMAIL)).state, 'synced');
  assert.equal(hasPending(EMAIL), false);
  reply = () => ({ ok: false });
  queueAttempt(EMAIL, att('T1'));
  t += SYNC_INTERVAL;
  await flush(EMAIL);
  t += 29999;
  assert.equal((await flush(EMAIL)).throttled, true, 'failures started over after the success');
  t += 1;
  const n = calls.length;
  await flush(EMAIL);
  assert.equal(calls.length, n + 1);
});

test('an old backend (unavailable) goes offline and sleeps for 5 minutes', async () => {
  reply = () => ({ ok: false, unavailable: true });
  queueAttempt(EMAIL, att('T1'));
  const res = await flush(EMAIL, { force: true });
  assert.equal(res.state, 'offline');
  assert.equal(hasPending(EMAIL), true);
  const early = await flush(EMAIL);
  assert.equal(early.throttled, true);
});

test('no backend URL or a student who cannot sync stays offline and sends nothing', async () => {
  queueAttempt(EMAIL, att('T1'));
  gas = '';
  const res = await flush(EMAIL, { force: true });
  assert.deepEqual([res.sent, res.state], [0, 'offline']);
  assert.equal(calls.length, 0);
  assert.equal((await flush('someone@else.org', { force: true })).state, 'offline');
  assert.equal(hasPending(EMAIL), true, 'the queue waits for a backend');
});

test('a call that throws is an error with backoff, never a rejection', async () => {
  configureSync({
    call: async () => { throw new Error('network'); }, now: () => t, setTimer: (fn, ms) => ({ fn, ms }), clearTimer: () => {},
    gasUrl: () => gas, canSync: () => true,
  });
  queueAttempt(EMAIL, att('T1'));
  const res = await flush(EMAIL, { force: true });
  assert.equal(res.state, 'error');
  assert.match(res.error, /network/);
  assert.equal(hasPending(EMAIL), true);
});

test('state listeners hear changes and can unsubscribe', async () => {
  const seen = [];
  const off = onSyncState((s) => seen.push(s));
  queueAttempt(EMAIL, att('T1'));
  await flush(EMAIL, { force: true });
  assert.deepEqual(seen.slice(-2), ['syncing', 'synced']);
  off();
  reply = () => ({ ok: false });
  queueAttempt(EMAIL, att('T1', { answeredCount: 2 }));
  t += SYNC_INTERVAL + 1;
  await flush(EMAIL, { force: true });
  assert.equal(seen.at(-1), 'synced', 'no more events after unsubscribe');
});

const fakeAttempt = (extra = {}) => {
  const subs = new Set();
  return {
    email: EMAIL, preview: false, test: { code: 'T9' }, lastMode: 'study', answeredCount: 2, total: 6, state: { done: false },
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    emit: (ev) => subs.forEach((fn) => fn(ev)), subs, ...extra,
  };
};

test('attachAttempt: saves queue the attempt, a mode switch flushes now', async () => {
  const a = fakeAttempt();
  const off = attachAttempt(a);
  a.emit({ type: 'answer' });
  assert.equal(hasPending(EMAIL), false, 'only saves are queued');
  a.emit({ type: 'save' });
  assert.deepEqual(readQueue(EMAIL).attempts.T9, { code: 'T9', mode: 'study', answeredCount: 2, total: 6 });
  assert.equal(calls.length, 0, 'a save is throttled, not sent');
  a.lastMode = 'tower';
  a.emit({ type: 'mode' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].attempt.mode, 'tower');
  off();
  assert.equal(a.subs.size, 0);
});

test('attachAttempt: pagehide queues and flushes now; a finished attempt does not', async () => {
  const a = fakeAttempt();
  const off = attachAttempt(a);
  assert.equal(listeners.pagehide.size, 1);
  [...listeners.pagehide][0]();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].attempt.code, 'T9');
  a.state.done = true;
  [...listeners.pagehide][0]();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.length, 1, 'nothing more after the attempt is done');
  off();
  assert.equal(listeners.pagehide.size, 0, 'the listener is removed');
});

test('attachAttempt: previews and attempts without an email are never synced', () => {
  const noop = attachAttempt(fakeAttempt({ preview: true }));
  const noop2 = attachAttempt(fakeAttempt({ email: '' }));
  const noop3 = attachAttempt(null);
  assert.equal(listeners.pagehide?.size || 0, 0);
  noop(); noop2(); noop3();
});
