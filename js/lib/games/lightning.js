// Lightning Round: 60 seconds in total, as many questions as possible. Skipping is allowed but costs 2 seconds.

import { streakMultiplier } from '../game.js';
import { questionAvailability } from './common.js';

export const TOTAL_SECONDS = 60;
export const SKIP_PENALTY_SECONDS = 2;
export const POINTS_PER_CORRECT = 100;
export const LIGHTNING_TYPES = ['mcq', 'truefalse', 'numeric', 'ptable', 'econfig'];

/** Points for a correct answer; `streak` is the streak BEFORE it. Reuses the classic streak multiplier. */
export function lightningPoints(streak) {
  return Math.round(POINTS_PER_CORRECT * streakMultiplier((Number(streak) || 0) + 1));
}

/** Seconds left after `elapsedMs` of play and `skips` skipped questions. Never below 0. */
export function secondsLeft(elapsedMs, skips = 0, total = TOTAL_SECONDS) {
  const left = total - (Number(elapsedMs) || 0) / 1000 - (Number(skips) || 0) * SKIP_PENALTY_SECONDS;
  return Math.max(0, left);
}

export const lightning = {
  id: 'lightning',
  title: 'Lightning Round',
  blurb: '60 seconds on the clock. Answer as many as you can; a skip costs 2 seconds.',
  icon: 'clock',
  playableTypes: LIGHTNING_TYPES,
  minQuestions: 3,
  scored: true,
  availability: (test) => questionAvailability(test, LIGHTNING_TYPES, 3, 'multiple-choice, true/false, numeric, periodic-table or electron-configuration'),
};
