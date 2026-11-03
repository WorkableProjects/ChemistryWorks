// Match-Up: a memory game. Cards turn face-up two at a time; find the matching pairs.
// Pairs come from the test's `matching` questions, topped up with element symbol <-> name pairs.

import { ELEMENTS } from '../elements.js';
import { questionsOfTypes, shuffle } from './common.js';

export const PAIR_COUNT = 6;
export const POINTS_PER_PAIR = 100;
export const MISS_PENALTY = 15;

/** Pairs [{ id, a, b }] from every matching question (left item + its correct right item). */
export function pairsFromMatching(test) {
  const out = [];
  for (const q of questionsOfTypes(test, ['matching'])) {
    const key = q.correctAnswer && typeof q.correctAnswer === 'object' ? q.correctAnswer : {};
    for (const l of q.left || []) {
      const r = (q.right || []).find((x) => String(x.id) === String(key[l.id]));
      const a = String(l.text ?? '').trim();
      const b = r ? String(r.text ?? '').trim() : '';
      if (a && b) out.push({ id: `${q.id}:${l.id}`, a, b });
    }
  }
  return out;
}

/** Symbol <-> name pairs for the familiar elements (up to Kr). */
export function elementPairs() {
  return ELEMENTS.filter((e) => e.number <= 36).map((e) => ({ id: `el:${e.symbol}`, a: e.symbol, b: e.name }));
}

/** Choose `count` pairs: test pairs first (shuffled), then element pairs. `source` tells which kinds were used. */
export function choosePairs(test, count = PAIR_COUNT, rand = Math.random) {
  const own = shuffle(pairsFromMatching(test), rand);
  const picked = own.slice(0, count);
  const seen = new Set(picked.flatMap((p) => [p.a, p.b]));
  if (picked.length < count) {
    for (const p of shuffle(elementPairs(), rand)) {
      if (picked.length >= count) break;
      if (!seen.has(p.a) && !seen.has(p.b)) { picked.push(p); seen.add(p.a); seen.add(p.b); }
    }
  }
  return { pairs: picked, fromTest: Math.min(own.length, count), fromElements: picked.length - Math.min(own.length, count) };
}

/** Face-down deck: two cards per pair, shuffled. Card = { id, pairId, side: 'a'|'b', text }. */
export function buildDeck(pairs, rand = Math.random) {
  const cards = [];
  for (const p of pairs) {
    cards.push({ id: `${p.id}#a`, pairId: p.id, side: 'a', text: p.a }, { id: `${p.id}#b`, pairId: p.id, side: 'b', text: p.b });
  }
  return shuffle(cards, rand);
}

export const isMatch = (c1, c2) => !!c1 && !!c2 && c1.id !== c2.id && c1.pairId === c2.pairId;

/** Score: 100 per pair, minus 15 per failed attempt, but never below 20 per pair. */
export function matchScore({ pairs, misses }) {
  const n = Math.max(0, Number(pairs) || 0);
  const m = Math.max(0, Number(misses) || 0);
  return Math.max(n * 20, n * POINTS_PER_PAIR - m * MISS_PENALTY);
}

export const matchup = {
  id: 'matchup',
  title: 'Match-Up',
  blurb: 'Flip two cards at a time and find the matching pairs. Fewer misses score more.',
  icon: 'sort',
  playableTypes: ['matching'],
  minQuestions: 0,
  scored: true,
  availability(test) {
    const n = pairsFromMatching(test).length;
    return { playable: true, reason: '', questions: questionsOfTypes(test, ['matching']), note: n ? `${n} pair${n === 1 ? '' : 's'} from this test` : 'Element symbol and name pairs' };
  },
};
