// v4 S11–S13 backend: classes + roster-only, bank, accommodations + window + late, regrade, live, leaderboard, errors, settings.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '../../apps-script/Code.gs'), 'utf8');

function makeSheet(name) {
  const rows = [];
  const sheet = {
    name, rows,
    getLastRow: () => rows.length,
    appendRow(arr) { rows.push(arr.slice()); return sheet; },
    setFrozenRows() {},
    deleteRow(n) { rows.splice(n - 1, 1); },
    getRange: (r, c, nr = 1, nc = 1) => makeRange(r, c, nr, nc),
  };
  function makeRange(r, c, nr, nc) {
    const range = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
      getValue: () => (rows[r - 1] || [])[c - 1] ?? '',
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

let sheets, props, ctx, tokens, fetchCount;
const NOW = () => Math.floor(Date.now() / 1000);
const goodToken = (email, over = {}) => ({ aud: 'client-1', iss: 'https://accounts.google.com', email, email_verified: 'true', exp: NOW() + 3600, ...over });

function loadScript(initialProps = {}) {
  sheets = new Map(); tokens = {}; fetchCount = 0;
  props = { ADMIN_KEY: 'secret', GOOGLE_CLIENT_ID: 'client-1', ...initialProps };
  const spreadsheet = { getSheetByName: (n) => sheets.get(n) || null, insertSheet(n) { const s = makeSheet(n); sheets.set(n, s); return s; } };
  ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { DigestAlgorithm: { SHA_256: 1 }, computeDigest: (_a, s) => Array.from(Buffer.from(String(s))).slice(0, 8) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    UrlFetchApp: { fetch(url) {
      fetchCount++;
      const tok = decodeURIComponent(url.split('id_token=')[1]);
      const info = tokens[tok];
      return { getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info || {}) };
    } },
    Logger: { log() {} }, console,
  });
  vm.runInContext(source, ctx, { filename: 'Code.gs' });
}
const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
const plain = (v) => JSON.parse(JSON.stringify(v)); // vm-realm arrays/objects -> this realm
const adminRows = () => plain((sheets.get('Admins')?.rows || []).slice(1));
const logRows = () => plain((sheets.get('Log')?.rows || []).slice(1));
function seedAdmins(...rows) {
  const s = ctx.getSheet_('Admins', vm.runInContext('ADMIN_HEADERS', ctx));
  rows.forEach((r) => s.appendRow(r));
}
function login(email, name = email) { tokens[`tok-${name}`] = goodToken(email); return `tok-${name}`; }

beforeEach(() => loadScript());

const A = (b) => post({ adminKey: 'secret', ...b });
const publish = (test) => A({ action: 'publishTest', test: { title: 'T', questions: [{ id: 'q1', type: 'truefalse', text: 'x', correctAnswer: true }], ...test } });
const sub = (over = {}) => ({ submission_id: `s-${Math.random()}`, student_name: 'Ada', student_email: 'ada@x.org', test_code: 'R1', test_title: 'T', score_achieved: 4, score_total: 5, percentage: '80', responses: [], ...over });
const lastRow = () => plain(sheets.get('Submissions').rows.at(-1));
const H = () => plain(sheets.get('Submissions').rows[0]);
const cell = (row, name) => row[H().indexOf(name)];
const iso = (ms) => new Date(Date.now() + ms).toISOString();

test('classes: save, list, delete; emails cleaned and de-duplicated', () => {
  const r = A({ action: 'saveClass', cls: { name: 'Period 1', period: '1', emails: 'A@x.org, a@x.org; b@x.org bad' } });
  assert.equal(r.result, 'success');
  assert.deepEqual(plain(r.cls.emails), ['a@x.org', 'b@x.org']);
  assert.equal(A({ action: 'listClasses' }).classes.length, 1);
  assert.equal(A({ action: 'deleteClass', id: r.cls.id }).result, 'success');
  assert.equal(A({ action: 'listClasses' }).classes.length, 0);
  assert.equal(post({ action: 'listClasses' }).error, 'unauthorized');
});

test('roster-only: a student on no assigned class is stored as Not on roster, never counted; class recorded otherwise', () => {
  const c = A({ action: 'saveClass', cls: { name: 'P1', emails: ['ada@x.org'] } }).cls;
  publish({ code: 'R1', rosterOnly: true, classes: [c.id] });
  post(sub({ student_email: 'bob@x.org' }));
  assert.equal(cell(lastRow(), 'Status'), 'Not on roster');
  assert.equal(cell(lastRow(), 'Final Score'), '');
  post(sub());
  assert.equal(cell(lastRow(), 'Status'), 'Auto-graded');
  assert.equal(cell(lastRow(), 'Class'), c.id);
  // POST getTest refuses roster-only tests to students who are not on a class
  props.ALLOW_UNVERIFIED_EMAIL = 'true';
  assert.equal(post({ action: 'getTest', code: 'R1', studentEmail: 'bob@x.org' }).error, 'not_on_roster');
  assert.equal(post({ action: 'getTest', code: 'R1', studentEmail: 'ada@x.org' }).result, 'success');
});

test('window: not served before it opens or after it closes; submissions after close are kept as Closed', () => {
  publish({ code: 'W1', opensAt: iso(3600e3) });
  assert.equal(JSON.parse(ctx.doGet({ parameter: { action: 'getTest', code: 'W1' } }).getContent()).error, 'not_open');
  publish({ code: 'W2', closesAt: iso(-3600e3) });
  assert.equal(JSON.parse(ctx.doGet({ parameter: { action: 'getTest', code: 'W2' } }).getContent()).error, 'closed');
  post(sub({ test_code: 'W2' }));
  assert.equal(cell(lastRow(), 'Status'), 'Closed (not counted)');
  publish({ code: 'W3', closesAt: iso(3600e3) });
  assert.equal(JSON.parse(ctx.doGet({ parameter: { action: 'getTest', code: 'W3' } }).getContent()).result, 'success');
});

test('late window: marked Late with a flat penalty applied to the stored score', () => {
  publish({ code: 'L1', closesAt: iso(-3600e3), late: { until: iso(86400e3), penalty: { type: 'flat', value: 10 } } });
  post(sub({ test_code: 'L1', score_achieved: 10, score_total: 10, percentage: '100' }));
  const row = lastRow();
  assert.equal(cell(row, 'Late'), true);
  assert.equal(cell(row, 'Final Score'), 9);
  assert.equal(cell(row, 'Final Percentage (%)'), 90);
});

test('extension: a student with extensionUntil is on time after closesAt (server-side), others are not', () => {
  publish({ code: 'E1', closesAt: iso(-3600e3) });
  A({ action: 'extendWindow', email: 'ada@x.org', testCode: 'E1', until: iso(3600e3) });
  post(sub({ test_code: 'E1' }));
  assert.equal(cell(lastRow(), 'Status'), 'Auto-graded');
  post(sub({ test_code: 'E1', student_email: 'bob@x.org' }));
  assert.equal(cell(lastRow(), 'Status'), 'Closed (not counted)');
});

test('accommodations: merged per student (test row wins over all-tests row) and returned by getStudentStatus', () => {
  publish({ code: 'AC1' });
  A({ action: 'saveAccommodation', email: 'ada@x.org', extraTime: 1.5, readAloud: true });
  A({ action: 'saveAccommodation', email: 'ada@x.org', testCode: 'AC1', extraTime: 2, reducedChoices: true });
  const merged = plain(ctx.accommodationFor_('ada@x.org', 'AC1'));
  assert.equal(merged.extraTime, 2);
  assert.equal(merged.readAloud, true);
  assert.equal(merged.reducedChoices, true);
  props.ALLOW_UNVERIFIED_EMAIL = 'true';
  const st = post({ action: 'getStudentStatus', testCode: 'AC1', studentEmail: 'ada@x.org' });
  assert.equal(st.accommodations.extraTime, 2);
  assert.equal(st.window.state, 'open');
  assert.equal(A({ action: 'deleteAccommodation', email: 'ada@x.org', testCode: 'AC1' }).result, 'success');
});

test('bank: save, edit keeps added-by, delete', () => {
  const r = A({ action: 'saveBankItem', item: { question: { id: 'q1', type: 'mcq', text: 'x' }, tags: { topic: 'gases' } } });
  assert.equal(r.result, 'success');
  A({ action: 'saveBankItem', item: { id: r.id, question: { id: 'q1', type: 'mcq', text: 'y' }, tags: {} } });
  const items = A({ action: 'listBank' }).items;
  assert.equal(items.length, 1);
  assert.equal(items[0].question.text, 'y');
  assert.equal(items[0].added_by, 'ADMIN_KEY');
  assert.equal(A({ action: 'deleteBankItem', id: r.id }).result, 'success');
});

test('regrade: new responses and score stored, teacher overrides kept', () => {
  publish({ code: 'RG' });
  post(sub({ test_code: 'RG', submission_id: 'rg-1', responses: [{ questionId: 'q1', pointsEarned: 0, pointsPossible: 1 }], score_achieved: 0, score_total: 1, percentage: '0' }));
  const r = A({ action: 'applyRegrade', testCode: 'RG', updates: [{ submissionId: 'rg-1', responses: [{ questionId: 'q1', pointsEarned: 1, pointsPossible: 1 }], scoreAchieved: 1, scoreTotal: 1, percentage: 100 }] });
  assert.equal(r.regraded, 1);
  assert.equal(cell(lastRow(), 'Score Achieved'), 1);
  assert.equal(cell(lastRow(), 'Final Score'), 1);
});

test('live: progressPing overwrites one row per student per test; getLive flags idle', () => {
  props.ALLOW_UNVERIFIED_EMAIL = 'true';
  post({ action: 'progressPing', testCode: 'LV', studentEmail: 'ada@x.org', answered: 1, total: 5 });
  post({ action: 'progressPing', testCode: 'LV', studentEmail: 'ada@x.org', answered: 3, total: 5 });
  assert.equal(sheets.get('Live').rows.length, 2);
  const live = A({ action: 'getLive', testCode: 'LV' });
  assert.equal(live.students[0].answered, 3);
  assert.equal(live.students[0].idle, false);
});

test('leaderboard: only for game-mode tests with the option on; best score kept and capped; hide + clear', () => {
  props.ALLOW_UNVERIFIED_EMAIL = 'true';
  publish({ code: 'G0', gameMode: true });
  assert.equal(post({ action: 'submitGameScore', testCode: 'G0', gameId: 'classic', score: 10, studentEmail: 'ada@x.org' }).error, 'leaderboard_off');
  publish({ code: 'G1', gameMode: true, gameOptions: { leaderboard: true } });
  post({ action: 'submitGameScore', testCode: 'G1', gameId: 'classic', score: 500, name: 'Ada L.', studentEmail: 'ada@x.org' });
  post({ action: 'submitGameScore', testCode: 'G1', gameId: 'classic', score: 300, studentEmail: 'ada@x.org' });
  post({ action: 'submitGameScore', testCode: 'G1', gameId: 'classic', score: 9e9, name: 'Bo B.', studentEmail: 'bo@x.org' });
  const b = post({ action: 'getLeaderboard', testCode: 'G1', gameId: 'classic', studentEmail: 'ada@x.org' });
  assert.deepEqual(plain(b.top.map((x) => x.score)), [100000, 500]);
  assert.equal(b.me.rank, 2);
  A({ action: 'hideLeaderboardEntry', testCode: 'G1', email: 'bo@x.org' });
  assert.equal(post({ action: 'getLeaderboard', testCode: 'G1', gameId: 'classic', studentEmail: 'ada@x.org' }).me.rank, 1);
  assert.equal(A({ action: 'clearLeaderboard', testCode: 'G1' }).removed, 2);
});

test('error reports: refused while off; stored when the setting is on', () => {
  assert.equal(post({ action: 'reportError', message: 'x' }).error, 'error_reports_off');
  A({ action: 'saveSettings', settings: { errorReports: true } });
  assert.equal(post({ action: 'reportError', message: 'boom', page: '/x' }).result, 'success');
  assert.equal(A({ action: 'getErrors' }).errors[0].message, 'boom');
});
