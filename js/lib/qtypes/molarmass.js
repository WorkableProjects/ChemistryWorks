// `molarmass` question type: "What is the molar mass of <formula>?". Pure definition, no DOM.
//   { type: 'molarmass', formula: 'Ca(OH)2', answer?: 74.1 (default: computed from the formula), tolerance: 0.05 (g/mol),
//     toleranceType: 'absolute'|'percent', showWork: true (offer the element-by-element work table), workCredit?: no }
//   Answer: { value: '74.10', work: [{ symbol: 'Ca', count: '1', mass: '40.08' }, ...] }  (typed text). Only `value` is graded;
//   the work is shown in review (results, grading, export).
import { registerType } from './registry.js';
import { molarMass, molarMassBreakdown } from '../chemfuncs.js';
import { parseNum, withinTolerance } from './dimensional.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === undefined || v === null ? '' : String(v));
const DASH = '—';

/** Number from what the student typed; "74.10 g/mol", "74.1 g" and "74,10" all read as 74.1. NaN otherwise. */
export function parseMolarMass(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  const s = str(input).trim().replace(/\s*(g\s*\/\s*mol|g\s*mol\^?-1|g\s*mol⁻¹|grams?(\s+per\s+mole)?|amu|u|g)\s*$/i, '');
  return parseNum(s);
}

/** The key: the question's own `answer` when given, else the molar mass computed from `formula` (NaN if unreadable). */
export function molarMassKey(q) {
  const own = q && q.answer !== undefined && q.answer !== null && q.answer !== '' ? Number(q.answer) : NaN;
  return Number.isFinite(own) ? own : molarMass(q && q.formula);
}

const workOf = (answer) => (isObj(answer) && Array.isArray(answer.work) ? answer.work.filter(isObj) : []);

/** "Ca 1 × 40.08; O 2 × 16.00" style text for the student's work table (rows with nothing typed are skipped). */
export function workText(answer) {
  return workOf(answer).filter((r) => str(r.symbol).trim() || str(r.count).trim() || str(r.mass).trim())
    .map((r) => `${str(r.symbol).trim() || '?'} ${str(r.count).trim() || '?'} × ${str(r.mass).trim() || '?'}`).join('; ');
}

export const def = {
  type: 'molarmass',
  label: 'Molar mass',
  shortLabel: 'Molar mass',
  group: 'Chemistry',

  normalize(q) {
    q.formula = str(q.formula).trim();
    if (typeof q.answer === 'string' && q.answer.trim() !== '' && Number.isFinite(Number(q.answer))) q.answer = Number(q.answer);
    if (q.answer === '' || q.answer === null) delete q.answer;
    q.tolerance = q.tolerance === undefined || q.tolerance === null || q.tolerance === '' ? 0.05 : Number(q.tolerance);
    q.toleranceType = q.toleranceType === 'percent' ? 'percent' : 'absolute';
    q.showWork = q.showWork === undefined || q.showWork === null ? true : Boolean(q.showWork);
  },

  validate(q, where, errors) {
    if (!q.formula) errors.push(`${where}: formula is required (for example "Ca(OH)2").`);
    else if (!Number.isFinite(molarMass(q.formula))) errors.push(`${where}: the formula "${q.formula}" could not be read (check the element symbols).`);
    if (q.answer !== undefined && (typeof q.answer !== 'number' || !Number.isFinite(q.answer) || q.answer <= 0)) errors.push(`${where}: answer must be a positive number (or leave it out to use the computed molar mass).`);
    if (typeof q.tolerance !== 'number' || !Number.isFinite(q.tolerance) || q.tolerance < 0) errors.push(`${where}: tolerance must be a number that is 0 or greater.`);
    if (q.toleranceType !== 'absolute' && q.toleranceType !== 'percent') errors.push(`${where}: toleranceType must be "absolute" or "percent".`);
  },

  blank(base) {
    return { ...base, text: 'Calculate the molar mass of the compound.', formula: 'Ca(OH)2', tolerance: 0.05, toleranceType: 'absolute', showWork: true };
  },

  isAnswered: (q, answer) => isObj(answer) && (str(answer.value).trim() !== '' || workText(answer) !== ''),

  score(q, answer) {
    if (!isObj(answer)) return { fraction: 0, full: false };
    const x = parseMolarMass(answer.value);
    const ok = withinTolerance(x, molarMassKey(q), q.tolerance, q.toleranceType);
    return { fraction: ok ? 1 : 0, full: ok };
  },

  answerText(q, answer) {
    const a = isObj(answer) ? answer : {};
    const value = str(a.value).trim();
    const work = workText(a);
    return `${value ? `${value} g/mol` : DASH}${work ? ` (work: ${work})` : ''}`;
  },

  keyText(q) {
    const key = molarMassKey(q);
    return Number.isFinite(key) ? `${key.toFixed(2)} g/mol` : DASH;
  },

  correctAnswer: (q) => molarMassKey(q),
};

registerType(def);
export { molarMassBreakdown };
export default def;
