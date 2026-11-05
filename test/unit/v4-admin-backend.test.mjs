// V4-07 backend: requireAdmin_, Admins sheet, Log sheet, admin management actions (apps-script/Code.gs in a vm).
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

test('version is 4.0.0 and ping reports it', () => {
  assert.equal(vm.runInContext('VERSION', ctx), '4.0.0');
  assert.equal(JSON.parse(ctx.doGet({ parameter: { action: 'ping' } }).getContent()).version, '4.0.0');
});

test('requireAdmin_: key path', () => {
  assert.deepEqual({ ...ctx.requireAdmin_({ adminKey: 'secret' }) }, { ok: true, email: '', role: 'admin', via: 'key' });
  assert.equal(ctx.requireAdmin_({ adminKey: 'nope' }).error, 'unauthorized');
  assert.equal(ctx.requireAdmin_({}).error, 'unauthorized');
  loadScript({ ADMIN_KEY: undefined });
  delete props.ADMIN_KEY;
  assert.equal(ctx.requireAdmin_({ adminKey: 'x' }).error, 'admin_key_not_configured');
});

test('requireAdmin_: listed token passes, role comes from the sheet', () => {
  seedAdmins(['Owner@School.org', 'owner', 'x', ''], ['t@school.org', 'admin', 'x', '']);
  const r = ctx.requireAdmin_({ idToken: login('t@school.org') });
  assert.deepEqual({ ...r }, { ok: true, email: 't@school.org', role: 'admin', via: 'google' });
  assert.equal(ctx.requireAdmin_({ idToken: login('owner@school.org') }).role, 'owner');
});

test('requireAdmin_: unlisted token is not_admin, even with a valid ADMIN_KEY in the body', () => {
  seedAdmins(['t@school.org', 'owner', 'x', '']);
  const r = ctx.requireAdmin_({ idToken: login('stranger@school.org'), adminKey: 'secret' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'not_admin');
});

test('requireAdmin_: bad tokens are invalid_token', () => {
  seedAdmins(['t@school.org', 'owner', 'x', '']);
  assert.equal(ctx.requireAdmin_({ idToken: 'unknown-token' }).error, 'invalid_token');
  const cases = [{ aud: 'other' }, { email_verified: 'false' }, { exp: NOW() - 5 }, { iss: 'https://evil.example' }];
  cases.forEach((over, i) => {
    tokens[`bad${i}`] = goodToken('t@school.org', over);
    assert.equal(ctx.requireAdmin_({ idToken: `bad${i}` }).error, 'invalid_token', JSON.stringify(over));
  });
  loadScript({ GOOGLE_CLIENT_ID: undefined });
  delete props.GOOGLE_CLIENT_ID;
  assert.equal(ctx.requireAdmin_({ idToken: 'x' }).error, 'identity_not_configured');
});

test('requireAdmin_: ALLOW_UNVERIFIED_EMAIL never grants admin', () => {
  loadScript({ ALLOW_UNVERIFIED_EMAIL: 'true' });
  seedAdmins(['t@school.org', 'owner', 'x', '']);
  assert.equal(ctx.requireAdmin_({ studentEmail: 't@school.org' }).error, 'unauthorized');
  assert.equal(ctx.requireAdmin_({ idToken: 'none', studentEmail: 't@school.org' }).error, 'invalid_token');
});

test('email normalisation: trimmed, lower-cased, blank rows and unknown roles handled', () => {
  seedAdmins(['  Mixed.Case@School.ORG ', 'OWNER', '', ''], ['', 'admin', '', ''], ['dup@school.org', 'admin', '', ''], ['DUP@school.org', 'owner', '', ''], ['x@school.org', 'superuser', '', '']);
  const rows = ctx.readAdminRows_();
  assert.deepEqual(plain(rows.map((r) => [r.email, r.role])), [['mixed.case@school.org', 'owner'], ['dup@school.org', 'admin'], ['x@school.org', 'admin']]);
  assert.equal(ctx.requireAdmin_({ idToken: login('MIXED.case@school.org') }).role, 'owner');
});

test('seeding from ADMIN_EMAILS: first is owner, only when the sheet is empty, invalid entries skipped', () => {
  loadScript({ ADMIN_EMAILS: ' First@School.org, second@school.org ,, not-an-email, first@school.org' });
  assert.equal(ctx.requireAdmin_({ idToken: login('second@school.org') }).role, 'admin');
  assert.deepEqual(adminRows().map((r) => [r[0], r[1]]), [['first@school.org', 'owner'], ['second@school.org', 'admin']]);
  // the sheet wins afterwards
  props.ADMIN_EMAILS = 'other@school.org';
  assert.equal(ctx.requireAdmin_({ idToken: login('other@school.org') }).error, 'not_admin');
  assert.equal(adminRows().length, 2);
});

test('no Admins and no ADMIN_EMAILS: google tokens fail, ADMIN_KEY still works', () => {
  assert.equal(ctx.requireAdmin_({ idToken: login('a@school.org') }).error, 'not_admin');
  assert.equal(ctx.requireAdmin_({ adminKey: 'secret' }).ok, true);
});

test('whoami / listAdmins / existing actions work for a listed admin', () => {
  seedAdmins(['o@school.org', 'owner', '', ''], ['a@school.org', 'admin', '', '']);
  const idToken = login('a@school.org');
  assert.deepEqual(post({ action: 'whoami', idToken }), { result: 'success', email: 'a@school.org', role: 'admin', via: 'google' });
  assert.equal(post({ action: 'listAdmins', idToken }).admins.length, 2);
  assert.equal(post({ action: 'listTests', idToken }).result, 'success');
  assert.equal(post({ action: 'listTests', idToken: login('z@school.org') }).error, 'not_admin');
  assert.equal(post({ action: 'whoami', adminKey: 'secret' }).via, 'key');
});

test('saveAdmin / removeAdmin are owner only', () => {
  seedAdmins(['o@school.org', 'owner', '', ''], ['a@school.org', 'admin', '', '']);
  const a = login('a@school.org');
  assert.equal(post({ action: 'saveAdmin', idToken: a, email: 'n@school.org', role: 'admin' }).error, 'owner_only');
  assert.equal(post({ action: 'removeAdmin', idToken: a, email: 'o@school.org' }).error, 'owner_only');
  assert.equal(post({ action: 'saveAdmin', adminKey: 'secret', email: 'n@school.org' }).error, 'owner_only', 'key is not owner while an owner exists');
  assert.equal(adminRows().length, 2);
  const o = login('o@school.org');
  const r = post({ action: 'saveAdmin', idToken: o, email: ' New@School.org ', role: 'admin' });
  assert.deepEqual({ ...r }, { result: 'success', email: 'new@school.org', role: 'admin', updated: false });
  assert.deepEqual(adminRows()[2].slice(0, 3), ['new@school.org', 'admin', 'o@school.org']);
  assert.equal(post({ action: 'saveAdmin', idToken: o, email: 'new@school.org', role: 'owner' }).updated, true);
  assert.equal(adminRows()[2][1], 'owner');
  assert.equal(post({ action: 'removeAdmin', idToken: o, email: 'a@school.org' }).result, 'success');
  assert.equal(adminRows().some((r) => r[0] === 'a@school.org'), false);
  assert.equal(post({ action: 'removeAdmin', idToken: o, email: 'a@school.org' }).error, 'not_found');
});

test('saveAdmin validates email and role (no formula injection)', () => {
  seedAdmins(['o@school.org', 'owner', '', '']);
  const o = login('o@school.org');
  for (const email of ['', 'nope', '=cmd@x.org', '+a@x.org', 'a b@x.org', 'a@b']) assert.equal(post({ action: 'saveAdmin', idToken: o, email, role: 'admin' }).error, 'invalid_email', email);
  assert.equal(post({ action: 'saveAdmin', idToken: o, email: 'ok@x.org', role: 'root' }).error, 'invalid_role');
  assert.equal(adminRows().length, 1);
});

test('cannot remove yourself, the last owner, or demote the last owner', () => {
  seedAdmins(['o@school.org', 'owner', '', ''], ['p@school.org', 'owner', '', '']);
  const o = login('o@school.org');
  assert.equal(post({ action: 'removeAdmin', idToken: o, email: 'o@school.org' }).error, 'cannot_remove_self');
  assert.equal(post({ action: 'removeAdmin', idToken: o, email: 'p@school.org' }).result, 'success');
  assert.equal(post({ action: 'saveAdmin', idToken: o, email: 'o@school.org', role: 'admin' }).error, 'last_owner');
  // a key caller removing the sole owner is refused too
  assert.equal(post({ action: 'removeAdmin', adminKey: 'secret', email: 'o@school.org' }).error, 'owner_only');
  assert.equal(adminRows().length, 1);
  assert.equal(adminRows()[0][1], 'owner');
});

test('ADMIN_KEY counts as owner only while there is no owner (bootstrap)', () => {
  seedAdmins(['a@school.org', 'admin', '', '']);
  assert.equal(post({ action: 'whoami', adminKey: 'secret' }).role, 'owner');
  assert.equal(post({ action: 'saveAdmin', adminKey: 'secret', email: 'o@school.org', role: 'owner' }).result, 'success');
  assert.equal(adminRows()[1][2], 'ADMIN_KEY');
  assert.equal(post({ action: 'whoami', adminKey: 'secret' }).role, 'admin');
  assert.equal(post({ action: 'saveAdmin', adminKey: 'secret', email: 'z@school.org' }).error, 'owner_only');
});

test('Log: every admin write appends a row; reads do not', () => {
  seedAdmins(['o@school.org', 'owner', '', '']);
  const idToken = login('o@school.org');
  post({ action: 'listTests', idToken });
  post({ action: 'getResults', idToken });
  assert.equal(logRows().length, 0);
  assert.equal(post({ action: 'publishTest', idToken, test: { code: 'c1', title: 'T', questions: [{ id: 'q1' }] } }).result, 'success');
  assert.equal(post({ action: 'publishTest', adminKey: 'secret', test: { code: 'c1', title: 'T', questions: [{ id: 'q1' }] } }).updated, true);
  assert.equal(post({ action: 'deleteTest', idToken, code: 'c1' }).result, 'success');
  assert.equal(post({ action: 'deleteTest', idToken, code: 'c1' }).error, 'not_found'); // failed writes are not logged
  assert.equal(post({ action: 'saveAdmin', idToken, email: 'n@school.org' }).result, 'success');
  assert.equal(post({ action: 'removeAdmin', idToken, email: 'n@school.org' }).result, 'success');
  const rows = plain(logRows().map((r) => [r[1], r[2], r[3]]));
  assert.deepEqual(rows, [
    ['o@school.org', 'publishTest', 'C1'],
    ['ADMIN_KEY', 'publishTest', 'C1'],
    ['o@school.org', 'deleteTest', 'C1'],
    ['o@school.org', 'saveAdmin', 'n@school.org'],
    ['o@school.org', 'removeAdmin', 'n@school.org'],
  ]);
  assert.deepEqual(plain(sheets.get('Log').rows[0]), ['Time', 'Admin', 'Action', 'Target', 'Details']);
  assert.ok(Date.parse(logRows()[0][0]) > 0);
});

test('getLog: newest first, limit honoured, rejected for non-admins', () => {
  seedAdmins(['o@school.org', 'owner', '', '']);
  const idToken = login('o@school.org');
  for (let i = 0; i < 5; i++) post({ action: 'releaseAll', idToken, testCode: `T${i}` });
  const all = post({ action: 'getLog', idToken });
  assert.deepEqual(all.rows.map((r) => r.target), ['T4', 'T3', 'T2', 'T1', 'T0']);
  assert.deepEqual(post({ action: 'getLog', idToken, limit: 2 }).rows.map((r) => r.target), ['T4', 'T3']);
  assert.equal(post({ action: 'getLog', idToken: login('x@school.org') }).error, 'not_admin');
  assert.equal(post({ action: 'getLog' }).error, 'unauthorized');
  assert.equal(post({ action: 'getLog', adminKey: 'secret' }).result, 'success');
});

test('saveGrade by a Google admin records their email as graded-by when the client sent none', () => {
  seedAdmins(['o@school.org', 'owner', '', '']);
  const idToken = login('o@school.org');
  post({ action: 'submit', submission_id: 's1', student_email: 'a@x.org', test_code: 'C1', responses: [{ questionId: 'q1', pointsPossible: 2, pointsEarned: 0, needsGrading: true }] });
  const r = post({ action: 'saveGrade', idToken, submissionId: 's1', grades: { q1: 2 } });
  assert.equal(r.grade.graded_by, 'o@school.org');
  const named = post({ action: 'saveGrade', idToken, submissionId: 's1', grades: { q1: 2 }, gradedBy: 'Ms Smith' });
  assert.equal(named.grade.graded_by, 'Ms Smith');
  const viaKey = post({ action: 'saveGrade', adminKey: 'secret', submissionId: 's1', grades: { q1: 1 }, gradedBy: '' });
  assert.equal(viaKey.grade.graded_by, '');
});

test('setup creates Admins and Log sheets and seeds ADMIN_EMAILS', () => {
  loadScript({ ADMIN_EMAILS: 'o@school.org' });
  ctx.setup();
  assert.ok(sheets.has('Admins') && sheets.has('Log'));
  assert.deepEqual(adminRows()[0].slice(0, 2), ['o@school.org', 'owner']);
});
