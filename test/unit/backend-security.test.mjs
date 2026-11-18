// Backend security and integrity (apps-script/Code.gs in a vm): token-bound identity, roster on GET, feedback token,
// formula injection, server errors, rate limits, ADMIN_KEY lock-out, score caps, server-side streaks and badges.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BADGES, BADGE_IDS } from '../../js/lib/xp.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '../../apps-script/Code.gs'), 'utf8');

function makeSheet(name) {
  const rows = [];
  const sheet = {
    name, rows,
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(0, ...rows.map((r) => r.length)),
    appendRow(arr) { rows.push(arr.slice()); return sheet; },
    setFrozenRows() {},
    deleteRow(n) { rows.splice(n - 1, 1); },
    getRange: (r, c, nr = 1, nc = 1) => makeRange(r, c, nr, nc),
  };
  function makeRange(r, c, nr, nc) {
    const range = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
      getValue: () => (rows[r - 1] || [])[c - 1] ?? '',
      setValue(v) { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = v; return range; },
      setValues(vals) {
        vals.forEach((rv, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; rv.forEach((v, j) => { rows[r - 1 + i][c - 1 + j] = v; }); });
        return range;
      },
      setFontWeight: () => range, setBackground: () => range, getRow: () => r,
      createTextFinder(text) {
        let entire = false;
        const f = { matchEntireCell(b) { entire = b; return f; },
          findNext() {
            for (let i = 0; i < nr; i++) { const v = (rows[r - 1 + i] || [])[c - 1]; if (v !== undefined && (entire ? String(v) === text : String(v).includes(text))) return makeRange(r + i, c, 1, 1); }
            return null;
          } };
        return f;
      },
    };
    return range;
  }
  return sheet;
}

const HOUR = 3600000;
let sheets, props, ctx, tokens, cacheStore, clock;

function loadScript(initialProps = {}) {
  sheets = new Map(); tokens = {}; cacheStore = new Map(); clock = Date.UTC(2026, 10, 18, 9, 30);
  props = { ADMIN_KEY: 'secret', GOOGLE_CLIENT_ID: 'client-1', ...initialProps };
  const spreadsheet = { getSheetByName: (n) => sheets.get(n) || null, insertSheet(n) { const s = makeSheet(n); sheets.set(n, s); return s; } };
  class FakeDate extends Date {
    constructor(...a) { super(...(a.length ? a : [clock])); }
    static now() { return clock; }
  }
  ctx = vm.createContext({
    Date: FakeDate,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props && props[k] !== undefined ? props[k] : null) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 1 },
      computeDigest: (_a, s) => Array.from(Buffer.from(String(s))).slice(0, 16),
      formatDate: (d) => new Date(d.getTime()).toISOString().slice(0, 10),
    },
    Session: { getScriptTimeZone: () => 'UTC' },
    CacheService: { getScriptCache: () => ({
      get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
      put: (k, v) => { cacheStore.set(k, String(v)); },
      removeAll: (ks) => ks.forEach((k) => cacheStore.delete(k)),
    }) },
    UrlFetchApp: { fetch(url) {
      const info = tokens[decodeURIComponent(url.split('id_token=')[1])];
      return { getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info || {}) };
    } },
    Logger: { log() {} }, console,
  });
  vm.runInContext(source, ctx, { filename: 'Code.gs' });
}

const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
const get = (parameter) => JSON.parse(ctx.doGet({ parameter }).getContent());
const plain = (v) => JSON.parse(JSON.stringify(v));
const A = (body) => post({ adminKey: 'secret', ...body });
const login = (email, extra = {}) => {
  tokens[`t-${email}`] = { aud: 'client-1', iss: 'accounts.google.com', email, email_verified: 'true', exp: Math.floor(Date.now() / 1000) + 36000, ...extra };
  return `t-${email}`;
};
const rows = (name) => plain((sheets.get(name)?.rows || []).slice(1));
const col = (name) => vm.runInContext(`SUBMISSION_HEADERS.indexOf('${name}')`, ctx);
const testDef = (over = {}) => ({ code: 'C1', title: 'Chem', questions: [{ id: 'q1', type: 'truefalse', text: 'x', correctAnswer: true }], ...over });
const publish = (over) => A({ action: 'publishTest', test: testDef(over) });
const submission = (over = {}) => ({
  submission_id: 'sub-1', student_name: 'Ada', student_email: 'ada@x.org', test_code: 'C1', test_title: 'Chem',
  score_achieved: 1, score_total: 1, percentage: 100, duration_seconds: 5, responses: [], flags: {}, ...over,
});

beforeEach(() => loadScript());

// ---------- 1. submissions ----------

test('submission: a valid token decides the stored email and name, not the body', () => {
  const r = post(submission({ student_email: 'victim@x.org', student_name: 'Fake', idToken: login('ada@x.org', { name: 'Ada Lovelace' }) }));
  assert.equal(r.result, 'success');
  const row = rows('Submissions')[0];
  assert.equal(row[3], 'ada@x.org');
  assert.equal(row[2], 'Ada Lovelace');
  assert.equal(row[col('Identity')], 'verified');
});

test('submission: a token without a name keeps the body name as display text', () => {
  post(submission({ student_name: 'Ada', idToken: login('ada@x.org') }));
  assert.equal(rows('Submissions')[0][2], 'Ada');
});

test('submission: a bad token is refused and nothing is stored', () => {
  assert.equal(post(submission({ idToken: 'bogus' })).error, 'invalid_token');
  assert.equal(sheets.has('Submissions') ? rows('Submissions').length : 0, 0);
});

test('submission: without a token it is refused unless ALLOW_UNVERIFIED_EMAIL is set', () => {
  assert.equal(post(submission()).error, 'unauthorized');
  loadScript({ ALLOW_UNVERIFIED_EMAIL: 'true' });
  assert.equal(post(submission()).result, 'success');
  const row = rows('Submissions')[0];
  assert.equal(row[3], 'ada@x.org');
  assert.equal(row[col('Identity')], 'unverified');
  assert.equal(post(submission({ submission_id: 'sub-2', student_email: 'not an email' })).error, 'unauthorized');
});

test('submission: a retry of a stored submission is a duplicate even without credentials', () => {
  post(submission({ idToken: login('ada@x.org') }));
  assert.equal(post(submission()).duplicate, true);
});

test('submission: the single-submission check uses the stored email, not the claimed one', () => {
  publish({ singleSubmission: true });
  const ada = login('ada@x.org');
  post(submission({ idToken: ada }));
  const second = post(submission({ submission_id: 'sub-2', student_email: 'someone-else@x.org', idToken: ada }));
  assert.equal(second.extra_attempt, true);
  assert.equal(rows('Submissions')[1][3], 'ada@x.org');
});

test('submission: the roster check uses the token email, not the claimed one', () => {
  publish({ rosterOnly: true, classes: ['k1'] });
  A({ action: 'saveClass', cls: { id: 'k1', name: 'P1', emails: ['ada@x.org'] } });
  const r = post(submission({ student_email: 'ada@x.org', idToken: login('eve@x.org') }));
  assert.equal(r.not_counted, 'Not on roster');
  assert.equal(post(submission({ submission_id: 'sub-2', student_email: 'eve@x.org', idToken: login('ada@x.org') })).not_counted, undefined);
});

test('older Submissions sheets get the Identity header', () => {
  const s = makeSheet('Submissions');
  s.rows.push(['Timestamp', 'Submission ID']);
  sheets.set('Submissions', s);
  post(submission({ idToken: login('ada@x.org') }));
  assert.equal(s.rows[0].at(-1), 'Identity');
  assert.equal(s.rows[1].at(-1), 'verified');
});

// ---------- 2. roster on GET ----------

test('GET getTest does not serve a roster-only test; the POST path with a token does', () => {
  publish({ code: 'R1', rosterOnly: true, classes: ['k1'] });
  publish({ code: 'OPEN1' });
  assert.equal(get({ action: 'getTest', code: 'R1' }).error, 'not_on_roster');
  assert.equal(get({ action: 'getTest', code: 'OPEN1' }).result, 'success');
  A({ action: 'saveClass', cls: { id: 'k1', name: 'P1', emails: ['ada@x.org'] } });
  const ok = post({ action: 'getTest', code: 'R1', idToken: login('ada@x.org') });
  assert.equal(ok.result, 'success');
  assert.equal(post({ action: 'getTest', code: 'R1', idToken: login('eve@x.org') }).error, 'not_on_roster');
});

// ---------- 3. feedback ----------

test('getFeedback needs a token whose email matches the row', () => {
  post(submission({ responses: [{ questionId: 'q1', pointsPossible: 1, pointsEarned: 0, needsGrading: true }], idToken: login('ada@x.org') }));
  A({ action: 'saveGrade', submissionId: 'sub-1', grades: { q1: 1 }, release: true });
  assert.equal(post({ action: 'getFeedback', submissionId: 'sub-1', studentEmail: 'ada@x.org' }).error, 'unauthorized');
  assert.equal(post({ action: 'getFeedback', submissionId: 'sub-1', idToken: 'bogus' }).error, 'invalid_token');
  assert.equal(post({ action: 'getFeedback', submissionId: 'sub-1', idToken: login('eve@x.org') }).error, 'not_authorized');
  const ok = post({ action: 'getFeedback', submissionId: 'sub-1', idToken: login('ada@x.org') });
  assert.equal(ok.released, true);
  assert.equal(ok.final_score, 1);
});

// ---------- 4. formula injection ----------

const F = '=HYPERLINK("x")';
const isFormula = (v) => typeof v === 'string' && /^[=+\-@]/.test(v);

// Every call below carries the formula in one string field at a time (walks the whole body).
function stringPaths(obj, prefix = []) {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out.push([...prefix, k]);
    else if (Array.isArray(v)) v.forEach((x, i) => { if (typeof x === 'string') out.push([...prefix, k, i]); else if (x && typeof x === 'object') out.push(...stringPaths(x, [...prefix, k, i])); });
    else if (v && typeof v === 'object') out.push(...stringPaths(v, [...prefix, k]));
  }
  return out;
}
function withValue(obj, p, value) {
  const copy = JSON.parse(JSON.stringify(obj));
  let o = copy;
  p.slice(0, -1).forEach((k) => { o = o[k]; });
  o[p.at(-1)] = value;
  return copy;
}
function leakedCells() {
  const bad = [];
  for (const [name, sheet] of sheets) sheet.rows.slice(1).forEach((r, i) => r.forEach((v, j) => { if (isFormula(v)) bad.push(`${name}[${i + 2}][${j}]=${v}`); }));
  return bad;
}

test('no stored cell starts with = + - or @ whatever string field carries a formula', () => {
  const token = login('ada@x.org', { name: F });
  const baseline = [
    submission({ idToken: token }),
    { action: 'publishTest', test: testDef({ title: 'T' }) },
    { action: 'saveClass', cls: { id: 'k1', name: 'P1', period: '1', emails: ['ada@x.org'] } },
    { action: 'saveBankItem', item: { id: 'b1', question: { type: 'truefalse', text: 'x' }, tags: { topic: 'x' } } },
    { action: 'saveAccommodation', email: 'ada@x.org', testCode: 'C1', notes: 'n' },
    { action: 'saveAssignment', assignment: { classId: 'k1', testCode: 'C1', title: 'T', instructions: 'i', modes: ['classic'] } },
    { action: 'postStream', classId: 'k1', body: 'hello' },
    { action: 'saveSettings', settings: { errorReports: true } },
    { action: 'progressPing', testCode: 'C1', name: 'Ada', idToken: token },
    { action: 'saveStudentProfile', prefs: { theme: 'dark', accent: 'navy' }, idToken: token },
    { action: 'syncProgress', attempt: { code: 'C1', mode: 'classic', total: 3, answeredCount: 1, answers: { q1: 'a' } }, xp: { delta: 20, badges: ['first_round'], lastActiveDate: '2026-11-18' }, idToken: token },
    { action: 'getStudentProfile', name: 'Ada', idToken: token },
    { action: 'reportError', page: 'p', message: 'm', detail: 'd', browser: 'b', clientId: 'c1' },
    { action: 'saveAdmin', email: 'new@x.org', role: 'admin' },
  ];
  const later = [
    { action: 'submitGameScore', testCode: 'C1', gameId: 'classic', score: 10, name: 'n', idToken: token },
    { action: 'saveGrade', submissionId: 'sub-1', grades: { q1: 1 }, note: 'n', comments: { q1: 'c' }, gradedBy: 'g', release: true },
    { action: 'saveAdmin', email: 'second@x.org', role: 'admin' },
  ];
  let calls = 0;
  for (const body of [...baseline, ...later]) {
    for (const p of stringPaths(body)) {
      if (p[0] === 'idToken') continue;
      loadScript({ ADMIN_EMAILS: 'owner@x.org', ALLOW_UNVERIFIED_EMAIL: 'true' });
      const tk = login('ada@x.org', { name: F });
      const fixed = (b) => JSON.parse(JSON.stringify(b).replaceAll('t-ada@x.org', tk));
      // Seed prerequisites with clean values, then send the poisoned call.
      A({ action: 'saveSettings', settings: { errorReports: true } });
      A({ action: 'publishTest', test: testDef({ gameMode: true, gameOptions: { leaderboard: true } }) });
      A({ action: 'saveClass', cls: { id: 'k1', name: 'P1', emails: ['ada@x.org'] } });
      post(submission({ idToken: tk }));
      const poisoned = withValue(fixed(body), p, F);
      const res = body.action ? A(poisoned) : post(poisoned);
      calls++;
      assert.notEqual(res.error, 'server_error', `${body.action || 'submit'} ${p.join('.')}`);
      assert.deepEqual(leakedCells(), [], `${body.action || 'submit'} with ${p.join('.')} = formula`);
    }
  }
  assert.ok(calls > 40, `swept ${calls} fields`);
});

test('every cell the known misses write is text_()-guarded', () => {
  loadScript({ ALLOW_UNVERIFIED_EMAIL: 'true' });
  const tk = login('ada@x.org', { name: F });
  post({ action: 'getStudentProfile', idToken: tk, name: F });
  post({ action: 'syncProgress', idToken: tk, attempt: { code: 'C1', mode: F, total: 1, answeredCount: 1 }, xp: { delta: 5, lastActiveDate: F } });
  assert.equal(rows('Students')[0][1], "'" + F);
  assert.equal(rows('Attempts')[0][2], "'" + F);
  A({ action: 'saveClass', cls: { id: 'k1', name: 'P1', emails: [] } });
  A({ action: 'saveAssignment', assignment: { classId: 'k1', testCode: 'C1' } });
  assert.deepEqual(leakedCells(), []);
});

// ---------- 5. server errors ----------

test('doPost and doGet catch-alls log to Errors and reply with a code and a short ref', () => {
  ctx.handleSubmission_ = () => { throw new Error('boom =secret detail'); };
  const r = post(submission());
  assert.equal(r.result, 'error');
  assert.equal(r.error, 'server_error');
  assert.match(r.ref, /^[a-z0-9]{6}$/);
  assert.ok(!JSON.stringify(r).includes('boom'), 'error text never reaches the client');
  const e = rows('Errors')[0];
  assert.equal(e[1], 'backend:');
  assert.ok(e[2].startsWith(`[${r.ref}] Error: boom`));
  assert.ok(!isFormula(e[2]) && !isFormula(e[3]));
  assert.ok(e[3].includes('Error'));

  ctx.getTest_ = () => { throw new Error('get failed'); };
  const g = get({ action: 'getTest', code: 'X' });
  assert.equal(g.error, 'server_error');
  assert.match(g.ref, /^[a-z0-9]{6}$/);
  assert.equal(rows('Errors')[1][1], 'backend:getTest');
});

test('a failing error log still replies server_error', () => {
  ctx.handleSubmission_ = () => { throw new Error('x'); };
  ctx.getSheet_ = () => { throw new Error('sheet down'); };
  assert.equal(post(submission()).error, 'server_error');
});

// ---------- 6. reportError limits ----------

test('reportError: 20 an hour per sender, other senders unaffected, 500 an hour overall', () => {
  A({ action: 'saveSettings', settings: { errorReports: true } });
  const send = (extra) => post({ action: 'reportError', message: 'm', ...extra });
  for (let i = 0; i < 20; i++) assert.equal(send({ clientId: 'device-a' }).result, 'success', `report ${i + 1}`);
  assert.equal(send({ clientId: 'device-a' }).error, 'rate_limited');
  assert.equal(send({ clientId: 'device-b' }).result, 'success');
  const tok = login('ada@x.org');
  for (let i = 0; i < 20; i++) assert.equal(send({ idToken: tok, clientId: 'rotating-' + i }).result, 'success');
  assert.equal(send({ idToken: tok, clientId: 'another' }).error, 'rate_limited', 'a token counts by its email, not the client id');
  const hour = Math.floor(clock / HOUR);
  cacheStore.set(`errors:g:${hour}`, '500');
  assert.equal(send({ clientId: 'fresh' }).error, 'rate_limited');
  clock += HOUR;
  assert.equal(send({ clientId: 'device-a' }).result, 'success', 'limits reset each hour');
});

test('reportError keeps stored cells safe and hashes the sender key', () => {
  A({ action: 'saveSettings', settings: { errorReports: true } });
  post({ action: 'reportError', message: F, page: F, detail: F, browser: F, clientId: 'device-a' });
  assert.deepEqual(leakedCells(), []);
  assert.ok([...cacheStore.keys()].every((k) => !k.includes('device-a')));
});

// ---------- 7. ADMIN_KEY ----------

test('safeEqual_ compares whole strings', () => {
  assert.equal(ctx.safeEqual_('secret', 'secret'), true);
  assert.equal(ctx.safeEqual_('secret', 'secreT'), false);
  assert.equal(ctx.safeEqual_('secret', 'secret1'), false);
  assert.equal(ctx.safeEqual_('', 'secret'), false);
});

test('ADMIN_KEY: 10 failures in an hour lock the key out until the hour ends', () => {
  for (let i = 0; i < 10; i++) assert.equal(post({ action: 'listTests', adminKey: 'wrong' + i }).error, 'unauthorized');
  assert.equal(post({ action: 'listTests', adminKey: 'secret' }).error, 'locked', 'even the right key');
  assert.equal(post({ action: 'listTests', adminKey: 'wrong' }).error, 'locked');
  clock += HOUR;
  assert.equal(post({ action: 'listTests', adminKey: 'secret' }).result, 'success');
});

test('ADMIN_KEY: success before the limit works and a Google admin is not locked out', () => {
  for (let i = 0; i < 9; i++) post({ action: 'listTests', adminKey: 'wrong' });
  assert.equal(post({ action: 'listTests', adminKey: 'secret' }).result, 'success');
  post({ action: 'listTests', adminKey: 'wrong' });
  assert.equal(post({ action: 'listTests', adminKey: 'secret' }).error, 'locked');
  loadScript({ ADMIN_EMAILS: 'owner@x.org' });
  for (let i = 0; i < 12; i++) post({ action: 'listTests', adminKey: 'wrong' });
  assert.equal(post({ action: 'listTests', idToken: login('owner@x.org') }).result, 'success');
});

// ---------- 8. client-trusted values ----------

const questions = (n, points = 1) => Array.from({ length: n }, (_, i) => ({ id: `q${i}`, type: 'truefalse', text: 'x', correctAnswer: true, points }));

test('submitGameScore caps the score by mode from the question count', () => {
  const tk = login('ada@x.org');
  const best = (mode, test = 'G1') => {
    post({ action: 'submitGameScore', testCode: test, gameId: mode, score: 9e9, idToken: tk });
    return post({ action: 'getLeaderboard', testCode: test, gameId: mode, idToken: tk }).me.score;
  };
  publish({ code: 'G1', gameMode: true, gameOptions: { leaderboard: true }, questions: questions(10) });
  assert.equal(best('classic'), 15000);
  assert.equal(best('lightning'), 1500);
  assert.equal(best('tower'), 1000);
  assert.equal(best('bingo'), 3500);
  assert.equal(best('quizshow'), 5000);
  assert.equal(best('race'), 1500);
  assert.equal(best('survival'), 10 * 150);
  assert.equal(best('boss'), 10 * 150 + 1000);
  publish({ code: 'G2', gameMode: true, gameOptions: { leaderboard: true }, questions: questions(10, 3) });
  assert.equal(best('survival', 'G2'), 10 * 350);
  publish({ code: 'G3', gameMode: true, gameOptions: { leaderboard: true }, questions: questions(100) });
  assert.equal(best('classic', 'G3'), 100000, 'never above 100000');
  assert.equal(best('study'), 0);
  assert.equal(best('flashcards'), 0);
  assert.equal(best('made-up'), 1000, 'an unknown mode gets the lowest per-question rate');
});

test('submitGameScore keeps a score at or under the cap', () => {
  const tk = login('ada@x.org');
  publish({ code: 'G1', gameMode: true, gameOptions: { leaderboard: true }, questions: questions(10) });
  post({ action: 'submitGameScore', testCode: 'G1', gameId: 'classic', score: 12345, idToken: tk });
  assert.equal(post({ action: 'getLeaderboard', testCode: 'G1', gameId: 'classic', idToken: tk }).me.score, 12345);
});

const profile = (day) => { clock = Date.UTC(2026, 10, day, 12); return post({ action: 'syncProgress', idToken: login('ada@x.org'), xp: { delta: 10, streakDays: 999, lastActiveDate: '2000-01-01' } }).profile; };

test('syncProgress works the streak out from server activity dates and ignores the client', () => {
  assert.equal(profile(18).streakDays, 1, 'client streakDays 999 ignored');
  assert.equal(profile(18).streakDays, 1, 'same day does not add');
  assert.equal(profile(19).streakDays, 2);
  assert.equal(profile(20).streakDays, 3);
  assert.equal(profile(20).lastActiveDate, '2026-11-20', 'client lastActiveDate ignored');
  assert.equal(profile(23).streakDays, 1, 'a gap resets it');
});

test('syncProgress counts a day only when XP was earned', () => {
  profile(18);
  clock = Date.UTC(2026, 10, 19, 12);
  const p = post({ action: 'syncProgress', idToken: login('ada@x.org'), xp: { delta: 0, streakDays: 50 } }).profile;
  assert.equal(p.streakDays, 1);
  assert.equal(p.lastActiveDate, '2026-11-18');
});

test('syncProgress accepts only known badges', () => {
  const r = post({ action: 'syncProgress', idToken: login('ada@x.org'), xp: { delta: 1, badges: ['first_round', 'level_5', 'made_up', '=HYPERLINK("x")', 'admin'] } });
  assert.deepEqual(plain(r.profile.badges).sort(), ['first_round', 'level_5']);
});

test('BADGE_IDS in Code.gs equals the badge ids in js/lib/xp.js', () => {
  assert.deepEqual([...BADGE_IDS], BADGES.map((b) => b.id));
  assert.deepEqual(plain(vm.runInContext('BADGE_IDS', ctx)), [...BADGE_IDS]);
});
