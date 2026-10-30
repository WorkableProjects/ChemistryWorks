import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  QUESTION_TYPES, TYPE_LABELS, normalizeTest, validateTest, blankQuestion, nextQuestionId, blankTest,
} from '../../js/lib/schema.js';

const chem = () => JSON.parse(readFileSync(new URL('../../data/tests/CHEM101.json', import.meta.url), 'utf8'));

function mk(q) {
  return normalizeTest({ code: 'T1', title: 'T', questions: [q] });
}
const errsOf = (t) => validateTest(t).errors;
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected /${re}/ in ${JSON.stringify(errors)}`);

test('constants', () => {
  assert.deepEqual(QUESTION_TYPES, ['mcq', 'multi', 'numeric', 'formula', 'truefalse', 'matching', 'short']);
  for (const t of QUESTION_TYPES) assert.equal(typeof TYPE_LABELS[t], 'string');
  assert.equal(TYPE_LABELS.truefalse, 'True / False');
});

test('CHEM101 normalizes and validates with zero errors', () => {
  const t = normalizeTest(chem());
  assert.deepEqual(validateTest(t), { valid: true, errors: [] });
  assert.equal(t.questions.length, 7);
  assert.equal(t.defaultMode, null);
  assert.equal(t.allowModeToggle, true);
  assert.equal(t.passingPercent, null);
});

test('normalizeTest applies defaults', () => {
  const t = normalizeTest({ code: ' chem-1 ', title: 'X', questions: [{ id: 'a', type: 'truefalse', text: 'T', correctAnswer: true }] });
  assert.equal(t.code, 'CHEM-1');
  assert.equal(t.description, '');
  assert.equal(t.timeLimitMinutes, null);
  assert.equal(t.shuffleQuestions, false);
  assert.equal(t.shuffleOptions, false);
  assert.equal(t.showResults, true);
  assert.equal(t.showCorrectAnswers, true);
  assert.equal(t.allowModeToggle, true);
  assert.equal(t.defaultMode, null);
  assert.equal(t.passingPercent, null);
  assert.equal(t.questions[0].points, 1);
  assert.equal(t.questions[0].explanation, '');
});

test('normalizeTest per-type defaults', () => {
  const t = normalizeTest({
    code: 'AB', title: 'x',
    questions: [
      { id: 'n', type: 'numeric', text: 't', correctAnswer: '3.5' },
      { id: 'f', type: 'formula', text: 't', correctAnswer: 'H2O' },
      { id: 'm', type: 'multi', text: 't', options: [{ id: 1, text: 2 }, { id: 2, text: 3 }], correctAnswer: ['1'] },
      { id: 'x', type: 'matching', text: 't', left: [], right: [], correctAnswer: {} },
    ],
  });
  const [n, f, m, x] = t.questions;
  assert.equal(n.tolerance, 0);
  assert.equal(n.toleranceType, 'absolute');
  assert.equal(n.unit, '');
  assert.equal(n.correctAnswer, 3.5);
  assert.equal(f.caseSensitive, true);
  assert.equal(m.partialCredit, false);
  assert.deepEqual(m.options, [{ id: '1', text: '2' }, { id: '2', text: '3' }]);
  assert.equal(x.partialCredit, true);
});

test('normalizeTest coerces points / time / passing', () => {
  const t = normalizeTest({ code: 'AB', title: 'x', timeLimitMinutes: '15', passingPercent: '70', questions: [{ id: 'a', type: 'truefalse', text: 't', points: '2.5', correctAnswer: false }] });
  assert.equal(t.timeLimitMinutes, 15);
  assert.equal(t.passingPercent, 70);
  assert.equal(t.questions[0].points, 2.5);
});

test('normalizeTest does not mutate its input and deep-copies', () => {
  const raw = chem();
  raw.code = ' chem101 ';
  const snapshot = JSON.stringify(raw);
  const t = normalizeTest(raw);
  assert.equal(JSON.stringify(raw), snapshot);
  t.questions[0].options[0].text = 'changed';
  assert.equal(JSON.stringify(raw), snapshot);
  assert.equal(t.code, 'CHEM101');
});

test('normalizeTest preserves unknown extra fields (e.g. drafts updatedAt)', () => {
  const t = normalizeTest({ ...chem(), updatedAt: '2025-01-01' });
  assert.equal(t.updatedAt, '2025-01-01');
});

test('normalizeTest tolerates garbage', () => {
  for (const bad of [null, undefined, 5, 'x', []]) {
    const t = normalizeTest(bad);
    assert.equal(t.code, '');
    assert.deepEqual(t.questions, []);
  }
  const t = normalizeTest({ questions: [null, 5] });
  assert.equal(t.questions.length, 2);
});

test('validateTest rejects non-objects', () => {
  assert.equal(validateTest(null).valid, false);
  assert.equal(validateTest('x').valid, false);
});

// ---- test-level rules
test('rule: missing code', () => has(errsOf(normalizeTest({ title: 'x', questions: [blankQuestion('mcq', 'q1')] })), /code is required/));
test('rule: invalid code (bad chars)', () => has(errsOf({ ...blankTest(), code: 'AB CD', title: 'x', questions: [blankQuestion('mcq', 'q1')] }), /code must be/));
test('rule: invalid code (too short)', () => has(errsOf({ ...blankTest(), code: 'A', title: 'x', questions: [blankQuestion('mcq', 'q1')] }), /code must be/));
test('rule: invalid code (too long)', () => has(errsOf({ ...blankTest(), code: 'A'.repeat(33), title: 'x', questions: [blankQuestion('mcq', 'q1')] }), /code must be/));
test('rule: missing title', () => has(errsOf(normalizeTest({ code: 'AB', questions: [blankQuestion('mcq', 'q1')] })), /title is required/));
test('rule: no questions', () => has(errsOf(normalizeTest({ code: 'AB', title: 'x' })), /at least one question/));

const base = (extra) => ({ ...normalizeTest({ code: 'AB', title: 'x', questions: [blankQuestion('mcq', 'q1')] }), ...extra });
test('rule: timeLimitMinutes must be positive', () => {
  has(errsOf(base({ timeLimitMinutes: 0 })), /timeLimitMinutes/);
  has(errsOf(base({ timeLimitMinutes: -5 })), /timeLimitMinutes/);
  has(errsOf(base({ timeLimitMinutes: NaN })), /timeLimitMinutes/);
  has(errsOf(base({ timeLimitMinutes: 'ten' })), /timeLimitMinutes/);
  assert.equal(validateTest(base({ timeLimitMinutes: 0.5 })).valid, true);
  assert.equal(validateTest(base({ timeLimitMinutes: null })).valid, true);
});
test('rule: passingPercent range', () => {
  has(errsOf(base({ passingPercent: -1 })), /passingPercent/);
  has(errsOf(base({ passingPercent: 101 })), /passingPercent/);
  assert.equal(validateTest(base({ passingPercent: 0 })).valid, true);
  assert.equal(validateTest(base({ passingPercent: 100 })).valid, true);
});
test('rule: defaultMode', () => {
  has(errsOf(base({ defaultMode: 'grid' })), /defaultMode/);
  assert.equal(validateTest(base({ defaultMode: 'focus' })).valid, true);
  assert.equal(validateTest(base({ defaultMode: 'scroll' })).valid, true);
});

// ---- question-level rules
test('rule: duplicate question ids', () => {
  const t = normalizeTest({ code: 'AB', title: 'x', questions: [blankQuestion('mcq', 'q1'), blankQuestion('truefalse', 'q1')] });
  has(errsOf(t), /Question 2 \(q1\): duplicate question id/);
});
test('rule: missing / invalid id chars', () => {
  has(errsOf(mk({ ...blankQuestion('mcq', ''), id: '' })), /id is required/);
  has(errsOf(mk(blankQuestion('mcq', 'a b'))), /id may only contain/);
  has(errsOf(mk(blankQuestion('mcq', 'a.b'))), /id may only contain/);
});
test('rule: unknown type', () => has(errsOf(mk({ id: 'q1', type: 'essay', text: 'x', correctAnswer: 'a' })), /unknown type "essay"/));
test('rule: empty text', () => has(errsOf(mk({ ...blankQuestion('mcq', 'q1'), text: '   ' })), /text is required/));
test('rule: points <= 0 or non-number', () => {
  has(errsOf(mk({ ...blankQuestion('mcq', 'q1'), points: 0 })), /points/);
  has(errsOf(mk({ ...blankQuestion('mcq', 'q1'), points: -2 })), /points/);
  has(errsOf(mk({ ...blankQuestion('mcq', 'q1'), points: 'lots' })), /points/);
});
test('error messages are prefixed with the location', () => {
  const e = errsOf(normalizeTest({ code: 'AB', title: 'x', questions: [blankQuestion('mcq', 'q1'), { ...blankQuestion('numeric', 'q3'), correctAnswer: 'x' }] }));
  assert.ok(e.includes('Question 2 (q3): correctAnswer must be a number.'), JSON.stringify(e));
});

test('rule: mcq < 2 options', () => has(errsOf(mk({ ...blankQuestion('mcq', 'q1'), options: [{ id: 'a', text: 'A' }] })), /at least 2/));
test('rule: duplicate option ids', () => has(errsOf(mk({ ...blankQuestion('mcq', 'q1'), options: [{ id: 'a', text: 'A' }, { id: 'a', text: 'B' }] })), /duplicate option id/));
test('rule: empty option text', () => has(errsOf(mk({ ...blankQuestion('mcq', 'q1'), options: [{ id: 'a', text: '' }, { id: 'b', text: 'B' }] })), /empty text/));
test('rule: mcq correctAnswer not an option id', () => {
  has(errsOf(mk({ ...blankQuestion('mcq', 'q1'), correctAnswer: 'z' })), /correctAnswer must be the id/);
  has(errsOf(mk({ ...blankQuestion('mcq', 'q1'), correctAnswer: ['a'] })), /correctAnswer must be the id/);
});
test('rule: multi correctAnswer empty / not array / unknown ids', () => {
  has(errsOf(mk({ ...blankQuestion('multi', 'q1'), correctAnswer: [] })), /non-empty array/);
  has(errsOf(mk({ ...blankQuestion('multi', 'q1'), correctAnswer: 'a' })), /non-empty array/);
  has(errsOf(mk({ ...blankQuestion('multi', 'q1'), correctAnswer: ['a', 'zz'] })), /unknown option id/);
});
test('rule: numeric correctAnswer not finite', () => {
  has(errsOf(mk({ ...blankQuestion('numeric', 'q1'), correctAnswer: NaN })), /must be a number/);
  has(errsOf(mk({ ...blankQuestion('numeric', 'q1'), correctAnswer: Infinity })), /must be a number/);
  has(errsOf(mk({ ...blankQuestion('numeric', 'q1'), correctAnswer: 'abc' })), /must be a number/);
  has(errsOf(mk({ ...blankQuestion('numeric', 'q1'), correctAnswer: null })), /must be a number/);
});
test('rule: numeric negative tolerance / bad toleranceType', () => {
  has(errsOf(mk({ ...blankQuestion('numeric', 'q1'), tolerance: -0.1 })), /tolerance must be/);
  has(errsOf(mk({ ...blankQuestion('numeric', 'q1'), tolerance: NaN })), /tolerance must be/);
  has(errsOf(mk({ ...blankQuestion('numeric', 'q1'), toleranceType: 'relative' })), /toleranceType/);
});
test('rule: formula correctAnswer empty', () => {
  has(errsOf(mk({ ...blankQuestion('formula', 'q1'), correctAnswer: '' })), /non-empty formula/);
  has(errsOf(mk({ ...blankQuestion('formula', 'q1'), correctAnswer: '   ' })), /non-empty formula/);
  has(errsOf(mk({ ...blankQuestion('formula', 'q1'), correctAnswer: [] })), /at least one/);
  has(errsOf(mk({ ...blankQuestion('formula', 'q1'), correctAnswer: ['H2O', ''] })), /at least one/);
  assert.equal(validateTest(mk({ ...blankQuestion('formula', 'q1'), correctAnswer: ['H2O', 'HOH'] })).valid, true);
});
test('rule: truefalse correctAnswer not boolean', () => {
  has(errsOf(mk({ ...blankQuestion('truefalse', 'q1'), correctAnswer: 'true' })), /true or false/);
  has(errsOf(mk({ ...blankQuestion('truefalse', 'q1'), correctAnswer: 1 })), /true or false/);
});
test('rule: matching needs >= 2 left and right', () => {
  has(errsOf(mk({ ...blankQuestion('matching', 'q1'), left: [{ id: 'l1', text: 'a' }], correctAnswer: { l1: 'r1' } })), /left item needs at least 2/);
  has(errsOf(mk({ ...blankQuestion('matching', 'q1'), right: [{ id: 'r1', text: 'a' }] })), /right item needs at least 2/);
});
test('rule: matching correctAnswer missing a left id', () => {
  has(errsOf(mk({ ...blankQuestion('matching', 'q1'), correctAnswer: { l1: 'r1' } })), /missing a match for left item "l2"/);
  has(errsOf(mk({ ...blankQuestion('matching', 'q1'), correctAnswer: 'x' })), /must be an object/);
});
test('rule: matching correctAnswer unknown right / left id', () => {
  has(errsOf(mk({ ...blankQuestion('matching', 'q1'), correctAnswer: { l1: 'r1', l2: 'zz' } })), /unknown right item "zz"/);
  has(errsOf(mk({ ...blankQuestion('matching', 'q1'), correctAnswer: { l1: 'r1', l2: 'r2', l9: 'r1' } })), /unknown left item "l9"/);
});
test('matching allows distractors and reused right items', () => {
  const q = { ...blankQuestion('matching', 'q1'), right: [{ id: 'r1', text: 'a' }, { id: 'r2', text: 'b' }, { id: 'r3', text: 'distractor' }], correctAnswer: { l1: 'r1', l2: 'r1' } };
  assert.equal(validateTest(mk(q)).valid, true);
});

// ---- templates
for (const type of QUESTION_TYPES) {
  test(`blankQuestion(${type}) validates as-is`, () => {
    const q = blankQuestion(type, 'q7');
    assert.equal(q.id, 'q7');
    assert.equal(q.type, type);
    assert.ok(q.text.trim().length > 0);
    const t = normalizeTest({ code: 'AB', title: 'x', questions: [q] });
    assert.deepEqual(validateTest(t).errors, []);
    assert.deepEqual(t.questions[0], q, 'normalizing a blank question should be a no-op');
  });
}
test('blankQuestion mcq has 4 options, first correct', () => {
  const q = blankQuestion('mcq', 'q1');
  assert.equal(q.options.length, 4);
  assert.equal(q.correctAnswer, q.options[0].id);
});
test('blankQuestion returns fresh objects', () => {
  const a = blankQuestion('mcq', 'q1');
  a.options.push({ id: 'x', text: 'x' });
  assert.equal(blankQuestion('mcq', 'q1').options.length, 4);
});
test('blankQuestion rejects unknown types', () => assert.throws(() => blankQuestion('essay', 'q1')));

test('nextQuestionId', () => {
  assert.equal(nextQuestionId([]), 'q1');
  assert.equal(nextQuestionId(undefined), 'q1');
  assert.equal(nextQuestionId([{ id: 'q1' }, { id: 'q2' }]), 'q3');
  assert.equal(nextQuestionId([{ id: 'q2' }]), 'q1');
  assert.equal(nextQuestionId([{ id: 'q1' }, { id: 'q3' }]), 'q2');
  assert.equal(nextQuestionId([{ id: 'a' }]), 'q1');
});

test('blankTest has defaults and is invalid until filled', () => {
  const t = blankTest();
  assert.equal(t.code, '');
  assert.deepEqual(t.questions, []);
  assert.equal(t.showResults, true);
  assert.equal(t.timeLimitMinutes, null);
  assert.equal(validateTest(t).valid, false);
  const filled = { ...t, code: 'NEW1', title: 'New', questions: [blankQuestion('mcq', nextQuestionId([]))] };
  assert.equal(validateTest(normalizeTest(filled)).valid, true);
  assert.notEqual(blankTest().questions, t.questions);
});
