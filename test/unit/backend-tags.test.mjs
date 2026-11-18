// Tags backend (apps-script/Code.gs in a vm): the Tags sheet, tagDefs on publish, listTags / saveTag / deleteTag / mergeTags and tagIndex.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeGas } from './helpers/gas.mjs';

let g;
beforeEach(() => { g = makeGas({ GOOGLE_CLIENT_ID: 'client-1' }); });

const ANN = 'ann@x.org';
const BOB = 'bob@x.org';
const T1 = 'tg_aaaaaa';
const T2 = 'tg_bbbbbb';
const T3 = 'tg_cccccc';

// Admins: Ann (owner) and Bob (admin).
function seedAdmins() {
  g.A({ action: 'saveAdmin', email: ANN, role: 'owner' });
  g.post({ idToken: g.login(ANN), action: 'saveAdmin', email: BOB, role: 'admin' });
}
const as = (email, body) => g.post({ idToken: g.login(email), ...body });
const q = (id, tags) => ({ id, type: 'truefalse', text: 'x', correctAnswer: true, tags });
const tdef = (id, name = 'Ions', color = 'blue', description = '') => ({ id, name, color, description });
const testDef = (code, tags, over = {}) => ({ code, title: `Test ${code}`, questions: [q('q1', tags)], ...over });
const publish = (email, code, tags, tagDefs, over) => as(email, { action: 'publishTest', test: testDef(code, tags, over), tagDefs });
const tagRows = () => g.rows('Tags');

beforeEach(seedAdmins);

test('Tags sheet is created only by publishing, never by reading or saving', () => {
  assert.equal(g.sheets.has('Tags'), false);
  assert.deepEqual(as(ANN, { action: 'listTags' }).tags, []);
  assert.equal(g.sheets.has('Tags'), false);
  const r = as(ANN, { action: 'saveTag', tag: { id: T1, name: 'New' } });
  assert.equal(r.error, 'not_on_sheet');
  assert.equal(g.sheets.has('Tags'), false);
  assert.equal(publish(ANN, 'A1', [T1], [tdef(T1)]).result, 'success');
  assert.deepEqual(g.sheets.get('Tags').rows[0], ['id', 'ownerEmail', 'name', 'color', 'description', 'firstTestCode', 'createdAt', 'updatedAt', 'deletedAt', 'mergedInto']);
  assert.equal(tagRows().length, 1);
});

test('publish creates a row owned by the caller and replies with the tag', () => {
  const r = publish(ANN, 'A1', [T1], [tdef(T1, 'Ions', 'teal', 'Charged particles')]);
  assert.equal(r.result, 'success');
  assert.equal(r.tags.length, 1);
  assert.equal(r.tags[0].applied, 'created');
  assert.equal(r.tags[0].ownerEmail, ANN);
  const [row] = tagRows();
  assert.equal(row[0], T1);
  assert.equal(row[1], ANN);
  assert.equal(row[2], 'Ions');
  assert.equal(row[3], 'teal');
  assert.equal(row[5], 'A1');
});

test('unknown_tag: nothing is published and no tag row is written', () => {
  const r = publish(ANN, 'A1', [T1, T2, T3], [tdef(T1)]);
  assert.equal(r.result, 'error');
  assert.equal(r.error, 'unknown_tag');
  assert.deepEqual(r.ids, [T2, T3]);
  assert.equal(g.rows('Tests').length, 0);
  assert.equal(g.sheets.has('Tags'), false);
});

test('an id that is only on the Sheet needs no tagDef', () => {
  publish(ANN, 'A1', [T1], [tdef(T1)]);
  const r = publish(BOB, 'B1', [T1], []);
  assert.equal(r.result, 'success');
  assert.equal(r.tags[0].applied, 'unchanged');
});

test('the owner republishing applies their name, colour and description', () => {
  publish(ANN, 'A1', [T1], [tdef(T1, 'Ions', 'blue', 'old')]);
  const r = publish(ANN, 'A2', [T1], [tdef(T1, 'Ionic bonds', 'rose', 'new')]);
  assert.equal(r.tags[0].applied, 'updated');
  const [row] = tagRows();
  assert.deepEqual([row[2], row[3], row[4]], ['Ionic bonds', 'rose', 'new']);
  assert.equal(row[5], 'A1');
  assert.equal(publish(ANN, 'A3', [T1], [tdef(T1, 'Ionic bonds', 'rose', 'new')]).tags[0].applied, 'unchanged');
});

test('the Sheet wins for a tag someone else owns', () => {
  publish(ANN, 'A1', [T1], [tdef(T1, 'Ions', 'blue')]);
  const r = publish(BOB, 'B1', [T1], [tdef(T1, 'Mine now', 'rose')]);
  assert.equal(r.result, 'success');
  assert.equal(r.tags[0].applied, 'sheet_wins');
  assert.equal(r.tags[0].name, 'Ions');
  assert.equal(r.tags[0].color, 'blue');
  const [row] = tagRows();
  assert.deepEqual([row[1], row[2], row[3]], [ANN, 'Ions', 'blue']);
});

test('names and descriptions go through text_ and are length-limited; bad colours become gray', () => {
  publish(ANN, 'A1', [T1], [tdef(T1, '=SUM(1)', 'purple', '+cmd')]);
  const [row] = tagRows();
  assert.equal(row[2], "'=SUM(1)");
  assert.equal(row[3], 'gray');
  assert.equal(row[4], "'+cmd");
  publish(ANN, 'A2', [T2], [tdef(T2, 'n'.repeat(80), 'blue', 'd'.repeat(500))]);
  const r2 = tagRows()[1];
  assert.equal(r2[2].length, 40);
  assert.equal(r2[4].length, 200);
  as(ANN, { action: 'saveTag', tag: { id: T2, name: '-bad', description: '@bad' } });
  const r3 = tagRows()[1];
  assert.equal(r3[2], "'-bad");
  assert.equal(r3[4], "'@bad");
});

test('listTags: non-deleted rows with usage over published tests, cached and cleared on publish', () => {
  publish(ANN, 'A1', [T1], [tdef(T1, 'Ions')]);
  const list = as(BOB, { action: 'listTags' });
  assert.equal(list.tags.length, 1);
  assert.deepEqual(list.tags[0].usage, { questions: 1, tests: 1 });
  assert.equal(list.tags[0].ownerName, 'ann');
  as(ANN, { action: 'publishTest', test: { code: 'A2', title: 'Two', questions: [q('q1', [T1]), q('q2', [T1]), q('q3', [])] }, tagDefs: [] });
  assert.deepEqual(as(BOB, { action: 'listTags' }).tags[0].usage, { questions: 3, tests: 2 });
  as(ANN, { action: 'deleteTag', id: T1 });
  assert.deepEqual(as(BOB, { action: 'listTags' }).tags, []);
});

test('usage is cleared by a tag write and by deleting a test', () => {
  publish(ANN, 'A1', [T1], [tdef(T1)]);
  assert.equal(as(ANN, { action: 'listTags' }).tags[0].usage.tests, 1);
  assert.ok([...g.cacheStore.keys()].includes('tags:usage'));
  as(ANN, { action: 'saveTag', tag: { id: T1, name: 'Renamed' } });
  assert.ok(![...g.cacheStore.keys()].includes('tags:usage'));
  as(ANN, { action: 'listTags' });
  as(ANN, { action: 'deleteTest', code: 'A1' });
  assert.equal(as(ANN, { action: 'listTags' }).tags[0].usage.tests, 0);
});

test('saveTag is owner only and never creates', () => {
  publish(ANN, 'A1', [T1], [tdef(T1, 'Ions', 'blue')]);
  assert.equal(as(BOB, { action: 'saveTag', tag: { id: T1, name: 'Hijack' } }).error, 'owner_only');
  assert.equal(tagRows()[0][2], 'Ions');
  const ok = as(ANN, { action: 'saveTag', tag: { id: T1, name: 'Ionic', color: 'green', description: 'Charged' } });
  assert.equal(ok.result, 'success');
  assert.deepEqual([ok.tag.name, ok.tag.color, ok.tag.description], ['Ionic', 'green', 'Charged']);
  assert.equal(as(ANN, { action: 'saveTag', tag: { id: T2, name: 'Nope' } }).error, 'not_on_sheet');
  assert.equal(tagRows().length, 1);
  assert.equal(as(ANN, { action: 'saveTag', tag: { id: 'bad' } }).error, 'invalid_request');
});

test('deleteTag is owner only and soft: the row stays', () => {
  publish(ANN, 'A1', [T1], [tdef(T1, 'Ions')]);
  assert.equal(as(BOB, { action: 'deleteTag', id: T1 }).error, 'owner_only');
  assert.equal(as(ANN, { action: 'deleteTag', id: T2 }).error, 'not_on_sheet');
  const r = as(ANN, { action: 'deleteTag', id: T1 });
  assert.deepEqual([r.result, r.id], ['success', T1]);
  const [row] = tagRows();
  assert.equal(row[2], 'Ions');
  assert.notEqual(row[8], '');
});

test('mergeTags rewrites the owner\'s tests only, de-duplicates and sets mergedInto', () => {
  publish(ANN, 'A1', [T1], [tdef(T1, 'Ions'), tdef(T2, 'Ionic')]);
  as(ANN, { action: 'publishTest', test: { code: 'A2', title: 'Both', questions: [q('q1', [T1, T2]), q('q2', ['tg_zzzzzz'].slice(0, 0))] }, tagDefs: [tdef(T1), tdef(T2)] });
  // Bob uses the old id in his own test.
  publish(BOB, 'B1', [T1], []);
  as(ANN, { action: 'publishTest', test: testDef('A3', [T2]), tagDefs: [tdef(T2)] });
  as(ANN, { action: 'saveTag', tag: { id: T2, name: 'Ionic' } });
  const r = as(ANN, { action: 'mergeTags', from: T1, into: T2 });
  assert.equal(r.result, 'success');
  assert.equal(r.into.id, T2);
  assert.equal(r.rewrittenTests, 2);
  assert.equal(r.rewrittenQuestions, 2);
  const stored = (code) => JSON.parse(g.rows('Tests').find((x) => x[0] === code)[3]);
  assert.deepEqual(stored('A1').questions[0].tags, [T2]);
  assert.deepEqual(stored('A2').questions[0].tags, [T2]);
  assert.deepEqual(stored('B1').questions[0].tags, [T1]);
  const from = tagRows().find((x) => x[0] === T1);
  assert.equal(from[9], T2);
  assert.notEqual(from[8], '');
  assert.deepEqual(as(ANN, { action: 'listTags' }).tags.map((t) => t.id), [T2]);
});

test('mergeTags needs both tags to be the caller\'s, different, and live', () => {
  publish(ANN, 'A1', [T1], [tdef(T1)]);
  publish(BOB, 'B1', [T2], [tdef(T2)]);
  assert.equal(as(ANN, { action: 'mergeTags', from: T1, into: T2 }).error, 'owner_only');
  assert.equal(as(ANN, { action: 'mergeTags', from: T2, into: T1 }).error, 'owner_only');
  assert.equal(as(ANN, { action: 'mergeTags', from: T1, into: T1 }).error, 'invalid_request');
  assert.equal(as(ANN, { action: 'mergeTags', from: T1, into: T3 }).error, 'not_on_sheet');
  publish(ANN, 'A2', [T3], [tdef(T3)]);
  as(ANN, { action: 'deleteTag', id: T3 });
  assert.equal(as(ANN, { action: 'mergeTags', from: T1, into: T3 }).error, 'not_on_sheet');
});

test('tagIndex: getTest (GET and POST) and getFeedback resolve merged, deleted and unknown ids', () => {
  publish(ANN, 'A1', [T1, T2, T3], [tdef(T1, 'Ions', 'blue'), tdef(T2, 'Ionic', 'rose'), tdef(T3, 'Old', 'gray')]);
  // Publish A2 for Bob to hold the old id after the merge (Ann's tests are rewritten, Bob's are not).
  publish(BOB, 'B1', [T1], []);
  as(ANN, { action: 'mergeTags', from: T1, into: T2 });
  as(ANN, { action: 'deleteTag', id: T3 });
  const get = JSON.parse(g.ctx.doGet({ parameter: { action: 'getTest', code: 'B1' } }).getContent());
  assert.deepEqual(get.tagIndex, { [T1]: { name: 'Ionic', color: 'rose' } });
  const post = g.post({ action: 'getTest', code: 'A1', idToken: g.login('stu@x.org') });
  assert.deepEqual(post.tagIndex, { [T2]: { name: 'Ionic', color: 'rose' }, [T3]: { name: 'Old', color: 'gray' } });
  g.addSubmission({ 'Submission ID': 's1', 'Student Email': 'stu@x.org', 'Test Code': 'B1', 'Released At': new Date(), Status: 'Auto-graded' });
  const fb = g.post({ action: 'getFeedback', submissionId: 's1', idToken: g.login('stu@x.org') });
  assert.equal(fb.released, true);
  assert.deepEqual(fb.tagIndex, { [T1]: { name: 'Ionic', color: 'rose' } });
});

test('tagIndex is empty for a test without tags and for ids that are not on the Sheet', () => {
  g.A({ action: 'publishTest', test: testDef('P1', []) });
  const plain = JSON.parse(g.ctx.doGet({ parameter: { action: 'getTest', code: 'P1' } }).getContent());
  assert.deepEqual(plain.tagIndex, {});
  assert.equal(g.sheets.has('Tags'), false);
});

test('tag actions need an admin and are logged', () => {
  assert.equal(g.post({ action: 'listTags', idToken: g.login('stranger@x.org') }).error, 'not_admin');
  publish(ANN, 'A1', [T1], [tdef(T1)]);
  as(ANN, { action: 'saveTag', tag: { id: T1, name: 'Renamed' } });
  const actions = g.rows('Log').map((r) => r[2]);
  assert.ok(actions.includes('saveTag'));
});

test('publishing a test marks its owner so merges can find it', () => {
  publish(ANN, 'A1', [T1], [tdef(T1)]);
  assert.equal(g.rows('Tests')[0][4], ANN);
  publish(BOB, 'A1', [T1], []);
  assert.equal(g.rows('Tests')[0][4], ANN);
});
