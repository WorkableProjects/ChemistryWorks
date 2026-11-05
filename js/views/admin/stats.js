// Pure (DOM-free) helpers for the admin Grading tab: row normalization, filters, grades, gradebook CSV. Unit-testable under node.

/** Format a percentage with one decimal: 82.43 -> "82.4%". */
export function formatPercent(n) {
  return `${(Math.round((Number(n) || 0) * 10) / 10).toFixed(1)}%`;
}

export const STATUS = { NEEDS_GRADING: 'Needs grading', AUTO: 'Auto-graded', GRADED: 'Graded', EXTRA: 'Extra attempt' };
// v3 grading-list filters beyond a plain status: 'released' (Released At set) and 'all' (everything except extra attempts).
export const FILTER_RELEASED = 'released';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Apply teacher points ({ [questionId]: points }) on top of auto-graded responses.
 * Returns { responses, scoreAchieved, scoreTotal, percentage } with points clamped to 0..pointsPossible.
 */
export function applyGrades(responses, grades) {
  const g = isObj(grades) ? grades : {};
  let earned = 0;
  let total = 0;
  const out = (Array.isArray(responses) ? responses : []).map((res) => {
    const r = res || {};
    const possible = Math.max(0, Number(r.pointsPossible) || 0);
    let pts = Number(r.pointsEarned) || 0;
    const graded = r.questionId != null && Object.prototype.hasOwnProperty.call(g, r.questionId) && Number.isFinite(Number(g[r.questionId]));
    if (graded) pts = Math.min(possible, Math.max(0, Number(g[r.questionId])));
    earned += pts;
    total += possible;
    return graded
      ? { ...r, pointsEarned: r2(pts), isCorrect: possible > 0 && pts >= possible, needsGrading: false, teacherGraded: true }
      : r;
  });
  earned = r2(earned);
  total = r2(total);
  return { responses: out, scoreAchieved: earned, scoreTotal: total, percentage: total > 0 ? (earned / total) * 100 : 0 };
}

/** Normalize a Payload (device log) or ResultRow (sheet) into the ResultRow shape. */
export function normalizeRow(raw) {
  const r = raw || {};
  const flags = r.flags && typeof r.flags === 'object' ? r.flags : {};
  let responses = r.responses;
  if (typeof responses === 'string') {
    try { responses = JSON.parse(responses); } catch { responses = []; }
  }
  const num = (x) => {
    const n = typeof x === 'string' ? parseFloat(x) : Number(x);
    return Number.isFinite(n) ? n : 0;
  };
  let achieved = num(r.score_achieved);
  let total = num(r.score_total);
  let percentage = num(r.percentage);
  if ((r.percentage === undefined || r.percentage === null || r.percentage === '') && total > 0) percentage = (achieved / total) * 100;
  const autoScore = achieved;
  const autoResponses = Array.isArray(responses) ? responses : [];
  const autoPercentage = percentage;
  responses = Array.isArray(responses) ? responses : [];
  let grades = r.grades;
  if (typeof grades === 'string') {
    try { grades = JSON.parse(grades); } catch { grades = null; }
  }
  const pending = responses.some((x) => x && x.needsGrading) || r.needs_grading === true;
  let status = r.status || (pending ? STATUS.NEEDS_GRADING : STATUS.AUTO);
  if (status === STATUS.GRADED && isObj(grades)) {
    // Teacher-graded: scores and per-question points reflect the teacher's grade.
    const applied = applyGrades(responses, grades);
    responses = applied.responses;
    achieved = applied.scoreAchieved;
    total = applied.scoreTotal || total;
    percentage = applied.percentage;
  } else if (status === STATUS.GRADED && r.final_score != null) {
    achieved = num(r.final_score);
    percentage = r.final_percentage != null ? num(r.final_percentage) : total > 0 ? (achieved / total) * 100 : 0;
  } else if (status !== STATUS.GRADED && status !== STATUS.EXTRA) { // extra attempts keep their status (the sheet marks them)
    status = pending ? STATUS.NEEDS_GRADING : STATUS.AUTO;
  }
  return {
    timestamp: r.timestamp || r.submitted_at || '',
    submission_id: r.submission_id || '',
    student_name: r.student_name || '',
    student_email: r.student_email || '',
    test_code: r.test_code || '',
    test_title: r.test_title || '',
    score_achieved: achieved,
    score_total: total,
    percentage,
    duration_seconds: num(r.duration_seconds),
    responses,
    flags,
    tab_switches: num(flags.tab_switches ?? r.tab_switches),
    status,
    auto_responses: autoResponses,
    auto_score: autoScore,
    auto_percentage: autoPercentage,
    grades: isObj(grades) ? grades : null,
    graded_at: r.graded_at || '',
    teacher_note: r.teacher_note || '',
    comments: isObj(r.comments) ? r.comments : {},   // v2: { questionId: comment text }
    released_at: r.released_at || '',
    retake_allowed_at: r.retake_allowed_at || '',  // v3: ISO time the teacher allowed a retake, '' = none
    graded_by: r.graded_by || '',                    // who graded (free text)                // v2: ISO time grades/comments were released to the student, '' = not released
  };
}

/** Filter rows by test code ('' or 'all' = no filter), grading status and a free-text query on name/email. */
export function filterRows(rows, { testCode = '', query = '', status = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return rows.filter((r) => {
    if (testCode && testCode !== 'all' && r.test_code !== testCode) return false;
    if (status === FILTER_RELEASED) { if (!r.released_at || r.status === STATUS.EXTRA) return false; }
    else if (status === 'all') { if (r.status === STATUS.EXTRA) return false; }
    else if (status && r.status !== status) return false;
    if (q && !`${r.student_name} ${r.student_email}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

const SORTERS = {
  student_name: (r) => r.student_name.toLowerCase(),
  student_email: (r) => r.student_email.toLowerCase(),
  test_code: (r) => r.test_code,
  score: (r) => r.score_achieved,
  percentage: (r) => r.percentage,
  duration_seconds: (r) => r.duration_seconds,
  timestamp: (r) => Date.parse(r.timestamp) || 0,
  tab_switches: (r) => r.tab_switches,
  status: (r) => r.status,
};
export const SORT_KEYS = Object.keys(SORTERS);

/** Stable sort copy. dir: 'asc' | 'desc'. */
export function sortRows(rows, key = 'timestamp', dir = 'desc') {
  const get = SORTERS[key] || SORTERS.timestamp;
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, v: get(r) }))
    .sort((a, b) => (a.v < b.v ? -sign : a.v > b.v ? sign : a.i - b.i))
    .map((x) => x.r);
}

/** Quote one CSV field (RFC 4180): wrap when it has comma, quote, CR or LF; double inner quotes. */
export function csvField(value) {
  let s = value == null ? '' : String(value);
  // Neutralize spreadsheet formula injection (=, +, -, @) in text values; leave real numbers alone.
  if (typeof value === 'string' && /^[=+\-@]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Column key of a question inside a gradebook / insights listing: tests may reuse ids, so the code is part of it. */
const qKey = (r, qid) => `${r.test_code}\u0000${qid}`;

/**
 * Per-question columns for the gradebook CSV (V4-02): one column per question in first-seen order across `rows`.
 * [{ key, testCode, questionId, number, possible }]; `number` counts per test code (Q1, Q2, ...).
 */
export function questionColumns(rows) {
  const cols = [];
  const seen = new Set();
  const perTest = new Map();
  for (const r of rows) {
    for (const res of Array.isArray(r.responses) ? r.responses : []) {
      if (!res || res.questionId == null) continue;
      const key = qKey(r, res.questionId);
      if (seen.has(key)) continue;
      seen.add(key);
      const number = (perTest.get(r.test_code) || 0) + 1;
      perTest.set(r.test_code, number);
      cols.push({ key, testCode: r.test_code, questionId: String(res.questionId), number, possible: Number(res.pointsPossible) || 0 });
    }
  }
  return cols;
}

/**
 * Gradebook CSV for copying into Aeries / Google Classroom: one row per submission with the final score.
 * Ungraded open-ended submissions are marked so they are not mistaken for final grades.
 * { perQuestion: true } appends one column per question with the points earned ('' = not answered in that
 * submission or still waiting for grading).
 */
export function toGradebookCsv(rows, { perQuestion = false } = {}) {
  const cols = [
    ['Student Name', (r) => r.student_name],
    ['Student Email', (r) => r.student_email],
    ['Test Code', (r) => r.test_code],
    ['Test Title', (r) => r.test_title],
    ['Score', (r) => r.score_achieved],
    ['Points Possible', (r) => r.score_total],
    ['Percent', (r) => Math.round(r.percentage * 100) / 100],
    ['Status', (r) => r.status],
    ['Submitted', (r) => r.timestamp],
  ];
  if (perQuestion) {
    const qcols = questionColumns(rows);
    const multi = new Set(qcols.map((c) => c.testCode)).size > 1;
    for (const c of qcols) {
      cols.push([`${multi ? `${c.testCode} ` : ''}Q${c.number} (${c.questionId}) / ${c.possible}`, (r) => {
        const res = (Array.isArray(r.responses) ? r.responses : []).find((x) => x && qKey(r, x.questionId) === c.key);
        if (!res || res.needsGrading) return '';
        return Math.round((Number(res.pointsEarned) || 0) * 100) / 100;
      }]);
    }
  }
  const lines = [cols.map(([name]) => csvField(name)).join(',')];
  for (const r of rows) lines.push(cols.map(([, get]) => csvField(get(r))).join(','));
  return lines.join('\r\n') + '\r\n';
}

/**
 * Validate a points entry from the grader. '' / whitespace -> { ok:true, value:null } (empty).
 * Decimal point is "." only ("1,5" is non-numeric). Values are rounded to 2 decimals.
 */
export function validatePoints(raw, max) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return { ok: true, value: null };
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return { ok: false, error: 'Enter a number.' };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, error: 'Enter a number.' };
  if (n < 0) return { ok: false, error: 'Points can’t be negative.' };
  if (n > Number(max)) return { ok: false, error: `Maximum is ${max} points.` };
  return { ok: true, value: r2(n) };
}

/** True when a teacher's points differ from the auto score of an auto-graded answer. */
export function isOverride(res, points) {
  if (!res || res.manual || points == null) return false;
  return r2(Number(points)) !== r2(Number(res.pointsEarned) || 0);
}

/* ------------------------------------------------------------------ insights (V4-02) */

export const REVIEW_THRESHOLD = 40; // a question below this % correct is flagged "Review"
export const WRONG_ANSWER_TYPES = ['mcq', 'multi', 'truefalse'];

/** Mean of finite numbers (0 for none), rounded to 2 decimals. */
export function mean(nums) {
  const a = nums.filter((n) => Number.isFinite(n));
  return a.length ? r2(a.reduce((s, n) => s + n, 0) / a.length) : 0;
}

/** Median of finite numbers (0 for none), rounded to 2 decimals. */
export function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = a.length >> 1;
  return r2(a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2);
}

/**
 * Histogram of percentages in `count` equal buckets over 0..100 (default ten 10% buckets).
 * A bucket holds [from, to); the last also holds exactly 100. Values are clamped to 0..100.
 */
export function scoreDistribution(percentages, count = 10) {
  const size = 100 / count;
  const buckets = Array.from({ length: count }, (_, i) => ({ from: r2(i * size), to: r2((i + 1) * size), count: 0 }));
  for (const p of percentages) {
    const n = Number(p);
    if (!Number.isFinite(n)) continue;
    const v = Math.min(100, Math.max(0, n));
    buckets[Math.min(count - 1, Math.floor(v / size))].count++;
  }
  return buckets;
}

/** Submissions that count in insights: not extra attempts, not waiting for grading. */
export function insightRows(rows) {
  return rows.filter((r) => r.status !== STATUS.EXTRA && r.status !== STATUS.NEEDS_GRADING);
}

/**
 * Test-level insights from normalized rows of ONE test: { count, pending, average, median, avgDuration, buckets }.
 * `pending` = submissions still needing grading (left out of every other number). avgDuration is in seconds,
 * over submissions that recorded a time.
 */
export function testInsights(rows) {
  const live = rows.filter((r) => r.status !== STATUS.EXTRA);
  const done = insightRows(rows);
  const pcts = done.map((r) => r.percentage);
  return {
    count: done.length,
    pending: live.length - done.length,
    average: mean(pcts),
    median: median(pcts),
    avgDuration: mean(done.map((r) => r.duration_seconds).filter((d) => d > 0)),
    buckets: scoreDistribution(pcts),
  };
}

/**
 * Per-question insights from normalized rows of ONE test, in first-seen order:
 * { questionId, text, type, n, correct, pctCorrect, avgPoints, pointsPossible, unanswered, topWrong, review }.
 * Only graded answers count (an answer still waiting for the teacher is skipped); "correct" = full points.
 * topWrong = { text, count } of the most-chosen wrong answer for mcq / multi / truefalse (first seen wins ties), else null.
 */
export function questionInsights(rows) {
  const by = new Map();
  for (const r of insightRows(rows)) {
    for (const res of Array.isArray(r.responses) ? r.responses : []) {
      if (!res || res.questionId == null || res.needsGrading) continue;
      const id = String(res.questionId);
      let q = by.get(id);
      if (!q) { q = { questionId: id, text: res.questionText || '', type: res.type || '', n: 0, correct: 0, points: 0, pointsPossible: 0, unanswered: 0, wrong: new Map() }; by.set(id, q); }
      q.n++;
      q.points += Number(res.pointsEarned) || 0;
      q.pointsPossible = Math.max(q.pointsPossible, Number(res.pointsPossible) || 0);
      if (res.isCorrect) q.correct++;
      if (!res.answered) q.unanswered++;
      else if (!res.isCorrect && WRONG_ANSWER_TYPES.includes(q.type)) {
        const t = String(res.givenAnswerText || '').trim();
        if (t) q.wrong.set(t, (q.wrong.get(t) || 0) + 1);
      }
    }
  }
  return [...by.values()].map((q) => {
    let topWrong = null;
    for (const [text, count] of q.wrong) if (!topWrong || count > topWrong.count) topWrong = { text, count };
    const pctCorrect = q.n ? r2((q.correct / q.n) * 100) : 0;
    return {
      questionId: q.questionId, text: q.text, type: q.type, n: q.n, correct: q.correct, pctCorrect,
      avgPoints: q.n ? r2(q.points / q.n) : 0, pointsPossible: q.pointsPossible, unanswered: q.unanswered,
      topWrong, review: q.n > 0 && pctCorrect < REVIEW_THRESHOLD,
    };
  });
}

/** Every student's answer to one question: [{ submissionId, name, email, answered, answerText, points, possible, needsGrading }]. */
export function answersForQuestion(rows, questionId) {
  const out = [];
  for (const r of rows) {
    if (r.status === STATUS.EXTRA) continue;
    const res = (Array.isArray(r.responses) ? r.responses : []).find((x) => x && String(x.questionId) === String(questionId));
    if (!res) continue;
    out.push({
      submissionId: r.submission_id, name: r.student_name, email: r.student_email, answered: !!res.answered,
      answerText: String(res.givenAnswerText ?? ''), points: Number(res.pointsEarned) || 0,
      possible: Number(res.pointsPossible) || 0, needsGrading: !!res.needsGrading,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ grade by question (V4-02) */

/**
 * The full grades object to save for one submission after setting ONE question's points: the student's existing
 * grades with `questionId` replaced (null / '' removes it). Other questions stay exactly as they were.
 */
export function mergeGrade(existing, questionId, points) {
  const out = isObj(existing) ? { ...existing } : {};
  if (points === null || points === undefined || points === '') delete out[questionId];
  else out[questionId] = r2(Number(points));
  return out;
}

/** Full comments object after setting one question's comment (empty text removes it). */
export function mergeComment(existing, questionId, text) {
  const out = isObj(existing) ? { ...existing } : {};
  const t = String(text ?? '').trim();
  if (t) out[questionId] = t; else delete out[questionId];
  return out;
}

/** Number of manual answers in a normalized row that still have no teacher points, given the grades that will be saved. */
export function pendingAfter(row, grades) {
  const g = isObj(grades) ? grades : {};
  return (Array.isArray(row.auto_responses) ? row.auto_responses : []).filter((x) => x && x.needsGrading && !Object.prototype.hasOwnProperty.call(g, x.questionId)).length;
}

/** Index after moving `delta` steps in a list of `length`, clamped (no wrap). */
export function stepIndex(index, delta, length) {
  if (!length) return 0;
  return Math.min(length - 1, Math.max(0, index + delta));
}

/* ------------------------------------------------------------------ bulk tools (V4-02) */

export const BULK = { RELEASE: 'release', UNRELEASE: 'unrelease', RETAKE: 'retake' };

/**
 * Which of the selected rows a bulk action applies to: { eligible, skipped }. Extra attempts are never touched.
 * release: Graded / Auto-graded and not released yet. unrelease: currently released.
 * retake: no retake allowed yet. Nothing here ever deletes anything.
 */
export function planBulk(rows, action) {
  const ok = (r) => {
    if (r.status === STATUS.EXTRA) return false;
    if (action === BULK.RELEASE) return (r.status === STATUS.GRADED || r.status === STATUS.AUTO) && !r.released_at;
    if (action === BULK.UNRELEASE) return !!r.released_at;
    if (action === BULK.RETAKE) return !r.retake_allowed_at;
    return false;
  };
  const eligible = [];
  const skipped = [];
  for (const r of rows) (ok(r) ? eligible : skipped).push(r);
  return { eligible, skipped };
}

const BULK_VERB = { release: 'Released', unrelease: 'Un-released', retake: 'Allowed a retake for' };

/** Summary toast text: "Released 8 · skipped 2 · failed 1". */
export function summarizeBulk(action, { done = 0, skipped = 0, failed = 0 } = {}) {
  const parts = [`${BULK_VERB[action] || 'Updated'} ${done}`];
  if (skipped) parts.push(`skipped ${skipped}`);
  if (failed) parts.push(`failed ${failed}`);
  return parts.join(' · ');
}
