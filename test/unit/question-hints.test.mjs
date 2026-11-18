// V4-03 per-question extras: confidence, point-costing hint, universal explanation.
globalThis.window = { CHEMISTRYWORKS_CONFIG: { FEATURES: { v4Types: true } } };
import test from 'node:test';
import assert from 'node:assert/strict';
const { CONFIDENCE_LEVELS, confidenceLabel, validConfidence, hintButtonText, ptsText, confidenceStats } = await import('../../js/lib/extras.js');
const { normalizeTest, validateTest } = await import('../../js/lib/schema.js');
const { gradeQuestion, gradeTest } = await import('../../js/lib/grading.js');

const base = { id: 'q1', type: 'truefalse', text: 'x', points: 2, correctAnswer: true };
const mk = (q) => normalizeTest({ code: 'TST', title: 'T', questions: [{ ...base, ...q }] });
const errs = (q) => validateTest(mk(q)).errors;

test('normalize: off by default, string hint accepted, empty hint dropped', () => {
  const q = mk({}).questions[0];
  assert.equal(q.confidence, undefined);
  assert.equal(q.hint, undefined);
  assert.deepEqual(mk({ hint: 'look' }).questions[0].hint, { text: 'look', cost: 0 });
  assert.equal(mk({ hint: { text: '  ', cost: 1 } }).questions[0].hint, undefined);
  assert.equal(mk({ confidence: true }).questions[0].confidence, true);
  assert.equal(mk({ confidence: false }).questions[0].confidence, undefined);
});

test('validate: hint cost within the points', () => {
  assert.deepEqual(errs({ hint: { text: 'h', cost: 1 } }), []);
  assert.ok(errs({ hint: { text: 'h', cost: 3 } }).some((e) => /cannot be more than/.test(e)));
  assert.ok(errs({ hint: { text: 'h', cost: -1 } }).some((e) => /cost must be a number/.test(e)));
});

test('grading: hint cost is subtracted, never below 0; two-argument calls unchanged', () => {
  const q = mk({ hint: { text: 'h', cost: 0.5 } }).questions[0];
  assert.equal(gradeQuestion(q, true).pointsEarned, 2);
  assert.equal(gradeQuestion(q, true, { hintUsed: true }).pointsEarned, 1.5);
  assert.equal(gradeQuestion(q, true, { hintUsed: true }).isCorrect, true);
  assert.equal(gradeQuestion(q, false, { hintUsed: true }).pointsEarned, 0);
  assert.equal(gradeQuestion(q, undefined, { hintUsed: true }).pointsEarned, 0);
});

test('gradeTest: hintsUsed (Set or array) and confidence on the result rows', () => {
  const t = normalizeTest({ code: 'TST', title: 'T', questions: [
    { ...base, id: 'q1', hint: { text: 'h', cost: 1 }, confidence: true },
    { ...base, id: 'q2' },
    { ...base, id: 'q3', confidence: true }] });
  const answers = { q1: true, q2: true };
  const none = gradeTest(t, answers);
  assert.equal(none.scoreAchieved, 4);
  const g = gradeTest(t, answers, { hintsUsed: new Set(['q1']), confidence: { q1: 3, q2: 2, q3: 1 } });
  assert.equal(g.scoreAchieved, 3);
  assert.equal(g.results[0].hintUsed, true);
  assert.equal(g.results[0].hintCost, 1);
  assert.equal(g.results[0].confidence, 3);
  assert.equal(g.results[1].confidence, undefined, 'question did not ask');
  assert.equal(g.results[2].confidence, undefined, 'unanswered');
  assert.equal(gradeTest(t, answers, { hintsUsed: ['q1'] }).scoreAchieved, 3);
});

test('explanation is kept for the new types too', () => {
  const t = normalizeTest({ code: 'TST', title: 'T', questions: [{ id: 'q1', type: 'naming', text: 'x', points: 1, prompt: 'NaCl', answers: ['sodium chloride'], explanation: 'because' }] });
  assert.equal(t.questions[0].explanation, 'because');
});

test('helpers: labels, validity, text', () => {
  assert.deepEqual(CONFIDENCE_LEVELS.map((l) => l.label), ['Guessing', 'Fairly sure', 'Certain']);
  assert.equal(confidenceLabel(2), 'Fairly sure');
  assert.equal(confidenceLabel(9), '');
  assert.equal(validConfidence(3), true);
  assert.equal(validConfidence(0), false);
  assert.equal(validConfidence(true), false);
  assert.equal(validConfidence(null), false);
  assert.equal(ptsText(1), '1 pt');
  assert.equal(ptsText(0.5), '0.5 pts');
  assert.equal(hintButtonText({ hint: { cost: 1 } }), 'Show hint (−1 pt)');
  assert.equal(hintButtonText({ hint: { cost: 0 } }), 'Show hint');
});

test('confidenceStats: average and confident-but-wrong', () => {
  const row = (c, ok, extra = {}) => ({ responses: [{ questionId: 'q1', confidence: c, answered: true, isCorrect: ok }], ...extra });
  const s = confidenceStats([row(3, false), row(3, true), row(1, false), row(undefined, true), row(3, false, { status: 'Extra attempt' }), row(3, false, { status: 'Needs grading' })]).get('q1');
  assert.equal(s.n, 3);
  assert.equal(s.avg, 2.33);
  assert.equal(s.confidentWrong, 1);
  assert.equal(confidenceStats(null).size, 0);
});
