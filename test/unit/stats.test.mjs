import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mean, median, formatPercent, histogramBuckets, normalizeRow, filterRows, sortRows, summarize,
  questionStats, csvField, CSV_COLUMNS, toCsv,
} from '../../js/views/admin/stats.js';

test('mean', () => {
  assert.equal(mean([]), 0);
  assert.equal(mean([10]), 10);
  assert.equal(mean([1, 2, 3, 4]), 2.5);
  assert.equal(mean([50, NaN, 100]), 75);
});

test('median odd / even / empty', () => {
  assert.equal(median([]), 0);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);
});

test('formatPercent', () => {
  assert.equal(formatPercent(82.43), '82.4%');
  assert.equal(formatPercent(100), '100.0%');
  assert.equal(formatPercent(0), '0.0%');
  assert.equal(formatPercent(undefined), '0.0%');
});

test('histogram bucket edges', () => {
  const b = histogramBuckets([0, 9.99, 10, 89.99, 90, 99.99, 100]);
  assert.equal(b.length, 10);
  assert.equal(b[0].count, 2);
  assert.equal(b[1].count, 1);
  assert.equal(b[8].count, 1);
  assert.equal(b[9].count, 3);
  assert.equal(b.reduce((s, x) => s + x.count, 0), 7);
  assert.equal(b[0].label, '0–9');
  assert.equal(b[9].label, '90–100');
  assert.equal(b[9].max, 100);
});

test('histogram ignores non-finite and clamps out-of-range', () => {
  const b = histogramBuckets([NaN, Infinity, -5, 150]);
  assert.equal(b[0].count, 1);
  assert.equal(b[9].count, 1);
  assert.equal(b.reduce((s, x) => s + x.count, 0), 2);
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

test('summarize', () => {
  const s = summarize([row({ percentage: 100, duration_seconds: 30 }), row({ percentage: 50, duration_seconds: 90 }), row({ percentage: 0 })]);
  assert.equal(s.count, 3);
  assert.equal(s.average, 50);
  assert.equal(s.median, 50);
  assert.equal(s.high, 100);
  assert.equal(s.low, 0);
  assert.equal(s.avgDuration, 60);
  assert.deepEqual(summarize([]), { count: 0, average: 0, median: 0, high: 0, low: 0, avgDuration: 0 });
});

test('questionStats aggregates per question, hardest first', () => {
  const resp = (id, ok, ans, given = '') => ({ questionId: id, questionText: id.toUpperCase(), type: 'mcq', answered: ans, isCorrect: ok, pointsEarned: ok ? 2 : 0, pointsPossible: 2, givenAnswerText: given });
  const rows = [
    row({ responses: [resp('q1', true, true), resp('q2', false, true, 'Neon')] }),
    row({ responses: [resp('q1', false, true, 'Helium'), resp('q2', false, true, 'Neon')] }),
    row({ responses: [resp('q1', true, true), resp('q2', false, false)] }),
  ];
  const s = questionStats(rows);
  assert.equal(s.length, 2);
  assert.equal(s[0].questionId, 'q2');
  assert.equal(s[0].attempts, 3);
  assert.equal(s[0].answered, 2);
  assert.equal(s[0].correct, 0);
  assert.equal(s[0].pctCorrect, 0);
  assert.deepEqual(s[0].commonWrong, { text: 'Neon', count: 2 });
  assert.equal(s[1].questionId, 'q1');
  assert.equal(s[1].correct, 2);
  assert.ok(Math.abs(s[1].pctCorrect - 66.6667) < 0.001);
  assert.ok(Math.abs(s[1].avgPoints - 4 / 3) < 1e-9);
  assert.equal(s[1].pointsPossible, 2);
  assert.deepEqual(questionStats([]), []);
});

test('questionStats keeps tests separate', () => {
  const r = (code) => row({ test_code: code, responses: [{ questionId: 'q1', answered: true, isCorrect: true, pointsEarned: 1, pointsPossible: 1 }] });
  assert.equal(questionStats([r('A'), r('B')]).length, 2);
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

test('toCsv header, CRLF endings and quoting', () => {
  const rows = [row({ student_name: 'Doe, Jane', test_title: 'Say "x"', percentage: 85.714, student_email: '=evil@x.org' })];
  const csv = toCsv(rows);
  const lines = csv.split('\r\n');
  assert.equal(lines.at(-1), '');
  assert.equal(lines[0], CSV_COLUMNS.map(([n]) => n).join(','));
  assert.match(lines[1], /"Doe, Jane"/);
  assert.match(lines[1], /"Say ""x"""/);
  assert.match(lines[1], /'=evil@x\.org/);
  assert.match(lines[1], /,85\.71,/);
  assert.equal(toCsv([]), `${lines[0]}\r\n`);
});
