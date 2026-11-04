import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTest, isRequired, blankTest } from '../../js/lib/schema.js';

test('requireAllQuestions defaults to false and required stays optional', () => {
  const t = normalizeTest({ code: 'R1', title: 'R', questions: [{ id: 'q1', type: 'truefalse', text: 'x', answer: true }, { id: 'q2', type: 'truefalse', text: 'y', answer: true, required: 1 }] });
  assert.equal(t.requireAllQuestions, false);
  assert.equal('required' in t.questions[0], false);
  assert.equal(t.questions[1].required, true);
  assert.equal(blankTest().requireAllQuestions, false);
});

test('isRequired: per question or all questions', () => {
  assert.equal(isRequired({ requireAllQuestions: false }, { required: false }), false);
  assert.equal(isRequired({ requireAllQuestions: false }, { required: true }), true);
  assert.equal(isRequired({ requireAllQuestions: true }, {}), true);
});
