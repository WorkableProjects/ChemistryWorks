// Conformance test for every question type: each fixture in test/fixtures/types/ is normalized, validated and graded
// with its correct, wrong and (where the type gives partial credit) partial answer.
globalThis.window = { CHEMISTRYWORKS_CONFIG: { FEATURES: { v4Types: true } } };
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const { QUESTION_TYPES, MANUAL_TYPES, normalizeTest, validateTest } = await import('../../js/lib/schema.js');
const { gradeQuestion, isAnswered, formatAnswer, correctAnswerText } = await import('../../js/lib/grading.js');
await import('../../js/lib/qtypes/v4-types.js');

const DIR = new URL('../fixtures/types/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const load = (f) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));

const wrap = (q) => normalizeTest({ code: 'FIXTURE', title: 'Fixture', questions: [structuredClone(q)] });

test('there is one fixture for each of the 42 question types', () => {
  assert.equal(QUESTION_TYPES.length, 42);
  assert.deepEqual(files.map((f) => f.replace(/\.json$/, '')), [...QUESTION_TYPES].sort());
});

for (const file of files) {
  const type = file.replace(/\.json$/, '');
  const fx = load(file);

  test(`${type}: fixture has the contract shape`, () => {
    assert.equal(fx.question.type, type);
    assert.equal(typeof fx.question.id, 'string');
    assert.ok('correct' in fx && 'wrong' in fx, 'correct and wrong are required');
    assert.ok(Object.keys(fx).every((k) => ['question', 'correct', 'wrong', 'partial'].includes(k)));
  });

  test(`${type}: validates with no errors`, () => {
    const result = validateTest(wrap(fx.question));
    assert.deepEqual(result.errors, []);
  });

  const manual = MANUAL_TYPES.includes(type);
  test(`${type}: grading`, () => {
    const q = wrap(fx.question).questions[0];
    const possible = q.points;
    if (manual) {
      assert.equal(isAnswered(q, fx.correct), true, 'correct counts as answered');
      assert.equal(isAnswered(q, fx.wrong), false, 'wrong is a blank answer');
      assert.notEqual(gradeQuestion(q, fx.correct).isCorrect, true, 'manual types are never auto-graded as full');
      return;
    }
    const good = gradeQuestion(q, fx.correct);
    assert.equal(good.isCorrect, true, 'correct is full credit');
    assert.equal(good.pointsEarned, possible);
    const bad = gradeQuestion(q, fx.wrong);
    assert.equal(bad.isCorrect, false);
    assert.equal(bad.pointsEarned, 0, 'wrong earns nothing');
    if ('partial' in fx) {
      const part = gradeQuestion(q, fx.partial);
      assert.equal(part.isCorrect, false);
      assert.ok(part.pointsEarned > 0 && part.pointsEarned < possible, `partial earns some credit, got ${part.pointsEarned} of ${possible}`);
    }
  });

  test(`${type}: answer and key text are readable`, () => {
    const q = wrap(fx.question).questions[0];
    assert.ok(String(formatAnswer(q, fx.correct)).trim().length > 0, 'formatAnswer(correct)');
    if (!manual) assert.ok(String(correctAnswerText(q)).trim().length > 0, 'correctAnswerText');
  });
}
