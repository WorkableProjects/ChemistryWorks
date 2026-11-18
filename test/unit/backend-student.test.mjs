// Student backend actions: getStudentProfile, saveStudentProfile, syncProgress, markNotificationsRead.
// Identity is the verified token's email only; XP never drops; the daily cap; attempts merge per (student, test).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeGas, plain } from './helpers/gas.mjs';

let g;
beforeEach(() => { g = makeGas(); });

const DAY = 86400000;
const sync = (email, body) => g.post({ action: 'syncProgress', idToken: g.login(email), ...body });
const studentRow = (email) => g.rows('Students').find((r) => r[0] === email);

test('getStudentProfile: no token, a bad token and a body email alone are all refused', () => {
  assert.equal(g.post({ action: 'getStudentProfile' }).error, 'unauthorized');
  assert.equal(g.post({ action: 'getStudentProfile', idToken: 'bogus' }).result, 'error');
  assert.equal(g.post({ action: 'getStudentProfile', studentEmail: 'ada@x.org' }).result, 'error');
  assert.equal(g.rows('Students').length, 0);
});

test('getStudentProfile: creates a profile on first call and returns the same one after', () => {
  const r = g.post({ action: 'getStudentProfile', idToken: g.login('Ada@x.org', { name: 'Ada L' }) });
  assert.equal(r.result, 'success');
  assert.equal(r.profile.email, 'ada@x.org');
  assert.equal(r.profile.name, 'Ada L');
  assert.equal(r.profile.xp, 0);
  assert.equal(r.profile.level, 1);
  assert.deepEqual(plain(r.attempts), []);
  g.post({ action: 'getStudentProfile', idToken: g.login('Ada@x.org') });
  assert.equal(g.rows('Students').length, 1);
});

test('a student cannot read another student: body email, name and studentEmail are ignored', () => {
  sync('bob@x.org', { xp: { delta: 50 }, attempt: { code: 'c1', answeredCount: 2, total: 4 } });
  const r = g.post({ action: 'getStudentProfile', idToken: g.login('ada@x.org'), email: 'bob@x.org', studentEmail: 'bob@x.org', name: 'Bob' });
  assert.equal(r.profile.email, 'ada@x.org');
  assert.equal(r.profile.xp, 0);
  assert.deepEqual(plain(r.attempts), []);
});

test('a student cannot write another student: saveStudentProfile and syncProgress touch only the token email', () => {
  sync('bob@x.org', { xp: { delta: 50 } });
  g.post({ action: 'saveStudentProfile', idToken: g.login('ada@x.org'), email: 'bob@x.org', studentEmail: 'bob@x.org', prefs: { theme: 'dark' } });
  sync('ada@x.org', { email: 'bob@x.org', studentEmail: 'bob@x.org', xp: { delta: 20, email: 'bob@x.org' }, attempt: { code: 'c1', email: 'bob@x.org', answeredCount: 1, total: 2 } });
  const bob = g.post({ action: 'getStudentProfile', idToken: g.login('bob@x.org') });
  assert.equal(bob.profile.xp, 50);
  assert.deepEqual(plain(bob.profile.prefs), {});
  assert.deepEqual(plain(bob.attempts), []);
  const ada = g.post({ action: 'getStudentProfile', idToken: g.login('ada@x.org') });
  assert.equal(ada.profile.xp, 20);
  assert.equal(ada.profile.prefs.theme, 'dark');
  assert.equal(ada.attempts.length, 1);
});

test('saveStudentProfile: keeps only known preference keys, trims strings, refuses a missing prefs object', () => {
  const tk = g.login('ada@x.org');
  assert.equal(g.post({ action: 'saveStudentProfile', idToken: tk }).error, 'invalid_request');
  const r = g.post({ action: 'saveStudentProfile', idToken: tk, prefs: { theme: 'dark', textSize: 2, reduceMotion: true, xp: 99999, evil: 'x', accent: 'a'.repeat(100) } });
  assert.equal(r.result, 'success');
  assert.equal(r.profile.prefs.theme, 'dark');
  assert.equal(r.profile.prefs.textSize, 2);
  assert.equal(r.profile.prefs.reduceMotion, true);
  assert.equal(r.profile.prefs.accent.length, 64);
  assert.equal('evil' in r.profile.prefs, false);
  assert.equal(r.profile.xp, 0, 'prefs cannot set xp');
});

test('saveStudentProfile: a second write inside the gap is rate limited, then allowed', () => {
  const tk = g.login('ada@x.org');
  assert.equal(g.post({ action: 'saveStudentProfile', idToken: tk, prefs: { theme: 'dark' } }).result, 'success');
  assert.equal(g.post({ action: 'saveStudentProfile', idToken: tk, prefs: { theme: 'light' } }).error, 'rate_limited');
  g.tick(6000);
  assert.equal(g.post({ action: 'saveStudentProfile', idToken: tk, prefs: { theme: 'light' } }).profile.prefs.theme, 'light');
});

test('syncProgress: XP adds up and never drops (negative, NaN and string deltas add nothing)', () => {
  assert.equal(sync('ada@x.org', { xp: { delta: 40 } }).profile.xp, 40);
  assert.equal(sync('ada@x.org', { xp: { delta: -500 } }).profile.xp, 40);
  assert.equal(sync('ada@x.org', { xp: { delta: 'abc' } }).profile.xp, 40);
  assert.equal(sync('ada@x.org', { xp: { delta: null } }).profile.xp, 40);
  assert.equal(sync('ada@x.org', { xp: { xp: 0, level: 1 } }).profile.xp, 40, 'client xp/level fields are ignored');
  assert.equal(sync('ada@x.org', { xp: { delta: 10 } }).profile.xp, 50);
  assert.equal(sync('ada@x.org', {}).profile.xp, 50, 'a sync with no xp leaves it alone');
});

test('syncProgress: level follows XP and never goes down', () => {
  const lvl = (xp) => sync('ada@x.org', { xp: { delta: xp } }).profile.level;
  assert.equal(lvl(10), 1);
  assert.equal(lvl(500), 5, '510 xp is level 5 (25*4*5 = 500)');
  assert.equal(lvl(0), 5);
  assert.equal(lvl(-100), 5);
});

test('syncProgress: daily cap of 600 XP, shared across calls, resets the next day', () => {
  assert.equal(sync('ada@x.org', { xp: { delta: 5000 } }).profile.xp, 600);
  assert.equal(sync('ada@x.org', { xp: { delta: 50 } }).profile.xp, 600, 'cap already reached');
  g.tick(DAY);
  assert.equal(sync('ada@x.org', { xp: { delta: 100 } }).profile.xp, 700);
  assert.equal(sync('ada@x.org', { xp: { delta: 1000 } }).profile.xp, 1200, 'only the remaining 500 of the new day');
});

test('syncProgress: the daily cap is per student', () => {
  sync('ada@x.org', { xp: { delta: 5000 } });
  assert.equal(sync('bob@x.org', { xp: { delta: 100 } }).profile.xp, 100);
});

test('syncProgress: attempts merge per test, a second sync updates the same row', () => {
  sync('ada@x.org', { attempt: { code: 'c1', mode: 'classic', answeredCount: 2, total: 10, answers: { q1: 'a' } } });
  const r = sync('ada@x.org', { attempt: { code: 'C1', mode: 'study', answeredCount: 5, total: 10, answers: { q1: 'a', q2: 'b' } } });
  assert.equal(r.attempt.code, 'C1');
  assert.equal(r.attempt.percentDone, 50);
  assert.equal(g.rows('Attempts').length, 1, 'code is case-insensitive, one row per student and test');
  sync('ada@x.org', { attempt: { code: 'C2', mode: 'classic', answeredCount: 1, total: 4 } });
  sync('bob@x.org', { attempt: { code: 'C1', mode: 'classic', answeredCount: 9, total: 10 } });
  assert.equal(g.rows('Attempts').length, 3);
  const p = g.post({ action: 'getStudentProfile', idToken: g.login('ada@x.org') });
  assert.deepEqual(plain(p.attempts).map((a) => [a.code, a.answeredCount]).sort(), [['C1', 5], ['C2', 1]]);
  const stored = g.rows('Attempts').find((a) => a[0] === 'ada@x.org' && a[1] === 'C1');
  assert.deepEqual(JSON.parse(stored[7]), { q1: 'a', q2: 'b' });
});

test('syncProgress: answered count is clamped to the total and an attempt needs a code', () => {
  assert.equal(sync('ada@x.org', { attempt: { code: 'c1', answeredCount: 99, total: 10 } }).attempt.answeredCount, 10);
  assert.equal(sync('ada@x.org', { attempt: { code: 'c1', answeredCount: -4, total: 10 } }).attempt.answeredCount, 0);
  assert.equal(sync('ada@x.org', { attempt: { mode: 'classic', answeredCount: 1, total: 2 } }).error, 'invalid_request');
});

test('syncProgress: badges merge without duplicates and an attempt does not need xp', () => {
  sync('ada@x.org', { xp: { delta: 1, badges: ['first_round'] } });
  const r = sync('ada@x.org', { xp: { delta: 1, badges: ['first_round', 'perfect_round'] } });
  assert.deepEqual(plain(r.profile.badges), ['first_round', 'perfect_round']);
  assert.equal(sync('ada@x.org', { attempt: { code: 'c1', answeredCount: 1, total: 2 } }).result, 'success');
  assert.equal(studentRow('ada@x.org')[6], 2);
});

test('syncProgress and the profile actions refuse a missing or bad token', () => {
  for (const action of ['syncProgress', 'saveStudentProfile', 'getClassHub', 'markNotificationsRead']) {
    assert.equal(g.post({ action, prefs: {}, all: true, xp: { delta: 5 } }).result, 'error', action);
    assert.equal(g.post({ action, idToken: 'bogus', prefs: {}, all: true }).result, 'error', action);
  }
  assert.equal(g.rows('Students').length, 0);
});

// ---------- class hub and notifications ----------

const hubSetup = () => {
  const cls = g.A({ action: 'saveClass', cls: { name: 'P1', emails: ['ada@x.org', 'bob@x.org'] } }).cls;
  g.A({ action: 'publishTest', test: { code: 'H1', title: 'Hub test', questions: [{ id: 'q1', type: 'truefalse', text: 'x', correctAnswer: true }] } });
  const dueAt = new Date(g.clock + 6 * 3600000).toISOString();
  const a = g.A({ action: 'saveAssignment', assignment: { classId: cls.id, testCode: 'H1', title: 'Quiz 1', dueAt } }).assignment;
  return { cls, a };
};

test('getClassHub: a student sees only their own classes, assignments and stream', () => {
  const { cls, a } = hubSetup();
  const other = g.A({ action: 'saveClass', cls: { name: 'P2', emails: ['cy@x.org'] } }).cls;
  g.A({ action: 'saveAssignment', assignment: { classId: other.id, testCode: 'H1', title: 'Other class' } });
  g.A({ action: 'postStream', classId: other.id, body: 'secret to P2' });
  g.A({ action: 'postStream', classId: cls.id, body: 'hello P1' });
  const r = g.post({ action: 'getClassHub', idToken: g.login('ada@x.org'), email: 'cy@x.org' });
  assert.equal(r.result, 'success');
  assert.deepEqual(plain(r.classes).map((c) => c.id), [cls.id]);
  assert.deepEqual(plain(r.assignments).map((x) => x.id), [a.id]);
  assert.ok(r.stream.every((p) => p.classId === cls.id));
  assert.ok(r.stream.some((p) => p.body === 'hello P1'));
  assert.ok(!r.stream.some((p) => p.body === 'secret to P2'));
  const none = g.post({ action: 'getClassHub', idToken: g.login('zed@x.org') });
  assert.deepEqual(plain(none.assignments), []);
  assert.deepEqual(plain(none.stream), []);
});

test('getClassHub: an _email in the request body is not trusted (internal-only field)', () => {
  hubSetup();
  const noToken = g.post({ action: 'getClassHub', _email: 'ada@x.org' });
  assert.equal(noToken.result, 'error', 'a client must not read a hub by sending _email without a token');
  const withToken = g.post({ action: 'getClassHub', idToken: g.login('cy@x.org'), _email: 'ada@x.org' });
  assert.deepEqual(plain(withToken.assignments), [], 'the token email wins over _email');
});

test('getClassHub: derives notifications (new assignment, due soon) and an unscheduled assignment stays hidden', () => {
  const { cls, a } = hubSetup();
  g.A({ action: 'saveAssignment', assignment: { classId: cls.id, testCode: 'H1', title: 'Later', publishAt: new Date(g.clock + DAY).toISOString() } });
  const r = g.post({ action: 'getClassHub', idToken: g.login('ada@x.org') });
  assert.deepEqual(plain(r.assignments).map((x) => x.id), [a.id], 'unpublished assignment is hidden');
  const ids = plain(r.notifications).map((n) => n.id).sort();
  assert.deepEqual(ids, [`due:${a.id}`, `new:${a.id}`].sort());
  assert.ok(r.notifications.every((n) => n.read === false));
});

test('markNotificationsRead: by id, then all; reads are per student and capped at 200 ids', () => {
  const { a } = hubSetup();
  const ada = g.login('ada@x.org');
  const bob = g.login('bob@x.org');
  assert.equal(g.post({ action: 'markNotificationsRead', idToken: ada }).error, 'invalid_request');
  assert.equal(g.post({ action: 'markNotificationsRead', idToken: ada, ids: [`new:${a.id}`] }).result, 'success');
  const read = (tk) => Object.fromEntries(plain(g.post({ action: 'getClassHub', idToken: tk }).notifications).map((n) => [n.id, n.read]));
  assert.equal(read(ada)[`new:${a.id}`], true);
  assert.equal(read(ada)[`due:${a.id}`], false);
  assert.equal(read(bob)[`new:${a.id}`], false, 'bob is unaffected by ada');
  g.tick(1000);
  const all = g.post({ action: 'markNotificationsRead', idToken: ada, all: true });
  assert.equal(all.readAt, g.clock);
  assert.ok(Object.values(read(ada)).every((v) => v === true));
  g.post({ action: 'markNotificationsRead', idToken: bob, ids: Array.from({ length: 250 }, (_, i) => `n${i}`) });
  const prefs = JSON.parse(studentRow('bob@x.org')[11]);
  assert.equal(prefs.notifRead.length, 200);
  assert.equal(prefs.notifRead.at(-1), 'n249');
});
