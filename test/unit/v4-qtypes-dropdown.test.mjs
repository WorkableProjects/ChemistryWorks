// V4-03 dropdown cloze: markers, validation, per-blank credit.
globalThis.window = { CHEMISTRYWORKS_CONFIG: { FEATURES: { v4Types: true } } };
import test from 'node:test';
import assert from 'node:assert/strict';
const { splitMarkers, markerIdsOf, numberedText } = await import('../../js/lib/qtypes/dropdown.js');
const { normalizeTest, validateTest, blankQuestion } = await import('../../js/lib/schema.js');
const { gradeQuestion, formatAnswer, isAnswered, correctAnswerText, displayQuestionText } = await import('../../js/lib/grading.js');

const mk = (q) => ({ id: 'q1', type: 'dropdown', points: 3, text: 'A [[b1]] and a [[b2]].', blanks: [
  { id: 'b1', options: ['x', 'y'], answer: 'x' }, { id: 'b2', options: ['p', 'q', 'r'], answer: 'q' }], ...q });
const norm = (q) => normalizeTest({ code: 'TST', title: 'T', questions: [mk(q)] }).questions[0];
const errs = (q) => validateTest(normalizeTest({ code: 'TST', title: 'T', questions: [mk(q)] })).errors;

test('markers', () => {
  assert.deepEqual(markerIdsOf('a [[b1]] b [[ b2 ]]'), ['b1', 'b2']);
  assert.deepEqual(splitMarkers('a[[x]]'), [{ text: 'a' }, { blank: 'x' }]);
  assert.equal(numberedText('a [[b1]] b [[b2]]'), 'a ____(1) b ____(2)');
  assert.equal(displayQuestionText(norm({})), 'A ____(1) and a ____(2).');
});

test('normalize defaults', () => {
  const q = norm({});
  assert.equal(q.partialCredit, true);
  assert.equal(norm({ partialCredit: false }).partialCredit, false);
  assert.deepEqual(norm({ blanks: [{ id: ' b1 ', options: [' x ', '', 'y'], answer: ' x ' }] }).blanks[0], { id: 'b1', options: ['x', 'y'], answer: 'x' });
});

test('validate messages', () => {
  assert.deepEqual(errs({}), []);
  assert.ok(errs({ text: 'no blanks' }).some((e) => /at least one blank/.test(e)));
  assert.ok(errs({ text: 'A [[b1]] [[b1]] [[b2]]' }).some((e) => /more than once/.test(e)));
  assert.ok(errs({ text: 'A [[b1]]' }).some((e) => /"b2" is not used in the text/.test(e)));
  assert.ok(errs({ text: 'A [[b1]] [[b2]] [[b3]]' }).some((e) => /\[\[b3\]\] in the text has no entry/.test(e)));
  assert.ok(errs({ blanks: [{ id: 'b1', options: ['x'], answer: 'x' }, { id: 'b2', options: ['p', 'q'], answer: 'z' }] }).some((e) => /at least two options/.test(e)));
  assert.ok(errs({ blanks: [{ id: 'b1', options: ['x', 'y'], answer: 'x' }, { id: 'b2', options: ['p', 'q'], answer: 'z' }] }).some((e) => /answer must be one of its options/.test(e)));
  assert.ok(errs({ blanks: [{ id: 'b1', options: ['x', 'x'], answer: 'x' }, { id: 'b2', options: ['p', 'q'], answer: 'p' }] }).some((e) => /duplicate options/.test(e)));
  assert.equal(blankQuestion('dropdown', 'q2').blanks.length, 2);
});

test('scoring: full, partial, none, malformed', () => {
  const q = norm({});
  assert.equal(gradeQuestion(q, { b1: 'x', b2: 'q' }).isCorrect, true);
  const part = gradeQuestion(q, { b1: 'x', b2: 'r' });
  assert.equal(part.pointsEarned, 1.5);
  assert.equal(part.partial, true);
  assert.equal(gradeQuestion(q, { b1: 'y', b2: 'r' }).pointsEarned, 0);
  assert.equal(gradeQuestion(norm({ partialCredit: false }), { b1: 'x', b2: 'r' }).pointsEarned, 0);
  assert.equal(gradeQuestion(q, { b1: 'x' }).pointsEarned, 1.5);
  for (const a of [undefined, null, 'x', 4, [], {}]) { assert.equal(gradeQuestion(q, a).isCorrect, false); }
  assert.equal(isAnswered(q, {}), false);
  assert.equal(isAnswered(q, { b1: 'x' }), true);
});

test('answer and key text', () => {
  const q = norm({});
  assert.equal(formatAnswer(q, { b1: 'x' }), '(1) x; (2) —');
  assert.equal(correctAnswerText(q), '(1) x; (2) q');
});
