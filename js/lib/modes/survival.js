// Survival: no clock, 3 lives. A wrong answer costs a life; every 5 correct in a row earns one back (up to the start).
// Questions run easiest first (by points). Teacher-graded questions never cost a life. Needs correctness to be shown.
import { isManual, sumEvents } from './common.js';
import { showsCorrectness } from '../attempt.js';

export const START_LIVES = 3;
export const STREAK_FOR_LIFE = 5;
export const BASE_POINTS = 100;
export const STREAK_BONUS_STEP = 10;
export const STREAK_BONUS_CAP = 50;

/** Easy to hard: ascending `points`; ties keep the attempt's order. */
export function sortSurvival(questions) {
  const pts = (q) => { const n = Number(q.points); return Number.isFinite(n) ? n : 1; };
  return questions.map((q, i) => ({ q, i })).sort((a, b) => pts(a.q) - pts(b.q) || a.i - b.i).map((x) => x.q);
}

/** state { lives, maxLives, streak } + one answer -> { state, points, lifeGained, lifeLost, over }. */
export function applySurvival(state, { outcome, points = 1 }) {
  const { lives, maxLives, streak } = state;
  if (outcome === 'wrong' || outcome === 'blank') {
    const left = Math.max(0, lives - 1);
    return { state: { ...state, lives: left, streak: 0 }, points: 0, lifeGained: false, lifeLost: true, over: left === 0 };
  }
  if (outcome !== 'correct' && outcome !== 'saved') return { state, points: 0, lifeGained: false, lifeLost: false, over: false };
  const next = streak + 1;
  const earned = outcome === 'correct' && next % STREAK_FOR_LIFE === 0 && lives < maxLives;
  const weight = Number(points) > 0 ? Number(points) : 1;
  const bonus = Math.min(STREAK_BONUS_CAP, STREAK_BONUS_STEP * streak);
  return { state: { ...state, lives: earned ? lives + 1 : lives, streak: next }, points: Math.round(BASE_POINTS * weight + bonus), lifeGained: earned, lifeLost: false, over: false };
}

export const survival = {
  id: 'survival', title: 'Survival', blurb: 'No clock, three lives. Five right in a row wins a life back', icon: 'alert', order: 3,
  pacing: 'lives', minQuestions: 3,
  available(test) {
    if ((test?.questions || []).length < 3) return { ok: false, reason: 'Needs at least 3 questions' };
    if (!showsCorrectness(test)) return { ok: false, reason: 'Needs correct answers to be shown' };
    return { ok: true };
  },
  rules(test, opts = {}) {
    const lives = opts.lives || START_LIVES;
    return {
      clock: 'none', lives, maxSkips: 1, skipCost: 0,
      order: (questions) => sortSurvival(questions).map((q) => q.id),
      secondsFor: () => null,
      init: () => ({ lives, maxLives: lives, streak: 0 }),
      apply: (state, ev) => applySurvival(state, { ...ev, points: ev.q?.points, outcome: isManual(ev.q) ? 'manual' : ev.outcome }),
    };
  },
  scoring: (attempt, events) => sumEvents(events),
};
