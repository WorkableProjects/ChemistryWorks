// Conformance for every registered question type: its fixture is normalized, validated and graded, and the answer
// reads back as text for results, CSV and the PDF export. The UI and editor loaders need a browser, so test/e2e covers
// them; here only the unknown-type rejection runs.
globalThis.window = { CHEMISTRYWORKS_CONFIG: { FEATURES: { v4Types: true } } };
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const { normalizeTest, validateTest, blankQuestion } = await import('../../js/lib/schema.js');
const { gradeQuestion, isAnswered, formatAnswer, correctAnswerText, pdfLines } = await import('../../js/lib/grading.js');
const { typeDef, registeredTypes, loadTypeUI, loadTypeEditor } = await import('../../js/lib/qtypes/registry.js');

const DIR = new URL('../fixtures/types/', import.meta.url);
const fixtureTypes = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
const fixture = (type) => JSON.parse(readFileSync(new URL(`${type}.json`, DIR), 'utf8'));
const wrap = (q) => normalizeTest({ code: 'FIXTURE', title: 'Fixture', questions: [structuredClone(q)] });
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';

const FUNCTIONS = ['normalize', 'validate', 'blank', 'isAnswered', 'grade', 'format', 'keyText', 'correctAnswer'];

test('registered types all have a fixture', () => {
  assert.ok(registeredTypes().length >= 27, 'the built-in types that moved and the 22 registry types are registered');
  for (const t of registeredTypes()) assert.ok(fixtureTypes.includes(t), `fixture for ${t}`);
});

for (const type of registeredTypes()) {
  const def = typeDef(type);
  const fx = fixture(type);

  test(`${type}: definition follows the TypeDef contract`, () => {
    assert.equal(def.type, type);
    for (const k of ['label', 'shortLabel', 'group']) assert.ok(nonEmpty(def[k]), k);
    assert.ok(['Basics', 'Match & sort', 'Chemistry', 'Diagrams & graphs'].includes(def.group), `group ${def.group}`);
    assert.equal(typeof def.manual, 'boolean');
    for (const k of FUNCTIONS) assert.equal(typeof def[k], 'function', k);
    assert.equal('score' in def, false, 'renamed to grade');
    assert.equal('answerText' in def, false, 'renamed to format');
    if ('toPdf' in def) assert.equal(typeof def.toPdf, 'function');
  });

  test(`${type}: normalize, validate, grade and text`, () => {
    const result = validateTest(wrap(fx.question));
    assert.deepEqual(result.errors, [], 'validates with no errors');
    const q = wrap(fx.question).questions[0];
    if (def.manual) {
      assert.equal(isAnswered(q, fx.correct), true);
      assert.equal(isAnswered(q, fx.wrong), false);
      assert.notEqual(gradeQuestion(q, fx.correct).isCorrect, true, 'a teacher-graded type is never full credit by itself');
    } else {
      const good = gradeQuestion(q, fx.correct);
      assert.equal(good.isCorrect, true, 'correct is full credit');
      assert.equal(good.pointsEarned, q.points);
      assert.equal(gradeQuestion(q, fx.wrong).pointsEarned, 0, 'wrong earns nothing');
      if ('partial' in fx) {
        const part = gradeQuestion(q, fx.partial).pointsEarned;
        assert.ok(part > 0 && part < q.points, `partial credit, got ${part} of ${q.points}`);
      }
      assert.ok(nonEmpty(correctAnswerText(q)), 'the key reads as text');
    }
    assert.ok(nonEmpty(formatAnswer(q, fx.correct)), 'the answer reads as text');
    const lines = pdfLines(q, fx.correct);
    assert.ok(Array.isArray(lines) && lines.length > 0 && lines.every(nonEmpty), 'PDF text is not empty');
  });

  test(`${type}: the builder template is valid`, () => {
    const q = blankQuestion(type, 'q1');
    assert.equal(q.type, type);
    assert.deepEqual(validateTest(normalizeTest({ code: 'BLANK', title: 'Blank', questions: [q] })).errors, []);
  });
}

test('an unknown type rejects with unknown_type', async () => {
  await assert.rejects(loadTypeUI('nope'), /unknown_type:nope/);
  await assert.rejects(loadTypeEditor('nope'), /unknown_type:nope/);
});
