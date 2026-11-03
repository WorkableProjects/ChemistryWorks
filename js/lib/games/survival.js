// Survival: no timer, 3 lives. A wrong answer costs a life; every 5 correct in a row earns one back
// (up to the starting 3). Questions get harder: sorted by points value, easiest first.

import { GAME_TYPES } from '../game.js';
import { questionAvailability, shuffle } from './common.js';

export const START_LIVES = 3;
export const MAX_LIVES = 3;
export const STREAK_FOR_LIFE = 5;
export const BASE_POINTS = 100;
export const STREAK_BONUS_STEP = 10; // +10 per answer already in the streak
export const STREAK_BONUS_CAP = 50;

/** Easy to hard: ascending `points` value; ties keep a random order. */
export function sortSurvival(questions, rand = Math.random) {
  const shuffled = shuffle(questions, rand).map((q, i) => ({ q, i }));
  const pts = (q) => { const n = Number(q.points); return Number.isFinite(n) ? n : 1; };
  shuffled.sort((a, b) => pts(a.q) - pts(b.q) || a.i - b.i);
  return shuffled.map((x) => x.q);
}

/**
 * Apply one answer. `state` is { lives, streak }; returns the new state plus
 * { points, lifeGained, lifeLost, over }.
 */
export function applySurvivalAnswer(state, { correct, points = 1 }) {
  const lives = Number(state.lives);
  const streak = Number(state.streak) || 0;
  if (!correct) {
    const left = Math.max(0, lives - 1);
    return { lives: left, streak: 0, points: 0, lifeGained: false, lifeLost: true, over: left === 0 };
  }
  const next = streak + 1;
  const earned = next % STREAK_FOR_LIFE === 0 && lives < MAX_LIVES;
  const p = Number(points);
  const weight = Number.isFinite(p) && p > 0 ? p : 1;
  const bonus = Math.min(STREAK_BONUS_CAP, STREAK_BONUS_STEP * streak);
  return { lives: earned ? lives + 1 : lives, streak: next, points: Math.round(BASE_POINTS * weight + bonus), lifeGained: earned, lifeLost: false, over: false };
}

export const survival = {
  id: 'survival',
  title: 'Survival',
  blurb: 'No clock, three lives. Five right in a row wins a life back. Questions get harder.',
  icon: 'alert',
  playableTypes: GAME_TYPES,
  minQuestions: 3,
  scored: true,
  availability: (test) => questionAvailability(test, GAME_TYPES, 3, 'auto-graded'),
};
