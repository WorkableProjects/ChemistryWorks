// Lewis (electron) dot diagrams for single elements. Pure functions, no DOM.
//
// A student's answer is an array of dot counts per side of the element symbol:
//   [top, right, bottom, left], each 0, 1 or 2.

export const SIDES = ['top', 'right', 'bottom', 'left'];

const GROUPS = [
  [1, ['H', 'Li', 'Na', 'K', 'Rb', 'Cs', 'Fr']],
  [2, ['He', 'Be', 'Mg', 'Ca', 'Sr', 'Ba', 'Ra']],
  [3, ['B', 'Al', 'Ga', 'In', 'Tl']],
  [4, ['C', 'Si', 'Ge', 'Sn', 'Pb']],
  [5, ['N', 'P', 'As', 'Sb', 'Bi']],
  [6, ['O', 'S', 'Se', 'Te', 'Po']],
  [7, ['F', 'Cl', 'Br', 'I', 'At']],
  [8, ['Ne', 'Ar', 'Kr', 'Xe', 'Rn']],
];

/** Valence electrons for main-group elements (the ones with an unambiguous dot diagram). */
export const VALENCE = Object.fromEntries(GROUPS.flatMap(([n, list]) => list.map((s) => [s, n])));

const SYMBOL_RE = /^[A-Z][a-z]{0,2}$/;

/** "o" -> "O", " cl " -> "Cl". Returns '' for anything that is not symbol-shaped. */
export function normalizeSymbol(s) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  const fixed = t[0].toUpperCase() + t.slice(1).toLowerCase();
  return SYMBOL_RE.test(fixed) ? fixed : '';
}

export function valenceOf(symbol) {
  return VALENCE[normalizeSymbol(symbol)] ?? null;
}

/** True for a well-formed answer: 4 integers in 0..2. */
export function isDotArray(a) {
  return Array.isArray(a) && a.length === 4 && a.every((n) => Number.isInteger(n) && n >= 0 && n <= 2);
}

export const dotTotal = (a) => (isDotArray(a) ? a.reduce((s, n) => s + n, 0) : 0);

/**
 * Conventional placement: one dot on each side before any side gets a pair.
 * Helium is drawn as a single pair, so for He both a pair and two singles are accepted.
 */
export function followsPlacementRule(dots, symbol = '') {
  if (!isDotArray(dots)) return false;
  const n = dotTotal(dots);
  const pairs = dots.filter((d) => d === 2).length;
  if (normalizeSymbol(symbol) === 'He' && n === 2) return true;
  return pairs === Math.max(0, n - 4);
}

/** The textbook diagram for n valence electrons: singles top, right, bottom, left, then pairs in the same order. */
export function canonicalDots(n, symbol = '') {
  const count = Math.max(0, Math.min(8, Math.floor(Number(n) || 0)));
  if (normalizeSymbol(symbol) === 'He' && count === 2) return [2, 0, 0, 0];
  const out = [0, 0, 0, 0];
  for (let i = 0; i < count; i++) out[i % 4] += 1;
  return out;
}

/** "6 dots (top 2, right 2, bottom 1, left 1)" */
export function describeDots(dots, symbol = '') {
  if (!isDotArray(dots)) return '—';
  const n = dotTotal(dots);
  const sides = SIDES.map((s, i) => `${s} ${dots[i]}`).join(', ');
  return `${symbol ? `${symbol}: ` : ''}${n} ${n === 1 ? 'dot' : 'dots'} (${sides})`;
}
