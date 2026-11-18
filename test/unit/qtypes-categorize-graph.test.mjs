import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeQuestion, formatAnswer, correctAnswerText } from '../../js/lib/grading.js';
import { normalizeTest, validateTest } from '../../js/lib/schema.js';
import { readFileSync } from 'node:fs';

const grade = (q, a) => gradeQuestion(q, a);
const cat = { id: 'c', type: 'categorize', text: 't', points: 4, partialCredit: true, categories: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
  items: [{ id: '1', text: 'x', category: 'a' }, { id: '2', text: 'y', category: 'b' }, { id: '3', text: 'z', category: 'a' }, { id: '4', text: 'w', category: 'b' }] };

test('categorize: full, partial, none, no partial', () => {
  assert.equal(grade(cat, { 1: 'a', 2: 'b', 3: 'a', 4: 'b' }).pointsEarned, 4);
  assert.equal(grade(cat, { 1: 'a', 2: 'a' }).pointsEarned, 1);
  assert.equal(grade({ ...cat, partialCredit: false }, { 1: 'a' }).pointsEarned, 0);
  assert.equal(grade(cat, {}).answered, false);
  assert.match(formatAnswer(cat, { 1: 'a' }), /x → A/);
});

const hot = { id: 'h', type: 'hotspot', text: 't', points: 2, radius: 0.06, partialCredit: true, image: { url: 'x.png', alt: 'a' }, labels: [{ id: 'a', text: 'A', x: 0.3, y: 0.3 }, { id: 'b', text: 'B', x: 0.7, y: 0.7 }] };

test('hotspot: radius check and partial credit', () => {
  assert.equal(grade(hot, { a: { x: 0.31, y: 0.3 }, b: { x: 0.7, y: 0.72 } }).pointsEarned, 2);
  assert.equal(grade(hot, { a: { x: 0.31, y: 0.3 }, b: { x: 0.5, y: 0.5 } }).pointsEarned, 1);
  assert.equal(grade(hot, { a: { x: 0.5, y: 0.3 } }).pointsEarned, 0);
});

const read = { id: 'g', type: 'graph', mode: 'read', text: 't', points: 1, answer: 60, tolerance: 3, chart: {} };
const plot = { id: 'p', type: 'graph', mode: 'plot', text: 't', points: 2, targets: [[1, 20], [3, 50]], toleranceX: 0.3, toleranceY: 5, partialCredit: true, chart: {} };

test('graph read reuses numeric grading', () => {
  assert.equal(grade(read, '62').isCorrect, true);
  assert.equal(grade(read, '70').isCorrect, false);
});

test('graph plot: tolerance box, extras, partial', () => {
  assert.equal(grade(plot, [[1.1, 22], [3, 48]]).isCorrect, true);
  assert.equal(grade(plot, [[1.1, 22], [3, 48], [9, 9]]).isCorrect, false);
  assert.equal(grade(plot, [[1.1, 22], [4, 48]]).pointsEarned, 1);
  assert.equal(grade(plot, []).answered, false);
  assert.equal(correctAnswerText(plot), '(1, 20), (3, 50)');
});

test('DEMOV3 validates and its new questions are correct against their own keys', () => {
  const t = normalizeTest(JSON.parse(readFileSync(new URL('../../data/tests/DEMOV3.json', import.meta.url), 'utf8')));
  assert.deepEqual(validateTest(t).errors, []);
  const q = (id) => t.questions.find((x) => x.id === id);
  assert.equal(grade(q('q5'), Object.fromEntries(q('q5').items.map((i) => [i.id, i.category]))).isCorrect, true);
  assert.equal(grade(q('q6'), Object.fromEntries(q('q6').labels.map((l) => [l.id, { x: l.x, y: l.y }]))).isCorrect, true);
  assert.equal(grade(q('q8'), q('q8').targets).isCorrect, true);
});

test('validation catches bad categorize / hotspot / graph', () => {
  const mk = (qq) => validateTest(normalizeTest({ code: 'X1', title: 'T', questions: [{ id: 'q1', text: 't', points: 1, ...qq }] })).errors.join('|');
  assert.match(mk({ type: 'categorize', categories: [{ id: 'a', label: 'A' }], items: [{ id: '1', text: 'x', category: 'zz' }] }), /at least 2 categories/);
  assert.match(mk({ type: 'hotspot', labels: [{ id: 'a', text: 'A', x: 2, y: 0 }] }), /image/);
  assert.match(mk({ type: 'graph', mode: 'plot', chart: { xMin: 0, xMax: 0, yMin: 0, yMax: 1, series: [] }, targets: [] }), /xMax must be larger/);
});
