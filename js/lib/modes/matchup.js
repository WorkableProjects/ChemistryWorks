// Match-Up: pair each prompt with its answer. Pairs come from the test's own questions (mcq, numeric, naming, formula
// key text, plus each line of a matching question). A right pair is saved with the value the runner would store.
// Needs correctness to be shown. Not timed.
import { correctAnswerText } from '../grading.js';
import { sumEvents } from './common.js';
import { showsCorrectness } from '../attempt.js';

export const PAIR_POINTS = 100;
export const RETRY_POINTS = 50;
export const ROUND_SIZE = 6;
const MAX_LEN = 140;
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const textOf = (q) => {
  const prompt = clean(q.prompt);
  const text = clean(q.text);
  return prompt && !text.includes(prompt) ? `${text} ${prompt}`.trim() : text;
};

/** The value the runner stores for a right answer, or undefined when the key can't be stored as one value. */
function keyValue(q) {
  switch (q.type) {
    case 'mcq': return q.correctAnswer === undefined || q.correctAnswer === null || Array.isArray(q.correctAnswer) ? undefined : String(q.correctAnswer);
    case 'numeric': return q.correctAnswer === undefined || q.correctAnswer === null || q.correctAnswer === '' ? undefined : String(q.correctAnswer);
    case 'formula': { const a = Array.isArray(q.correctAnswer) ? q.correctAnswer[0] : q.correctAnswer; return typeof a === 'string' && a.trim() ? a : undefined; }
    case 'naming': return Array.isArray(q.answers) && q.answers[0] ? String(q.answers[0]) : undefined;
    default: return undefined;
  }
}

/**
 * Pairs from the questions: [{ id, qid, prompt, answer, value, leftId? }].
 * `value` is what attempt.set gets; for a matching line it is the right id, and `leftId` says which line (the view
 * merges the lines of one question into the { leftId: rightId } object the runner stores).
 */
export function buildPairs(questions) {
  const out = [];
  for (const q of Array.isArray(questions) ? questions : []) {
    if (!q) continue;
    if (q.type === 'matching') {
      const right = new Map((q.right || []).map((r) => [r.id, clean(r.text)]));
      for (const l of q.left || []) {
        const rid = q.correctAnswer ? q.correctAnswer[l.id] : undefined;
        out.push({ id: `${q.id}:${l.id}`, qid: q.id, prompt: clean(l.text), answer: right.get(rid) || '', value: rid, leftId: l.id });
      }
      continue;
    }
    if (!['mcq', 'numeric', 'naming', 'formula'].includes(q.type)) continue;
    const value = keyValue(q);
    if (value === undefined) continue;
    out.push({ id: q.id, qid: q.id, prompt: textOf(q), answer: clean(correctAnswerText(q)), value });
  }
  return out.filter((p) => p.prompt && p.answer && p.answer !== '—' && p.prompt.length <= MAX_LEN && p.answer.length <= MAX_LEN);
}

/** Split pairs into rounds of at most `size`; a last round of fewer than 3 is folded into the one before. */
export function buildRounds(pairs, size = ROUND_SIZE) {
  const list = [...pairs];
  const rounds = [];
  for (let i = 0; i < list.length; i += size) rounds.push(list.slice(i, i + size));
  if (rounds.length > 1 && rounds[rounds.length - 1].length < 3) {
    const last = rounds.pop();
    rounds[rounds.length - 1].push(...last);
  }
  return rounds;
}

export const matchup = {
  id: 'matchup', title: 'Match-Up', blurb: 'Pair each prompt with its answer. A right pair is saved as your answer', icon: 'grid', order: 8,
  pacing: 'none', minQuestions: 3,
  available(test) {
    if (buildPairs(test?.questions).length < 3) return { ok: false, reason: 'Needs at least 3 pairs to match' };
    if (!showsCorrectness(test)) return { ok: false, reason: 'Needs correct answers to be shown' };
    return { ok: true };
  },
  rules: () => ({ clock: 'none', lives: 0, maxSkips: 0, skipCost: 0, order: (qs) => qs.map((q) => q.id), secondsFor: () => null, init: () => ({}), apply: (state) => ({ state, points: 0 }) }),
  scoring: (attempt, events) => sumEvents(events),
};
