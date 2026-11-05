// Regrade (V4-02, S12): re-run auto-grading on stored answers after an answer key was fixed. Pure.
// Teacher overrides (grades) are kept by the backend (applyRegrade_ re-applies them).
//   regradeRow(test, row) -> { responses, scoreAchieved, scoreTotal, percentage, changed } | null (nothing gradable)
import { gradeQuestion, formatAnswer, correctAnswerText } from './grading.js';

export function regradeRow(test, row) {
  const byId = new Map((test?.questions || []).map((q) => [q.id, q]));
  const old = Array.isArray(row?.responses) ? row.responses : [];
  if (!old.length) return null;
  let changed = false;
  let achieved = 0; let total = 0;
  const responses = old.map((r) => {
    const q = byId.get(r?.questionId);
    if (!q || r.manual || r.needsGrading) { achieved += Number(r?.pointsEarned) || 0; total += Number(r?.pointsPossible) || 0; return r; }
    const given = r.answered ? r.givenAnswer : null;
    const g = gradeQuestion(q, given === null ? undefined : given);
    achieved += g.pointsEarned; total += g.pointsPossible;
    const next = { ...r, isCorrect: g.isCorrect, pointsEarned: g.pointsEarned, pointsPossible: g.pointsPossible, partial: g.partial,
      correctAnswerText: correctAnswerText(q), givenAnswerText: formatAnswer(q, given) };
    if (next.pointsEarned !== r.pointsEarned || next.pointsPossible !== r.pointsPossible) changed = true;
    return next;
  });
  const round2 = (x) => Math.round(x * 100) / 100;
  return { responses, scoreAchieved: round2(achieved), scoreTotal: round2(total), percentage: total > 0 ? round2((achieved / total) * 100) : 0, changed };
}
