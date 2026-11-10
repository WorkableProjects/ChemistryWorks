// Flashcards: study cards, not scored. Question on the front; the back shows the key when the test allows showing
// answers, otherwise "Flip to answer" opens the answer widget. Cards marked "Review again" come back later.
export const flashcards = {
  id: 'flashcards', title: 'Flashcards', blurb: 'Flip each card, then mark it known or review it again. Not scored', icon: 'copy', order: 4,
  pacing: 'none', minQuestions: 1,
  available: (test) => ((test?.questions || []).length >= 1 ? { ok: true } : { ok: false, reason: 'This practice has no questions' }),
  rules: () => ({ clock: 'none', lives: 0, maxSkips: 0, skipCost: 0, order: (qs) => qs.map((q) => q.id), secondsFor: () => null, init: () => ({}), apply: (state) => ({ state, points: 0 }) }),
  scoring: () => ({ score: 0, detail: {} }),
};

/** Card queue after a mark: a known card leaves; a card to review goes three places back (or to the end). */
export function advanceCards(queue, knew, gap = 3) {
  const [head, ...rest] = queue;
  if (head === undefined || knew) return rest;
  rest.splice(Math.min(gap, rest.length), 0, head);
  return rest;
}
