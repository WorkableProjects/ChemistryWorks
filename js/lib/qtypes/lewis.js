// `lewis`: place the dots around an element symbol. Answer: [top, right, bottom, left] dot counts.
import { registerType } from './registry.js';
import { normalizeSymbol, valenceOf, isDotArray, dotTotal, followsPlacementRule, canonicalDots, describeDots } from '../lewis.js';
import { str, bool, nonEmptyStr, DASH } from './shared.js';

export const def = {
  type: 'lewis',
  label: 'Lewis dot diagram',
  shortLabel: 'Lewis dots',
  group: 'Diagrams & graphs',
  manual: false,
  layout: 'wide',

  normalize(q) {
    const sym = normalizeSymbol(q.element);
    q.element = sym || str(q.element).trim();
    q.checkPlacement = bool(q.checkPlacement, true);
    if (q.correctAnswer === undefined || q.correctAnswer === null || q.correctAnswer === '') {
      const v = valenceOf(sym);
      if (v !== null) q.correctAnswer = v;
    } else if (typeof q.correctAnswer === 'string' && Number.isFinite(Number(q.correctAnswer))) {
      q.correctAnswer = Number(q.correctAnswer);
    }
  },

  validate(q, where, errors) {
    const a = q.correctAnswer;
    if (!nonEmptyStr(q.element) || !normalizeSymbol(q.element)) errors.push(`${where}: element must be an element symbol such as "O" or "Cl".`);
    if (!Number.isInteger(a) || a < 1 || a > 8) errors.push(`${where}: correctAnswer must be the number of valence electrons (a whole number from 1 to 8).`);
  },

  blank: (base) => ({ ...base, text: 'Draw the Lewis dot diagram for oxygen.', element: 'O', correctAnswer: 6, checkPlacement: true }),

  isAnswered: (q, answer) => isDotArray(answer) && dotTotal(answer) > 0,

  grade(q, answer) {
    if (!isDotArray(answer)) return { fraction: 0, full: false };
    const ok = dotTotal(answer) === Number(q.correctAnswer)
      && (q.checkPlacement === false || followsPlacementRule(answer, q.element));
    return { fraction: ok ? 1 : 0, full: ok };
  },

  format: (q, answer) => describeDots(answer, q.element),

  keyText(q) {
    const n = Number(q.correctAnswer);
    if (!Number.isInteger(n) || n < 1) return DASH;
    return `${describeDots(canonicalDots(n, q.element), q.element)}${q.checkPlacement === false ? ' — any placement' : ''}`;
  },

  correctAnswer: (q) => q.correctAnswer,
};

registerType(def);
export default def;
