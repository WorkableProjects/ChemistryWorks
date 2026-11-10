// Tower: every correct answer adds a block; every wrong answer makes the tower wobble, and the third wobble knocks it
// down. Height (blocks, 100 points each) is the score. No clock. Needs correctness to be shown.
import { sumEvents } from './common.js';
import { showsCorrectness } from '../attempt.js';

export const MAX_WOBBLES = 3;
export const POINTS_PER_BLOCK = 100;

export const newTower = () => ({ blocks: 0, wobbles: 0, fell: false });

/** One answer -> { state, points, wobbled, over }. Teacher-graded and saved answers change nothing. */
export function applyTower(state, { outcome }) {
  if (state.fell) return { state, points: 0, wobbled: false, over: true };
  if (outcome === 'correct') return { state: { ...state, blocks: state.blocks + 1 }, points: POINTS_PER_BLOCK, wobbled: false, over: false };
  if (outcome === 'wrong' || outcome === 'blank') {
    const wobbles = state.wobbles + 1;
    const fell = wobbles >= MAX_WOBBLES;
    return { state: { ...state, wobbles, fell }, points: 0, wobbled: true, over: fell };
  }
  return { state, points: 0, wobbled: false, over: false };
}

export const tower = {
  id: 'tower', title: 'Tower', blurb: 'Stack a block for every right answer. Three wobbles and the tower falls', icon: 'layers', order: 6,
  pacing: 'lives', minQuestions: 3,
  available(test) {
    if ((test?.questions || []).length < 3) return { ok: false, reason: 'Needs at least 3 questions' };
    if (!showsCorrectness(test)) return { ok: false, reason: 'Needs correct answers to be shown' };
    return { ok: true };
  },
  rules: () => ({ clock: 'none', lives: 0, maxSkips: 0, skipCost: 0, order: (qs) => qs.map((q) => q.id), secondsFor: () => null, init: newTower, apply: (state, ev) => applyTower(state, ev) }),
  scoring: (attempt, events) => sumEvents(events),
};
