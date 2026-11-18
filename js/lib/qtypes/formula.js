// `formula`: a chemical formula, compared after normalizing subscripts and charges. Answer: the text typed.
// The key may list several accepted formulas.
import { registerType } from './registry.js';
import { formulasEqual } from '../formula.js';
import { bool, nonEmptyStr, DASH } from './shared.js';

const answered = (answer) => typeof answer === 'string' && answer.trim() !== '';

export const def = {
  type: 'formula',
  label: 'Chemical formula',
  shortLabel: 'Formula',
  group: 'Chemistry',
  manual: false,

  normalize(q) {
    q.caseSensitive = bool(q.caseSensitive, true);
  },

  validate(q, where, errors) {
    const a = q.correctAnswer;
    if (Array.isArray(a)) {
      if (a.length === 0 || a.some((x) => !nonEmptyStr(x))) errors.push(`${where}: correctAnswer must list at least one non-empty formula.`);
    } else if (!nonEmptyStr(a)) errors.push(`${where}: correctAnswer must be a non-empty formula.`);
  },

  blank: (base) => ({ ...base, caseSensitive: true, correctAnswer: 'H2O', formatHelp: 'auto' }),

  isAnswered: (q, answer) => answered(answer),

  grade(q, answer) {
    if (typeof answer !== 'string') return { fraction: 0, full: false };
    const accepted = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
    const opts = { caseSensitive: q.caseSensitive !== false };
    const ok = accepted.some((a) => typeof a === 'string' && a.trim() !== '' && formulasEqual(answer, a, opts));
    return { fraction: ok ? 1 : 0, full: ok };
  },

  format: (q, answer) => (Array.isArray(answer) ? (answer.length ? answer.map(String).join(' / ') : DASH) : answered(answer) ? String(answer) : DASH),

  keyText(q) {
    const a = q.correctAnswer;
    if (Array.isArray(a)) return a.join(' / ') || DASH;
    return typeof a === 'string' && a !== '' ? a : DASH;
  },

  correctAnswer: (q) => q.correctAnswer,
};

registerType(def);
export default def;
