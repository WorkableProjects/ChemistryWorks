// `ptable`: click the element(s) on a periodic table. Answer: an array of element symbols.
import { registerType } from './registry.js';
import { ELEMENTS } from '../elements.js';
import { str, bool, DASH } from './shared.js';

const list = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);

/** "Sodium (Na); Chlorine (Cl)" for a list of symbols; unknown symbols are shown as typed. */
function symbolsText(answer) {
  const picked = new Set(answer.map(String));
  const known = ELEMENTS.filter((e) => picked.has(e.symbol)).map((e) => `${e.name} (${e.symbol})`);
  const unknown = [...picked].filter((sym) => !ELEMENTS.some((e) => e.symbol === sym));
  return [...known, ...unknown].join('; ');
}

export const def = {
  type: 'ptable',
  label: 'Periodic-table pick',
  shortLabel: 'Periodic table pick',
  group: 'Chemistry',
  manual: false,

  normalize(q) {
    const bySymbol = new Map(ELEMENTS.map((e) => [e.symbol.toLowerCase(), e.symbol]));
    q.answers = list(q.answers).map((a) => bySymbol.get(str(a).trim().toLowerCase()) || str(a).trim());
    q.multiple = bool(q.multiple, true);
    q.partialCredit = bool(q.partialCredit, false);
  },

  validate(q, where, errors) {
    const symbols = new Set(ELEMENTS.map((e) => e.symbol));
    if (!Array.isArray(q.answers) || q.answers.length === 0) { errors.push(`${where}: answers must list at least one element symbol, e.g. ["Na"].`); return; }
    q.answers.forEach((x) => { if (typeof x !== 'string' || !symbols.has(x)) errors.push(`${where}: "${x}" is not an element symbol.`); });
    if (new Set(q.answers).size !== q.answers.length) errors.push(`${where}: answers lists the same element more than once.`);
    if (q.multiple !== undefined && typeof q.multiple !== 'boolean') errors.push(`${where}: multiple must be true or false.`);
    if (q.multiple === false && q.answers.length !== 1) errors.push(`${where}: a single-select question (multiple: false) needs exactly one answer.`);
  },

  blank: (base) => ({ ...base, text: 'Click the alkali metal in period 3.', answers: ['Na'], multiple: true, partialCredit: false }),

  isAnswered: (q, answer) => Array.isArray(answer) && answer.length > 0,

  // Same set rules as `multi`: partial credit = (right - wrong) / expected.
  grade(q, answer) {
    if (!Array.isArray(answer) || !Array.isArray(q.answers)) return { fraction: 0, full: false };
    const correct = new Set(q.answers.map(String));
    const picked = new Set(answer.map(String));
    let right = 0;
    let wrong = 0;
    for (const sym of picked) (correct.has(sym) ? right++ : wrong++);
    if (right === correct.size && wrong === 0) return { fraction: 1, full: true };
    if (q.partialCredit && correct.size > 0) return { fraction: Math.max(0, (right - wrong) / correct.size), full: false };
    return { fraction: 0, full: false };
  },

  format: (q, answer) => symbolsText(answer),

  keyText: (q) => (Array.isArray(q.answers) && q.answers.length ? symbolsText(q.answers) : DASH),

  correctAnswer: (q) => q.answers,
};

registerType(def);
export default def;
