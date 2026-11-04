// V4-03 multipart: part normalization/validation, scoring across part types, text.
globalThis.window = { CHEMISTRYWORKS_CONFIG: { FEATURES: { v4Types: true } } };
import test from 'node:test';
import assert from 'node:assert/strict';
const { isAutoPartType, partsPoints } = await import('../../js/lib/qtypes/multipart.js');
const { normalizeTest, validateTest, blankQuestion } = await import('../../js/lib/schema.js');
const { gradeQuestion, gradeTest, formatAnswer, isAnswered, correctAnswerText } = await import('../../js/lib/grading.js');

const parts = () => [
  { id: 'a', type: 'mcq', text: 'pick b', points: 1, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctAnswer: 'b' },
  { id: 'b', type: 'numeric', text: 'two', points: 2, correctAnswer: 2, tolerance: 0, toleranceType: 'absolute' },
];
const mk = (q) => ({ id: 'q1', type: 'multipart', text: 'Q', stem: 'S', points: 3, parts: parts(), ...q });
const norm = (q) => normalizeTest({ code: 'TST', title: 'T', questions: [mk(q)] }).questions[0];
const errs = (q) => validateTest(normalizeTest({ code: 'TST', title: 'T', questions: [mk(q)] })).errors;

test('normalize: ids, points and extras', () => {
  const q = norm({ points: 99, parts: [{ type: 'truefalse', text: 't', points: 1.5, correctAnswer: true, confidence: true, hint: { text: 'h', cost: 0.5 } }, { type: 'truefalse', text: 'u', points: 1, correctAnswer: false }] });
  assert.deepEqual(q.parts.map((p) => p.id), ['a', 'b']);
  assert.equal(q.points, 2.5);
  assert.equal(q.parts[0].confidence, undefined);
  assert.equal(q.parts[0].hint, undefined);
  assert.equal(norm({ stem: undefined }).stem, '');
  assert.equal(norm({ stem: null }).stem, '');
});

test('validate: auto types only, unique ids, nested part errors', () => {
  assert.deepEqual(errs({}), []);
  assert.ok(errs({ parts: [] }).some((e) => /at least one part/.test(e)));
  assert.ok(errs({ parts: [{ ...parts()[0] }, { ...parts()[0] }] }).some((e) => /duplicate part id "a"/.test(e)));
  assert.ok(errs({ parts: [{ id: 'a', type: 'short', text: 's', points: 1 }] }).some((e) => /"short" part cannot be used/.test(e)));
  assert.ok(errs({ parts: [{ id: 'a', type: 'multipart', text: 's', points: 1, parts: [] }] }).some((e) => /cannot contain another multi-part/.test(e)));
  assert.ok(errs({ parts: [{ ...parts()[0], options: [{ id: 'a', text: 'A' }] }] }).some((e) => /part \(a\)/.test(e)), 'part errors mention the part');
  assert.equal(isAutoPartType({ type: 'mcq' }), true);
  assert.equal(isAutoPartType({ type: 'open' }), false);
  assert.equal(isAutoPartType({ type: 'structure', studentCharges: true }), false);
  assert.equal(partsPoints({ parts: parts() }), 3);
  assert.equal(blankQuestion('multipart', 'q3').parts.length, 2);
});

test('scoring: points earned over points possible', () => {
  const q = norm({});
  assert.equal(gradeQuestion(q, { a: 'b', b: 2 }).isCorrect, true);
  const g = gradeQuestion(q, { a: 'a', b: 2 });
  assert.equal(g.pointsEarned, 2);
  assert.equal(g.partial, true);
  assert.equal(g.isCorrect, false);
  assert.equal(gradeQuestion(q, { a: 'b' }).pointsEarned, 1);
  assert.equal(gradeQuestion(q, { a: 'a', b: 5 }).pointsEarned, 0);
});

test('malformed answers never throw', () => {
  const q = norm({});
  for (const a of [undefined, null, 'x', 3, [], {}, { a: {}, b: [] }]) {
    assert.equal(gradeQuestion(q, a).isCorrect, false);
  }
  assert.equal(isAnswered(q, {}), false);
  assert.equal(isAnswered(q, { b: 2 }), true);
});

test('answer and key text', () => {
  const q = norm({});
  assert.match(formatAnswer(q, { a: 'b' }), /^\(a\) .*; \(b\) /);
  assert.match(correctAnswerText(q), /^\(a\) B; \(b\) 2/);
});

test('works inside gradeTest with a hint on the whole question', () => {
  const t = normalizeTest({ code: 'TST', title: 'T', questions: [mk({ hint: { text: 'h', cost: 1 } })] });
  const r = gradeTest(t, { q1: { a: 'b', b: 2 } }, { hintsUsed: ['q1'] });
  assert.equal(r.scoreAchieved, 2);
});
