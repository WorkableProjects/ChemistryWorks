// Flashcards (study, not scored): flip, then mark "knew it" or "review again". Cards marked for review
// come back later in the session.

import { GAME_TYPES } from '../game.js';
import { formatAnswer } from '../grading.js';
import { questionAvailability, shuffle } from './common.js';

export const REVIEW_GAP = 3; // a card marked "review again" returns after this many other cards

/** One card per question: { id, front (prompt), back (correct answer text), explanation }. */
export function buildCards(questions, rand = Math.random) {
  return shuffle(questions, rand).map((q) => ({
    id: String(q.id),
    front: String(q.text ?? ''),
    back: formatAnswer(q, q.correctAnswer),
    explanation: q.explanation ? String(q.explanation) : '',
    question: q,
  }));
}

/**
 * Remove the current (first) card from the queue. `knew` drops it; otherwise it is re-inserted REVIEW_GAP cards
 * later (or at the end when fewer remain). Returns a new queue.
 */
export function advanceQueue(queue, knew) {
  const [card, ...rest] = Array.isArray(queue) ? queue : [];
  if (!card || knew) return rest;
  const at = Math.min(REVIEW_GAP, rest.length);
  return [...rest.slice(0, at), card, ...rest.slice(at)];
}

export const flashcards = {
  id: 'flashcards',
  title: 'Flashcards',
  blurb: 'Study mode, not scored. Flip each card, then mark "knew it" or "review again".',
  icon: 'sheet',
  playableTypes: GAME_TYPES,
  minQuestions: 1,
  scored: false,
  availability: (test) => questionAvailability(test, GAME_TYPES, 1, 'auto-graded'),
};
