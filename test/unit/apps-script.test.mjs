import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '../../apps-script/Code.gs'), 'utf8');

// ---- Minimal in-memory fakes of the Apps Script services Code.gs uses ----
function makeSheet(name) {
  const rows = []; // array of arrays
  const sheet = {
    name,
    frozenRows: 0,
    formats: [],
    getLastRow: () => rows.length,
    appendRow(arr) { rows.push(arr.slice()); return sheet; },
    setFrozenRows(n) { sheet.frozenRows = n; },
    deleteRow(n) { rows.splice(n - 1, 1); },
    getDataRange: () => makeRange(1, 1, rows.length, Math.max(0, ...rows.map((r) => r.length))),
    getRange: (r, c, nr = 1, nc = 1) => makeRange(r, c, nr, nc),
    rows,
  };
  function makeRange(r, c, nr, nc) {
    const range = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
      getValue: () => (rows[r - 1] || [])[c - 1] ?? '',
      setValues(vals) {
        vals.forEach((rowVals, i) => {
          rows[r - 1 + i] = rows[r - 1 + i] || [];
          rowVals.forEach((v, j) => { rows[r - 1 + i][c - 1 + j] = v; });
        });
        return range;
      },
      setFontWeight(w) { sheet.formats.push({ weight: w, r, c, nr, nc }); return range; },
      setBackground(bg) { sheet.formats.push({ bg, r, c, nr, nc }); return range; },
      getRow: () => r,
      createTextFinder(text) {
        let entire = false;
        const finder = {
          matchEntireCell(b) { entire = b; return finder; },
          findNext() {
            for (let i = 0; i < nr; i++) {
              const v = (rows[r - 1 + i] || [])[c - 1];
              if (v !== undefined && (entire ? String(v) === text : String(v).includes(text))) return makeRange(r + i, c, 1, 1);
            }
            return null;
          },
        };
        return finder;
      },
    };
    return range;
  }
  return sheet;
}

let sheets, props, ctx, lockCalls;

function loadScript(initialProps = {}) {
  sheets = new Map();
  props = { ...initialProps };
  lockCalls = { wait: 0, release: 0 };
  const spreadsheet = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet(n) { const s = makeSheet(n); sheets.set(n, s); return s; },
  };
  ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (text) => ({ text, mime: null, setMimeType(m) { this.mime = m; return this; }, getContent() { return this.text; } }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { lockCalls.wait++; }, releaseLock: () => { lockCalls.release++; } }) },
    Logger: { log: () => {} },
    console,
  });
  vm.runInContext(source, ctx, { filename: 'Code.gs' });
}

const out = (o) => JSON.parse(o.getContent());
const post = (body) => out(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }));
const get = (parameter) => out(ctx.doGet({ parameter }));

const sample = (over = {}) => ({
  submission_id: 'sub-1', student_name: 'Ada', student_email: 'ada@x.org', test_code: 'CHEM101', test_title: 'Foundations',
  score_achieved: 5, score_total: 7, percentage: '71.43', duration_seconds: 120,
  responses: [{ questionId: 'q1', isCorrect: true }], started_at: 'a', submitted_at: 'b',
  flags: { tab_switches: 2, auto_submitted: true, mode: 'focus' }, ...over,
});
const sampleTest = (over = {}) => ({ code: 'chem101', title: 'Foundations', questions: [{ id: 'q1', type: 'truefalse', text: 'x', correctAnswer: true }], ...over });

beforeEach(() => loadScript({ ADMIN_KEY: 'secret' }));

test('ping returns version', () => {
  const r = get({ action: 'ping' });
  assert.equal(r.result, 'success');
  assert.equal(r.version, vm.runInContext('VERSION', ctx));
});

test('doGet unknown action is an error', () => {
  assert.equal(get({ action: 'nope' }).error, 'unknown_action');
  assert.equal(out(ctx.doGet({})).result, 'error');
});

test('first submission creates both sheets with formatted headers', () => {
  assert.equal(post(sample()).result, 'success');
  const s = sheets.get('Submissions');
  assert.equal(s.frozenRows, 1);
  assert.deepEqual([...s.rows[0]], [
    'Timestamp', 'Submission ID', 'Student Name', 'Student Email', 'Test Code', 'Test Title', 'Score Achieved', 'Total Score',
    'Percentage (%)', 'Duration (s)', 'Tab Switches', 'Auto Submitted', 'Detailed Responses (JSON)', 'Flags (JSON)',
  ]);
  assert.ok(s.formats.some((f) => f.weight === 'bold' && f.r === 1 && f.nc === 14));
  assert.ok(s.formats.some((f) => f.bg === '#E2E8F0'));
});

test('setup creates Submissions and Tests sheets', () => {
  ctx.setup();
  assert.deepEqual([...sheets.get('Tests').rows[0]], ['Code', 'Title', 'Updated At', 'Test JSON']);
  assert.equal(sheets.get('Tests').frozenRows, 1);
  assert.ok(sheets.has('Submissions'));
});

test('submission row has correct column order and numeric types', () => {
  post(sample());
  const row = sheets.get('Submissions').rows[1];
  assert.equal(Object.prototype.toString.call(row[0]), '[object Date]');
  assert.deepEqual([...row.slice(1, 12)], ['sub-1', 'Ada', 'ada@x.org', 'CHEM101', 'Foundations', 5, 7, 71.43, 120, 2, true]);
  assert.deepEqual(JSON.parse(row[12]), [{ questionId: 'q1', isCorrect: true }]);
  assert.equal(JSON.parse(row[13]).mode, 'focus');
});

test('duplicate submission_id is not appended twice', () => {
  post(sample());
  const again = post(sample());
  assert.equal(again.result, 'success');
  assert.equal(again.duplicate, true);
  post(sample({ submission_id: 'sub-2' }));
  assert.equal(sheets.get('Submissions').getLastRow(), 3);
});

test('submission uses the script lock and always releases it', () => {
  post(sample());
  assert.equal(lockCalls.wait, 1);
  assert.equal(lockCalls.release, 1);
});

test('Netlify webhook shape is parsed (strings coerced, JSON columns decoded)', () => {
  const r = post({
    number: 3, title: 'chemistryworks-submissions', form_name: 'chemistryworks-submissions',
    data: {
      submission_id: 'nl-1', student_name: 'Bo', student_email: 'bo@x.org', test_code: 'CHEM101', test_title: 'Foundations',
      score_achieved: '4', score_total: '7', percentage: '57.14', duration_seconds: '90',
      responses_json: JSON.stringify([{ questionId: 'q1' }]), flags_json: JSON.stringify({ tab_switches: 1, auto_submitted: false }),
      submitted_at: 'z',
    },
  });
  assert.equal(r.result, 'success');
  const row = sheets.get('Submissions').rows[1];
  assert.deepEqual([...row.slice(1, 12)], ['nl-1', 'Bo', 'bo@x.org', 'CHEM101', 'Foundations', 4, 7, 57.14, 90, 1, false]);
  assert.deepEqual(JSON.parse(row[12]), [{ questionId: 'q1' }]);
});

test('direct submission followed by webhook delivery is deduped', () => {
  post(sample({ submission_id: 'dual' }));
  const r = post({ data: { submission_id: 'dual', test_code: 'CHEM101', percentage: '71.43' } });
  assert.equal(r.duplicate, true);
  assert.equal(sheets.get('Submissions').getLastRow(), 2);
});

test('submission without id or code is rejected', () => {
  assert.equal(post(sample({ submission_id: '' })).error, 'missing_submission_id');
  assert.equal(post(sample({ test_code: '' })).error, 'missing_test_code');
});

test('malformed JSON body returns an error and does not throw', () => {
  assert.deepEqual(post('{not json'), { result: 'error', error: 'invalid_json' });
  assert.equal(out(ctx.doPost({})).result, 'error');
});

test('unknown POST action is an error', () => {
  assert.equal(post({ action: 'explode' }).error, 'unknown_action');
});

test('admin ops require ADMIN_KEY to be configured', () => {
  loadScript({});
  for (const action of ['publishTest', 'listTests', 'deleteTest', 'getResults']) {
    assert.equal(post({ action, adminKey: 'x' }).error, 'admin_key_not_configured');
  }
});

test('admin ops reject a wrong or missing key', () => {
  for (const action of ['publishTest', 'listTests', 'deleteTest', 'getResults']) {
    assert.equal(post({ action, adminKey: 'wrong', test: sampleTest() }).error, 'unauthorized');
    assert.equal(post({ action }).error, 'unauthorized');
  }
  assert.equal(sheets.has('Tests'), false);
});

test('publish, get, list and delete a test', () => {
  const pub = post({ action: 'publishTest', adminKey: 'secret', test: sampleTest() });
  assert.equal(pub.result, 'success');
  assert.equal(pub.code, 'CHEM101');

  const got = get({ action: 'getTest', code: 'chem101' });
  assert.equal(got.result, 'success');
  assert.equal(got.test.code, 'CHEM101');
  assert.equal(got.test.questions.length, 1);

  const list = post({ action: 'listTests', adminKey: 'secret' });
  assert.equal(list.tests.length, 1);
  assert.equal(list.tests[0].code, 'CHEM101');
  assert.equal(list.tests[0].title, 'Foundations');
  assert.ok(list.tests[0].updatedAt);

  const del = post({ action: 'deleteTest', adminKey: 'secret', code: 'CHEM101' });
  assert.equal(del.result, 'success');
  assert.equal(get({ action: 'getTest', code: 'CHEM101' }).error, 'not_found');
  assert.equal(post({ action: 'deleteTest', adminKey: 'secret', code: 'CHEM101' }).error, 'not_found');
});

test('publishing the same code upserts instead of duplicating', () => {
  post({ action: 'publishTest', adminKey: 'secret', test: sampleTest() });
  const second = post({ action: 'publishTest', adminKey: 'secret', test: sampleTest({ title: 'Renamed' }) });
  assert.equal(second.updated, true);
  assert.equal(sheets.get('Tests').getLastRow(), 2);
  assert.equal(get({ action: 'getTest', code: 'CHEM101' }).test.title, 'Renamed');
});

test('getTest for an unknown code is not_found (public, no key needed)', () => {
  assert.equal(get({ action: 'getTest', code: 'NOPE' }).error, 'not_found');
  assert.equal(get({ action: 'getTest' }).error, 'not_found');
});

test('publishTest validates code, title and questions', () => {
  const bad = (t) => post({ action: 'publishTest', adminKey: 'secret', test: t });
  assert.match(bad(sampleTest({ code: '' })).error, /^invalid_test/);
  assert.match(bad(sampleTest({ code: 'a b!' })).error, /^invalid_test/);
  assert.match(bad(sampleTest({ title: '  ' })).error, /^invalid_test/);
  assert.match(bad(sampleTest({ questions: [] })).error, /^invalid_test/);
  assert.match(bad(sampleTest({ questions: 'x' })).error, /^invalid_test/);
  assert.match(bad(null).error, /^invalid_test/);
});

test('getResults returns parsed ResultRow objects and filters by test code', () => {
  post(sample());
  post(sample({ submission_id: 'sub-2', test_code: 'OTHER', percentage: '100.00', score_achieved: 7 }));
  const all = post({ action: 'getResults', adminKey: 'secret' });
  assert.equal(all.rows.length, 2);
  const r = all.rows[0];
  assert.equal(r.submission_id, 'sub-1');
  assert.equal(r.student_name, 'Ada');
  assert.equal(r.student_email, 'ada@x.org');
  assert.equal(r.test_code, 'CHEM101');
  assert.equal(r.test_title, 'Foundations');
  assert.equal(r.score_achieved, 5);
  assert.equal(r.score_total, 7);
  assert.equal(r.percentage, 71.43);
  assert.equal(typeof r.percentage, 'number');
  assert.equal(r.duration_seconds, 120);
  assert.deepEqual(r.responses, [{ questionId: 'q1', isCorrect: true }]);
  assert.equal(r.flags.tab_switches, 2);
  assert.equal(Number.isNaN(Date.parse(r.timestamp)), false);

  const filtered = post({ action: 'getResults', adminKey: 'secret', testCode: 'other' });
  assert.deepEqual(filtered.rows.map((x) => x.submission_id), ['sub-2']);
});

test('getResults on an empty sheet returns no rows', () => {
  assert.deepEqual(post({ action: 'getResults', adminKey: 'secret' }), { result: 'success', rows: [] });
});

test('appsscript.json manifest is valid and configured for the web app', () => {
  const m = JSON.parse(fs.readFileSync(path.join(here, '../../apps-script/appsscript.json'), 'utf8'));
  assert.equal(m.runtimeVersion, 'V8');
  assert.equal(m.timeZone, 'America/Los_Angeles');
  assert.equal(m.webapp.access, 'ANYONE_ANONYMOUS');
  assert.equal(m.webapp.executeAs, 'USER_DEPLOYING');
});
