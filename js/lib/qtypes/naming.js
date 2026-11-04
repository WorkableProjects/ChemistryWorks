// `naming` question type (V4-03): name a compound from its formula, or write the formula from its name.
// Pure module, no DOM. Answer shape: a string.
//   { type: 'naming', direction: 'toName' | 'toFormula', prompt: 'CuSO4·5H2O' | 'copper(II) sulfate', answers: [accepted, ...] }
import { registerType } from './registry.js';
import { formulasEqual } from '../formula.js';


export const DIRECTIONS = ['toName', 'toFormula'];

/**
 * Canonical form of a compound name for comparing: case, spacing, hyphens and the Roman-numeral charge written
 * "(II)" or " (II) " all compare equal, and a leading "mono" on the first element is optional
 * ("monocarbon monoxide" = "carbon monoxide"). "-ic" / "-ous" endings are NOT converted to Roman numerals.
 */
export function normalizeName(input) {
  let s = String(input ?? '').normalize('NFKC').toLowerCase();
  s = s.replace(/[‐-―−]/g, '-'); // every dash/minus lookalike -> "-"
  s = s.replace(/[-_]+/g, ' '); // hyphens read as spaces
  s = s.replace(/\s*([()[\]])\s*/g, '$1'); // "copper (II) sulfate" = "copper(II)sulfate"
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/[.,;:!?]+$/, '').trim();
  // optional "mono" on the first element: "monocarbon monoxide" -> "carbon monoxide"
  s = s.replace(/^mono(?=[a-z]{2})/, '');
  return s;
}

/** True when two names are the same after normalizeName(). Empty never matches. */
export function namesEqual(a, b) {
  const x = normalizeName(a);
  return x !== '' && x === normalizeName(b);
}

/** True when `given` matches one accepted answer for the question's direction. Never throws. */
export function namingMatches(q, given) {
  if (typeof given !== 'string' || given.trim() === '') return false;
  const answers = Array.isArray(q && q.answers) ? q.answers : [];
  try {
    if (q.direction === 'toFormula') return answers.some((a) => typeof a === 'string' && a.trim() !== '' && formulasEqual(given, a, { caseSensitive: true }));
    return answers.some((a) => typeof a === 'string' && namesEqual(given, a));
  } catch {
    return false;
  }
}

export const def = {
  type: 'naming',
  label: 'Name ↔ formula',
  shortLabel: 'Naming',
  group: 'Chemistry',

  normalize(q) {
    q.direction = DIRECTIONS.includes(q.direction) ? q.direction : 'toName';
    q.prompt = q.prompt === undefined || q.prompt === null ? '' : String(q.prompt);
    const list = Array.isArray(q.answers) ? q.answers : q.answers === undefined || q.answers === null ? [] : [q.answers];
    q.answers = list.map((a) => String(a ?? '').trim()).filter(Boolean);
  },

  validate(q, where, errors) {
    if (!DIRECTIONS.includes(q.direction)) errors.push(`${where}: direction must be "toName" or "toFormula".`);
    if (typeof q.prompt !== 'string' || !q.prompt.trim()) errors.push(`${where}: prompt is required (the ${q.direction === 'toFormula' ? 'name' : 'formula'} students are given).`);
    if (!Array.isArray(q.answers) || !q.answers.length) { errors.push(`${where}: add at least one accepted answer.`); return; }
    q.answers.forEach((a, i) => {
      if (typeof a !== 'string' || !a.trim()) errors.push(`${where}: accepted answer ${i + 1} is empty.`);
    });
  },

  blank(base) {
    return { ...base, text: 'Name this compound.', direction: 'toName', prompt: 'CuSO4', answers: ['copper(II) sulfate'] };
  },

  isAnswered: (q, answer) => typeof answer === 'string' && answer.trim() !== '',

  score(q, answer) {
    const ok = namingMatches(q, answer);
    return { fraction: ok ? 1 : 0, full: ok };
  },

  answerText: (q, answer) => (typeof answer === 'string' ? answer.trim() : ''),

  keyText: (q) => (Array.isArray(q.answers) && q.answers.length ? q.answers.join(' / ') : '—'),

  correctAnswer: (q) => (Array.isArray(q.answers) ? q.answers.slice() : []),
};

registerType(def);
export default def;
