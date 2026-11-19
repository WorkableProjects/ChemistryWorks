// Per-tag results: released only, partial credit, teacher grades, questions with several tags, and tag names.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function memory() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; },
  };
}
globalThis.localStorage = memory();
globalThis.sessionStorage = memory();

const S = await import('../../js/lib/tag-stats.js');
const { matchesLibraryFilter } = await import('../../js/views/admin/library.js');

const A = 'tg_aaaaaa';
const B = 'tg_bbbbbb';
const q = (id, tags, points = 1) => ({ id, type: 'truefalse', text: id, points, correctAnswer: true, ...(tags ? { tags } : {}) });
const T = { code: 'T1', title: 'T', questions: [q('q1', [A]), q('q2', [A, B], 2), q('q3', [B]), q('q4')] };
const res = (questionId, pointsEarned, pointsPossible, extra = {}) => ({ questionId, pointsEarned, pointsPossible, ...extra });
const by = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

test('totals per tag; a question with several tags counts toward each; untagged questions are ignored', () => {
  const sub = { released: true, responses: [res('q1', 1, 1), res('q2', 2, 2), res('q3', 0, 1), res('q4', 1, 1)] };
  const out = by(S.tagStats([sub], T));
  assert.deepEqual([out[A].earned, out[A].possible, out[A].percent], [3, 3, 100]);
  assert.deepEqual([out[B].earned, out[B].possible, out[B].percent], [2, 3, 66.7]);
  assert.equal(Object.keys(out).length, 2);
});

test('partial credit counts as the points earned', () => {
  const sub = { released: true, responses: [res('q1', 1, 1), res('q2', 0.5, 2)] };
  const out = by(S.tagStats([sub], T));
  assert.equal(out[A].earned, 1.5);
  assert.equal(out[A].possible, 3);
  assert.equal(out[A].percent, 50);
});

test('only released results count for students; teacher views can count everything', () => {
  const rel = { released: true, responses: [res('q1', 1, 1)] };
  const not = { responses: [res('q1', 0, 1)] };
  assert.equal(S.tagStats([rel, not], T)[0].possible, 1, 'the unreleased result is left out');
  assert.deepEqual(S.tagStats([not], T), []);
  assert.equal(S.tagStats([rel, not], T, { releasedOnly: false })[0].possible, 2);
  assert.equal(S.isReleased({ released_at: '2026-01-01T00:00:00Z' }), true);
  assert.equal(S.isReleased({ status: 'released' }), true);
  assert.equal(S.isReleased({ released_at: '' }), false);
  assert.equal(S.isReleased(null), false);
});

test('a teacher-graded item counts once it has a grade, and the grade wins over the auto points', () => {
  const waiting = { released: true, responses: [res('q1', 0, 1, { needsGrading: true })] };
  assert.deepEqual(S.tagStats([waiting], T), []);
  const graded = { released: true, responses: [res('q1', 0, 1, { needsGrading: true })], grades: { q1: 0.5 } };
  const out = by(S.tagStats([graded], T));
  assert.equal(out[A].earned, 0.5);
  assert.equal(out[A].possible, 1);
  const override = { released: true, responses: [res('q1', 1, 1)], grades: { q1: 0 } };
  assert.equal(S.tagStats([override], T)[0].earned, 0);
});

test('points never exceed the points possible, and a question worth nothing is skipped', () => {
  const sub = { released: true, responses: [res('q1', 5, 1), res('q3', 1, 0)] };
  const out = by(S.tagStats([sub], T));
  assert.equal(out[A].earned, 1);
  assert.equal(out[B], undefined);
});

test('several submissions add up; stats list the weakest tag first; rows of several tests pick their own test', () => {
  const a = { released: true, code: 'T1', responses: [res('q1', 1, 1), res('q3', 0, 1)] };
  const b = { released: true, code: 'T1', responses: [res('q1', 0, 1), res('q3', 1, 1)] };
  const other = { code: 'T2', questions: [q('x', [B])] };
  const c = { released: true, code: 'T2', responses: [res('x', 1, 1)] };
  const rows = S.tagStats([a, b, c], (s) => (s.code === 'T2' ? other : T));
  const out = by(rows);
  assert.deepEqual([out[A].earned, out[A].possible, out[A].students], [1, 2, 2]);
  assert.deepEqual([out[B].earned, out[B].possible, out[B].students], [2, 3, 3]);
  assert.equal(rows[0].id, A, 'weakest first');
});

test('tagIds, usedIds and hasTag', () => {
  assert.deepEqual([...S.tagIds(T).get('q2')], [A, B]);
  assert.deepEqual(S.usedIds(T), [A, B]);
  assert.equal(S.hasTag({ responses: [res('q3', 1, 1)] }, T, B), true);
  assert.equal(S.hasTag({ responses: [res('q3', 1, 1)] }, T, A), false);
});

test('student names come from tagIndex; a missing name is "Unknown tag", never the id', () => {
  const idx = { [A]: { name: 'Stoichiometry', color: 'teal' } };
  assert.equal(S.studentTag(A, idx).name, 'Stoichiometry');
  assert.equal(S.studentTag(A, idx).color, 'teal');
  const miss = S.studentTag(B, idx);
  assert.equal(miss.name, 'Unknown tag');
  assert.equal(miss.unknown, true);
  assert.equal(S.studentTag(B, null).name, 'Unknown tag');
  const rows = S.withNames(S.tagStats([{ released: true, responses: [res('q1', 1, 1), res('q3', 1, 1)] }], T), (id) => S.studentTag(id, idx));
  assert.deepEqual(rows.map((r) => r.name).sort(), ['Stoichiometry', 'Unknown tag']);
});

test('remembered tagIndex merges replies and is keyed by upper-case code', () => {
  S.rememberTagIndex('t9', { [A]: { name: 'Old', color: 'blue' } });
  S.rememberTagIndex('T9', { [B]: { name: 'Bonds', color: 'rose' } });
  S.rememberTagIndex('T9', null);
  const got = S.recalledTagIndex('t9');
  assert.equal(got[A].name, 'Old');
  assert.equal(got[B].name, 'Bonds');
  assert.deepEqual(S.recalledTagIndex('NOPE'), {});
});

test('topic options and the mode filter', () => {
  const idx = { [A]: { name: 'Zeta' }, [B]: { name: 'Alpha' } };
  const opts = S.topicOptions(T.questions, idx);
  assert.deepEqual(opts.map((o) => [o.name, o.count]), [['Alpha', 2], ['Zeta', 2]]);
  assert.deepEqual(S.topicOptions([q('a')], idx), []);
  assert.deepEqual(S.filterByTag(['q1', 'q2', 'q3', 'q4'], T.questions, A), ['q1', 'q2']);
  assert.deepEqual(S.filterByTag(['q1', 'q4'], T.questions, ''), ['q1', 'q4']);
});

test('library filter by tag', () => {
  const tagsByCode = new Map([['AAA', new Set([A])], ['BBB', new Set([B])]]);
  assert.equal(matchesLibraryFilter({ code: 'AAA' }, { tag: A, tagsByCode }), true);
  assert.equal(matchesLibraryFilter({ code: 'BBB' }, { tag: A, tagsByCode }), false);
  assert.equal(matchesLibraryFilter({ code: 'CCC' }, { tag: A, tagsByCode }), false);
  assert.equal(matchesLibraryFilter({ code: 'CCC' }, {}), true);
});
