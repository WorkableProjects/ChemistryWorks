// Question tags: the local store, resolve, tagDefsFor, the picker groups, schema rules, the importer, backup and chip contrast.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function memory() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; },
  };
}
globalThis.localStorage = memory();
globalThis.sessionStorage = memory();

const T = await import('../../js/lib/tags.js');
const { normalizeTest, validateTest } = await import('../../js/lib/schema.js');
const { mapTagNames, applyTagNames } = await import('../../js/lib/importers.js');
const { makeBundle, readBundle } = await import('../../js/lib/backup.js');
const { resource, clearStore } = await import('../../js/lib/store.js');
const { contrastRatio } = await import('../../js/lib/contrast.js');

const ANN = 'ann@school.org';
const BOB = 'bob@school.org';
beforeEach(() => { globalThis.localStorage.clear(); globalThis.sessionStorage.clear(); clearStore(); });

const sheetRow = (id, over = {}) => ({ id, ownerEmail: BOB, ownerName: 'bob', name: id, color: 'teal', description: '', mergedInto: '', usage: { questions: 1, tests: 1 }, ...over });
const q = (id, tags) => ({ id, type: 'truefalse', text: 'x', points: 1, correctAnswer: true, ...(tags ? { tags } : {}) });
const testWith = (...qs) => ({ code: 'T1', title: 'T', questions: qs });

/* ---------------------------------------------------------------- ids and the local store */

test('newTagId: tg_ plus 6 base-36 characters, never one already taken', () => {
  assert.match(T.newTagId(), /^tg_[0-9a-z]{6}$/);
  let n = 0;
  const rand = () => (n++ < 6 ? 0 : 0.5); // first try is tg_000000, which is taken
  assert.equal(T.newTagId(['tg_000000'], rand), 'tg_iiiiii');
  assert.equal(T.TAG_ID_RE.test('tg_ABC123'), false);
});

test('local store: create, rename, recolour, delete, under cw:tags:<email>', () => {
  const t = T.createTag({ name: '  Ions ', color: 'rose' }, { email: ANN });
  assert.match(t.id, /^tg_[0-9a-z]{6}$/);
  assert.deepEqual([t.name, t.color, t.onSheet], ['Ions', 'rose', false]);
  assert.ok(globalThis.localStorage.getItem(`cw:tags:${ANN}`), 'stored under cw:tags:<email>');
  assert.equal(T.listLocal(BOB).length, 0, 'another teacher has their own store');
  const r = T.updateLocalTag(t.id, { name: 'Ionic bonds', color: 'green', description: 'Unit 3' }, { email: ANN });
  assert.deepEqual([r.name, r.color, r.description], ['Ionic bonds', 'green', 'Unit 3']);
  assert.equal(T.listLocal(ANN)[0].name, 'Ionic bonds');
  assert.equal(T.deleteLocalTag(t.id, { email: ANN }), true);
  assert.deepEqual(T.listLocal(ANN), []);
});

test('createTag: empty name throws, same name (any case) returns the existing tag, name is capped at 40', () => {
  assert.throws(() => T.createTag({ name: '   ' }, { email: ANN }));
  const a = T.createTag({ name: 'Acids' }, { email: ANN });
  assert.equal(T.createTag({ name: 'acids' }, { email: ANN }).id, a.id);
  assert.equal(T.listLocal(ANN).length, 1);
  assert.equal(T.createTag({ name: 'x'.repeat(60) }, { email: ANN }).name.length, 40);
});

test('an unknown colour falls back, and damaged storage reads as empty', () => {
  assert.equal(T.createTag({ name: 'A', color: 'chartreuse' }, { email: ANN }).color, T.TAG_COLORS[0]);
  globalThis.localStorage.setItem(`cw:tags:${BOB}`, '{not json');
  assert.deepEqual(T.listLocal(BOB), []);
  globalThis.localStorage.setItem(`cw:tags:${BOB}`, JSON.stringify([{ id: 'bad', name: 'x' }, null]));
  assert.deepEqual(T.listLocal(BOB), []);
});

test('a tag that is on the Sheet is not edited or deleted locally', () => {
  const t = T.createTag({ name: 'Gas laws' }, { email: ANN });
  T.markOnSheet([{ id: t.id, ownerEmail: ANN, name: 'Gas laws', color: 'blue', description: '', applied: 'created' }], { email: ANN });
  assert.equal(T.listLocal(ANN)[0].onSheet, true);
  assert.equal(T.updateLocalTag(t.id, { name: 'x' }, { email: ANN }), null);
  assert.equal(T.deleteLocalTag(t.id, { email: ANN }), false);
});

test('markOnSheet: takes the Sheet name and colour, adds your new tags, skips other owners', () => {
  const t = T.createTag({ name: 'Mine', color: 'blue' }, { email: ANN });
  T.markOnSheet([
    { id: t.id, ownerEmail: BOB, name: 'Renamed by sheet', color: 'gray', description: 'd', applied: 'sheet_wins' },
    { id: 'tg_aaaaaa', ownerEmail: ANN, name: 'New', color: 'green', description: '', applied: 'created' },
    { id: 'tg_bbbbbb', ownerEmail: BOB, name: 'Theirs', color: 'rose', description: '', applied: 'unchanged' },
    { id: 'junk', ownerEmail: ANN, name: 'junk' },
  ], { email: ANN });
  const list = T.listLocal(ANN);
  assert.deepEqual(list.map((x) => x.id).sort(), [t.id, 'tg_aaaaaa'].sort());
  const mine = list.find((x) => x.id === t.id);
  assert.deepEqual([mine.name, mine.color, mine.onSheet], ['Renamed by sheet', 'gray', true]);
});

test('mergeLocal (restore) adds missing tags and keeps existing records', () => {
  const t = T.createTag({ name: 'Keep' }, { email: ANN });
  const n = T.mergeLocal([{ id: t.id, name: 'Other name' }, { id: 'tg_zzzzzz', name: 'Added', color: 'teal' }, { id: 'bad', name: 'x' }], { email: ANN });
  assert.equal(n, 1);
  assert.equal(T.listLocal(ANN).find((x) => x.id === t.id).name, 'Keep');
  assert.ok(T.listLocal(ANN).some((x) => x.id === 'tg_zzzzzz'));
});

/* ---------------------------------------------------------------- resolve and tagDefsFor */

test('resolve: local first, then Sheet, then "Unknown tag"; ids keep their order', () => {
  const local = [{ id: 'tg_local1', name: 'Local', color: 'rose', description: '', onSheet: false }];
  const sheet = [sheetRow('tg_sheet1', { name: 'Shared one' })];
  const r = T.resolve(['tg_sheet1', 'tg_local1', 'tg_nope00'], { local, sheet, email: ANN });
  assert.deepEqual(r.map((x) => [x.id, x.name, x.source]), [['tg_sheet1', 'Shared one', 'sheet'], ['tg_local1', 'Local', 'local'], ['tg_nope00', 'Unknown tag', 'unknown']]);
  assert.equal(r[0].mine, false);
  assert.equal(r[0].owner, 'bob');
  assert.equal(r[2].unknown, true);
});

test('resolve: a local copy of a Sheet tag shows the Sheet name (the Sheet is the source of truth)', () => {
  const local = [{ id: 'tg_abcdef', name: 'Old name', color: 'blue', description: '', onSheet: true }];
  const sheet = [sheetRow('tg_abcdef', { ownerEmail: ANN, name: 'New name', color: 'green' })];
  const [r] = T.resolve(['tg_abcdef'], { local, sheet, email: ANN });
  assert.deepEqual([r.name, r.color, r.mine], ['New name', 'green', true]);
});

test('resolve follows mergedInto, through chains, and survives a loop', () => {
  const sheet = [sheetRow('tg_aaaaaa', { name: 'A', mergedInto: 'tg_bbbbbb' }), sheetRow('tg_bbbbbb', { name: 'B', mergedInto: 'tg_cccccc' }), sheetRow('tg_cccccc', { name: 'C' })];
  const [r] = T.resolve(['tg_aaaaaa'], { local: [], sheet, email: ANN });
  assert.equal(r.name, 'C');
  assert.equal(r.id, 'tg_aaaaaa', 'the id as stored in the test is kept');
  const loop = [sheetRow('tg_aaaaaa', { name: 'A', mergedInto: 'tg_bbbbbb' }), sheetRow('tg_bbbbbb', { name: 'B', mergedInto: 'tg_aaaaaa' })];
  assert.equal(T.resolve(['tg_aaaaaa'], { local: [], sheet: loop, email: ANN }).length, 1);
});

test('resolve reads the Sheet tags from the store resource `tags`', () => {
  resource('tags').patch(() => [sheetRow('tg_fromst', { name: 'From the store' })]);
  assert.equal(T.resolve(['tg_fromst'], { email: ANN })[0].name, 'From the store');
});

test('tagDefsFor: one definition per tag the test uses, skipping unknown ids', () => {
  const local = [{ id: 'tg_local1', name: 'Local', color: 'rose', description: 'd', onSheet: false }, { id: 'tg_unused', name: 'Unused', color: 'blue', description: '', onSheet: false }];
  const sheet = [sheetRow('tg_sheet1', { name: 'Shared one' })];
  const test_ = testWith(q('q1', ['tg_local1', 'tg_sheet1']), q('q2', ['tg_local1', 'tg_nope00']), q('q3'));
  assert.deepEqual(T.tagDefsFor(test_, { local, sheet, email: ANN }), [
    { id: 'tg_local1', name: 'Local', color: 'rose', description: 'd' },
    { id: 'tg_sheet1', name: 'Shared one', color: 'teal', description: '' },
  ]);
  assert.deepEqual(T.tagDefsFor(testWith(q('q1')), { local, sheet }), []);
});

test('pickerGroups: Your tags = local + yours on the Sheet; Shared tags = others\' tags a test uses', () => {
  const local = [{ id: 'tg_local1', name: 'Zeta', color: 'rose', description: '', onSheet: false }, { id: 'tg_cache1', name: 'Cached', color: 'blue', description: '', onSheet: true }];
  const sheet = [
    sheetRow('tg_cache1', { ownerEmail: ANN, name: 'Cached' }),
    sheetRow('tg_mine02', { ownerEmail: ANN, name: 'Alpha' }),
    sheetRow('tg_other1', { name: 'Beta' }),
    sheetRow('tg_unused', { name: 'Unused', usage: { questions: 0, tests: 0 } }),
    sheetRow('tg_merged', { name: 'Merged', mergedInto: 'tg_other1' }),
  ];
  const g = T.pickerGroups({ local, sheet, email: ANN });
  assert.deepEqual(g.mine.map((x) => x.name), ['Alpha', 'Cached', 'Zeta']);
  assert.deepEqual(g.shared.map((x) => x.name), ['Beta']);
});

/* ---------------------------------------------------------------- schema */

test('schema: tags are trimmed and de-duplicated; empty or non-list tags are dropped', () => {
  const t = normalizeTest(testWith(q('q1', [' tg_aaaaaa ', 'tg_aaaaaa', '', 'tg_bbbbbb']), q('q2', []), { ...q('q3'), tags: 'oops' }));
  assert.deepEqual(t.questions[0].tags, ['tg_aaaaaa', 'tg_bbbbbb']);
  assert.equal('tags' in t.questions[1], false);
  assert.equal('tags' in t.questions[2], false);
});

test('schema: more than 10 tags on a question is an error; 10 is fine', () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => `tg_aaaa${String(i).padStart(2, '0')}`);
  assert.deepEqual(validateTest(normalizeTest(testWith(q('q1', ids(10))))).errors, []);
  const v = validateTest(normalizeTest(testWith(q('q1', ids(11)))));
  assert.equal(v.valid, false);
  assert.match(v.errors[0], /Question 1 \(q1\): a question can have at most 10 tags/);
});

test('schema: unknown tag ids are warnings (never errors), only when knownTagIds is given', () => {
  const t = normalizeTest(testWith(q('q1', ['tg_known1', 'tg_gone01']), q('q2', ['tg_known1'])));
  const plain = validateTest(t);
  assert.equal('warnings' in plain, false);
  const v = validateTest(t, { knownTagIds: ['tg_known1'] });
  assert.equal(v.valid, true);
  assert.deepEqual(v.errors, []);
  assert.equal(v.warnings.length, 1);
  assert.match(v.warnings[0], /Question 1 \(q1\).*tg_gone01/);
  assert.deepEqual(validateTest(t, { knownTagIds: ['tg_known1', 'tg_gone01'] }).warnings, []);
});

/* ---------------------------------------------------------------- importer */

test('importer: names match local tags first (any case), then Sheet tags; ids are kept', () => {
  const local = [{ id: 'tg_local1', name: 'Ions' }];
  const sheet = [sheetRow('tg_sheet1', { name: 'Ions' }), sheetRow('tg_sheet2', { name: 'Redox' }), sheetRow('tg_gone00', { name: 'Old', mergedInto: 'tg_sheet2' })];
  const input = testWith(q('q1', ['ions', 'Redox', 'tg_other9']), q('q2', ['Ions', 'ions ']), q('q3'));
  const { test: out, unmatched } = mapTagNames(input, { local, sheet });
  assert.deepEqual(out.questions[0].tags, ['tg_local1', 'tg_sheet2', 'tg_other9']);
  assert.deepEqual(out.questions[1].tags, ['tg_local1'], 'duplicates collapse');
  assert.deepEqual(unmatched, []);
  assert.deepEqual(input.questions[0].tags, ['ions', 'Redox', 'tg_other9'], 'the input is not changed');
});

test('importer: unmatched names are listed once, and a merged-away Sheet tag does not match', () => {
  const sheet = [sheetRow('tg_gone00', { name: 'Old', mergedInto: 'tg_sheet2' })];
  const { test: out, unmatched } = mapTagNames(testWith(q('q1', ['Old', 'Bonding']), q('q2', ['bonding', 'Moles'])), { local: [], sheet });
  assert.deepEqual(unmatched, ['Old', 'Bonding', 'Moles']);
  assert.deepEqual(out.questions[0].tags, ['Old', 'Bonding'], 'names stay until they are settled');
});

test('importer: applyTagNames swaps settled names for ids and drops the rest', () => {
  const { test: mapped } = mapTagNames(testWith(q('q1', ['Bonding', 'Moles', 'tg_keep00']), q('q2', ['Moles'])), { local: [], sheet: [] });
  const out = applyTagNames(mapped, { bonding: 'tg_bond01' });
  assert.deepEqual(out.questions[0].tags, ['tg_bond01', 'tg_keep00']);
  assert.equal('tags' in out.questions[1], false, 'a question left with no tags loses the field');
  assert.deepEqual(applyTagNames(mapped, {}).questions[0].tags, ['tg_keep00']);
});

test('importer: an imported test with names is valid once they are mapped', () => {
  const local = [{ id: 'tg_local1', name: 'Ions' }];
  const { test: out } = mapTagNames(testWith(q('q1', ['Ions'])), { local, sheet: [] });
  assert.deepEqual(validateTest(normalizeTest(out), { knownTagIds: ['tg_local1'] }).warnings, []);
});

/* ---------------------------------------------------------------- backup */

test('backup: local tags go into the bundle and come back out; bad records are dropped', () => {
  const tags = [{ id: 'tg_abcdef', name: 'Ions', color: 'blue', description: '', onSheet: false }, { id: 'nope', name: 'x' }, { id: 'tg_nonamee', name: ' ' }];
  const bundle = makeBundle({ tests: [normalizeTest(testWith(q('q1', ['tg_abcdef'])))], tags });
  assert.deepEqual(bundle.tags.map((t) => t.id), ['tg_abcdef']);
  const back = readBundle(JSON.stringify(bundle));
  assert.equal(back.ok, true);
  assert.deepEqual(back.tags.map((t) => t.name), ['Ions']);
  assert.deepEqual(back.tests[0].questions[0].tags, ['tg_abcdef']);
  assert.deepEqual(readBundle(JSON.stringify({ kind: 'chemworks-backup', tests: [] })).tags, [], 'an older backup has no tags');
  assert.deepEqual(makeBundle({ tests: [] }).tags, []);
});

/* ---------------------------------------------------------------- chip contrast */

const css = readFileSync(new URL('../../css/base.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
function tokens(selector) {
  const out = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((x) => x.trim()).includes(selector)) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

for (const [mode, selector] of [['light', ':root'], ['dark', ':root[data-theme="dark"]']]) {
  for (const color of T.TAG_COLORS) {
    test(`tag chip text passes AA: ${color}, ${mode}`, () => {
      const t = tokens(selector);
      const { bg, ink } = T.tagColorTokens(color);
      assert.match(t[bg] || '', /^#[0-9A-Fa-f]{6}$/, `${bg} is defined for ${mode}`);
      assert.match(t[ink] || '', /^#[0-9A-Fa-f]{6}$/, `${ink} is defined for ${mode}`);
      const r = contrastRatio(t[ink], t[bg]);
      assert.ok(r >= 4.5, `${t[ink]} on ${t[bg]} = ${r.toFixed(2)}`);
    });
  }
}

test('tagColorTokens: an unknown colour uses gray', () => {
  assert.deepEqual(T.tagColorTokens('plaid'), { bg: '--tag-gray-bg', ink: '--tag-gray-ink' });
});
