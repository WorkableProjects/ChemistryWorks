// S07: duplicate codes and "Version B" (deterministic shuffle, answer keys stay valid).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestCopyCode, validateNewCode, isCodeFree, duplicateTest, suggestVersionCode, shuffleQuestionOptions, versionTest } from '../../js/lib/versions.js';
import { gradeQuestion, correctAnswerText } from '../../js/lib/grading.js';
import { validateTest, normalizeTest } from '../../js/lib/schema.js';

const opts = (...t) => t.map((x, i) => ({ id: `o${i + 1}`, text: x }));
const TEST = {
  code: 'CHEM1', title: 'Unit 1', description: '', timeLimitMinutes: 20, updatedAt: '2026-01-01',
  sections: [{ id: 'sec1', title: 'Part A', instructions: '' }],
  questions: [
    { id: 'q1', type: 'mcq', text: 'Pick', points: 1, options: opts('Na', 'K', 'Li', 'Rb', 'Cs'), correctAnswer: 'o3' },
    { id: 'q2', type: 'multi', text: 'Pick all', points: 2, options: opts('a', 'b', 'c', 'd', 'e', 'f'), correctAnswer: ['o2', 'o5'], partialCredit: false },
    { id: 'q3', type: 'matching', text: 'Match', points: 3, left: [{ id: 'l1', text: 'one' }, { id: 'l2', text: 'two' }, { id: 'l3', text: 'three' }], right: [{ id: 'r1', text: 'A' }, { id: 'r2', text: 'B' }, { id: 'r3', text: 'C' }], correctAnswer: { l1: 'r2', l2: 'r3', l3: 'r1' } },
    { id: 'q4', type: 'ordering', text: 'Order', points: 2, items: [{ id: 'i1', text: 'first' }, { id: 'i2', text: 'second' }, { id: 'i3', text: 'third' }, { id: 'i4', text: 'fourth' }], correctAnswer: ['i1', 'i2', 'i3', 'i4'] },
    { id: 'q5', type: 'truefalse', text: 'TF', points: 1, correctAnswer: true, section: 'sec1' },
    { id: 'q6', type: 'numeric', text: 'Num', points: 1, correctAnswer: 4, tolerance: 0, toleranceType: 'absolute', section: 'sec1' },
    { id: 'q7', type: 'mcq', text: 'Pick again', points: 1, options: opts('x', 'y', 'z'), correctAnswer: 'o1', section: 'sec1' },
  ],
};

test('suggestCopyCode: CODE-2, next free, trailing number replaced, case-insensitive, 32-char limit', () => {
  assert.equal(suggestCopyCode('CHEM1', []), 'CHEM1-2');
  assert.equal(suggestCopyCode('CHEM1', ['CHEM1']), 'CHEM1-2');
  assert.equal(suggestCopyCode('CHEM1', ['chem1-2', 'CHEM1-3']), 'CHEM1-4');
  assert.equal(suggestCopyCode('CHEM1-2', new Set(['CHEM1-2'])), 'CHEM1-3');
  assert.equal(suggestCopyCode('chem1'), 'CHEM1-2');
  const long = 'A'.repeat(32);
  const c = suggestCopyCode(long, [long]);
  assert.equal(c.length, 32);
  assert.ok(c.endsWith('-2'));
});

test('validateNewCode / isCodeFree', () => {
  assert.equal(validateNewCode('CHEM1-2', ['CHEM1']), '');
  assert.match(validateNewCode('chem1', ['CHEM1']), /already in your library/);
  assert.match(validateNewCode('A', []), /2-32/);
  assert.match(validateNewCode('bad code', []), /2-32/);
  assert.match(validateNewCode('A'.repeat(33), []), /2-32/);
  assert.equal(isCodeFree('x1', ['X1']), false);
  assert.equal(isCodeFree('x2', ['X1']), true);
});

test('duplicateTest: independent deep copy with the new code and no saved-at stamp', () => {
  const copy = duplicateTest(TEST, 'chem1-2');
  assert.equal(copy.code, 'CHEM1-2');
  assert.equal(copy.updatedAt, undefined);
  assert.deepEqual(copy.questions, TEST.questions);
  copy.questions[0].options[0].text = 'changed';
  assert.equal(TEST.questions[0].options[0].text, 'Na');
  assert.equal(TEST.code, 'CHEM1');
});

test('suggestVersionCode', () => {
  assert.equal(suggestVersionCode('CHEM1', 'B', []), 'CHEM1-B');
  assert.equal(suggestVersionCode('CHEM1', 'B', ['CHEM1-B']), 'CHEM1-B2');
  assert.equal(suggestVersionCode('CHEM1-B', 'B', []), 'CHEM1-B');
  assert.equal(suggestVersionCode('A'.repeat(32), 'B', []).length, 32);
});

test('versionTest is deterministic and leaves the input untouched', () => {
  const before = JSON.stringify(TEST);
  const a = versionTest(TEST);
  const b = versionTest(TEST);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(TEST), before);
  assert.equal(a.code, 'CHEM1-B');
  assert.equal(a.title, 'Unit 1 (Version B)');
  assert.equal(a.updatedAt, undefined);
  assert.notDeepEqual(versionTest(TEST, { seed: 'other' }).questions.map((q) => q.id), a.questions.map((q) => q.id));
  assert.equal(versionTest(TEST, { existingCodes: ['CHEM1-B'] }).code, 'CHEM1-B2');
});

test('versionTest keeps every question, point total and section membership; actually reorders', () => {
  const v = versionTest(TEST);
  assert.deepEqual(v.questions.map((q) => q.id).sort(), TEST.questions.map((q) => q.id).sort());
  assert.equal(v.questions.reduce((s, q) => s + q.points, 0), 11);
  // Unsectioned questions stay in front, sec1 questions stay together after them.
  assert.deepEqual(v.questions.slice(0, 4).map((q) => q.section || ''), ['', '', '', '']);
  assert.deepEqual(v.questions.slice(4).map((q) => q.section), ['sec1', 'sec1', 'sec1']);
  assert.notDeepEqual(v.questions.map((q) => q.id), TEST.questions.map((q) => q.id));
  assert.deepEqual(v.sections, TEST.sections);
});

test('versionTest: shuffled options change order but every answer key still grades correct', () => {
  const v = versionTest(TEST);
  const byId = (t, id) => t.questions.find((q) => q.id === id);
  for (const id of ['q1', 'q2', 'q7']) {
    const orig = byId(TEST, id);
    const shuf = byId(v, id);
    assert.notDeepEqual(shuf.options.map((o) => o.id), orig.options.map((o) => o.id), `${id} options reordered`);
    assert.deepEqual(shuf.options.map((o) => o.id).sort(), orig.options.map((o) => o.id).sort());
    assert.deepEqual(shuf.correctAnswer, orig.correctAnswer);
    // The id that was correct still carries the same text.
    const ids = Array.isArray(orig.correctAnswer) ? orig.correctAnswer : [orig.correctAnswer];
    for (const cid of ids) assert.equal(shuf.options.find((o) => o.id === cid).text, orig.options.find((o) => o.id === cid).text);
    assert.equal(gradeQuestion(shuf, shuf.correctAnswer).isCorrect, true);
    // The key text lists answers in display order, so compare as sets.
    assert.deepEqual(correctAnswerText(shuf).split('; ').sort(), correctAnswerText(orig).split('; ').sort());
  }
});

test('versionTest: matching columns and ordering items shuffle without breaking the key', () => {
  const v = versionTest(TEST);
  const m = v.questions.find((q) => q.id === 'q3');
  const o = v.questions.find((q) => q.id === 'q4');
  assert.deepEqual(m.correctAnswer, { l1: 'r2', l2: 'r3', l3: 'r1' });
  assert.equal(gradeQuestion(m, m.correctAnswer).isCorrect, true);
  assert.deepEqual(correctAnswerText(m).split('; ').sort(), correctAnswerText(TEST.questions[2]).split('; ').sort());
  assert.ok(m.left.map((x) => x.id).join() !== 'l1,l2,l3' || m.right.map((x) => x.id).join() !== 'r1,r2,r3');
  assert.deepEqual(o.correctAnswer, ['i1', 'i2', 'i3', 'i4']);
  assert.notEqual(o.items.map((i) => i.id).join(), 'i1,i2,i3,i4'); // never handed out already sorted
  assert.deepEqual(o.items.map((i) => i.id).sort(), ['i1', 'i2', 'i3', 'i4']);
  assert.equal(gradeQuestion(o, o.correctAnswer).isCorrect, true);
  assert.equal(correctAnswerText(o), 'first → second → third → fourth');
});

test('versionTest: types without an order are untouched; result is still a valid test', () => {
  const v = versionTest(TEST);
  assert.deepEqual(v.questions.find((q) => q.id === 'q5'), TEST.questions[4]);
  assert.deepEqual(v.questions.find((q) => q.id === 'q6'), TEST.questions[5]);
  const res = validateTest(normalizeTest(v));
  assert.equal(res.valid, true, JSON.stringify(res.errors));
  assert.deepEqual(shuffleQuestionOptions(TEST.questions[4], 's'), TEST.questions[4]);
});
