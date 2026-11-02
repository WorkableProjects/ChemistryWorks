import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VALENCE, normalizeSymbol, valenceOf, isDotArray, followsPlacementRule, canonicalDots, describeDots,
} from '../../js/lib/lewis.js';
import { gradeQuestion, isAnswered, formatAnswer, gradeTest } from '../../js/lib/grading.js';
import { normalizeTest, validateTest, blankQuestion } from '../../js/lib/schema.js';

test('valence table and symbol normalization', () => {
  assert.equal(VALENCE.O, 6);
  assert.equal(valenceOf('cl'), 7);
  assert.equal(valenceOf(' Na '), 1);
  assert.equal(valenceOf('He'), 2);
  assert.equal(valenceOf('Fe'), null);
  assert.equal(normalizeSymbol('MG'), 'Mg');
  assert.equal(normalizeSymbol('O2'), '');
  assert.equal(normalizeSymbol(''), '');
});

test('dot array shape', () => {
  assert.equal(isDotArray([1, 1, 2, 2]), true);
  assert.equal(isDotArray([3, 0, 0, 0]), false);
  assert.equal(isDotArray([1, 1, 1]), false);
  assert.equal(isDotArray('1111'), false);
});

test('placement rule: singles before pairs', () => {
  assert.equal(followsPlacementRule([1, 1, 1, 0]), true);
  assert.equal(followsPlacementRule([2, 1, 0, 0]), false);
  assert.equal(followsPlacementRule([2, 2, 1, 1]), true);
  assert.equal(followsPlacementRule([1, 2, 1, 2]), true);
  assert.equal(followsPlacementRule([2, 2, 2, 0]), false);
  assert.equal(followsPlacementRule([2, 2, 2, 2]), true);
  assert.equal(followsPlacementRule([2, 0, 0, 0], 'He'), true);
  assert.equal(followsPlacementRule([1, 1, 0, 0], 'He'), true);
  assert.equal(followsPlacementRule([2, 0, 0, 0], 'Mg'), false);
});

test('canonical diagrams', () => {
  assert.deepEqual(canonicalDots(1), [1, 0, 0, 0]);
  assert.deepEqual(canonicalDots(5), [2, 1, 1, 1]);
  assert.deepEqual(canonicalDots(6), [2, 2, 1, 1]);
  assert.deepEqual(canonicalDots(8), [2, 2, 2, 2]);
  assert.deepEqual(canonicalDots(2, 'He'), [2, 0, 0, 0]);
  assert.equal(describeDots([2, 2, 1, 1], 'O'), 'O: 6 dots (top 2, right 2, bottom 1, left 1)');
});

test('grading a lewis question', () => {
  const q = { type: 'lewis', element: 'O', correctAnswer: 6, checkPlacement: true, points: 2 };
  assert.equal(isAnswered(q, [0, 0, 0, 0]), false);
  assert.equal(isAnswered(q, [1, 0, 0, 0]), true);
  assert.equal(gradeQuestion(q, [2, 2, 1, 1]).isCorrect, true);
  assert.equal(gradeQuestion(q, [1, 1, 2, 2]).pointsEarned, 2);
  assert.equal(gradeQuestion(q, [2, 2, 2, 0]).isCorrect, false); // right count, wrong placement
  assert.equal(gradeQuestion(q, [2, 2, 1, 0]).isCorrect, false); // wrong count
  assert.equal(gradeQuestion({ ...q, checkPlacement: false }, [2, 2, 2, 0]).isCorrect, true);
  assert.equal(gradeQuestion(q, 'garbage').answered, false);
  assert.equal(formatAnswer(q, [2, 2, 1, 1]), 'O: 6 dots (top 2, right 2, bottom 1, left 1)');
  const g = gradeTest({ questions: [{ ...q, id: 'q1', text: 't' }] }, { q1: [1, 1, 1, 1] });
  assert.equal(g.results[0].isCorrect, false);
  assert.match(g.results[0].correctAnswerText, /6 dots/);
});

test('schema: normalize, validate, blank', () => {
  const t = normalizeTest({ code: 'L1', title: 'Lewis', questions: [{ id: 'q1', type: 'lewis', text: 'Draw Cl', element: ' cl ' }] });
  const q = t.questions[0];
  assert.equal(q.element, 'Cl');
  assert.equal(q.correctAnswer, 7);
  assert.equal(q.checkPlacement, true);
  assert.equal(validateTest(t).valid, true);

  const bad = normalizeTest({ code: 'L1', title: 'Lewis', questions: [{ id: 'q1', type: 'lewis', text: 'Draw Fe', element: 'Fe' }] });
  assert.match(validateTest(bad).errors.join('\n'), /valence electrons/);
  const badEl = normalizeTest({ code: 'L1', title: 'Lewis', questions: [{ id: 'q1', type: 'lewis', text: 'x', element: '12', correctAnswer: 4 }] });
  assert.match(validateTest(badEl).errors.join('\n'), /element symbol/);

  const blank = blankQuestion('lewis', 'q9');
  assert.equal(validateTest({ code: 'L1', title: 'Lewis', questions: [blank] }).valid, true);
});
