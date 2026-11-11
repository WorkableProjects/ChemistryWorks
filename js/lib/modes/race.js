// Race: a track with one step per question. A right answer moves you forward; a wrong one stays put. The ghost is
// your last finished run on this test, kept on this device. Needs correctness to be shown. Not timed.
import { sumEvents } from './common.js';
import { showsCorrectness } from '../attempt.js';
import { load, save } from '../storage.js';

export const STEP_POINTS = 100;
export const STREAK_STEP = 10;
export const STREAK_CAP = 50;

export const ghostKey = (code) => `race:ghost:${code}`;
/** The last run as [1|0, ...] per question, or null. */
export function loadGhost(code, total) {
  const v = load(ghostKey(code), null);
  return Array.isArray(v) && v.length === total && v.every((x) => x === 0 || x === 1) ? v : null;
}
export const saveGhost = (code, run) => save(ghostKey(code), run);

/** Steps the ghost had after `n` questions. */
export const ghostAt = (ghost, n) => (ghost ? ghost.slice(0, n).reduce((a, b) => a + b, 0) : 0);

/** One answer: new state { steps, streak } and points (a streak adds a small bonus). */
export function applyRace(state, { outcome }) {
  if (outcome === 'correct') {
    const bonus = Math.min(STREAK_CAP, STREAK_STEP * state.streak);
    return { state: { steps: state.steps + 1, streak: state.streak + 1 }, points: STEP_POINTS + bonus };
  }
  if (outcome === 'wrong' || outcome === 'blank') return { state: { ...state, streak: 0 }, points: 0 };
  return { state, points: 0 };
}

export const race = {
  id: 'race', title: 'Race', blurb: 'Every right answer moves you forward. Beat your last run', icon: 'flag', order: 10,
  pacing: 'none', minQuestions: 3,
  available(test) {
    if ((test?.questions || []).length < 3) return { ok: false, reason: 'Needs at least 3 questions' };
    if (!showsCorrectness(test)) return { ok: false, reason: 'Needs correct answers to be shown' };
    return { ok: true };
  },
  rules: () => ({ clock: 'none', lives: 0, maxSkips: 0, skipCost: 0, order: (qs) => qs.map((q) => q.id), secondsFor: () => null, init: () => ({ steps: 0, streak: 0 }), apply: (state, ev) => applyRace(state, ev) }),
  scoring: (attempt, events) => sumEvents(events),
};
