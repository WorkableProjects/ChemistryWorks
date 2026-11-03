import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportFilename, buildExportModel } from '../../js/lib/export.js';

const res = (id, over = {}) => ({ questionId: id, type: 'short', questionText: `Prompt ${id}`, pointsPossible: 2, pointsEarned: 1.5, answered: true, needsGrading: false, givenAnswer: 'x', givenAnswerText: 'x', ...over });
const row = (over = {}) => ({
  student_name: 'Ada Lovelace', student_email: 'ada@example.org', test_code: 'CHEMV2', test_title: 'Electrons & Bonding',
  score_achieved: 8.5, score_total: 12, percentage: 70.83,
  responses: [res('q1'), res('q2', { needsGrading: true, pointsEarned: 0 }), res('q3'), res('gone')],
  comments: { q1: 'Nice', q3: 'Check **this**' }, ...over,
});
const tst = {
  sections: [{ id: 's1', title: 'Part A', instructions: 'Go' }, { id: 's2', title: 'Part B', instructions: '' }, { id: 's3', title: 'Empty' }],
  questions: [{ id: 'q1', type: 'short', text: 'Prompt q1', points: 2, section: 's2' }, { id: 'q2', type: 'short', text: 'Prompt q2', points: 2 }, { id: 'q3', type: 'short', text: 'Prompt q3', points: 2, section: 's1' }],
};

test('exportFilename', () => {
  assert.equal(exportFilename(row()), 'ChemistryWorks - Ada Lovelace - CHEMV2 Electrons & Bonding');
  assert.equal(exportFilename(row({ student_name: 'Ada/Lovelace:*' })), 'ChemistryWorks - AdaLovelace - CHEMV2 Electrons & Bonding');
  assert.equal(exportFilename(row({ student_name: '' })), 'ChemistryWorks - ada@example.org - CHEMV2 Electrons & Bonding');
  assert.equal(exportFilename({ test_code: 'X' }), 'ChemistryWorks - Student - X');
  assert.equal(exportFilename(row({ student_name: 'A\u0001  \n B' })).includes('A B'), true);
  assert.ok(exportFilename(row({ student_name: 'x'.repeat(300) })).length <= 120);
  assert.doesNotMatch(exportFilename(row({ test_title: 'a\\b|c?"<>' })), /[\\/:*?"<>|]/);
});

test('model with a test: grouping, order, numbering, unmatched appended', () => {
  const m = buildExportModel({ row: row(), test: tst, includeComments: true });
  assert.equal(m.title, exportFilename(row()));
  assert.deepEqual(m.groups.map((g) => g.section && g.section.id), [null, 's1', 's2', null]);
  assert.deepEqual(m.groups.flatMap((g) => g.items.map((i) => i.questionId)), ['q2', 'q3', 'q1', 'gone']);
  assert.deepEqual(m.groups.flatMap((g) => g.items.map((i) => i.number)), [1, 2, 3, 4]);
  assert.equal(m.groups[1].section.title, 'Part A');
  assert.equal(m.groups[2].items[0].question.id, 'q1');
  assert.equal(m.groups[3].items[0].question, null);
});

test('model without a test: stored order, one unsectioned group', () => {
  const m = buildExportModel({ row: row(), test: null, includeComments: true });
  assert.equal(m.groups.length, 1);
  assert.equal(m.groups[0].section, null);
  assert.deepEqual(m.groups[0].items.map((i) => i.questionId), ['q1', 'q2', 'q3', 'gone']);
});

test('comments only when included', () => {
  const on = buildExportModel({ row: row(), test: tst, includeComments: true });
  const off = buildExportModel({ row: row(), test: tst, includeComments: false });
  const all = (m) => m.groups.flatMap((g) => g.items);
  assert.equal(all(on).find((i) => i.questionId === 'q3').comment, 'Check **this**');
  assert.equal(all(on).find((i) => i.questionId === 'q2').comment, '');
  assert.ok(all(off).every((i) => i.comment === ''));
});

test('score and pending', () => {
  const m = buildExportModel({ row: row(), test: tst, includeComments: false });
  assert.deepEqual(m.score, { earned: 8.5, total: 12, percentage: 70.8, pending: 1 });
  const fallback = buildExportModel({ row: { responses: [res('a'), res('b')] }, test: null, includeComments: false });
  assert.deepEqual(fallback.score, { earned: 3, total: 4, percentage: 75, pending: 0 });
});
