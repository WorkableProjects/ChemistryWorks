// Mistake Review: only the questions answered wrong (attempt.wrongIds()) plus any marked wrong in the teacher's
// released feedback. Answer again to fix them. Empty list = nothing to review.
import { sumEvents } from './common.js';

export const FIX_POINTS = 100;

/**
 * Ids to review, in the attempt's order. `feedback` is the released review from student-status (or null):
 * a question counts as missed when its released points (or the teacher's grade) are below the points possible.
 */
export function mistakeIds(attempt, feedback = null) {
  const ids = new Set(attempt.wrongIds());
  const fb = feedback && typeof feedback === 'object' ? feedback : null;
  if (fb) {
    const grades = fb.grades && typeof fb.grades === 'object' ? fb.grades : {};
    for (const r of Array.isArray(fb.responses) ? fb.responses : []) {
      if (!r || r.questionId == null || r.needsGrading) continue;
      const possible = Number(r.pointsPossible) || 0;
      const graded = Object.prototype.hasOwnProperty.call(grades, r.questionId) && Number.isFinite(Number(grades[r.questionId]));
      const earned = graded ? Number(grades[r.questionId]) : Number(r.pointsEarned) || 0;
      if (possible > 0 && earned < possible) ids.add(r.questionId);
    }
  }
  return attempt.questions.filter((q) => ids.has(q.id)).map((q) => q.id);
}

export const mistakes = {
  id: 'mistakes', title: 'Mistake review', blurb: 'Answer again the questions you got wrong', icon: 'refresh', order: 5,
  pacing: 'none', minQuestions: 1,
  available: (test) => ((test?.questions || []).length >= 1 ? { ok: true } : { ok: false, reason: 'This practice has no questions' }),
  rules: () => ({
    clock: 'none', lives: 0, maxSkips: 0, skipCost: 0, order: (qs) => qs.map((q) => q.id), secondsFor: () => null, init: () => ({}),
    apply: (state, { outcome }) => ({ state, points: outcome === 'correct' ? FIX_POINTS : 0 }),
  }),
  scoring: (attempt, events) => sumEvents(events),
};
