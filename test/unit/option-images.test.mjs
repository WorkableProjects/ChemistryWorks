import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTest, validateTest } from '../../js/lib/schema.js';
import { gradeTest, gradeQuestion, formatAnswer } from '../../js/lib/grading.js';

const mcq = (options) => ({ id: 'q1', type: 'mcq', text: 'Which?', points: 1, options, correctAnswer: 'b' });
const wrap = (...questions) => ({ code: 'IMG1', title: 'T', questions });
const errs = (t) => validateTest(normalizeTest(t)).errors;
const IMG = { url: 'https://example.org/a.png', alt: 'A flask' };

test('options without images normalize exactly as before', () => {
  const t = normalizeTest(wrap(mcq([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }])));
  assert.deepEqual(t.questions[0].options, [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }]);
  assert.ok(!('image' in t.questions[0].options[0]));
});

test('option image is kept only with a url; empty ones are dropped', () => {
  const t = normalizeTest(wrap(mcq([
    { id: 'a', text: 'A', image: { url: '  https://example.org/a.png ', alt: 'A flask' } },
    { id: 'b', text: 'B', image: { url: '   ', alt: 'x' } },
    { id: 'c', text: 'C', image: 'nope' },
  ])));
  const [a, b, c] = t.questions[0].options;
  assert.deepEqual(a.image, IMG);
  assert.ok(!('image' in b));
  assert.ok(!('image' in c));
});

test('image-only options validate (text or image required)', () => {
  assert.deepEqual(errs(wrap(mcq([{ id: 'a', text: '', image: IMG }, { id: 'b', text: 'B' }]))), []);
  const e = errs(wrap(mcq([{ id: 'a', text: '' }, { id: 'b', text: 'B' }])));
  assert.ok(e.some((m) => /option 1 has empty text/.test(m)), JSON.stringify(e));
});

test('option images need a safe url and alt text', () => {
  const e = errs(wrap(mcq([
    { id: 'a', text: 'A', image: { url: 'javascript:alert(1)', alt: 'x' } },
    { id: 'b', text: 'B', image: { url: 'https://example.org/b.png', alt: '' } },
  ])));
  assert.ok(e.some((m) => /option 1 image url/.test(m)), JSON.stringify(e));
  assert.ok(e.some((m) => /option 2 image needs alt/.test(m)), JSON.stringify(e));
});

test('images work on multi, matching (left and right) and ordering items', () => {
  const multi = { id: 'm', type: 'multi', text: 'M', points: 1, options: [{ id: 'a', text: '', image: IMG }, { id: 'b', text: 'B' }], correctAnswer: ['a'] };
  const match = { id: 'x', type: 'matching', text: 'X', points: 1, left: [{ id: 'l1', text: '', image: IMG }, { id: 'l2', text: 'L2' }], right: [{ id: 'r1', text: 'R1' }, { id: 'r2', text: '', image: IMG }], correctAnswer: { l1: 'r1', l2: 'r2' } };
  const order = { id: 'o', type: 'ordering', text: 'O', points: 1, items: [{ id: 'i1', text: '', image: IMG }, { id: 'i2', text: 'two' }], correctAnswer: ['i1', 'i2'] };
  const t = normalizeTest(wrap(multi, match, order));
  assert.deepEqual(validateTest(t).errors, []);
  assert.deepEqual(t.questions[0].options[0].image, IMG);
  assert.deepEqual(t.questions[1].left[0].image, IMG);
  assert.deepEqual(t.questions[1].right[1].image, IMG);
  assert.deepEqual(t.questions[2].items[0].image, IMG);
});

test('grading is by option id and unaffected by images; image-only answers are never blank in text', () => {
  const t = normalizeTest(wrap(mcq([{ id: 'a', text: 'A' }, { id: 'b', text: '', image: IMG }])));
  const q = t.questions[0];
  assert.equal(gradeQuestion(q, 'b').isCorrect, true);
  assert.equal(gradeQuestion(q, 'a').isCorrect, false);
  assert.equal(formatAnswer(q, 'b'), '[image: A flask]');
  const g = gradeTest(t, { q1: 'b' });
  assert.equal(g.results[0].givenAnswerText, '[image: A flask]');
  assert.equal(g.results[0].correctAnswerText, '[image: A flask]');
});
