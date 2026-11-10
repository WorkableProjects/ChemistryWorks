// V5-01 shared rules for game modes (pure, no DOM). A mode only orders `attempt.questions`; it never adds, drops or swaps one.
// Contract: docs/ARCHITECTURE.md -> V5 contracts -> Game mode definition.

import { isManualQuestion } from '../schema.js';
import { load, save } from '../storage.js';

/** Types that take longer to answer: timers pause (total clocks) or run x3 (per-question clocks). */
export const SLOW_TYPES = ['balance', 'graph', 'structure', 'lewis', 'multipart', 'datatable'];
export const SLOW_FACTOR = 3;
export const QUESTION_SECONDS = 20;
export const BASE_POINTS = 1000;
export const MIN_CORRECT_POINTS = 500;
export const UNTIMED_POINTS = 750;
export const STREAK_START = 3;
export const STREAK_STEP = 0.1;
export const STREAK_CAP = 1.5;

export const isManual = (q) => isManualQuestion(q);
export const isSlow = (q) => !!q && (SLOW_TYPES.includes(q.type) || isManual(q));
/** 1 for a normal question, 3 for a long one. */
export const slowFactor = (q) => (isSlow(q) ? SLOW_FACTOR : 1);

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

/** Points for one answer; `streak` is the streak BEFORE it. No limit (null) = flat points, no speed bonus. */
export function pointsFor({ elapsedMs = 0, limitMs = null, streak = 0 } = {}) {
  const next = (Number(streak) || 0) + 1;
  const raw = limitMs ? Math.max(MIN_CORRECT_POINTS, Math.round(BASE_POINTS * speedFactor(elapsedMs, limitMs))) : UNTIMED_POINTS;
  return { points: Math.round(raw * streakMultiplier(next)), streak: next };
}

/**
 * What an answer is worth, from the student's side:
 * 'correct' | 'wrong' (only where the test shows correctness), 'saved' (answered, correctness hidden),
 * 'manual' (teacher-graded type, answered), 'blank' (no answer).
 */
export function outcomeOf(attempt, q) {
  if (!attempt.isAnswered(q.id)) return 'blank';
  if (isManual(q)) return 'manual';
  if (!attempt.showsCorrectness()) return 'saved';
  const r = attempt.resultFor(q.id);
  if (r.correct === true) return 'correct';
  if (r.correct === false) return 'wrong';
  return 'manual';
}

export const modeBestKey = (email, code, modeId) => `gamebest:${String(email || '').toLowerCase()}:${code}:${modeId}`;
export const loadModeBest = (email, code, modeId) => { const v = Number(load(modeBestKey(email, code, modeId), 0)); return Number.isFinite(v) && v > 0 ? v : 0; };
/** Save `score` when it beats the stored best. Returns { best, isBest }. */
export function saveModeBest(email, code, modeId, score) {
  const prev = loadModeBest(email, code, modeId);
  const isBest = score > prev;
  if (isBest) save(modeBestKey(email, code, modeId), score);
  return { best: Math.max(prev, score), isBest };
}

/** Standard scoring: the points of every resolved question. events: [{ id, outcome, points }]. */
export function sumEvents(events) {
  const list = Array.isArray(events) ? events : [];
  const score = list.reduce((n, e) => n + (Number(e.points) || 0), 0);
  const correct = list.filter((e) => e.outcome === 'correct').length;
  return { score, detail: { correct, resolved: list.length } };
}
