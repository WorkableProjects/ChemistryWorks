// Student profile: merge rules for results and attempts, the local profile, loadProfile and savePrefs (js/lib/profile.js).
const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear(),
  };
};
globalThis.localStorage = memory();
globalThis.sessionStorage = memory();
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const P = await import('../../js/lib/profile.js');
const { readQueue, configureSync } = await import('../../js/lib/sync.js');
const { saveXp, emptyXp } = await import('../../js/lib/xp.js');

const EMAIL = 'kid@school.org';
const USER = { email: 'Kid@School.org', name: 'Kid', picture: null, provider: 'google' };
const GAS = 'https://script.example/exec';
const iso = (ms) => new Date(ms).toISOString();
const T0 = Date.parse('2026-03-01T10:00:00Z');

beforeEach(() => {
  globalThis.localStorage.clear();
  configureSync({ call: async () => ({ ok: true, data: {} }), setTimer: () => 0, clearTimer: () => {}, gasUrl: () => '', canSync: () => true });
});

/** A fetch that answers with a canned backend reply and records the requests. */
const backend = (replies) => {
  const log = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    log.push(body);
    const r = typeof replies === 'function' ? replies(body) : replies[body.action];
    return { ok: true, status: 200, json: async () => r };
  };
  fetchImpl.log = log;
  return fetchImpl;
};

test('profileKey is per student and lower case', () => {
  assert.equal(P.profileKey('Kid@School.org'), 'profile:kid@school.org');
});

test('mergeResults: server wins on status and released scores; local-only rows stay; twins collapse', () => {
  const local = [
    { code: 'T1', title: 'Acids', submittedAt: iso(T0), status: 'submitted', released: false, percentage: null, scoreAchieved: null, scoreTotal: null, source: 'local' },
    { code: 'T2', title: 'Bases', submittedAt: iso(T0 + 3600e3), status: 'submitted', released: false, percentage: null, scoreAchieved: null, scoreTotal: null, source: 'local' },
  ];
  const server = [
    { testCode: 'T1', title: 'Acids', submittedAt: iso(T0 + 60e3), status: 'released', percentage: 88, scoreAchieved: 22, scoreTotal: 25 },
    { testCode: 'T3', submittedAt: iso(T0 - 86400e3), status: 'submitted', percentage: 50, scoreAchieved: 5, scoreTotal: 10 },
    { title: 'no code' },
    null,
  ];
  const out = P.mergeResults(local, server);
  assert.deepEqual(out.map((r) => [r.code, r.source]), [['T2', 'local'], ['T1', 'both'], ['T3', 'server']], 'newest first');
  const t1 = out.find((r) => r.code === 'T1');
  assert.deepEqual([t1.status, t1.released, t1.percentage, t1.scoreAchieved, t1.scoreTotal], ['released', true, 88, 22, 25]);
  const t3 = out.find((r) => r.code === 'T3');
  assert.deepEqual([t3.status, t3.percentage, t3.scoreAchieved, t3.title], ['submitted', null, null, 'T3'], 'scores stay hidden until released');
});

test('mergeResults: the same code far apart in time is two submissions; bad input is empty', () => {
  const out = P.mergeResults(
    [{ code: 'T1', title: 'A', submittedAt: iso(T0), source: 'local' }],
    [{ testCode: 'T1', submittedAt: iso(T0 + 10 * 60e3), released: true, percentage: 70 }],
  );
  assert.equal(out.length, 2);
  assert.deepEqual(P.mergeResults(null, undefined), []);
});

test('mergeAttempts: newer wins, newerOnServer offers Continue, submitted tests drop out', () => {
  const local = [
    { code: 'A', title: 'Alpha', answered: 3, total: 10, updatedAt: T0, lastMode: 'tower' },
    { code: 'B', title: 'Beta', answered: 5, total: 10, updatedAt: T0, lastMode: 'study' },
    { code: 'C', title: 'Gamma', answered: 2, total: 4, updatedAt: T0, lastMode: 'study' },
  ];
  const server = [
    { code: 'A', mode: 'study', answeredCount: 6, total: 10, updatedAt: iso(T0 + 1000) },
    { code: 'B', mode: 'study', answeredCount: 2, total: 10, updatedAt: iso(T0 + 1000) },
    { code: 'D', mode: 'classic', answeredCount: 1, total: 8, percentDone: 12.6, updatedAt: iso(T0 + 500) },
    { mode: 'study' },
  ];
  const results = [{ code: 'C', submittedAt: iso(T0 + 5000) }];
  const out = P.mergeAttempts(local, server, results, { D: 'Delta' });
  assert.deepEqual(out.map((a) => a.code), ['D', 'A', 'B'].sort((x, y) => out.find((a) => a.code === y).updatedAt - out.find((a) => a.code === x).updatedAt), 'newest first');
  assert.ok(!out.some((a) => a.code === 'C'), 'submitted after the last save, so it is not in progress');
  const a = out.find((x) => x.code === 'A');
  assert.deepEqual([a.source, a.newerOnServer, a.serverAnswered, a.answered, a.lastMode], ['both', true, 6, 3, 'tower']);
  const b = out.find((x) => x.code === 'B');
  assert.deepEqual([b.newerOnServer, b.percent], [false, 50], 'a server copy that is not further along is ignored');
  const d = out.find((x) => x.code === 'D');
  assert.deepEqual([d.source, d.title, d.percent, d.newerOnServer, d.lastMode], ['server', 'Delta', 13, true, 'classic']);
});

test('mergeAttempts: a test started again after submitting stays in progress', () => {
  const out = P.mergeAttempts([{ code: 'C', title: 'G', answered: 1, total: 4, updatedAt: T0 + 9000 }], [], [{ code: 'C', submittedAt: iso(T0) }]);
  assert.deepEqual(out.map((a) => a.code), ['C']);
  assert.deepEqual(P.mergeAttempts(null, null), []);
});

test('mergeAttempts: a server total fills a missing local total', () => {
  const out = P.mergeAttempts([{ code: 'A', title: 'A', answered: 2, total: 0, updatedAt: T0 }], [{ code: 'A', answeredCount: 1, total: 8, updatedAt: iso(T0 - 1) }]);
  assert.deepEqual([out[0].total, out[0].percent], [8, 25]);
});

test('buildLocalProfile on an empty device', () => {
  const p = P.buildLocalProfile(USER);
  assert.equal(p.email, EMAIL);
  assert.equal(p.name, 'Kid');
  assert.deepEqual([p.level, p.xp, p.xpIntoLevel, p.xpToNext, p.levelProgress], [1, 0, 0, 50, 0]);
  assert.deepEqual([p.inProgress, p.results, p.badges, p.bests, p.assigned, p.classes], [[], [], [], [], [], []]);
  assert.deepEqual([p.synced, p.syncedAt, p.hub], [false, 0, null]);
  assert.deepEqual(p.prefs, {});
});

test('buildLocalProfile reads xp, badges, attempts, results and bests from this device', () => {
  saveXp(EMAIL, { ...emptyXp(), xp: 160, badges: { first_round: 111 } });
  globalThis.localStorage.setItem('cw:profile:kid@school.org', JSON.stringify({ streakDays: 6, prefs: { theme: 'dark' } }));
  globalThis.localStorage.setItem(`cw:progress:${EMAIL}:T1`, JSON.stringify({ answers: { q1: 'a', q2: 'b' }, total: 5, updatedAt: T0, title: 'Acids', lastMode: 'race' }));
  globalThis.localStorage.setItem('cw:localResults', JSON.stringify([
    { submission_id: 's1', student_email: 'KID@school.org', test_code: 'T9', test_title: 'Old', submitted_at: iso(T0) },
    { submission_id: 's2', student_email: 'other@school.org', test_code: 'T8', submitted_at: iso(T0) },
    { student_email: EMAIL, test_code: 'T7' },
  ]));
  globalThis.localStorage.setItem(`cw:gamebest:${EMAIL}:T1:tower`, '700');
  globalThis.localStorage.setItem(`cw:gamebest:${EMAIL}:T1:classic`, '0');
  const p = P.buildLocalProfile(USER);
  assert.deepEqual([p.level, p.xp, p.xpIntoLevel, p.xpToNext], [3, 160, 10, 140]);
  assert.equal(p.streakDays, 6);
  assert.deepEqual(p.badges.map((b) => [b.id, b.title, b.earnedAt]), [['first_round', 'First round', 111]]);
  assert.deepEqual(p.inProgress.map((a) => [a.code, a.answered, a.total, a.percent, a.lastMode, a.source]), [['T1', 2, 5, 40, 'race', 'local']]);
  assert.deepEqual(p.results.map((r) => [r.code, r.title, r.status, r.source]), [['T9', 'Old', 'submitted', 'local']], 'only this student, only real submissions');
  assert.deepEqual(p.bests, [{ code: 'T1', game: 'tower', score: 700 }], 'a zero best is not listed');
  assert.deepEqual(p.prefs, { theme: 'dark' });
});

test('buildLocalProfile uses the cached server snapshot for classes, assigned work and titles', () => {
  globalThis.localStorage.setItem('cw:profile:kid@school.org', JSON.stringify({
    syncedAt: 4242,
    server: {
      profile: { name: 'Server Kid', picture: 'https://img/x.png', classIds: ['c1', 'c2'] },
      hub: { classes: [{ id: 'c1', name: 'Chem A' }, { classId: 'c2', name: 'Chem B' }] },
      assigned: [{ testCode: 'T5', title: 'Moles', status: 'open' }],
      attempts: [{ code: 'T5', mode: 'study', answeredCount: 3, total: 6, updatedAt: iso(T0) }],
      results: [],
    },
  }));
  const p = P.buildLocalProfile({ email: EMAIL });
  assert.deepEqual([p.name, p.picture], ['Server Kid', 'https://img/x.png']);
  assert.deepEqual(p.classes, [{ id: 'c1', name: 'Chem A' }, { id: 'c2', name: 'Chem B' }]);
  assert.deepEqual(p.assigned.map((a) => a.testCode), ['T5']);
  assert.equal(p.inProgress[0].title, 'Moles', 'titles come from assigned work');
  assert.equal(p.syncedAt, 4242);
});

test('loadProfile with no user gives nothing', async () => {
  const out = P.loadProfile(null);
  assert.equal(out.profile, null);
  assert.equal(await out.done, null);
});

test('loadProfile offline (demo sign-in or no backend) stays local and does not call out', async () => {
  const f = backend({});
  const demo = P.loadProfile({ ...USER, provider: 'demo' }, { gasUrl: GAS, fetchImpl: f });
  assert.equal(demo.profile.synced, false);
  assert.equal((await demo.done).synced, false);
  const none = P.loadProfile(USER, { gasUrl: '', fetchImpl: f });
  assert.equal((await none.done).synced, false);
  assert.equal(f.log.length, 0);
});

test('loadProfile merges the server reply: xp never lowered, server prefs, snapshot cached, subscribers told', async () => {
  saveXp(EMAIL, { ...emptyXp(), xp: 500 });
  const f = backend({
    getStudentProfile: {
      result: 'success',
      profile: { xp: 120, level: 3, streakDays: 4, lastActiveDate: '2026-03-01', badges: ['first_round'], prefs: { theme: 'light', accent: 'teal' }, classIds: ['c1'], name: 'Kid' },
      results: [{ testCode: 'T1', title: 'Acids', submittedAt: iso(T0), status: 'released', percentage: 90, scoreAchieved: 9, scoreTotal: 10 }],
      attempts: [{ code: 'T2', mode: 'study', answeredCount: 2, total: 4, updatedAt: iso(T0) }],
      assigned: [{ testCode: 'T2', title: 'Bases' }],
      hub: { classes: [{ id: 'c1', name: 'Chem A' }] },
    },
  });
  const heard = [];
  const off = P.subscribeProfile(USER, (p) => heard.push(p.synced));
  const updates = [];
  const { profile, done } = P.loadProfile(USER, { gasUrl: GAS, fetchImpl: f, onUpdate: (p) => updates.push(p) });
  assert.equal(profile.synced, false, 'the local profile comes back first');
  const merged = await done;
  assert.equal(merged.synced, true);
  assert.equal(merged.xp, 500, 'the larger xp wins');
  assert.equal(merged.streakDays, 4);
  assert.deepEqual(merged.prefs, { theme: 'light', accent: 'teal' });
  assert.deepEqual(merged.results.map((r) => [r.code, r.percentage]), [['T1', 90]]);
  assert.deepEqual(merged.inProgress.map((a) => [a.code, a.title, a.newerOnServer]), [['T2', 'Bases', true]]);
  assert.deepEqual(merged.classes, [{ id: 'c1', name: 'Chem A' }]);
  assert.deepEqual(merged.badges.map((b) => b.id), ['first_round']);
  assert.ok(merged.syncedAt > 0);
  assert.equal(updates.length, 1);
  assert.ok(heard.includes(true), 'subscribers hear that the server answered');
  assert.equal(f.log[0].action, 'getStudentProfile');
  off();
  const rec = P.readLocalRecord(EMAIL);
  assert.equal(rec.xp, 120, 'the record keeps the server xp; loadXp takes the larger of the two');
  assert.equal(rec.server.results.length, 1);
});

test('loadProfile queues the existing local xp once, as the first sync', async () => {
  saveXp(EMAIL, { ...emptyXp(), xp: 90, dailyStreak: 2, badges: { first_round: 1 } });
  const f = backend({ getStudentProfile: { result: 'success', profile: {} } });
  await P.loadProfile(USER, { gasUrl: GAS, fetchImpl: f }).done;
  let q = readQueue(EMAIL);
  assert.equal(q.xp.delta, 90);
  assert.deepEqual(q.xp.badges, ['first_round']);
  assert.equal(P.readLocalRecord(EMAIL).xpMigrated, true);
  await P.loadProfile(USER, { gasUrl: GAS, fetchImpl: f }).done;
  q = readQueue(EMAIL);
  assert.equal(q.xp.delta, 90, 'not queued a second time');
});

test('loadProfile falls back to the local profile when the server fails or the backend is old', async () => {
  const other = { email: 'second@school.org', name: 'Second', provider: 'google' };
  saveXp(other.email, { ...emptyXp(), xp: 70 });
  const old = await P.loadProfile(other, { gasUrl: GAS, fetchImpl: backend({ getStudentProfile: { result: 'error', error: 'unknown_action' } }) }).done;
  assert.deepEqual([old.synced, old.xp], [false, 70]);
  const down = await P.loadProfile(other, { gasUrl: GAS, fetchImpl: async () => { throw new Error('offline'); } }).done;
  assert.deepEqual([down.synced, down.xp], [false, 70]);
});

test('savePrefs: always saved locally, only known keys, sent when reachable', async () => {
  const f = backend({ saveStudentProfile: { result: 'success' } });
  const res = await P.savePrefs(USER, { theme: 'dark', bogus: 1, density: 'compact' }, { gasUrl: GAS, fetchImpl: f });
  assert.deepEqual(res, { ok: true, synced: true, prefs: { theme: 'dark', density: 'compact' } });
  assert.deepEqual(f.log[0].prefs, { theme: 'dark', density: 'compact' });
  assert.equal(P.readLocalRecord(EMAIL).dirty, false);
  const next = await P.savePrefs(USER, { accent: 'teal' }, { gasUrl: GAS, fetchImpl: f });
  assert.deepEqual(next.prefs, { theme: 'dark', density: 'compact', accent: 'teal' }, 'changes merge over what was saved');
});

test('savePrefs: offline or rate limited keeps the change dirty and the next load retries it', async () => {
  const offline = await P.savePrefs({ ...USER, provider: 'demo' }, { theme: 'dark' }, { gasUrl: GAS, fetchImpl: backend({}) });
  assert.deepEqual([offline.ok, offline.synced], [true, false]);
  assert.equal(P.readLocalRecord(EMAIL).dirty, true);
  const limited = await P.savePrefs(USER, { accent: 'red' }, { gasUrl: GAS, fetchImpl: backend({ saveStudentProfile: { result: 'error', error: 'rate_limited' } }) });
  assert.deepEqual([limited.ok, limited.synced], [true, false]);
  assert.equal(P.readLocalRecord(EMAIL).dirty, true);
  const f = backend({ getStudentProfile: { result: 'success', profile: { prefs: { theme: 'light', density: 'roomy' } } }, saveStudentProfile: { result: 'success' } });
  const merged = await P.loadProfile(USER, { gasUrl: GAS, fetchImpl: f }).done;
  assert.deepEqual(merged.prefs, { theme: 'dark', density: 'roomy', accent: 'red' }, 'a pending local change beats the server value');
  await new Promise((r) => setTimeout(r, 0));
  const saves = f.log.filter((b) => b.action === 'saveStudentProfile');
  assert.equal(saves.length, 1, 'the pending save went out after the load');
  assert.deepEqual(saves[0].prefs, { theme: 'dark', density: 'roomy', accent: 'red' });
});

test('savePrefs without a user does nothing', async () => {
  assert.deepEqual(await P.savePrefs(null, { theme: 'dark' }), { ok: false, synced: false, prefs: {} });
});

test('subscribeProfile: prefs saves notify and unsubscribe stops it', async () => {
  const seen = [];
  const off = P.subscribeProfile(USER, (p) => seen.push(p.prefs.theme));
  await P.savePrefs({ ...USER, provider: 'demo' }, { theme: 'dark' }, { gasUrl: '' });
  assert.deepEqual(seen.at(-1), 'dark');
  off();
  const n = seen.length;
  await P.savePrefs({ ...USER, provider: 'demo' }, { theme: 'light' }, { gasUrl: '' });
  assert.equal(seen.length, n);
});
