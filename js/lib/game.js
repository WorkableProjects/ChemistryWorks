// Game mode helpers (pure, no DOM). Single-player practice: nothing here is ever submitted anywhere.

import { isManualQuestion } from './schema.js';

/** Question types that can be played one-at-a-time with instant auto-grading. */
export const GAME_TYPES = ['mcq', 'multi', 'truefalse', 'numeric', 'formula'];

export const BASE_POINTS = 1000;
export const MIN_CORRECT_POINTS = 500; // a correct answer at the buzzer still earns half the base
export const QUESTION_SECONDS = 20;
export const FREEZE_SECONDS = 10;
export const STREAK_START = 3; // streak length at which the bonus begins
export const STREAK_STEP = 0.1; // +10% per answer beyond the second in a row
export const STREAK_CAP = 1.5;

/** True when the question can be played in game mode. */
export function isGameQuestion(q) {
  return !!q && GAME_TYPES.includes(q.type) && !isManualQuestion(q);
}

/** { playable, skipped } preserving the test's order. */
export function splitGameQuestions(test) {
  const list = Array.isArray(test && test.questions) ? test.questions : [];
  const playable = [];
  const skipped = [];
  for (const q of list) (isGameQuestion(q) ? playable : skipped).push(q);
  return { playable, skipped };
}

/** Only a test that explicitly opts in offers game mode. */
export function allowsGameMode(test) {
  return !!test && test.gameMode === true;
}

/** 1 at the start of the countdown down to 0.5 when time is nearly out. */
export function speedFactor(elapsedMs, limitMs) {
  const limit = Number(limitMs);
  if (!(limit > 0)) return 0.5;
  const frac = Math.min(1, Math.max(0, Number(elapsedMs) / limit));
  return 1 - 0.5 * (Number.isFinite(frac) ? frac : 1);
}

/** Multiplier for a streak that includes the answer just given: 1 below 3, then +10% per extra, capped. */
export function streakMultiplier(streak) {
  const s = Math.floor(Number(streak) || 0);
  if (s < STREAK_START) return 1;
  return Math.min(STREAK_CAP, Math.round((1 + STREAK_STEP * (s - STREAK_START + 1)) * 100) / 100);
}

/**
 * Score one answer. `streak` is the streak BEFORE this answer.
 * Wrong or timed-out answers earn 0 and reset the streak.
 * Returns { points, streak, multiplier, speed }.
 */
export function scoreAnswer({ correct, elapsedMs, limitMs, streak = 0 }) {
  if (!correct) return { points: 0, streak: 0, multiplier: 1, speed: 0 };
  const next = (Number(streak) || 0) + 1;
  const speed = speedFactor(elapsedMs, limitMs);
  const multiplier = streakMultiplier(next);
  const raw = Math.max(MIN_CORRECT_POINTS, Math.round(BASE_POINTS * speed));
  return { points: Math.round(raw * multiplier), streak: next, multiplier, speed };
}

/** Totals for the end screen from [{ correct, points }] in play order. */
export function summarizeGame(results) {
  const list = Array.isArray(results) ? results : [];
  let score = 0;
  let correct = 0;
  let run = 0;
  let bestStreak = 0;
  for (const r of list) {
    score += Number(r.points) || 0;
    if (r.correct) { correct++; run++; bestStreak = Math.max(bestStreak, run); } else run = 0;
  }
  return { score, correct, total: list.length, accuracy: list.length ? Math.round((correct / list.length) * 100) : 0, bestStreak };
}

/**
 * 50/50 for a multiple-choice question: ids of wrong options to hide, always leaving the answer
 * plus at least one distractor. `order` is any array of option ids used to pick deterministically.
 */
export function fiftyFiftyRemovals(q, order = null) {
  if (!q || q.type !== 'mcq' || !Array.isArray(q.options)) return [];
  const wrong = (order || q.options.map((o) => o.id)).map(String).filter((id) => id !== String(q.correctAnswer)
    && q.options.some((o) => String(o.id) === id));
  if (wrong.length < 2) return [];
  return wrong.slice(0, Math.min(2, wrong.length - 1));
}

export const bestKey = (email, code) => `gamebest:${String(email || '').toLowerCase()}:${code}`;
