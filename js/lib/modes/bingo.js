// Bingo: a card of the test's questions (3x3 up to 12 questions, else 4x4). A right answer marks its square; a full
// row, column or diagonal is a line, and play goes on to a full card. Spare squares are free and never form a line alone.
// Needs correctness to be shown. Not timed.
import { sumEvents } from './common.js';
import { showsCorrectness } from '../attempt.js';

export const CELL_POINTS = 100;
export const LINE_POINTS = 200;
export const FULL_POINTS = 500;
export const MIN_QUESTIONS = 6;

export const cardSize = (n) => (n <= 12 ? 3 : 4);

/** Every winning line of a size x size card, as lists of cell indexes. */
export function bingoLines(size) {
  const lines = [];
  for (let r = 0; r < size; r++) lines.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) lines.push(Array.from({ length: size }, (_, r) => r * size + c));
  lines.push(Array.from({ length: size }, (_, i) => i * size + i));
  lines.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)));
  return lines;
}

// Where spare squares go: positions that cannot complete a line by themselves (3 spares at most).
const FREE_ORDER = { 3: [0, 1, 5, 6, 7, 2, 3, 8, 4], 4: [0, 1, 6, 11, 12, 15, 2, 3, 4, 5, 7, 8, 9, 10, 13, 14] };

/**
 * The card: [{ index, qid|null, free }] for size*size cells. `ids` are question ids in the order wanted
 * (extra ones are cut). Squares left over are free.
 */
export function buildCard(ids, size = cardSize(ids.length)) {
  const cells = size * size;
  const queue = ids.slice(0, cells);
  const free = new Set((FREE_ORDER[size] || []).slice(0, cells - queue.length));
  return Array.from({ length: cells }, (_, index) => (free.has(index) ? { index, qid: null, free: true } : { index, qid: queue.shift(), free: false }));
}

/** Indexes (into bingoLines) of the lines that are complete, given the marked cell indexes. */
export function completedLines(size, marked) {
  const m = marked instanceof Set ? marked : new Set(marked);
  return bingoLines(size).map((l, i) => ({ l, i })).filter(({ l }) => l.every((c) => m.has(c))).map(({ i }) => i);
}

/** One answer on a cell: new marks, newly completed lines, points. `marked` includes the free squares. */
export function applyBingo({ size, marked, outcome, index }) {
  const next = new Set(marked);
  if (outcome === 'correct') next.add(index);
  const before = new Set(completedLines(size, marked));
  const newLines = completedLines(size, next).filter((i) => !before.has(i)).length;
  const full = next.size === size * size && marked.size !== next.size;
  const points = outcome === 'correct' ? CELL_POINTS + newLines * LINE_POINTS + (full ? FULL_POINTS : 0) : 0;
  return { marked: next, newLines, full, points };
}

export const bingo = {
  id: 'bingo', title: 'Bingo', blurb: 'Answer to mark squares. Complete a line, then fill the card', icon: 'grid', order: 11,
  pacing: 'none', minQuestions: MIN_QUESTIONS,
  available(test) {
    if ((test?.questions || []).length < MIN_QUESTIONS) return { ok: false, reason: `Needs at least ${MIN_QUESTIONS} questions` };
    if (!showsCorrectness(test)) return { ok: false, reason: 'Needs correct answers to be shown' };
    return { ok: true };
  },
  rules: () => ({ clock: 'none', lives: 0, maxSkips: 0, skipCost: 0, order: (qs) => qs.map((q) => q.id), secondsFor: () => null, init: () => ({}), apply: (state) => ({ state, points: 0 }) }),
  scoring: (attempt, events) => sumEvents(events),
};
