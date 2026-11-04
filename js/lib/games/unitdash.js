// Unit Dash: generated unit conversions and significant-figure rounding against the clock. Needs no test questions.
// Everything is deterministic for a given rand, so it is unit-testable.

import { makeRng } from './common.js';
import { streakMultiplier } from '../game.js';

export const DASH_SECONDS = 60;
export const UNTIMED_QUESTIONS = 10;
export const POINTS_PER_CORRECT = 100;
export const LEVEL_EVERY = 3; // correct answers per level

// [from, to, factor]  (value in `from` * factor = value in `to`)
const PREFIX = [
  ['mL', 'L', 1e-3], ['L', 'mL', 1e3], ['g', 'kg', 1e-3], ['kg', 'g', 1e3], ['mg', 'g', 1e-3], ['g', 'mg', 1e3],
  ['cm', 'm', 1e-2], ['m', 'cm', 1e2], ['km', 'm', 1e3], ['mm', 'm', 1e-3], ['m', 'nm', 1e9], ['nm', 'm', 1e-9],
  ['kJ', 'J', 1e3], ['J', 'kJ', 1e-3], ['mol', 'mmol', 1e3], ['mmol', 'mol', 1e-3],
];
const nice = (n) => Number(Number(n).toPrecision(10));

/** Round to `n` significant figures (n >= 1). */
export function roundSig(x, n) {
  const v = Number(x);
  if (!Number.isFinite(v) || v === 0) return 0;
  return Number(v.toPrecision(Math.max(1, Math.round(n))));
}

/** Parse what a student typed: 1,200 / 1.2e3 / 1.2x10^3 / 1.2 × 10^3 / 12e-4. NaN when it is not a number. */
export function parseDashNumber(input) {
  const s = String(input ?? '').trim().replace(/,/g, '').replace(/\s+/g, '').replace(/[×x*]10\^?([+-]?\d+)/i, 'e$1').replace('−', '-');
  if (s === '' || !/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

const pick = (list, rand) => list[Math.floor(rand() * list.length)];
const mantissa = (rand, digits) => Number((1 + rand() * 8).toFixed(digits - 1));

function conversion(rand, level) {
  const [from, to, factor] = pick(PREFIX, rand);
  const value = level === 0 ? pick([1, 2, 5, 10, 25, 50, 100, 250], rand) : nice(mantissa(rand, 3) * 10 ** Math.floor(rand() * 4 - 1));
  const answer = nice(value * factor);
  return { kind: 'convert', prompt: `Convert ${value} ${from} to ${to}.`, answer, unit: to, level };
}

function temperature(rand, level) {
  const c = Math.round(rand() * 200 - 20);
  if (rand() < 0.5) return { kind: 'temperature', prompt: `Convert ${c} °C to kelvin.`, answer: nice(c + 273.15), unit: 'K', level };
  const k = Math.round(250 + rand() * 250);
  return { kind: 'temperature', prompt: `Convert ${k} K to °C.`, answer: nice(k - 273.15), unit: '°C', level };
}

function sigfig(rand, level) {
  const digits = 4 + Math.floor(rand() * 2);
  const exp = Math.floor(rand() * 7) - 3;
  const value = nice(Number((1 + rand() * 8.99).toFixed(digits - 1)) * 10 ** exp);
  const n = 2 + Math.floor(rand() * 2);
  return { kind: 'sigfig', prompt: `Round ${value} to ${n} significant figures.`, answer: roundSig(value, n), unit: '', level };
}

/** One generated question for a level (0 easy .. 3 hard): { kind, prompt, answer, unit, level }. */
export function generateDash(level, rand = Math.random) {
  const lv = Math.max(0, Math.min(3, Math.floor(Number(level) || 0)));
  if (lv === 0) return conversion(rand, 0);
  if (lv === 1) return rand() < 0.6 ? conversion(rand, 1) : sigfig(rand, 1);
  if (lv === 2) return pick([conversion, sigfig, temperature], rand)(rand, 2);
  return pick([conversion, sigfig, temperature, sigfig], rand)(rand, 3);
}

/** Level for the number of correct answers so far. */
export const dashLevel = (correctCount) => Math.min(3, Math.floor((Number(correctCount) || 0) / LEVEL_EVERY));

/** Right when the number matches (relative 1e-6; temperatures to 0.01). */
export function checkDash(q, input) {
  const given = parseDashNumber(input);
  if (!Number.isFinite(given)) return false;
  const tol = q.kind === 'temperature' ? 0.01 : Math.abs(q.answer) * 1e-6;
  return Math.abs(given - q.answer) <= tol;
}

/** The answer as text for feedback (plain, not scientific unless tiny/huge). */
export function dashAnswerText(q) {
  const a = q.answer;
  const text = Math.abs(a) >= 1e6 || (a !== 0 && Math.abs(a) < 1e-3) ? a.toExponential().replace('e+', 'e') : String(a);
  return q.unit ? `${text} ${q.unit}` : text;
}

/** Points for a correct answer; `streak` is the streak BEFORE it. */
export const dashPoints = (streak) => Math.round(POINTS_PER_CORRECT * streakMultiplier((Number(streak) || 0) + 1));

/** Deterministic sequence of `count` questions climbing through the levels (used by tests and the untimed round). */
export function dashSequence(count, seed = 'dash') {
  const rand = makeRng(seed);
  return Array.from({ length: count }, (_, i) => generateDash(dashLevel(i), rand));
}


export const unitdash = {
  id: 'unitdash',
  title: 'Unit Dash',
  blurb: 'Quick unit conversions and significant-figure rounding against the clock. No test questions needed.',
  icon: 'hourglass',
  playableTypes: [],
  minQuestions: 0,
  scored: true,
  timed: true,
  availability: () => ({ playable: true, reason: '', questions: [], note: 'Generated questions' }),
};
