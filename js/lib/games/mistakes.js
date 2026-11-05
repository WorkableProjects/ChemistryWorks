// Mistake Review: replays questions the student got wrong (past game rounds on this device, plus the student's own
// released results when the test shows answers) until each is answered correctly twice. Not scored, nothing is sent.

import { load, save } from '../storage.js';
import { SURVIVAL_TYPES } from './survival.js';
import { isManualQuestion } from '../schema.js';

export const RIGHT_TWICE = 2;
export const REVIEW_GAP = 2; // a missed question returns after this many others
export const MISTAKE_CAP = 100;
export const MISTAKE_TYPES = [...SURVIVAL_TYPES, 'naming', 'nuclear', 'vsepr', 'dropdown'];

export const mistakeKey = (email, code) => `gamemistakes:${String(email || '').toLowerCase()}:${code}`;

export function loadMistakeIds(email, code) {
  const v = load(mistakeKey(email, code), []);
  return Array.isArray(v) ? v.map(String) : [];
}

/** Add the wrong answers of a finished round ([{ q, correct, skipped }]). Returns the stored ids. */
export function recordRound(email, code, results) {
  const ids = loadMistakeIds(email, code);
  for (const r of Array.isArray(results) ? results : []) {
    if (!r || !r.q || r.correct || r.skipped) continue;
    const id = String(r.q.id);
    if (!ids.includes(id)) ids.push(id);
  }
  const kept = ids.slice(-MISTAKE_CAP);
  save(mistakeKey(email, code), kept);
  return kept;
}

export function clearMistakes(email, code, solvedIds) {
  const solved = new Set((solvedIds || []).map(String));
  save(mistakeKey(email, code), loadMistakeIds(email, code).filter((id) => !solved.has(id)));
}

/** Wrong question ids from stored result payloads of this test (only when the test lets students see answers). */
export function mistakesFromResults(payloads, test) {
  if (!test || test.showResults === false || test.showCorrectAnswers === false) return [];
  const out = [];
  for (const p of Array.isArray(payloads) ? payloads : []) {
    if (!p || p.test_code !== test.code) continue;
    for (const r of Array.isArray(p.responses) ? p.responses : []) {
      if (r && r.answered && r.isCorrect === false && !r.needsGrading && r.questionId != null) out.push(String(r.questionId));
    }
  }
  return out;
}

/** Auto-graded test questions that are in `ids`, keeping the test's order. */
export function mistakeQuestions(test, ids) {
  const want = new Set((ids || []).map(String));
  const list = Array.isArray(test && test.questions) ? test.questions : [];
  return list.filter((q) => q && want.has(String(q.id)) && MISTAKE_TYPES.includes(q.type) && !isManualQuestion(q));
}

/** Review state: { queue: [id], right: { id: n }, order: [id] }. */
export function startReview(questions) {
  const order = questions.map((q) => String(q.id));
  return { queue: order.slice(), right: {}, order, answered: 0, wrong: 0 };
}

/**
 * Apply an answer to the first queued question. Right: counts toward RIGHT_TWICE and leaves the queue once reached,
 * otherwise comes back after REVIEW_GAP others. Wrong: comes back after REVIEW_GAP others (progress kept).
 * Returns a new state plus { solved, done }.
 */
export function answerReview(state, correct) {
  const [id, ...rest] = state.queue;
  if (id === undefined) return { ...state, solved: false, done: true };
  const right = { ...state.right };
  if (correct) right[id] = (right[id] || 0) + 1;
  const solved = correct && right[id] >= RIGHT_TWICE;
  const queue = solved ? rest : [...rest.slice(0, Math.min(REVIEW_GAP, rest.length)), id, ...rest.slice(Math.min(REVIEW_GAP, rest.length))];
  return { ...state, queue, right, answered: state.answered + 1, wrong: state.wrong + (correct ? 0 : 1), solved, done: queue.length === 0 };
}

export const mistakes = {
  id: 'mistakes',
  title: 'Mistake Review',
  blurb: 'Replays only the questions you missed until you get each one right twice. Not scored.',
  icon: 'refresh',
  playableTypes: MISTAKE_TYPES,
  minQuestions: 1,
  scored: false,
  againLabel: 'Review again',
  availability(test, ctx = {}) {
    const ids = [...loadMistakeIds(ctx.email, test && test.code)];
    if (ctx.localResults) ids.push(...mistakesFromResults(ctx.localResults, test));
    const questions = mistakeQuestions(test, ids);
    return questions.length
      ? { playable: true, reason: '', questions, note: `${questions.length} question${questions.length === 1 ? '' : 's'} to review` }
      : { playable: false, reason: 'No mistakes to review yet. Play a round of another game first.', questions: [] };
  },
};
