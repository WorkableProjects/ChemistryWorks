import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeTest, validateTest, QUESTION_TYPES, MANUAL_TYPES } from '../../js/lib/schema.js';
import { gradeTest } from '../../js/lib/grading.js';
import { validateBank } from '../../scripts/validate-tests.mjs';

const DIR = new URL('../../data/tests/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
const load = (f) => normalizeTest(JSON.parse(readFileSync(new URL(f, DIR), 'utf8')));

function keyAnswer(q) {
  switch (q.type) {
    case 'numeric': return String(q.correctAnswer);
    case 'formula': return Array.isArray(q.correctAnswer) ? q.correctAnswer[0] : q.correctAnswer;
    default: return q.correctAnswer;
  }
}

test('bank contains the expected tests', () => {
  for (const code of ['CHEM101', 'CHEM102', 'CHEM110', 'CHEM201']) assert.ok(files.includes(`${code}.json`), code);
});

for (const f of files) {
  const t = load(f);
  test(`${f}: validates, file name matches code`, () => {
    const { valid, errors } = validateTest(t);
    assert.deepEqual(errors, []);
    assert.ok(valid);
    assert.equal(`${t.code}.json`, f);
  });
  test(`${f}: unique question ids and explanations on every question`, () => {
    const ids = t.questions.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const q of t.questions) assert.ok(q.explanation.trim().length > 10, `${q.id} needs an explanation`);
  });
  test(`${f}: answering every question with its key scores 100.00`, () => {
    const answers = Object.fromEntries(t.questions.map((q) => [q.id, keyAnswer(q)]));
    const g = gradeTest(t, answers);
    assert.equal(g.percentage, '100.00');
    assert.equal(g.correctCount, t.questions.length);
    assert.equal(g.answeredCount, t.questions.length);
  });
  test(`${f}: blank submission scores 0.00`, () => {
    assert.equal(gradeTest(t, {}).percentage, '0.00');
  });
}

for (const code of ['CHEM102', 'CHEM110', 'CHEM201']) {
  test(`${code}: uses all six auto-graded question types, 10 questions, math notation`, () => {
    const t = load(`${code}.json`);
    assert.equal(t.questions.length, 10);
    assert.deepEqual([...new Set(t.questions.map((q) => q.type))].sort(), QUESTION_TYPES.filter((x) => !MANUAL_TYPES.includes(x)).sort());
    assert.ok(t.questions.some((q) => q.text.includes('\\ce{')));
  });
}

test('CHEM102 / CHEM110 / CHEM201 settings from the spec', () => {
  const a = load('CHEM102.json'), b = load('CHEM110.json'), c = load('CHEM201.json');
  assert.equal(a.timeLimitMinutes, 30);
  assert.equal(a.passingPercent, 70);
  assert.equal(b.shuffleOptions, true);
  assert.equal(c.showCorrectAnswers, true);
  assert.equal(c.passingPercent, 75);
});

test('spot-check chemistry keys', () => {
  const a = load('CHEM102.json');
  const q = (id) => a.questions.find((x) => x.id === id);
  // CaCO3 100.09 g/mol x 0.250 mol; H2O 36.0 g / 18.016 g/mol
  assert.ok(Math.abs(0.25 * (40.08 + 12.01 + 3 * 16.0) - q('q2').correctAnswer) < 0.01);
  assert.ok(Math.abs(36 / (2 * 1.008 + 16) - q('q3').correctAnswer) < 0.001);
  assert.ok(Math.abs((4 / 2.016) * 18.016 - q('q8').correctAnswer) < 0.01);
  assert.equal(q('q9').correctAnswer, (10 / 12.5) * 100);
  const c = load('CHEM201.json');
  assert.ok(Math.abs(Math.sqrt(1.8e-5 * 0.1) - c.questions.find((x) => x.id === 'q8').correctAnswer) < 1e-6);
  assert.equal(c.questions.find((x) => x.id === 'q9').correctAnswer, 20); // 0.20 / 0.10^2
});

test('validateBank reports no errors and the CLI exits 0', async () => {
  const { rows, errors } = await validateBank();
  assert.deepEqual(errors, []);
  assert.equal(rows.length, files.length);
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../../scripts/validate-tests.mjs', import.meta.url))], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /All \d+ tests valid/);
});
