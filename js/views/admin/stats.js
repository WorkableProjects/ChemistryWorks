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
  const achieved = num(r.score_achieved);
  const total = num(r.score_total);
  let percentage = num(r.percentage);
  if ((r.percentage === undefined || r.percentage === null || r.percentage === '') && total > 0) percentage = (achieved / total) * 100;
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
    responses: Array.isArray(responses) ? responses : [],
    flags,
    tab_switches: num(flags.tab_switches ?? r.tab_switches),
  };
}

/** Filter rows by test code ('' or 'all' = no filter) and a free-text query on name/email. */
export function filterRows(rows, { testCode = '', query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return rows.filter((r) => {
    if (testCode && testCode !== 'all' && r.test_code !== testCode) return false;
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
      if (res.answered && !res.isCorrect) {
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
  const s = value == null ? '' : String(value);
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
];

/** CSV text (header + rows, CRLF line ends) for normalized rows. */
export function toCsv(rows) {
  const lines = [CSV_COLUMNS.map(([name]) => csvField(name)).join(',')];
  for (const r of rows) lines.push(CSV_COLUMNS.map(([, get]) => csvField(get(r))).join(','));
  return lines.join('\r\n') + '\r\n';
}
