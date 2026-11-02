import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPercent, normalizeRow, filterRows, sortRows, csvField, applyGrades, toGradebookCsv, STATUS,
} from '../../js/views/admin/stats.js';

test('formatPercent', () => {
  assert.equal(formatPercent(82.43), '82.4%');
  assert.equal(formatPercent(100), '100.0%');
  assert.equal(formatPercent(0), '0.0%');
  assert.equal(formatPercent(undefined), '0.0%');
});

test('normalizeRow handles payloads, strings and missing fields', () => {
  const r = normalizeRow({ submitted_at: '2026-01-01T00:00:00Z', score_achieved: '6', score_total: '8', responses: '[{"questionId":"q1"}]', flags: { tab_switches: 2 } });
  assert.equal(r.timestamp, '2026-01-01T00:00:00Z');
  assert.equal(r.percentage, 75);
  assert.equal(r.tab_switches, 2);
  assert.equal(r.responses.length, 1);
  const empty = normalizeRow(null);
  assert.equal(empty.percentage, 0);
  assert.deepEqual(empty.responses, []);
  assert.equal(normalizeRow({ percentage: '85.71', responses: 'not json' }).percentage, 85.71);
});

const row = (o) => normalizeRow({ student_name: 'A', student_email: 'a@x.org', test_code: 'T1', score_achieved: 1, score_total: 2, percentage: 50, duration_seconds: 60, timestamp: '2026-01-01T00:00:00Z', ...o });

test('filterRows and sortRows', () => {
  const rows = [row({ student_name: 'Zed', percentage: 20, test_code: 'T2' }), row({ student_name: 'amy', percentage: 90 }), row({ student_name: 'Bob', percentage: 55, student_email: 'bob@school.org' })];
  assert.equal(filterRows(rows, { testCode: 'T2' }).length, 1);
  assert.equal(filterRows(rows, { testCode: 'all' }).length, 3);
  assert.equal(filterRows(rows, { query: 'SCHOOL' }).length, 1);
  assert.deepEqual(sortRows(rows, 'percentage', 'desc').map((r) => r.percentage), [90, 55, 20]);
  assert.deepEqual(sortRows(rows, 'student_name', 'asc').map((r) => r.student_name), ['amy', 'Bob', 'Zed']);
  assert.equal(rows[0].student_name, 'Zed', 'input not mutated');
});

test('csvField quoting (RFC 4180)', () => {
  assert.equal(csvField('plain'), 'plain');
  assert.equal(csvField(null), '');
  assert.equal(csvField(undefined), '');
  assert.equal(csvField(42), '42');
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField('line1\nline2'), '"line1\nline2"');
  assert.equal(csvField('a\r\nb'), '"a\r\nb"');
});

test('csvField neutralizes spreadsheet formula injection', () => {
  assert.equal(csvField('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvField('+1+1'), "'+1+1");
  assert.equal(csvField('-cmd'), "'-cmd");
  assert.equal(csvField('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvField('=1,2'), `"'=1,2"`);
  // real numbers (strings or numbers) are untouched
  assert.equal(csvField('-3'), '-3');
  assert.equal(csvField('+4.5'), '+4.5');
  assert.equal(csvField(-3), '-3');
  // only a leading character matters
  assert.equal(csvField('a=b'), 'a=b');
  assert.equal(csvField('Dr. -X'), 'Dr. -X');
});

const gradedResponses = [
  { questionId: 'q1', type: 'mcq', answered: true, isCorrect: false, pointsEarned: 0, pointsPossible: 2 },
  { questionId: 'q2', type: 'short', answered: true, isCorrect: false, pointsEarned: 0, pointsPossible: 4, needsGrading: true, givenAnswerText: 'An essay' },
];

test('applyGrades overrides and clamps points', () => {
  const r = applyGrades(gradedResponses, { q2: 9, q1: 1 });
  assert.equal(r.scoreAchieved, 5);
  assert.equal(r.scoreTotal, 6);
  assert.equal(r.responses[1].pointsEarned, 4);
  assert.equal(r.responses[1].isCorrect, true);
  assert.equal(r.responses[1].needsGrading, false);
  assert.equal(r.responses[0].pointsEarned, 1);
  assert.equal(applyGrades(gradedResponses, null).scoreAchieved, 0);
});

test('normalizeRow derives status and applies teacher grades', () => {
  const pending = normalizeRow({ score_achieved: 0, score_total: 6, percentage: 0, responses: gradedResponses });
  assert.equal(pending.status, STATUS.NEEDS_GRADING);
  const auto = normalizeRow({ score_achieved: 2, score_total: 2, percentage: 100, responses: [gradedResponses[0]] });
  assert.equal(auto.status, STATUS.AUTO);
  const graded = normalizeRow({ status: 'Graded', score_achieved: 0, score_total: 6, percentage: 0, responses: JSON.stringify(gradedResponses), grades: '{"q2":3}' });
  assert.equal(graded.status, STATUS.GRADED);
  assert.equal(graded.score_achieved, 3);
  assert.equal(graded.percentage, 50);
  assert.equal(graded.auto_score, 0);
  assert.equal(graded.auto_responses[1].needsGrading, true);
  assert.equal(graded.responses[1].pointsEarned, 3);
});

test('filterRows by status and gradebook CSV', () => {
  const rows = [
    normalizeRow({ student_name: 'Ada', student_email: 'ada@x.org', test_code: 'T', score_achieved: 0, score_total: 6, responses: gradedResponses }),
    normalizeRow({ student_name: 'Bo', student_email: 'bo@x.org', test_code: 'T', status: 'Graded', score_total: 6, responses: gradedResponses, grades: { q1: 2, q2: 4 } }),
  ];
  assert.deepEqual(filterRows(rows, { status: STATUS.GRADED }).map((r) => r.student_name), ['Bo']);
  const csv = toGradebookCsv(rows).split('\r\n');
  assert.equal(csv[0], 'Student Name,Student Email,Test Code,Test Title,Score,Points Possible,Percent,Status,Submitted');
  assert.ok(csv[1].startsWith('Ada,ada@x.org,T,,0,6,0,Needs grading,'));
  assert.ok(csv[2].startsWith('Bo,bo@x.org,T,,6,6,100,Graded,'));
});
