import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as grading from '../../js/lib/grading.js';
import { normalizeTest } from '../../js/lib/schema.js';

const { parseNumber, isAnswered, gradeQuestion, gradeTest, formatAnswer } = grading;
const chem = () => normalizeTest(JSON.parse(readFileSync(new URL('../../data/tests/CHEM101.json', import.meta.url), 'utf8')));

test('exports match the contract', () => {
  for (const name of ['parseNumber', 'isAnswered', 'gradeQuestion', 'gradeTest', 'formatAnswer']) {
    assert.equal(typeof grading[name], 'function', name);
  }
});

// ---------- parseNumber
const PARSE = [
  ['18.02', 18.02], ['-3', -3], ['+4', 4], ['0', 0], ['.5', 0.5], ['5.', 5], ['  42  ', 42],
  ['1,204.5', 1204.5], ['1,000,000', 1000000], ['6.02e23', 6.02e23], ['6.02E+23', 6.02e23], ['1e-3', 0.001],
  ['6.02x10^23', 6.02e23], ['6.02X10^23', 6.02e23], ['6.02 × 10^23', 6.02e23], ['6.02*10^23', 6.02e23],
  ['6.02×10²³', 6.02e23], ['6.02 x 10^-3', 6.02e-3], ['6.02×10⁻³', 6.02e-3], ['6.02 × 10 ^ 23', 6.02e23],
  ['−3', -3], ['−3.5e2', -350], ['-1.2×10^-4', -1.2e-4],
];
for (const [input, expected] of PARSE) {
  test(`parseNumber(${JSON.stringify(input)})`, () => assert.equal(parseNumber(input), expected));
}
for (const junk of ['abc', '', '   ', '1.2.3', '1,5', '12,34', '--3', '1e', 'e5', 'Infinity', 'NaN', '0x10', '3 4', '1,2,3', '6.02x10^', '5%']) {
  test(`parseNumber(${JSON.stringify(junk)}) is NaN`, () => assert.ok(Number.isNaN(parseNumber(junk))));
}
test('parseNumber non-string input', () => {
  assert.equal(parseNumber(12.5), 12.5);
  assert.ok(Number.isNaN(parseNumber(null)));
  assert.ok(Number.isNaN(parseNumber(undefined)));
  assert.ok(Number.isNaN(parseNumber({})));
  assert.ok(Number.isNaN(parseNumber(NaN)));
  assert.ok(Number.isNaN(parseNumber(Infinity)));
  assert.ok(Number.isNaN(parseNumber(true)));
});
test('parseNumber strips a trailing unit (case/whitespace-insensitive)', () => {
  const u = { unit: 'g/mol' };
  assert.equal(parseNumber('18.02 g/mol', u), 18.02);
  assert.equal(parseNumber('18.02g/mol', u), 18.02);
  assert.equal(parseNumber('18.02 G/MOL', u), 18.02);
  assert.equal(parseNumber('18.02 g / mol', u), 18.02);
  assert.equal(parseNumber('18.02', u), 18.02);
  assert.equal(parseNumber('6.02e23 mol', { unit: 'mol' }), 6.02e23);
  assert.ok(Number.isNaN(parseNumber('18.02 kg', u)));
  assert.ok(Number.isNaN(parseNumber('g/mol', u)));
  assert.ok(Number.isNaN(parseNumber('18.02 g/mol'))); // no unit configured
});

// ---------- isAnswered
test('isAnswered', () => {
  const mcq = { type: 'mcq' }, multi = { type: 'multi' }, num = { type: 'numeric' }, f = { type: 'formula' }, tf = { type: 'truefalse' }, m = { type: 'matching' };
  assert.equal(isAnswered(mcq, 'a'), true);
  assert.equal(isAnswered(mcq, ''), false);
  assert.equal(isAnswered(mcq, '  '), false);
  assert.equal(isAnswered(mcq, undefined), false);
  assert.equal(isAnswered(mcq, null), false);
  assert.equal(isAnswered(multi, ['a']), true);
  assert.equal(isAnswered(multi, []), false);
  assert.equal(isAnswered(num, '0'), true);
  assert.equal(isAnswered(num, ' '), false);
  assert.equal(isAnswered(f, 'H2O'), true);
  assert.equal(isAnswered(f, ''), false);
  assert.equal(isAnswered(tf, false), true);
  assert.equal(isAnswered(tf, true), true);
  assert.equal(isAnswered(tf, null), false);
  assert.equal(isAnswered(m, {}), false);
  assert.equal(isAnswered(m, { a: 'x' }), true);
  assert.equal(isAnswered(m, { a: '' }), false);
  assert.equal(isAnswered(m, []), false);
});
test('isAnswered treats wrong-typed answers as unanswered', () => {
  assert.equal(isAnswered({ type: 'multi' }, 'a'), false);
  assert.equal(isAnswered({ type: 'truefalse' }, 'true'), false);
  assert.equal(isAnswered({ type: 'matching' }, 'a'), false);
  assert.equal(isAnswered({ type: 'formula' }, 5), false);
});

// ---------- gradeQuestion
const grade = (q, a) => gradeQuestion({ points: 2, ...q }, a);

test('mcq', () => {
  const q = { type: 'mcq', correctAnswer: 'b' };
  assert.deepEqual(grade(q, 'b'), { answered: true, isCorrect: true, pointsEarned: 2, pointsPossible: 2, partial: false });
  assert.deepEqual(grade(q, 'a'), { answered: true, isCorrect: false, pointsEarned: 0, pointsPossible: 2, partial: false });
  assert.deepEqual(grade(q, null), { answered: false, isCorrect: false, pointsEarned: 0, pointsPossible: 2, partial: false });
  assert.equal(grade(q, ['b']).isCorrect, false);
});

test('truefalse (false is a real answer)', () => {
  assert.equal(grade({ type: 'truefalse', correctAnswer: true }, true).isCorrect, true);
  assert.equal(grade({ type: 'truefalse', correctAnswer: true }, false).isCorrect, false);
  assert.equal(grade({ type: 'truefalse', correctAnswer: true }, false).answered, true);
  assert.equal(grade({ type: 'truefalse', correctAnswer: false }, false).isCorrect, true);
  assert.equal(grade({ type: 'truefalse', correctAnswer: true }, 'true').answered, false);
  assert.equal(grade({ type: 'truefalse', correctAnswer: true }, undefined).answered, false);
});

test('multi without partial credit', () => {
  const q = { type: 'multi', correctAnswer: ['a', 'c'], partialCredit: false };
  assert.equal(grade(q, ['c', 'a']).isCorrect, true);
  assert.equal(grade(q, ['a', 'c']).pointsEarned, 2);
  assert.equal(grade(q, ['a']).pointsEarned, 0);
  assert.equal(grade(q, ['a', 'b', 'c']).pointsEarned, 0);
  assert.equal(grade(q, []).answered, false);
});
test('multi with partial credit', () => {
  const q = { type: 'multi', correctAnswer: ['a', 'c', 'e'], partialCredit: true, points: 3 };
  const g = (a) => gradeQuestion(q, a);
  assert.deepEqual(g(['a', 'c', 'e']), { answered: true, isCorrect: true, pointsEarned: 3, pointsPossible: 3, partial: false });
  assert.equal(g(['a', 'c']).pointsEarned, 2);
  assert.equal(g(['a', 'c']).partial, true);
  assert.equal(g(['a', 'c']).isCorrect, false);
  assert.equal(g(['a']).pointsEarned, 1);
  assert.equal(g(['a', 'c', 'b']).pointsEarned, 1);   // (2-1)/3*3
  assert.equal(g(['b', 'd']).pointsEarned, 0);        // clamped at 0
  assert.equal(g(['a', 'b', 'd']).pointsEarned, 0);
  assert.equal(g(['a', 'c', 'e', 'b']).isCorrect, false);
  assert.equal(g(['a', 'c', 'e', 'b']).pointsEarned, 2);
  assert.equal(g(['a', 'a', 'c', 'e']).isCorrect, true); // duplicates ignored
  assert.equal(g('a').answered, false);
});
test('multi partial rounds to 2 decimals', () => {
  const q = { type: 'multi', correctAnswer: ['a', 'b', 'c'], partialCredit: true, points: 1 };
  assert.equal(gradeQuestion(q, ['a']).pointsEarned, 0.33);
});

test('numeric absolute tolerance, boundary passes', () => {
  const q = { type: 'numeric', correctAnswer: 18.016, tolerance: 0.05, toleranceType: 'absolute' };
  assert.equal(grade(q, '18.016').isCorrect, true);
  assert.equal(grade(q, '18.066').isCorrect, true);   // exactly at boundary
  assert.equal(grade(q, '17.966').isCorrect, true);   // exactly at boundary
  assert.equal(grade(q, '18.07').isCorrect, false);
  assert.equal(grade(q, '17.96').isCorrect, false);
  assert.equal(grade(q, 'abc').isCorrect, false);
  assert.equal(grade(q, 'abc').answered, true);
  assert.equal(grade(q, '').answered, false);
});
test('numeric exact with float noise epsilon', () => {
  const q = { type: 'numeric', correctAnswer: 0.3, tolerance: 0 };
  assert.equal(grade(q, String(0.1 + 0.2)).isCorrect, true);
  assert.equal(grade(q, '0.31').isCorrect, false);
  assert.equal(grade({ type: 'numeric', correctAnswer: 0 }, '0').isCorrect, true);
  assert.equal(grade({ type: 'numeric', correctAnswer: 0 }, '0.0001').isCorrect, false);
});
test('numeric percent tolerance incl. negative keys and boundary', () => {
  const q = { type: 'numeric', correctAnswer: 200, tolerance: 5, toleranceType: 'percent' };
  assert.equal(grade(q, '210').isCorrect, true);
  assert.equal(grade(q, '190').isCorrect, true);
  assert.equal(grade(q, '210.1').isCorrect, false);
  const neg = { type: 'numeric', correctAnswer: -200, tolerance: 5, toleranceType: 'percent' };
  assert.equal(grade(neg, '-210').isCorrect, true);
  assert.equal(grade(neg, '-190').isCorrect, true);
  assert.equal(grade(neg, '-211').isCorrect, false);
  assert.equal(grade(neg, '200').isCorrect, false);
});
test('numeric accepts formats and units', () => {
  const q = { type: 'numeric', correctAnswer: 6.022e23, tolerance: 1, toleranceType: 'percent', unit: 'molecules' };
  for (const a of ['6.022e23', '6.022×10²³', '6.022 x 10^23', '6.022*10^23', '6.022E+23', '6.022e23 molecules', '6.022e23 MOLECULES']) {
    assert.equal(grade(q, a).isCorrect, true, a);
  }
  assert.equal(grade(q, '6.2e23').isCorrect, false);
  const u = { type: 'numeric', correctAnswer: 18.016, tolerance: 0.05, unit: 'g/mol' };
  assert.equal(grade(u, '18.02 g/mol').isCorrect, true);
  assert.equal(grade(u, '18.02 g/ mol').isCorrect, true);
  assert.equal(grade({ type: 'numeric', correctAnswer: 1204.5 }, '1,204.5').isCorrect, true);
  assert.equal(grade({ type: 'numeric', correctAnswer: -3 }, '−3').isCorrect, true);
});
test('numeric with bad key never throws', () => {
  assert.equal(grade({ type: 'numeric', correctAnswer: 'x' }, '1').isCorrect, false);
  assert.equal(grade({ type: 'numeric' }, '1').isCorrect, false);
  assert.equal(grade({ type: 'numeric', correctAnswer: null }, '0').isCorrect, false);
});

test('formula', () => {
  const q = { type: 'formula', correctAnswer: 'H2SO4' };
  assert.equal(grade(q, 'H2SO4').isCorrect, true);
  assert.equal(grade(q, ' H₂SO₄ ').isCorrect, true);
  assert.equal(grade(q, 'h2so4').isCorrect, false);
  assert.equal(grade(q, 'H2SO3').isCorrect, false);
  assert.equal(grade(q, '').answered, false);
  assert.equal(grade({ ...q, caseSensitive: false }, 'h2so4').isCorrect, true);
  assert.equal(grade({ ...q, caseSensitive: true }, 'h2so4').isCorrect, false);
  assert.equal(grade(q, 42).answered, false);
});
test('formula with multiple accepted answers, hydrates and charges', () => {
  const q = { type: 'formula', correctAnswer: ['CuSO4.5H2O', 'CuSO4·5H2O(s)'] };
  assert.equal(grade(q, 'CuSO4·5H2O').isCorrect, true);
  assert.equal(grade(q, 'CuSO4*5H2O').isCorrect, true);
  assert.equal(grade(q, 'CuSO4').isCorrect, false);
  const ion = { type: 'formula', correctAnswer: 'SO4^2-' };
  for (const a of ['SO₄²⁻', 'SO4{2-}', 'SO4^-2', 'SO42-']) assert.equal(grade(ion, a).isCorrect, true, a);
});

test('matching with partial credit (default in normalized tests)', () => {
  const q = { type: 'matching', points: 3, partialCredit: true, left: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], right: [{ id: '1', text: 'one' }, { id: '2', text: 'two' }, { id: '3', text: 'three' }], correctAnswer: { a: '1', b: '2', c: '3' } };
  const g = (a) => gradeQuestion(q, a);
  assert.deepEqual(g({ a: '1', b: '2', c: '3' }), { answered: true, isCorrect: true, pointsEarned: 3, pointsPossible: 3, partial: false });
  assert.deepEqual(g({ a: '1', b: '2', c: '1' }), { answered: true, isCorrect: false, pointsEarned: 2, pointsPossible: 3, partial: true });
  assert.equal(g({ a: '1' }).pointsEarned, 1);
  assert.equal(g({ a: '2', b: '3', c: '1' }).pointsEarned, 0);
  assert.equal(g({ a: '2', b: '3', c: '1' }).partial, false);
  assert.equal(g({}).answered, false);
  assert.equal(g({ a: '', b: null }).answered, false);
  assert.equal(g('x').answered, false);
  assert.equal(g({ zz: '1', a: '1' }).pointsEarned, 1);
});
test('matching without partial credit', () => {
  const q = { type: 'matching', points: 3, partialCredit: false, left: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], right: [{ id: '1', text: 'one' }, { id: '2', text: 'two' }], correctAnswer: { a: '1', b: '2' } };
  assert.equal(gradeQuestion(q, { a: '1', b: '2' }).pointsEarned, 3);
  assert.equal(gradeQuestion(q, { a: '1', b: '1' }).pointsEarned, 0);
  assert.equal(gradeQuestion(q, { a: '1', b: '1' }).partial, false);
});

test('unknown type, missing question, and malformed key never throw', () => {
  assert.doesNotThrow(() => gradeQuestion({ type: 'weird', points: 1 }, 'x'));
  assert.equal(gradeQuestion({ type: 'weird', points: 1 }, 'x').isCorrect, false);
  assert.doesNotThrow(() => gradeQuestion(null, 'x'));
  assert.doesNotThrow(() => gradeQuestion({ type: 'multi', points: 1, correctAnswer: 'a' }, ['a']));
  assert.doesNotThrow(() => gradeQuestion({ type: 'matching', points: 1 }, { a: 'b' }));
  assert.doesNotThrow(() => gradeQuestion({ type: 'formula', points: 1 }, 'H2O'));
});

test('wrong-typed answers are incorrect, not exceptions', () => {
  const cases = [
    [{ type: 'mcq', correctAnswer: 'a' }, { x: 1 }],
    [{ type: 'multi', correctAnswer: ['a'] }, 'a'],
    [{ type: 'numeric', correctAnswer: 1 }, ['1']],
    [{ type: 'formula', correctAnswer: 'H2O' }, ['H2O']],
    [{ type: 'truefalse', correctAnswer: true }, 'true'],
    [{ type: 'matching', correctAnswer: { a: '1' }, left: [{ id: 'a' }] }, ['a']],
  ];
  for (const [q, a] of cases) {
    const r = gradeQuestion({ points: 1, ...q }, a);
    assert.equal(r.isCorrect, false, q.type);
    assert.equal(r.pointsEarned, 0, q.type);
  }
});

// ---------- formatAnswer
test('formatAnswer', () => {
  const t = chem();
  const [q1, q2, q3, q4, q5, q6, q7] = t.questions;
  assert.equal(formatAnswer(q1, 'b'), 'Proton');
  assert.equal(formatAnswer(q1, null), '—');
  assert.equal(formatAnswer(q1, 'zzz'), 'zzz');
  assert.equal(formatAnswer(q2, ['e', 'a']), 'Helium (He); Xenon (Xe)');
  assert.equal(formatAnswer(q2, []), '—');
  assert.equal(formatAnswer(q3, '18.0'), '18.0 g/mol');
  assert.equal(formatAnswer(q3, '18.0 g/mol'), '18.0 g/mol');
  assert.equal(formatAnswer(q3, 18.016), '18.016 g/mol');
  assert.equal(formatAnswer(q7, '1.2e24'), '1.2e24');
  assert.equal(formatAnswer(q4, 'H2SO4'), 'H2SO4');
  assert.equal(formatAnswer(q4, ['H2SO4', 'HSO4']), 'H2SO4 / HSO4');
  assert.equal(formatAnswer(q5, true), 'True');
  assert.equal(formatAnswer(q5, false), 'False');
  assert.equal(formatAnswer(q5, null), '—');
  assert.equal(formatAnswer(q6, { na: 'p1', mg: 'p2', al: 'p3' }), 'Sodium (Na) → +1; Magnesium (Mg) → +2; Aluminum (Al) → +3');
  assert.equal(formatAnswer(q6, { mg: 'p2' }), 'Sodium (Na) → —; Magnesium (Mg) → +2; Aluminum (Al) → —');
  assert.equal(formatAnswer(q6, {}), '—');
});

// ---------- gradeTest on CHEM101
const FULL = { q1: 'b', q2: ['a', 'c', 'e'], q3: '18.016 g/mol', q4: 'H₂SO₄', q5: true, q6: { na: 'p1', mg: 'p2', al: 'p3' }, q7: '1.2044 × 10^24' };

test('CHEM101 all correct -> 100.00', () => {
  const g = gradeTest(chem(), FULL);
  assert.equal(g.percentage, '100.00');
  assert.equal(g.scoreAchieved, 12);
  assert.equal(g.scoreTotal, 12);
  assert.equal(g.correctCount, 7);
  assert.equal(g.answeredCount, 7);
  assert.equal(g.questionCount, 7);
  assert.ok(g.results.every((r) => r.isCorrect));
});

test('CHEM101 all wrong -> 0.00', () => {
  const wrong = { q1: 'a', q2: ['b', 'd'], q3: '99', q4: 'H2O', q5: false, q6: { na: 'p3', mg: 'p1', al: 'p2' }, q7: '1' };
  const g = gradeTest(chem(), wrong);
  assert.equal(g.percentage, '0.00');
  assert.equal(g.scoreAchieved, 0);
  assert.equal(g.correctCount, 0);
  assert.equal(g.answeredCount, 7);
});

test('CHEM101 nothing answered -> 0.00, null givenAnswer, dash text', () => {
  for (const answers of [{}, undefined, null]) {
    const g = gradeTest(chem(), answers);
    assert.equal(g.percentage, '0.00');
    assert.equal(g.answeredCount, 0);
    assert.equal(g.scoreTotal, 12);
    assert.ok(g.results.every((r) => r.givenAnswer === null && r.givenAnswerText === '—' && r.answered === false));
  }
});

test('CHEM101 mixed -> exact percentage', () => {
  const answers = {
    q1: 'b',                                        // 1
    q2: ['a', 'c'],                                // 2 * 2/3 = 1.33
    q3: '18.0',                                    // 2 (within 0.05)
    q4: 'H2SO3',                                   // 0
    q5: false,                                     // 0
    q6: { na: 'p1', mg: 'p3', al: 'p3' },          // 3 * 2/3 = 2
    // q7 unanswered                               // 0
  };
  const g = gradeTest(chem(), answers);
  assert.equal(g.scoreAchieved, 6.33);
  assert.equal(g.scoreTotal, 12);
  assert.equal(g.percentage, '52.75');
  assert.equal(g.correctCount, 2);
  assert.equal(g.answeredCount, 6);
  const byId = Object.fromEntries(g.results.map((r) => [r.questionId, r]));
  assert.equal(byId.q2.pointsEarned, 1.33);
  assert.equal(byId.q2.isCorrect, false);
  assert.equal(byId.q6.pointsEarned, 2);
  assert.equal(byId.q7.answered, false);
});

test('gradeTest result rows carry the contract fields', () => {
  const t = chem();
  const g = gradeTest(t, { q1: 'a', q5: true });
  const r1 = g.results[0];
  assert.deepEqual(Object.keys(r1).sort(), [
    'answered', 'correctAnswer', 'correctAnswerText', 'givenAnswer', 'givenAnswerText', 'isCorrect',
    'needsGrading', 'pointsEarned', 'pointsPossible', 'questionId', 'questionText', 'type',
  ]);
  assert.equal(r1.questionId, 'q1');
  assert.equal(r1.questionText, t.questions[0].text);
  assert.equal(r1.type, 'mcq');
  assert.equal(r1.givenAnswer, 'a');
  assert.equal(r1.givenAnswerText, 'Neutron');
  assert.equal(r1.correctAnswer, 'b');
  assert.equal(r1.correctAnswerText, 'Proton');
  assert.equal(r1.pointsPossible, 1);
  const r3 = g.results[2];
  assert.equal(r3.correctAnswerText, '18.016 g/mol');
  assert.equal(g.results[3].correctAnswerText, 'H2SO4');
  assert.equal(g.results[4].correctAnswerText, 'True');
  assert.equal(g.results[4].isCorrect, true);
  assert.equal(typeof g.percentage, 'string');
});

test('gradeTest is JSON-serialisable (payload-safe)', () => {
  const g = gradeTest(chem(), FULL);
  assert.deepEqual(JSON.parse(JSON.stringify(g)), g);
});

test('gradeTest total 0 guard', () => {
  assert.equal(gradeTest({ questions: [] }, {}).percentage, '0.00');
  assert.equal(gradeTest({}, {}).percentage, '0.00');
  assert.equal(gradeTest(null, {}).questionCount, 0);
  const zero = { questions: [{ id: 'z', type: 'truefalse', text: 't', points: 0, correctAnswer: true }] };
  const g = gradeTest(zero, { z: true });
  assert.equal(g.scoreTotal, 0);
  assert.equal(g.percentage, '0.00');
});

test('gradeTest with malformed answers never throws', () => {
  const junk = { q1: { x: 1 }, q2: 'a', q3: ['1'], q4: 5, q5: 'true', q6: 'na', q7: {} };
  let g;
  assert.doesNotThrow(() => { g = gradeTest(chem(), junk); });
  assert.equal(g.percentage, '0.00');
  assert.equal(g.correctCount, 0);
});

test('gradeTest does not mutate test or answers', () => {
  const t = chem();
  const before = JSON.stringify(t);
  const answers = JSON.parse(JSON.stringify(FULL));
  gradeTest(t, answers);
  assert.equal(JSON.stringify(t), before);
  assert.deepEqual(answers, FULL);
});

test('scores sum without float drift', () => {
  const qs = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, type: 'truefalse', text: 't', points: 0.1, correctAnswer: true }));
  const answers = Object.fromEntries(qs.map((q) => [q.id, true]));
  const g = gradeTest({ questions: qs }, answers);
  assert.equal(g.scoreAchieved, 1);
  assert.equal(g.scoreTotal, 1);
  assert.equal(g.percentage, '100.00');
});

test('short answer: answered is pending teacher grading and scores 0 for now', () => {
  const t = { questions: [
    { id: 'q1', type: 'mcq', text: 'x', points: 1, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctAnswer: 'a' },
    { id: 'q2', type: 'short', text: 'Explain', points: 3, sampleAnswer: 'Because.' },
    { id: 'q3', type: 'short', text: 'Explain again', points: 2 },
  ] };
  const g = gradeTest(t, { q1: 'a', q2: '  Electrons are shared.  ', q3: '   ' });
  assert.equal(g.scoreAchieved, 1);
  assert.equal(g.scoreTotal, 6);
  assert.equal(g.pendingCount, 1);
  assert.equal(g.pendingPoints, 3);
  assert.equal(g.answeredCount, 2);
  const [, r2, r3] = g.results;
  assert.equal(r2.needsGrading, true);
  assert.equal(r2.pointsEarned, 0);
  assert.equal(r2.givenAnswerText, 'Electrons are shared.');
  assert.equal(r2.correctAnswerText, 'Because.');
  assert.equal(r3.answered, false);
  assert.equal(r3.needsGrading, false);
  assert.equal(r3.correctAnswerText, '—');
  assert.equal(g.results[0].needsGrading, false);
});
