// Element Hunt: "Click the element that ..." on the periodic table. Prompts are generated from the built-in
// element data (js/lib/elements.js), so it needs no test questions.

import { ELEMENTS } from '../elements.js';
import { scoreAnswer } from '../game.js';
import { shuffle } from './common.js';

export const ROUNDS = 10;
export const HUNT_SECONDS = 20;

const FAMILIES = [
  { id: 'alkali', label: 'an alkali metal', test: (e) => e.group === 1 && e.symbol !== 'H' },
  { id: 'alkaline', label: 'an alkaline earth metal', test: (e) => e.group === 2 },
  { id: 'halogen', label: 'a halogen', test: (e) => e.group === 17 },
  { id: 'noble', label: 'a noble gas', test: (e) => e.group === 18 },
];

const main = ELEMENTS.filter((e) => e.number <= 56 || (e.number >= 72 && e.number <= 86)); // familiar elements first

/** Prompt kinds. Each builds { text, accepts(el) -> bool, hint } for a target element. */
const KINDS = {
  name: (e) => ({ text: `Click the element named ${e.name}.`, accepts: (x) => x.number === e.number }),
  symbol: (e) => ({ text: `Click the element with the symbol ${e.symbol}.`, accepts: (x) => x.number === e.number }),
  number: (e) => ({ text: `Click the element with atomic number ${e.number}.`, accepts: (x) => x.number === e.number }),
  group: (e) => ({ text: `Click any element in group ${e.group}.`, accepts: (x) => x.group === e.group }),
  period: (e) => ({ text: `Click any element in period ${e.period}.`, accepts: (x) => x.period === e.period }),
  groupPeriod: (e) => ({ text: `Click the element in group ${e.group}, period ${e.period}.`, accepts: (x) => x.group === e.group && x.period === e.period }),
  family: (e) => {
    const f = FAMILIES.find((x) => x.test(e));
    return { text: `Click ${f.label}.`, accepts: f.test };
  },
};

/**
 * Build `count` prompts: { id, kind, target, text, accepts }. `accepts(element)` says whether a click is right.
 * Deterministic for a given rand. Only elements with a usable group (not the f-block rows) are used for group prompts.
 */
export function buildPrompts(count = ROUNDS, rand = Math.random) {
  const kinds = ['name', 'symbol', 'number', 'group', 'period', 'groupPeriod', 'family'];
  const order = shuffle(kinds, rand);
  const out = [];
  for (let i = 0; i < count; i++) {
    const kind = order[i % order.length];
    let pool = main.filter((e) => e.number >= 1);
    if (kind === 'family') pool = pool.filter((e) => FAMILIES.some((f) => f.test(e)));
    if (kind === 'group' || kind === 'groupPeriod') pool = pool.filter((e) => e.group);
    if (kind === 'name') pool = pool.filter((e) => e.number <= 54);
    const target = pool[Math.floor(rand() * pool.length)];
    const p = KINDS[kind](target);
    out.push({ id: `${kind}-${target.symbol}-${i}`, kind, target, ...p });
  }
  return out;
}

/** Score a click, reusing the classic speed/streak scoring over HUNT_SECONDS. */
export function scoreHunt({ correct, elapsedMs, streak, untimed = false }) {
  return scoreAnswer({ correct, elapsedMs, limitMs: HUNT_SECONDS * 1000, streak, untimed });
}

export const elementhunt = {
  id: 'elementhunt',
  title: 'Element Hunt',
  blurb: 'Find elements on the periodic table by name, number, group, period or family.',
  icon: 'grid',
  playableTypes: [],
  minQuestions: 0,
  scored: true,
  timed: true,
  availability: () => ({ playable: true, reason: '', questions: [] }),
};
