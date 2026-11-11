// Classic: 20 seconds a question (x3 for long types, none for teacher-graded), speed points and a streak bonus.
import { QUESTION_SECONDS, slowFactor, isManual, pointsFor, sumEvents } from './common.js';

export const classic = {
  id: 'classic', title: 'Classic', blurb: '20 seconds a question. Faster answers score more, streaks add a bonus', icon: 'flag', order: 1,
  pacing: 'timed', minQuestions: 1,
  available: (test) => ((test?.questions || []).length >= 1 ? { ok: true } : { ok: false, reason: 'This practice has no questions' }),
  /** Rules for one round. `opts` = normalized gameOptions. */
  rules(test, opts = {}) {
    const untimed = opts.untimed === true;
    return {
      clock: untimed ? 'none' : 'question', lives: 0, maxSkips: 1, skipCost: 0,
      order: (questions) => questions.map((q) => q.id),
      secondsFor: (q) => (untimed || isManual(q) ? null : (opts.timePerQuestion || QUESTION_SECONDS) * slowFactor(q)),
      init: () => ({ streak: 0 }),
      apply(state, { outcome, elapsedMs, limitMs }) {
        if (outcome === 'correct' || outcome === 'saved') {
          const hidden = outcome === 'saved';
          const { points, streak } = pointsFor({ elapsedMs, limitMs, streak: hidden ? 0 : state.streak });
          return { state: { streak: hidden ? 0 : streak }, points };
        }
        return { state: { streak: outcome === 'manual' ? state.streak : 0 }, points: 0 };
      },
    };
  },
  scoring: (attempt, events) => sumEvents(events),
};
