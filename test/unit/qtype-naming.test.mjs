// V4-03 naming type: normalize, validate, scoring, text.
globalThis.window = { CHEMISTRYWORKS_CONFIG: { FEATURES: { v4Types: true } } };
import test from 'node:test';
import assert from 'node:assert/strict';
const { normalizeName, namesEqual } = await import('../../js/lib/qtypes/naming.js');
const { normalizeTest, validateTest, blankQuestion } = await import('../../js/lib/schema.js');
const { gradeQuestion, formatAnswer, isAnswered, correctAnswerText } = await import('../../js/lib/grading.js');

const norm = (q) => normalizeTest({ code: 'TST', title: 'T', questions: [{ id: 'q1', points: 2, text: 'x', ...q }] }).questions[0];
const errs = (q) => validateTest(normalizeTest({ code: 'TST', title: 'T', questions: [{ id: 'q1', points: 2, text: 'x', ...q }] })).errors;

test('normalize defaults', () => {
  const q = norm({ type: 'naming' });
  assert.equal(q.direction, 'toName');
  assert.equal(q.prompt, '');
  assert.deepEqual(q.answers, []);
  assert.deepEqual(norm({ type: 'naming', answers: ' a ' }).answers, ['a']);
});

test('validate messages', () => {
  assert.ok(errs({ type: 'naming', direction: 'toName', prompt: '', answers: [] }).some((e) => /prompt is required/.test(e)));
  assert.ok(errs({ type: 'naming', direction: 'toName', prompt: 'NaCl', answers: [] }).some((e) => /at least one accepted answer/.test(e)));
  assert.deepEqual(errs({ type: 'naming', direction: 'toName', prompt: 'NaCl', answers: ['sodium chloride'] }), []);
  assert.ok(blankQuestion('naming', 'q9').answers.length > 0);
});

test('toName: case, spacing, hyphens, Roman numerals, optional mono', () => {
  assert.equal(normalizeName('Copper (II)  Sulfate'), normalizeName('copper(II) sulfate'));
  assert.ok(namesEqual('IRON-(III) oxide', 'iron(III) oxide'));
  assert.ok(namesEqual('monocarbon monoxide', 'carbon monoxide'));
  assert.ok(namesEqual('carbon monoxide', 'carbon monoxide.'));
  assert.ok(!namesEqual('copper(I) oxide', 'copper(II) oxide'));
  assert.ok(!namesEqual('cuprous oxide', 'copper(I) oxide'), 'ous/ic is not auto-converted');
  assert.ok(!namesEqual('', ''));
  const q = norm({ type: 'naming', prompt: 'CuO', answers: ['copper(II) oxide', 'cupric oxide'] });
  assert.equal(gradeQuestion(q, 'Cupric Oxide').isCorrect, true);
  assert.equal(gradeQuestion(q, 'copper (II) oxide').pointsEarned, 2);
  assert.equal(gradeQuestion(q, 'copper oxide').pointsEarned, 0);
});

test('toFormula uses chemistry equality', () => {
  const q = norm({ type: 'naming', direction: 'toFormula', prompt: 'copper(II) sulfate pentahydrate', answers: ['CuSO4.5H2O'] });
  assert.equal(gradeQuestion(q, 'CuSO4·5H2O').isCorrect, true);
  assert.equal(gradeQuestion(q, 'cuso4.5h2o').isCorrect, false);
  assert.equal(gradeQuestion(q, 'CuSO4').isCorrect, false);
});

test('malformed answers never throw', () => {
  const q = norm({ type: 'naming', prompt: 'NaCl', answers: ['sodium chloride'] });
  for (const a of [undefined, null, 5, {}, [], '', '   ', true]) {
    assert.equal(gradeQuestion(q, a).isCorrect, false);
    assert.equal(isAnswered(q, a), false);
  }
});

test('answer and key text', () => {
  const q = norm({ type: 'naming', prompt: 'NaCl', answers: ['sodium chloride', 'table salt'] });
  assert.equal(formatAnswer(q, ' sodium chloride '), 'sodium chloride');
  assert.equal(correctAnswerText(q), 'sodium chloride / table salt');
});
