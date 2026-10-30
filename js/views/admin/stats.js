// Pure (DOM-free) statistics helpers for the admin analytics tab. Unit-testable under node.

/** Arithmetic mean; 0 for an empty list. */
export function mean(values) {
  const v = values.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

/** Median; 0 for an empty list. */
export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Format a percentage with one decimal: 82.43 -> "82.4%". */
export function formatPercent(n) {
  return `${(Math.round((Number(n) || 0) * 10) / 10).toFixed(1)}%`;
}

/**
 * Ten buckets: 0–9, 10–19, … 80–89, 90–100 (100 falls in the last bucket).
 * Returns [{ label, min, max, count }].
 */
export function histogramBuckets(percentages) {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    min: i * 10,
    max: i === 9 ? 100 : i * 10 + 9,
    label: i === 9 ? '90–100' : `${i * 10}–${i * 10 + 9}`,
    count: 0,
  }));
  for (const p of percentages) {
    if (!Number.isFinite(p)) continue;
    const idx = Math.min(9, Math.max(0, Math.floor(p / 10)));
    buckets[idx].count++;
  }
  return buckets;
}

export const STATUS = { NEEDS_GRADING: 'Needs grading', AUTO: 'Auto-graded', GRADED: 'Graded' };

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
  } else if (status !== STATUS.GRADED) {
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
  };
}

/** Filter rows by test code ('' or 'all' = no filter), grading status and a free-text query on name/email. */
export function filterRows(rows, { testCode = '', query = '', status = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return rows.filter((r) => {
    if (testCode && testCode !== 'all' && r.test_code !== testCode) return false;
    if (status && status !== 'all' && r.status !== status) return false;
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

/** Headline numbers for the KPI cards. */
export function summarize(rows) {
  const pcts = rows.map((r) => r.percentage);
  return {
    count: rows.length,
    average: mean(pcts),
    median: median(pcts),
    high: pcts.length ? Math.max(...pcts) : 0,
    low: pcts.length ? Math.min(...pcts) : 0,
    avgDuration: mean(rows.map((r) => r.duration_seconds)),
  };
}

/**
 * Per-question aggregation from each row's responses (gradeTest().results).
 * Returns [{ key, testCode, questionId, questionText, type, attempts, answered, correct, pctCorrect,
 *            avgPoints, pointsPossible, commonWrong: { text, count } | null }]
 * sorted hardest first (lowest % correct; ties by more attempts).
 */
export function questionStats(rows) {
  const map = new Map();
  for (const row of rows) {
    for (const res of row.responses || []) {
      if (!res || res.questionId == null) continue;
      const key = `${row.test_code}::${res.questionId}`;
      let s = map.get(key);
      if (!s) {
        s = { key, testCode: row.test_code, questionId: res.questionId, questionText: res.questionText || '', type: res.type || '',
          attempts: 0, answered: 0, correct: 0, pointsSum: 0, pointsPossible: Number(res.pointsPossible) || 0, wrong: new Map() };
        map.set(key, s);
      }
      s.attempts++;
      if (res.answered) s.answered++;
      if (res.isCorrect) s.correct++;
      s.pointsSum += Number(res.pointsEarned) || 0;
      if (!s.questionText && res.questionText) s.questionText = res.questionText;
      if (res.answered && !res.isCorrect && res.type !== 'short') {
        const t = String(res.givenAnswerText ?? '').trim();
        if (t) s.wrong.set(t, (s.wrong.get(t) || 0) + 1);
      }
    }
  }
  const out = [...map.values()].map((s) => {
    let commonWrong = null;
    for (const [text, count] of s.wrong) if (!commonWrong || count > commonWrong.count) commonWrong = { text, count };
    return {
      key: s.key, testCode: s.testCode, questionId: s.questionId, questionText: s.questionText, type: s.type,
      attempts: s.attempts, answered: s.answered, correct: s.correct,
      pctCorrect: s.attempts ? (s.correct / s.attempts) * 100 : 0,
      avgPoints: s.attempts ? s.pointsSum / s.attempts : 0,
      pointsPossible: s.pointsPossible,
      commonWrong,
    };
  });
  out.sort((a, b) => a.pctCorrect - b.pctCorrect || b.attempts - a.attempts);
  return out;
}

/** Quote one CSV field (RFC 4180): wrap when it has comma, quote, CR or LF; double inner quotes. */
export function csvField(value) {
  let s = value == null ? '' : String(value);
  // Neutralize spreadsheet formula injection (=, +, -, @) in text values; leave real numbers alone.
  if (typeof value === 'string' && /^[=+\-@]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_COLUMNS = [
  ['Timestamp', (r) => r.timestamp],
  ['Submission ID', (r) => r.submission_id],
  ['Student Name', (r) => r.student_name],
  ['Student Email', (r) => r.student_email],
  ['Test Code', (r) => r.test_code],
  ['Test Title', (r) => r.test_title],
  ['Score Achieved', (r) => r.score_achieved],
  ['Total Score', (r) => r.score_total],
  ['Percentage (%)', (r) => (Math.round(r.percentage * 100) / 100)],
  ['Duration (s)', (r) => r.duration_seconds],
  ['Tab Switches', (r) => r.tab_switches],
  ['Status', (r) => r.status],
];

/** CSV text (header + rows, CRLF line ends) for normalized rows. */
export function toCsv(rows) {
  const lines = [CSV_COLUMNS.map(([name]) => csvField(name)).join(',')];
  for (const r of rows) lines.push(CSV_COLUMNS.map(([, get]) => csvField(get(r))).join(','));
  return lines.join('\r\n') + '\r\n';
}

/**
 * Gradebook CSV for copying into Aeries / Google Classroom: one row per submission with the final score.
 * Ungraded open-ended submissions are marked so they are not mistaken for final grades.
 */
export function toGradebookCsv(rows) {
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
  const lines = [cols.map(([name]) => csvField(name)).join(',')];
  for (const r of rows) lines.push(cols.map(([, get]) => csvField(get(r))).join(','));
  return lines.join('\r\n') + '\r\n';
}
