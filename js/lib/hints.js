// Decides when a question should show students HOW to type charges or exponents. Pure functions, no DOM.
//
// question.formatHelp: 'auto' (default) | 'always' | 'never'
//   auto   formula answers with a charge (SO4^2-, Na+) or ion wording in the text -> charge help;
//          numeric answers that need scientific notation (>= 10,000 or < 0.001) or "× 10" wording -> exponent help.
//   always show the help that fits the type (formula -> charges, numeric -> exponents, fillblank -> per blank kind).
//   never  hide it.

import { normalizeFormula } from './formula.js';

export const FORMAT_HELP_MODES = ['auto', 'always', 'never'];

const ION_WORDS = /\b(ion|ions|ionic|cation|cations|anion|anions|charge|charged|polyatomic|oxidation state)\b/i;
const EXP_WORDS = /(\\times\s*10|×\s*10|x\s*10\^|scientific notation|\de[+-]?\d|avogadro)/i;

/** True when a formula string carries a charge (SO4^2-, Na+, Fe³⁺, Cl{-}). */
export function formulaHasCharge(f) {
  return /\^/.test(normalizeFormula(String(f ?? '')));
}

/** True when a number is awkward to type without scientific notation. */
export function needsScientific(n) {
  const x = Math.abs(Number(n));
  return Number.isFinite(x) && x !== 0 && (x >= 1e4 || x < 1e-3);
}

const list = (a) => (Array.isArray(a) ? a : a === undefined || a === null ? [] : [a]);

/** { charges: boolean, exponents: boolean } for a question. */
export function formatHelpFor(q) {
  const mode = FORMAT_HELP_MODES.includes(q?.formatHelp) ? q.formatHelp : 'auto';
  const none = { charges: false, exponents: false };
  if (!q || mode === 'never') return none;
  const always = mode === 'always';
  const text = String(q.text ?? '');
  switch (q.type) {
    case 'formula':
      return { charges: always || list(q.correctAnswer).some(formulaHasCharge) || ION_WORDS.test(text), exponents: false };
    case 'numeric':
      return { charges: false, exponents: always || needsScientific(q.correctAnswer) || EXP_WORDS.test(text) };
    case 'fillblank': {
      const blanks = Array.isArray(q.blanks) ? q.blanks : [];
      const formulas = blanks.filter((b) => b && b.kind === 'formula');
      const numbers = blanks.filter((b) => b && b.kind === 'number');
      return {
        charges: formulas.length > 0 && (always || formulas.some((b) => list(b.answers).some(formulaHasCharge)) || ION_WORDS.test(text)),
        exponents: numbers.length > 0 && (always || numbers.some((b) => list(b.answers).some((a) => needsScientific(typeof a === 'number' ? a : Number(String(a).replace(/[x×]\s*10\^?/i, 'e'))))) || EXP_WORDS.test(text)),
      };
    }
    default:
      return none;
  }
}

/** Examples shown in the charge help box: [typed, meaning]. */
export const CHARGE_EXAMPLES = [
  ['Na^+', 'Na⁺ (a charge of 1: no number, just the sign)'],
  ['Cl^-', 'Cl⁻'],
  ['Fe^3+', 'Fe³⁺ (number first, then the sign)'],
  ['SO4^2-', 'SO₄²⁻ (subscript 4, then ^ and the charge)'],
  ['NH4^+', 'NH₄⁺'],
];

/** Examples shown in the exponent help box. */
export const EXPONENT_EXAMPLES = [
  ['6.02e23', '6.02 × 10²³'],
  ['6.02x10^23', '6.02 × 10²³ (same thing)'],
  ['1.5e-4', '1.5 × 10⁻⁴ (negative exponent: put - after e)'],
];
