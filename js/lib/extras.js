// Per-question extras (V4-03): "How sure are you?" confidence, point-costing hints. Pure functions, no DOM.
//   question.confidence = true                  ask the student how sure they are after answering
//   question.hint = { text, cost }              a hint the student may reveal for `cost` points

export const CONFIDENCE_LEVELS = [
  { value: 1, label: 'Guessing' },
  { value: 2, label: 'Fairly sure' },
  { value: 3, label: 'Certain' },
];

/** 1 -> "Guessing"; anything else that is not 1..3 -> ''. */
export function confidenceLabel(value) {
  const l = CONFIDENCE_LEVELS.find((x) => x.value === Number(value));
  return l ? l.label : '';
}

/** True for 1, 2 or 3. */
export const validConfidence = (v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 3 && v !== null && v !== '' && typeof v !== 'boolean';

/** Points text without float noise: 1 -> "1 pt", 0.5 -> "0.5 pt", 2 -> "2 pts". */
export function ptsText(n) {
  const x = Math.round(Number(n) * 100) / 100;
  return `${x} ${x === 1 ? 'pt' : 'pts'}`;
}

/** Button text: "Show hint (−1 pt)", or just "Show hint" for a free hint. */
export function hintButtonText(q) {
  const cost = Number(q && q.hint && q.hint.cost) || 0;
  return cost > 0 ? `Show hint (−${ptsText(cost)})` : 'Show hint';
}

/**
 * Per-question confidence numbers from normalized submission rows (js/views/admin/stats.js normalizeRow):
 * Map(questionId -> { n, avg, confidentWrong }). n = students who gave a confidence; avg on the 1..3 scale (2 decimals);
 * confidentWrong = answered with confidence 3 ("Certain") and did not get full credit. Extra attempts and rows still
 * waiting for grading are skipped.
 */
export function confidenceStats(rows) {
  const by = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || r.status === 'Extra attempt' || r.status === 'Needs grading') continue;
    for (const res of Array.isArray(r.responses) ? r.responses : []) {
      if (!res || res.questionId == null || res.needsGrading || !validConfidence(res.confidence)) continue;
      const id = String(res.questionId);
      let s = by.get(id);
      if (!s) { s = { n: 0, sum: 0, confidentWrong: 0 }; by.set(id, s); }
      s.n++;
      s.sum += Number(res.confidence);
      if (Number(res.confidence) === 3 && res.answered && !res.isCorrect) s.confidentWrong++;
    }
  }
  const out = new Map();
  for (const [id, s] of by) out.set(id, { n: s.n, avg: Math.round((s.sum / s.n) * 100) / 100, confidentWrong: s.confidentWrong });
  return out;
}
