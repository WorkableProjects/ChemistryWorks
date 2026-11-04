// S07: insights, per-question gradebook columns, grade-by-question merge helpers, bulk planning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRow, mean, median, scoreDistribution, testInsights, questionInsights, answersForQuestion, toGradebookCsv, questionColumns,
  mergeGrade, mergeComment, pendingAfter, stepIndex, planBulk, summarizeBulk, BULK, STATUS, REVIEW_THRESHOLD,
} from '../../js/views/admin/stats.js';

const resp = (questionId, type, pts, possible, over = {}) => ({
  questionId, questionText: `Text ${questionId}`, type, answered: true, givenAnswer: 'x', givenAnswerText: 'x',
  isCorrect: pts >= possible, pointsEarned: pts, pointsPossible: possible, needsGrading: false, manual: false, ...over,
});
const q3 = (over = {}) => resp('q3', 'short', 0, 2, { needsGrading: true, manual: true, givenAnswerText: 'essay', ...over });

// Hand calculation fixture (one test, 3 questions: mcq 2 pts, truefalse 1 pt, short 2 pts = 5 pts):
//   s1 5/5 = 100%   s2 1/5 = 20%   s3 1/5 = 20%   s4 waiting for grading   s5 extra attempt
const raw = (id, responses, extra = {}) => ({ submission_id: id, student_name: id, student_email: `${id}@x.org`, test_code: 'T1', test_title: 'T', score_total: 5, duration_seconds: 600, responses, ...extra });
const FIX = [
  raw('s1', [resp('q1', 'mcq', 2, 2, { givenAnswerText: 'A' }), resp('q2', 'truefalse', 1, 1, { givenAnswerText: 'True' }), q3()], { status: STATUS.GRADED, grades: { q3: 2 }, duration_seconds: 300 }),
  raw('s2', [resp('q1', 'mcq', 0, 2, { givenAnswerText: 'B' }), resp('q2', 'truefalse', 0, 1, { givenAnswerText: 'False' }), q3()], { status: STATUS.GRADED, grades: { q3: 1 }, duration_seconds: 900 }),
  raw('s3', [resp('q1', 'mcq', 0, 2, { givenAnswerText: 'B' }), resp('q2', 'truefalse', 1, 1, { givenAnswerText: 'True' }), q3()], { status: STATUS.GRADED, grades: { q3: 0 }, duration_seconds: 0 }),
  raw('s4', [resp('q1', 'mcq', 0, 2, { givenAnswerText: 'C' }), resp('q2', 'truefalse', 0, 1), q3()]),
  raw('s5', [resp('q1', 'mcq', 2, 2)], { status: STATUS.EXTRA }),
].map(normalizeRow);

test('mean / median', () => {
  assert.equal(mean([]), 0);
  assert.equal(mean([100, 20, 20]), 46.67);
  assert.equal(median([]), 0);
  assert.equal(median([20, 100, 20]), 20);
  assert.equal(median([10, 20, 30, 40]), 25);
  assert.equal(median([NaN, 5]), 5);
});

test('scoreDistribution: ten 10% buckets, 100 lands in the last one', () => {
  const b = scoreDistribution([0, 9.99, 10, 55, 89.9, 90, 100, 120, -5, 'x']);
  assert.equal(b.length, 10);
  assert.deepEqual(b.map((x) => x.count), [3, 1, 0, 0, 0, 1, 0, 0, 1, 3]);
  assert.deepEqual([b[0].from, b[0].to, b[9].from, b[9].to], [0, 10, 90, 100]);
  assert.equal(scoreDistribution([]).reduce((s, x) => s + x.count, 0), 0);
});

test('testInsights matches the hand calculation', () => {
  const s = testInsights(FIX);
  assert.equal(s.count, 3);                 // s4 pending and s5 extra are left out
  assert.equal(s.pending, 1);
  assert.equal(s.average, 46.67);           // (100 + 20 + 20) / 3
  assert.equal(s.median, 20);
  assert.equal(s.avgDuration, 600);         // (300 + 900) / 2: the row without a time is ignored
  assert.deepEqual(s.buckets.map((b) => b.count), [0, 0, 2, 0, 0, 0, 0, 0, 0, 1]);
});

test('testInsights with no graded rows', () => {
  const s = testInsights([]);
  assert.deepEqual([s.count, s.pending, s.average, s.median, s.avgDuration], [0, 0, 0, 0, 0]);
});

test('questionInsights: % correct, average points, most-chosen wrong answer, review flag', () => {
  const qs = questionInsights(FIX);
  assert.deepEqual(qs.map((q) => q.questionId), ['q1', 'q2', 'q3']);
  const [a, b, c] = qs;
  assert.equal(a.n, 3);
  assert.equal(a.pctCorrect, 33.33);        // 1 of 3
  assert.equal(a.avgPoints, 0.67);          // 2 / 3
  assert.equal(a.pointsPossible, 2);
  assert.deepEqual(a.topWrong, { text: 'B', count: 2 });
  assert.equal(a.review, true);             // under 40%
  assert.equal(b.pctCorrect, 66.67);
  assert.deepEqual(b.topWrong, { text: 'False', count: 1 });
  assert.equal(b.review, false);
  assert.equal(c.n, 3);
  assert.equal(c.avgPoints, 1);             // teacher points 2, 1, 0
  assert.equal(c.pctCorrect, 33.33);
  assert.equal(c.topWrong, null);           // short answers have no "most-chosen wrong answer"
  assert.equal(REVIEW_THRESHOLD, 40);
});

test('questionInsights: exactly 40% is not flagged; unanswered counted', () => {
  const rows = [1, 2, 3, 4, 5].map((i) => normalizeRow(raw(`r${i}`, [resp('q1', 'mcq', i <= 2 ? 1 : 0, 1, i === 5 ? { answered: false, givenAnswerText: '' } : { givenAnswerText: 'B' })], { status: STATUS.AUTO })));
  const [q] = questionInsights(rows);
  assert.equal(q.pctCorrect, 40);
  assert.equal(q.review, false);
  assert.equal(q.unanswered, 1);
  assert.deepEqual(q.topWrong, { text: 'B', count: 2 });
});

test('answersForQuestion lists every student except extra attempts', () => {
  const list = answersForQuestion(FIX, 'q3');
  assert.equal(list.length, 4);
  assert.deepEqual(list.map((x) => x.name), ['s1', 's2', 's3', 's4']);
  assert.equal(list[3].needsGrading, true);
  assert.equal(list[0].points, 2);
});

test('gradebook CSV: default columns unchanged, per-question columns optional', () => {
  const plain = toGradebookCsv(FIX.slice(0, 2));
  assert.equal(plain.split('\r\n')[0], 'Student Name,Student Email,Test Code,Test Title,Score,Points Possible,Percent,Status,Submitted');
  assert.equal(plain, toGradebookCsv(FIX.slice(0, 2), { perQuestion: false }));

  const csv = toGradebookCsv(FIX.slice(0, 4), { perQuestion: true }).split('\r\n');
  assert.equal(csv[0], 'Student Name,Student Email,Test Code,Test Title,Score,Points Possible,Percent,Status,Submitted,Q1 (q1) / 2,Q2 (q2) / 1,Q3 (q3) / 2');
  const cells = (line) => line.split(',').slice(-3);
  assert.deepEqual(cells(csv[1]), ['2', '1', '2']);   // s1
  assert.deepEqual(cells(csv[2]), ['0', '0', '1']);   // s2
  assert.deepEqual(cells(csv[3]), ['0', '1', '0']);   // s3
  assert.deepEqual(cells(csv[4]), ['0', '0', '']);    // s4: q3 still waiting for grading -> blank
});

test('gradebook CSV per-question: several tests prefix the code, missing answers are blank', () => {
  const a = normalizeRow(raw('a', [resp('q1', 'mcq', 1, 1)], { status: STATUS.AUTO }));
  const b = normalizeRow({ ...raw('b', [resp('q1', 'mcq', 2, 2), resp('q9', 'mcq', 1, 1)], { status: STATUS.AUTO }), test_code: 'T2' });
  const cols = questionColumns([a, b]);
  assert.deepEqual(cols.map((c) => [c.testCode, c.questionId, c.number]), [['T1', 'q1', 1], ['T2', 'q1', 1], ['T2', 'q9', 2]]);
  const [head, la, lb] = toGradebookCsv([a, b], { perQuestion: true }).split('\r\n');
  assert.ok(head.endsWith('T1 Q1 (q1) / 1,T2 Q1 (q1) / 2,T2 Q2 (q9) / 1'));
  assert.ok(la.endsWith(',1,,'));
  assert.ok(lb.endsWith(',,2,1'));
});

test('mergeGrade keeps every other question untouched and never mutates', () => {
  const existing = { q1: 2, q2: 0.5 };
  const next = mergeGrade(existing, 'q3', 1.499);
  assert.deepEqual(next, { q1: 2, q2: 0.5, q3: 1.5 });
  assert.deepEqual(existing, { q1: 2, q2: 0.5 });
  assert.deepEqual(mergeGrade(existing, 'q1', 0), { q1: 0, q2: 0.5 });
  assert.deepEqual(mergeGrade(existing, 'q1', null), { q2: 0.5 });
  assert.deepEqual(mergeGrade(null, 'q1', 3), { q1: 3 });
  assert.deepEqual(mergeGrade([1, 2], 'q1', 3), { q1: 3 });
});

test('mergeComment sets, replaces and removes one comment', () => {
  const c = { q1: 'Nice', q2: 'Check units' };
  assert.deepEqual(mergeComment(c, 'q3', '  Good  '), { q1: 'Nice', q2: 'Check units', q3: 'Good' });
  assert.deepEqual(mergeComment(c, 'q1', ''), { q2: 'Check units' });
  assert.deepEqual(c, { q1: 'Nice', q2: 'Check units' });
});

test('pendingAfter counts manual answers that still have no points', () => {
  const row = FIX[3]; // s4: q3 pending
  assert.equal(pendingAfter(row, {}), 1);
  assert.equal(pendingAfter(row, { q3: 1 }), 0);
  assert.equal(pendingAfter(FIX[0], {}), 1); // auto_responses keep needsGrading until grades are applied
});

test('stepIndex clamps at both ends', () => {
  assert.equal(stepIndex(0, -1, 5), 0);
  assert.equal(stepIndex(4, 1, 5), 4);
  assert.equal(stepIndex(2, 1, 5), 3);
  assert.equal(stepIndex(0, 1, 0), 0);
});

test('planBulk: eligibility per action, extra attempts never touched', () => {
  const mk = (over) => normalizeRow(raw('x', [resp('q1', 'mcq', 1, 1)], over));
  const graded = mk({ status: STATUS.GRADED, grades: {} });
  const auto = mk({});
  const released = mk({ status: STATUS.GRADED, grades: {}, released_at: '2026-01-01T00:00:00Z' });
  const pending = normalizeRow(raw('p', [q3()]));
  const retake = mk({ status: STATUS.GRADED, grades: {}, retake_allowed_at: '2026-01-02T00:00:00Z' });
  const extra = mk({ status: STATUS.EXTRA });
  const all = [graded, auto, released, pending, retake, extra];
  assert.deepEqual(planBulk(all, BULK.RELEASE).eligible, [graded, auto, retake]);
  assert.deepEqual(planBulk(all, BULK.UNRELEASE).eligible, [released]);
  assert.deepEqual(planBulk(all, BULK.RETAKE).eligible, [graded, auto, released, pending]);
  assert.equal(planBulk(all, BULK.RELEASE).skipped.length, 3);
  assert.deepEqual(planBulk(all, 'delete').eligible, []);
});

test('summarizeBulk', () => {
  assert.equal(summarizeBulk(BULK.RELEASE, { done: 8 }), 'Released 8');
  assert.equal(summarizeBulk(BULK.RELEASE, { done: 8, skipped: 2, failed: 1 }), 'Released 8 · skipped 2 · failed 1');
  assert.equal(summarizeBulk(BULK.RETAKE, { done: 1 }), 'Allowed a retake for 1');
  assert.equal(summarizeBulk(BULK.UNRELEASE, { done: 0, failed: 3 }), 'Un-released 0 · failed 3');
});
