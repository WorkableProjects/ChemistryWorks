// Shared pure helpers for the game modules (no DOM). Nothing here ever touches the network.

import { isManualQuestion } from '../schema.js';

/** Deterministic PRNG (mulberry32) from any seed string. Returns () => number in [0, 1). */
export function makeRng(seed) {
  let a = 2166136261;
  for (const ch of String(seed)) a = Math.imul(a ^ ch.charCodeAt(0), 16777619);
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle with an injected rng (default Math.random). Returns a new array. */
export function shuffle(list, rand = Math.random) {
  const out = Array.isArray(list) ? list.slice() : [];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Auto-graded questions of the given types, in the test's order. */
export function questionsOfTypes(test, types) {
  const list = Array.isArray(test && test.questions) ? test.questions : [];
  return list.filter((q) => q && types.includes(q.type) && !isManualQuestion(q));
}

/**
 * Standard availability check for a game that plays test questions.
 * Returns { playable, reason, questions }.
 */
export function questionAvailability(test, types, minQuestions, what) {
  const questions = questionsOfTypes(test, types);
  if (questions.length >= minQuestions) return { playable: true, reason: '', questions };
  const need = minQuestions === 1 ? 'at least 1' : `at least ${minQuestions}`;
  return { playable: false, reason: `Needs ${need} ${what} question${minQuestions === 1 ? '' : 's'} (this test has ${questions.length}).`, questions };
}

/** Best-score storage keys. The classic game also reads the pre-v3 key. */
export const gameBestKey = (email, code, gameId) => `gamebest:${String(email || '').toLowerCase()}:${code}:${gameId}`;
export const legacyBestKey = (email, code) => `gamebest:${String(email || '').toLowerCase()}:${code}`;
