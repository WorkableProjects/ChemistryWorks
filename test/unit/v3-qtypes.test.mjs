import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, configsEqual, matchesAny } from '../../js/lib/qtypes/econfig.js';
import { countSigFigs, formatWithSigFigs } from '../../js/lib/qtypes/sigfigs.js';
import { gradeQuestion, formatAnswer, isAnswered } from '../../js/lib/grading.js';
import { normalizeTest, validateTest, blankQuestion } from '../../js/lib/schema.js';

test('econfig: shorthand, superscripts, case and order are normalized', () => {
  assert.ok(configsEqual('[Ne] 3s1', '1s2 2s2 2p6 3s1'));
  assert.ok(configsEqual('1s² 2s² 2p⁶ 3s¹', '1s2 2s2 2p6 3s1'));
  assert.ok(configsEqual('1S^2  2s^2 2P^6 3s^1', '1s2 2s2 2p6 3s1'));
  assert.ok(configsEqual('[ar] 4s1 3d5', '[Ar] 3d5 4s1'));
  assert.ok(!configsEqual('[Ar] 4s2 3d4', '[Ar] 4s1 3d5'));
  assert.equal(parseConfig('hello'), null);
  assert.equal(parseConfig('[Xx] 3s1'), null);
  assert.ok(matchesAny('[Ar] 4s1 3d5', ['[Ar] 4s2 3d4', '1s2 2s2 2p6 3s2 3p6 4s1 3d5']));
});

test('sigfigs: counting rules', () => {
  const cases = { '0.00450': 3, '4.50e-3': 3, '4.50 × 10^-3': 3, '4.50×10⁻³': 3, '1500': 2, '1500.': 4, '1.500e3': 4, '100': 1, '0.0045': 2, '12.0': 3, '-3.20': 3, '0': 1 };
  for (const [s, n] of Object.entries(cases)) assert.equal(countSigFigs(s), n, s);
  assert.equal(countSigFigs('abc'), null);
  assert.equal(formatWithSigFigs(0.0045, 3), '0.00450');
});

const sf = { type: 'sigfigs', points: 2, answer: 0.0045, sigFigs: 3, tolerance: 0.000001, partialCredit: true };
test('sigfigs: grading with and without partial credit', () => {
  assert.equal(gradeQuestion(sf, '4.50e-3').pointsEarned, 2);
  assert.equal(gradeQuestion(sf, '0.00450').isCorrect, true);
  assert.equal(gradeQuestion(sf, '4.5e-3').pointsEarned, 1);
  assert.equal(gradeQuestion(sf, '0.00460').pointsEarned, 1);
  assert.equal(gradeQuestion(sf, '5').pointsEarned, 0);
  assert.equal(gradeQuestion({ ...sf, partialCredit: false }, '4.5e-3').pointsEarned, 0);
  assert.equal(formatAnswer(sf, ' 4.50e-3 '), '4.50e-3');
});

const bal = { type: 'balance', points: 3, reactants: ['H2', 'O2'], products: ['H2O'], coefficients: [2, 1, 2], allowMultiples: false, partialCredit: false };
test('balance: exact, multiples and partial credit', () => {
  assert.equal(gradeQuestion(bal, [2, 1, 2]).isCorrect, true);
  assert.equal(gradeQuestion(bal, [4, 2, 4]).isCorrect, false);
  assert.equal(gradeQuestion({ ...bal, allowMultiples: true }, [4, 2, 4]).isCorrect, true);
  assert.equal(gradeQuestion({ ...bal, allowMultiples: true }, [4, 2, 3]).isCorrect, false);
  assert.equal(gradeQuestion({ ...bal, partialCredit: true }, [2, 1, 3]).pointsEarned, 2);
  assert.equal(gradeQuestion(bal, [0, 0, 0]).answered, false);
  assert.equal(isAnswered(bal, [0, 1, 0]), true);
  assert.equal(formatAnswer(bal, [2, 1, 2]), '2 H2 + O2 → 2 H2O');
});

test('ptable: set rules like multi', () => {
  const q = { type: 'ptable', points: 2, answers: ['Na', 'K'], multiple: true, partialCredit: true };
  assert.equal(gradeQuestion(q, ['K', 'Na']).isCorrect, true);
  assert.equal(gradeQuestion(q, ['Na']).pointsEarned, 1);
  assert.equal(gradeQuestion(q, ['Na', 'Li', 'K']).pointsEarned, 1);
  assert.equal(gradeQuestion({ ...q, partialCredit: false }, ['Na']).pointsEarned, 0);
  assert.equal(formatAnswer(q, ['Na']), 'Sodium (Na)');
});

test('econfig: grading', () => {
  const q = { type: 'econfig', points: 1, answers: ['1s2 2s2 2p6 3s1', '[Ne] 3s1'] };
  assert.equal(gradeQuestion(q, '[ne] 3s¹').isCorrect, true);
  assert.equal(gradeQuestion(q, '1s2 2s2 2p6 3s2').isCorrect, false);
});

test('validation of the four new types', () => {
  const mk = (q) => validateTest(normalizeTest({ code: 'AB', title: 'x', questions: [{ id: 'q1', text: 't', points: 1, ...q }] })).errors;
  for (const t of ['balance', 'econfig', 'ptable', 'sigfigs']) assert.deepEqual(mk(blankQuestion(t, 'q1')), [], t);
  assert.ok(mk({ type: 'balance', reactants: ['H2'], products: ['H2O'], coefficients: [2, 1, 1] }).length);
  assert.ok(mk({ type: 'balance', reactants: [], products: ['H2O'], coefficients: [1] }).length);
  assert.ok(mk({ type: 'balance', reactants: ['H2'], products: ['H2O'], coefficients: [2, 0] }).length);
  assert.ok(mk({ type: 'econfig', answers: ['nonsense'] }).length);
  assert.ok(mk({ type: 'ptable', answers: ['Zz'] }).length);
  assert.ok(mk({ type: 'ptable', answers: ['Na', 'K'], multiple: false }).length);
  assert.ok(mk({ type: 'sigfigs', answer: 1, sigFigs: 0 }).length);
  assert.deepEqual(mk({ type: 'ptable', answers: ['na'] }), []);
});
