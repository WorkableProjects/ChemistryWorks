// Backend performance and housekeeping (apps-script/Code.gs in a vm): lock-free appends, the row-index and header caches,
// column-limited reads, one accommodations read per request, one-call rewrites, pruning, triggers and diag.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeGas, plain } from './helpers/gas.mjs';

let g;
let lock;
beforeEach(() => {
  g = makeGas({ GOOGLE_CLIENT_ID: 'client-1' });
  lock = { wait: 0, tryLock: 0, busy: false };
  g.ctx.LockService = { getScriptLock: () => ({
    waitLock() { lock.wait++; },
    tryLock() { lock.tryLock++; return !lock.busy; },
    releaseLock() {},
  }) };
});

const HOUR = 3600000;
const DAY = 24 * HOUR;
const sheetOf = (name, headersConst) => g.ctx.getSheet_(name, g.run(headersConst));

// Records the reads and writes made on a sheet. Data rows are rows 2 and below.
function watch(name) {
  const sh = g.sheets.get(name);
  const log = { reads: [], writes: [], deleteRows: 0, deleteRow: 0, dataRows: () => log.reads.filter((x) => x.r >= 2).reduce((n, x) => n + x.nr, 0) };
  const orig = sh.getRange;
  sh.getRange = (r, c, nr = 1, nc = 1) => {
    const rg = orig(r, c, nr, nc);
    const gv = rg.getValues;
    const gv1 = rg.getValue;
    const sv = rg.setValues;
    rg.getValues = () => { log.reads.push({ r, c, nr, nc }); return gv(); };
    rg.getValue = () => { log.reads.push({ r, c, nr: 1, nc: 1 }); return gv1(); };
    rg.setValues = (v) => { log.writes.push({ r, c, nr, nc }); return sv(v); };
    return rg;
  };
  const dr = sh.deleteRows;
  sh.deleteRows = (n, count) => { log.deleteRows++; return dr(n, count); };
  const d1 = sh.deleteRow;
  sh.deleteRow = (n) => { log.deleteRow++; return d1(n); };
  return log;
}

const sync = (email, body) => g.post({ action: 'syncProgress', idToken: g.login(email), ...body });
const testDef = (code = 'P1', over = {}) => ({ code, title: `Test ${code}`, questions: [{ id: 'q1', type: 'truefalse', text: 'x', correctAnswer: true }], ...over });

// ---------- 1. locks ----------

test('locks: submissions, live pings, error reports and log lines take no script lock', () => {
  g.A({ action: 'publishTest', test: testDef('L1') });
  lock.wait = 0;
  const sub = g.post({ submission_id: 's1', student_name: 'Ada', test_code: 'L1', test_title: 'T', score_achieved: 1, score_total: 1, percentage: 100, duration_seconds: 5, responses: [], flags: {}, idToken: g.login('ada@x.org') });
  assert.equal(sub.result, 'success');
  assert.equal(g.post({ action: 'progressPing', idToken: g.login('ada@x.org'), testCode: 'L1', answered: 1, total: 4 }).result, 'success');
  g.A({ action: 'saveSettings', settings: { errorReports: true } });
  lock.wait = 0;
  assert.equal(g.post({ action: 'reportError', page: 'p', message: 'm', clientId: 'c1' }).result, 'success');
  g.run("appendLog_({ via: 'key' }, 'publishTest', 'L1', 'x')");
  assert.equal(lock.wait, 0);
  assert.equal(lock.tryLock, 0);
  assert.equal(g.rows('Submissions').length, 1);
  assert.equal(g.rows('Live').length, 1);
  assert.equal(g.rows('Errors').length, 1);
  assert.equal(g.rows('Log').length >= 1, true);
});

test('locks: a repeat submission id is still a duplicate without the lock', () => {
  const body = { submission_id: 's1', student_name: 'Ada', test_code: 'L1', test_title: 'T', score_achieved: 1, score_total: 1, percentage: 100, duration_seconds: 5, responses: [], flags: {}, idToken: g.login('ada@x.org') };
  assert.equal(g.post(body).result, 'success');
  assert.equal(g.post(body).duplicate, true);
  assert.equal(g.rows('Submissions').length, 1);
});

test('locks: upserts and grade writes keep the lock', () => {
  g.A({ action: 'saveClass', cls: { name: 'P1', emails: ['ada@x.org'] } });
  assert.ok(lock.wait > 0, 'saveClass');
  g.post({ submission_id: 's1', student_name: 'Ada', test_code: 'L1', test_title: 'T', score_achieved: 1, score_total: 1, percentage: 100, duration_seconds: 5, responses: [], flags: {}, idToken: g.login('ada@x.org') });
  lock.wait = 0;
  g.A({ action: 'saveGrade', submissionId: 's1', grades: {} });
  assert.ok(lock.wait > 0, 'saveGrade');
  lock.wait = 0;
  g.post({ action: 'getStudentProfile', idToken: g.login('ada@x.org') });
  assert.ok(lock.wait > 0, 'student upsert');
});

test('syncProgress: takes tryLock(1500) and answers busy with retryAfter when it cannot', () => {
  assert.equal(sync('ada@x.org', { xp: { delta: 5 } }).result, 'success');
  assert.equal(lock.tryLock, 1);
  assert.equal(lock.wait, 0, 'one lock acquisition, not a nested wait');
  lock.busy = true;
  const r = sync('ada@x.org', { xp: { delta: 5 } });
  assert.deepEqual(plain(r), { result: 'error', error: 'busy', retryAfter: 30 });
  const row = g.rows('Students').find((x) => x[0] === 'ada@x.org');
  assert.equal(row[6], 5, 'the busy call wrote nothing');
});

// ---------- 2 and 3. row index and header cache ----------

test('row index: a warm syncProgress reads at most 2 data rows', () => {
  g.A({ action: 'saveClass', cls: { name: 'P1', emails: ['ada@x.org'] } });
  for (let i = 0; i < 30; i++) sync(`s${i}@x.org`, { attempt: { code: 'c1', answeredCount: 1, total: 4 }, xp: { delta: 1 } });
  sync('ada@x.org', { attempt: { code: 'c1', answeredCount: 1, total: 4 }, xp: { delta: 1 } });
  const students = watch('Students');
  const attempts = watch('Attempts');
  const r = sync('ada@x.org', { attempt: { code: 'c1', answeredCount: 2, total: 4 }, xp: { delta: 1 } });
  assert.equal(r.result, 'success');
  assert.equal(r.attempt.answeredCount, 2);
  assert.ok(students.dataRows() + attempts.dataRows() <= 2, `read ${students.dataRows() + attempts.dataRows()} data rows`);
});

test('row index: a new key appends once, and the next call for it is a one-row hit', () => {
  sync('ada@x.org', { xp: { delta: 1 } });
  sync('bob@x.org', { xp: { delta: 1 } });
  const students = watch('Students');
  sync('bob@x.org', { xp: { delta: 1 } });
  assert.equal(students.dataRows(), 1);
  assert.equal(g.rows('Students').filter((x) => x[0] === 'bob@x.org').length, 1);
});

test('row index: rebuilds when the cached row no longer holds the key', () => {
  sync('ada@x.org', { xp: { delta: 1 } });
  sync('bob@x.org', { xp: { delta: 1 } });
  sync('cy@x.org', { xp: { delta: 1 } });
  g.sheets.get('Students').deleteRow(2);
  const r = sync('cy@x.org', { xp: { delta: 1 } });
  assert.equal(r.result, 'success');
  assert.equal(r.profile.xp, 2, 'merged into cy, not into the student who moved up');
  assert.deepEqual(g.rows('Students').map((x) => x[0]), ['bob@x.org', 'cy@x.org']);
});

test('row index: an empty or lost cache falls back to a scan and still finds the row', () => {
  sync('ada@x.org', { xp: { delta: 1 } });
  g.cacheStore.clear();
  sync('ada@x.org', { xp: { delta: 1 } });
  assert.equal(g.rows('Students').length, 1);
  assert.equal(g.rows('Students')[0][6], 2);
});

test('header cache: the header row is read at most twice per sheet in a request', () => {
  sync('ada@x.org', { attempt: { code: 'c1', answeredCount: 1, total: 2 }, xp: { delta: 1 } });
  const students = watch('Students');
  const attempts = watch('Attempts');
  sync('ada@x.org', { attempt: { code: 'c1', answeredCount: 2, total: 2 }, xp: { delta: 1 } });
  const headerReads = (log) => log.reads.filter((x) => x.r === 1).length;
  assert.ok(headerReads(students) <= 2, `Students header read ${headerReads(students)} times`);
  assert.ok(headerReads(attempts) <= 2, `Attempts header read ${headerReads(attempts)} times`);
});

// ---------- 4. column-limited reads ----------

const submit = (id, code = 'R1') => g.post({ submission_id: id, student_name: 'Ada', test_code: code, test_title: 'T', score_achieved: 1, score_total: 2, percentage: 50, duration_seconds: 5,
  responses: [{ questionId: 'q1', answer: 'long answer' }], flags: { tab_switches: 1 }, idToken: g.login('ada@x.org') });

test('getResults: leaves the answers out unless includeAnswers is true, and does not read that column', () => {
  submit('s1');
  submit('s2');
  const log = watch('Submissions');
  const lean = g.A({ action: 'getResults' });
  assert.equal(lean.rows.length, 2);
  assert.deepEqual(plain(lean.rows[0].responses), []);
  assert.equal(lean.rows[0].student_email, 'ada@x.org');
  assert.equal(lean.rows[0].flags.tab_switches, 1);
  assert.equal(lean.rows[0].status, 'Auto-graded');
  const col = g.run('COL.RESPONSES');
  assert.ok(log.reads.filter((x) => x.r >= 2).every((x) => !(x.c <= col && col < x.c + x.nc)), 'the answers column was read');
  const full = g.A({ action: 'getResults', includeAnswers: true });
  assert.deepEqual(plain(full.rows[0].responses), [{ questionId: 'q1', answer: 'long answer' }]);
});

test('testSummaries: parsed once per Updated At, and the Test JSON cell is read only on a miss', () => {
  g.A({ action: 'publishTest', test: testDef('T1', { questions: [{ id: 'q1', type: 'truefalse', text: 'x', correctAnswer: true, points: 2 }] }) });
  g.A({ action: 'publishTest', test: testDef('T2') });
  g.cacheStore.clear();
  const log = watch('Tests');
  const first = plain(g.run("testSummaries_('')"));
  assert.deepEqual(first.map((t) => [t.code, t.questionCount, t.points]), [['T1', 1, 2], ['T2', 1, 1]]);
  const jsonReads = () => log.reads.filter((x) => x.c <= 4 && 4 < x.c + x.nc && x.r >= 2).length;
  assert.equal(jsonReads(), 2);
  const second = plain(g.run("testSummaries_('')"));
  assert.deepEqual(second, first);
  assert.equal(jsonReads(), 2, 'no further reads of the Test JSON column');
});

test('testSummaries: a republish shows the new shape even when the clock did not move', () => {
  g.A({ action: 'publishTest', test: testDef('T1') });
  assert.equal(plain(g.run("testSummaries_('')"))[0].questionCount, 1);
  const two = { code: 'T1', title: 'Test T1', questions: [
    { id: 'q1', type: 'truefalse', text: 'x', correctAnswer: true }, { id: 'q2', type: 'truefalse', text: 'y', correctAnswer: false }] };
  g.A({ action: 'publishTest', test: two });
  assert.equal(plain(g.run("testSummaries_('')"))[0].questionCount, 2);
});

// ---------- 5. N+1 ----------

test('class hub: accommodations are read once however many assignments there are', () => {
  const cls = g.A({ action: 'saveClass', cls: { name: 'P1', emails: ['ada@x.org'] } }).cls;
  for (const code of ['H1', 'H2', 'H3', 'H4']) {
    g.A({ action: 'publishTest', test: testDef(code) });
    g.A({ action: 'saveAssignment', assignment: { classId: cls.id, testCode: code, title: `Quiz ${code}`, dueAt: new Date(g.clock + DAY).toISOString() } });
  }
  g.A({ action: 'saveAccommodation', email: 'ada@x.org', testCode: 'H2', extraTime: 2 });
  const acc = watch('Accommodations');
  const r = g.post({ action: 'getClassHub', idToken: g.login('ada@x.org') });
  assert.equal(r.assignments.length, 4);
  assert.equal(acc.reads.filter((x) => x.r >= 2).length, 1);
});

test('getAssignmentStatus: accommodations are read once for the whole roster', () => {
  const cls = g.A({ action: 'saveClass', cls: { name: 'P1', emails: ['a@x.org', 'b@x.org', 'c@x.org'] } }).cls;
  g.A({ action: 'publishTest', test: testDef('H1') });
  const a = g.A({ action: 'saveAssignment', assignment: { classId: cls.id, testCode: 'H1', title: 'Q' } }).assignment;
  g.A({ action: 'saveAccommodation', email: 'a@x.org', testCode: 'H1', extensionUntil: new Date(g.clock + 5 * DAY).toISOString() });
  const acc = watch('Accommodations');
  const r = g.A({ action: 'getAssignmentStatus', id: a.id });
  assert.equal(r.rows.length, 3);
  assert.equal(acc.reads.filter((x) => x.r >= 2).length, 1);
});

test('accommodations: a save in the same request is seen by the next read', () => {
  g.A({ action: 'saveAccommodation', email: 'ada@x.org', testCode: 'H1', extraTime: 2 });
  assert.equal(plain(g.run("accommodationFor_('ada@x.org', 'H1')")).extraTime, 2);
  g.A({ action: 'saveAccommodation', email: 'ada@x.org', testCode: 'H1', extraTime: 3 });
  assert.equal(plain(g.run("accommodationFor_('ada@x.org', 'H1')")).extraTime, 3);
});

// ---------- 6. leaderboard ----------

test('clearLeaderboard: keeps the other rows and rewrites the range in one call', () => {
  g.A({ action: 'publishTest', test: testDef('B1', { gameMode: true, gameOptions: { leaderboard: true } }) });
  g.A({ action: 'publishTest', test: testDef('B2', { gameMode: true, gameOptions: { leaderboard: true } }) });
  for (const [code, who] of [['B1', 'a'], ['B2', 'b'], ['B1', 'c'], ['B2', 'd'], ['B1', 'e']]) {
    assert.equal(g.post({ action: 'submitGameScore', idToken: g.login(`${who}@x.org`), testCode: code, gameId: 'quiz', score: 1, name: who }).result, 'success');
  }
  const log = watch('Leaderboard');
  const r = g.A({ action: 'clearLeaderboard', testCode: 'B1' });
  assert.equal(r.removed, 3);
  assert.deepEqual(g.rows('Leaderboard').map((x) => x[2]), ['b@x.org', 'd@x.org']);
  assert.equal(log.writes.length, 1);
  assert.equal(log.deleteRows, 1);
  assert.equal(log.deleteRow, 0);
  assert.equal(g.A({ action: 'clearLeaderboard', testCode: 'NONE' }).removed, 0);
});

// ---------- 7. pruning, triggers, settings ----------

const addRow = (name, headersConst, vals) => sheetOf(name, headersConst).appendRow(vals);
const ago = (days) => new Date(g.clock - days * DAY);

test('settings: retention keys have defaults, are saved as whole numbers 1 to 3650, and bad values are ignored', () => {
  const s = g.A({ action: 'getSettings' }).settings;
  assert.deepEqual(plain({ a: s.retainLiveDays, b: s.retainLogDays, c: s.retainErrorsDays, d: s.archiveStreamDays }), { a: 1, b: 180, c: 180, d: 300 });
  const saved = g.A({ action: 'saveSettings', settings: { retainLogDays: 30, retainLiveDays: '3', retainErrorsDays: 0, archiveStreamDays: 5000 } }).settings;
  assert.equal(saved.retainLogDays, 30);
  assert.equal(saved.retainLiveDays, 3);
  assert.equal(saved.retainErrorsDays, 180);
  assert.equal(saved.archiveStreamDays, 300);
  const frac = g.A({ action: 'saveSettings', settings: { retainLogDays: 2.5 } }).settings;
  assert.equal(frac.retainLogDays, 30);
});

test('pruneSheets: keeps the right rows in Live, Log and Errors and moves old Stream posts to Stream_archive', () => {
  g.run('PRUNE_CHUNK = 2');
  const live = (n, d) => addRow('Live', 'LIVE_HEADERS', ['C1', `${n}@x.org`, n, 1, 4, '', ago(d), ago(d), false]);
  live('old1', 3); live('new1', 0); live('old2', 2); live('new2', 0.2); live('new3', 0.5);
  const logRow = (t, d) => addRow('Log', 'LOG_HEADERS', [ago(d), 'a', 'x', t, '']);
  logRow('keep-a', 10); logRow('drop-a', 200); logRow('keep-b', 179); logRow('drop-b', 400);
  const errRow = (m, d) => addRow('Errors', 'ERROR_HEADERS', [ago(d), 'p', m, '', 'b']);
  errRow('drop', 181); errRow('keep', 1);
  const post = (id, d, pinned) => addRow('Stream', 'STREAM_HEADERS', [id, 'cls', 'post', id, pinned, 'ada', ago(d)]);
  post('p-new', 5, false); post('p-old', 301, false); post('p-pinned-old', 400, true); post('p-old2', 999, false);

  const logs = ['Live', 'Log', 'Errors', 'Stream'].map(watch);
  const res = plain(g.run('pruneSheets()'));
  assert.deepEqual(res.removed, { Live: 2, Log: 2, Errors: 1 });
  assert.equal(res.archived, 2);
  assert.deepEqual(g.rows('Live').map((x) => x[2]), ['new1', 'new2', 'new3']);
  assert.deepEqual(g.rows('Log').map((x) => x[3]), ['keep-a', 'keep-b']);
  assert.deepEqual(g.rows('Errors').map((x) => x[2]), ['keep']);
  assert.deepEqual(g.rows('Stream').map((x) => x[0]), ['p-new', 'p-pinned-old']);
  assert.deepEqual(g.rows('Stream_archive').map((x) => x[0]), ['p-old', 'p-old2']);
  assert.ok(logs.every((l) => l.deleteRow === 0), 'no row-by-row deletes');
  assert.ok(logs.every((l) => l.deleteRows <= 1), 'one delete of the leftover range per sheet');
  assert.equal(g.A({ action: 'diag' }).lastPrune.archived, 2);
});

test('pruneSheets: honours retention from Settings and leaves everything when nothing is old', () => {
  g.A({ action: 'saveSettings', settings: { retainLogDays: 5, retainErrorsDays: 5 } });
  addRow('Log', 'LOG_HEADERS', [ago(6), 'a', 'x', 'old', '']);
  addRow('Log', 'LOG_HEADERS', [ago(4), 'a', 'x', 'recent', '']);
  addRow('Errors', 'ERROR_HEADERS', [ago(4), 'p', 'recent', '', 'b']);
  const res = plain(g.run('pruneSheets()'));
  assert.equal(res.removed.Log, 1);
  assert.equal(res.removed.Errors, 0);
  assert.deepEqual(g.rows('Log').map((x) => x[3]).filter((t) => t === 'old' || t === 'recent'), ['recent']);
  const again = plain(g.run('pruneSheets()'));
  assert.deepEqual(again.removed, { Live: 0, Log: 0, Errors: 0 });
  assert.equal(again.archived, 0);
});

test('pruneSheets: an empty database is fine', () => {
  const res = plain(g.run('pruneSheets()'));
  assert.deepEqual(res.removed, { Live: 0, Log: 0, Errors: 0 });
});

test('setupTriggers: installs a daily pruneSheets and an hourly Classroom publish trigger, and can run twice', () => {
  g.run('setupTriggers()');
  g.run('setupTriggers()');
  assert.equal(g.triggers.length, 2);
  assert.equal(g.triggers[0].getHandlerFunction(), 'pruneSheets');
  assert.deepEqual(plain(g.triggers[0].spec), { everyDays: 1, atHour: 3 });
  assert.equal(g.triggers[1].getHandlerFunction(), 'publishDueClassroomWork');
  assert.deepEqual(plain(g.triggers[1].spec), { everyHours: 1 });
});

test('setupTriggers: leaves triggers it does not own alone', () => {
  g.triggers.push({ getHandlerFunction: () => 'somethingElse', spec: {} });
  g.run('setupTriggers()');
  g.run('setupTriggers()');
  assert.deepEqual(g.triggers.map((t) => t.getHandlerFunction()).sort(), ['pruneSheets', 'publishDueClassroomWork', 'somethingElse']);
});

test('setup(): installs the trigger, and running it twice still leaves one', () => {
  g.run('setup()');
  g.run('setup()');
  assert.equal(g.triggers.filter((t) => t.getHandlerFunction() === 'pruneSheets').length, 1);
});

// ---------- 8. diag ----------

test('diag: admin only, row counts for every sheet, timings, and no fake student left behind', () => {
  g.A({ action: 'publishTest', test: testDef('D1') });
  sync('ada@x.org', { xp: { delta: 1 } });
  assert.equal(g.post({ action: 'diag' }).result, 'error');
  const before = g.rows('Students').length;
  const r = g.A({ action: 'diag' });
  assert.equal(r.result, 'success');
  assert.equal(typeof r.version, 'string');
  const counts = Object.fromEntries(plain(r.sheets).map((s) => [s.name, s.rows]));
  assert.equal(counts.Tests, 1);
  assert.equal(counts.Students, 1);
  for (const k of ['listTests', 'getResults', 'getClassHub', 'syncProgress']) assert.equal(typeof r.timings[k], 'number', k);
  assert.ok(Object.values(plain(r.timings)).every((t) => t >= 0), 'every timing ran');
  assert.equal(r.lastPrune, null);
  assert.equal(g.rows('Students').length, before);
  assert.ok(!g.rows('Students').some((x) => String(x[0]).includes('invalid')));
  assert.equal(g.rows('Attempts').length, 0);
  const again = sync('ada@x.org', { xp: { delta: 1 } });
  assert.equal(again.profile.xp, 2, 'real students are unaffected by the cleanup');
});

// ---------- Submissions email|code index ----------

const single = (id, who = 'ada@x.org', code = 'S1') => g.post({ submission_id: id, student_name: 'N', test_code: code, test_title: 'T', single_submission: true,
  score_achieved: 1, score_total: 1, percentage: 100, duration_seconds: 5, responses: [], flags: {}, idToken: g.login(who) });

test('email|code index: a second turn-in to a single-submission test is marked Extra, others are not', () => {
  for (let i = 0; i < 20; i++) single(`o${i}`, `o${i}@x.org`);
  single('a1');
  assert.equal(single('a2').extra_attempt, true);
  assert.equal(single('b1', 'bob@x.org').extra_attempt, undefined);
  assert.equal(single('a3', 'ada@x.org', 'S2').extra_attempt, undefined);
});

test('email|code index: a warm check reads only the rows of that student and test', () => {
  for (let i = 0; i < 20; i++) single(`o${i}`, `o${i}@x.org`);
  single('a1');
  g.run("findRowsByEmailCode_(getSheet_('Submissions', SUBMISSION_HEADERS), 'ada@x.org', 'S1')");
  const log = watch('Submissions');
  const rows = plain(g.run("findRowsByEmailCode_(getSheet_('Submissions', SUBMISSION_HEADERS), 'ada@x.org', 'S1')"));
  assert.equal(rows.length, 1);
  assert.ok(log.dataRows() <= 1, `read ${log.dataRows()} data rows`);
});

test('email|code index: rebuilds after rows move or the cache is lost', () => {
  single('x1', 'x@x.org');
  single('a1');
  g.sheets.get('Submissions').deleteRow(2);
  assert.equal(single('a2').extra_attempt, true);
  g.cacheStore.clear();
  assert.equal(single('a3').extra_attempt, true);
});
