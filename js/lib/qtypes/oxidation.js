// `oxidation` question type (V5-07, S12b): oxidation numbers. Pure definition, no DOM.
//   A formula or equation is shown. Each element symbol in it is one atom position; the student enters a signed
//   integer above each one (+2, -1, 0).
//   { type: 'oxidation', formula: 'H2SO4', key: [1, 6, -2] }   (key: one integer per atom position, in order)
//   Answer: array of integers or null, one per atom position.
//   Score: per atom; fraction = atoms right / atoms. Full credit only when every atom is right.
import { registerType } from './registry.js';
import { ELEMENTS } from '../elements.js';

const str = (v) => (v === undefined || v === null ? '' : String(v));
export const OX_MIN = -4;
export const OX_MAX = 8;
const DASH = '—';
const MINUS = '−';
const SYMBOLS = new Set(ELEMENTS.map((e) => e.symbol));

/** Atom positions in order: every element symbol in the text (subscripts and coefficients are ignored). */
export function atomsOf(formula) {
  const out = [];
  const text = str(formula);
  const re = /[A-Z][a-z]?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    let sym = m[0];
    if (!SYMBOLS.has(sym) && SYMBOLS.has(sym[0])) sym = sym[0];
    if (!SYMBOLS.has(sym)) continue;
    out.push({ symbol: sym, start: m.index, end: m.index + sym.length });
    re.lastIndex = m.index + sym.length;
  }
  return out;
}

/** Signed integer text: "+2", "−1", "0". */
export const oxText = (n) => (n > 0 ? `+${n}` : n < 0 ? `${MINUS}${Math.abs(n)}` : '0');

/** Parses a student's entry: "+2", "2", "-1", "−1", "0" gives an integer; blank gives null; anything else NaN. */
export function parseOx(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
  const s = String(v).trim().replace(/−/g, '-').replace(/\s+/g, '');
  if (s === '') return null;
  return /^[+-]?\d+$/.test(s) ? Number(s) : NaN;
}

/** The key as one integer per atom position (null where missing). */
export function keyOf(q) {
  const key = Array.isArray(q.key) ? q.key : [];
  return atomsOf(q.formula).map((_, i) => (Number.isInteger(key[i]) ? key[i] : null));
}

export const def = {
  type: 'oxidation',
  label: 'Oxidation numbers',
  shortLabel: 'Oxidation numbers',
  group: 'Chemistry',
  v5: true,

  normalize(q) {
    q.formula = str(q.formula).trim();
    const key = Array.isArray(q.key) ? q.key : [];
    q.key = key.map((v) => (v === '' || v === null || v === undefined ? null : Number(v)));
  },

  validate(q, where, errors) {
    if (!q.formula) { errors.push(`${where}: enter a formula or an equation.`); return; }
    const atoms = atomsOf(q.formula);
    if (!atoms.length) { errors.push(`${where}: the formula needs at least one element symbol.`); return; }
    const key = Array.isArray(q.key) ? q.key : [];
    atoms.forEach((a, i) => {
      const v = key[i];
      if (!Number.isInteger(v) || v < OX_MIN || v > OX_MAX) {
        errors.push(`${where}: enter the oxidation number of ${a.symbol} (atom ${i + 1}) as a whole number from ${OX_MIN} to +${OX_MAX}.`);
      }
    });
  },

  blank(base) {
    return { ...base, text: 'Give the oxidation number of each element in H₂SO₄.', formula: 'H2SO4', key: [1, 6, -2] };
  },

  isAnswered(q, a) {
    return Array.isArray(a) && a.some((v) => parseOx(v) !== null);
  },

  score(q, a) {
    const key = keyOf(q);
    if (!key.length || key.some((k) => k === null)) return { fraction: 0, full: false };
    const given = Array.isArray(a) ? a : [];
    const right = key.filter((k, i) => parseOx(given[i]) === k).length;
    if (right === key.length) return { fraction: 1, full: true };
    return { fraction: right / key.length, full: false };
  },

  answerText(q, a) {
    const atoms = atomsOf(q.formula);
    if (!atoms.length) return DASH;
    const given = Array.isArray(a) ? a : [];
    return atoms.map((at, i) => {
      const v = parseOx(given[i]);
      return `${at.symbol} ${v === null || Number.isNaN(v) ? DASH : oxText(v)}`;
    }).join(', ');
  },

  keyText(q) {
    const atoms = atomsOf(q.formula);
    const key = keyOf(q);
    if (!atoms.length || key.some((k) => k === null)) return DASH;
    return atoms.map((at, i) => `${at.symbol} ${oxText(key[i])}`).join(', ');
  },

  correctAnswer: (q) => keyOf(q),
};

registerType(def);
export default def;
