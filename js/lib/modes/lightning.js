// Lightning Round: 60 seconds in total. A skip costs 2 seconds and the question comes back at the end.
// The clock pauses on teacher-graded questions and runs at a third of the speed on long types.
import { slowFactor, isManual, pointsFor, sumEvents } from './common.js';

export const TOTAL_SECONDS = 60;
export const SKIP_PENALTY_SECONDS = 2;
export const POINTS_PER_CORRECT = 100;

export const lightning = {
  id: 'lightning', title: 'Lightning Round', blurb: '60 seconds on the clock. Answer as many as you can; a skip costs 2 seconds', icon: 'clock', order: 2,
  pacing: 'timed', minQuestions: 3,
  available: (test) => ((test?.questions || []).length >= 3 ? { ok: true } : { ok: false, reason: 'Needs at least 3 questions' }),
  rules(test, opts = {}) {
    const untimed = opts.untimed === true;
    return {
      clock: untimed ? 'none' : 'total', totalSeconds: opts.totalSeconds || TOTAL_SECONDS, lives: 0, maxSkips: Infinity, skipCost: SKIP_PENALTY_SECONDS,
      order: (questions) => questions.map((q) => q.id),
      secondsFor: () => null,
      /** How fast the total clock drains on this question: 0 = paused. */
      drainRate: (q) => (isManual(q) ? 0 : 1 / slowFactor(q)),
      init: () => ({ streak: 0 }),
      apply(state, { outcome }) {
        if (outcome === 'correct' || outcome === 'saved') {
          const hidden = outcome === 'saved';
          const { points, streak } = pointsFor({ limitMs: null, streak: hidden ? 0 : state.streak });
          return { state: { streak: hidden ? 0 : streak }, points: Math.round(points * (POINTS_PER_CORRECT / 750)) };
        }
        return { state: { streak: outcome === 'manual' ? state.streak : 0 }, points: 0 };
      },
    };
  },
  scoring: (attempt, events) => sumEvents(events),
};
