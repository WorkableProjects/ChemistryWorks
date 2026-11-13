// `estimate` question type: the student sets a slider (and may type the number) to estimate a quantity.
// Pure definition, no DOM.
//   { type: 'estimate', min: 0, max: 14, step: 0.1, answer: 7, tolerance: 0.5, toleranceType: 'absolute'|'percent', unit: 'pH' }
//   Answer: a number (text from the readout box is accepted and parsed).
import { registerType } from './registry.js';
import { parseNum, withinTolerance } from './dimensional.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => (v === undefined || v === null || v === '' ? v : Number.isFinite(Number(v)) ? Number(v) : v);
const DASH = '—';

/** Value shown to people: at most as many decimals as the step has. */
export function formatEstimate(q, x) {
  if (!Number.isFinite(x)) return DASH;
  const s = String(q && q.step > 0 ? q.step : 1);
  const decimals = Math.min(6, (s.split('.')[1] || '').length);
  return x.toFixed(decimals);
}

export const def = {
  type: 'estimate',
  label: 'Estimate on a slider',
  shortLabel: 'Estimate',
  group: 'Chemistry',

  normalize(q) {
    for (const k of ['min', 'max', 'step', 'answer', 'tolerance']) q[k] = num(q[k]);
    if (q.tolerance === undefined || q.tolerance === '') q.tolerance = 0;
    if (q.step === undefined || q.step === '') q.step = 1;
    q.toleranceType = q.toleranceType === 'percent' ? 'percent' : 'absolute';
    q.unit = q.unit === undefined || q.unit === null ? '' : String(q.unit);
  },

  validate(q, where, errors) {
    if (!isNum(q.min)) errors.push(`${where}: min must be a number.`);
    if (!isNum(q.max)) errors.push(`${where}: max must be a number.`);
    if (isNum(q.min) && isNum(q.max) && q.min >= q.max) errors.push(`${where}: min must be below max.`);
    if (!isNum(q.step) || q.step <= 0) errors.push(`${where}: step must be a number above 0.`);
    else if (isNum(q.min) && isNum(q.max) && q.step > q.max - q.min) errors.push(`${where}: step is larger than the range.`);
    if (!isNum(q.answer)) errors.push(`${where}: answer must be a number.`);
    else if (isNum(q.min) && isNum(q.max) && (q.answer < q.min || q.answer > q.max)) errors.push(`${where}: answer must lie between min and max.`);
    if (!isNum(q.tolerance) || q.tolerance < 0) errors.push(`${where}: tolerance must be a number that is 0 or greater.`);
    if (q.toleranceType !== 'absolute' && q.toleranceType !== 'percent') errors.push(`${where}: toleranceType must be "absolute" or "percent".`);
  },

  blank(base) {
    return { ...base, text: 'Estimate the pH of a 0.1 M solution of a strong acid.', min: 0, max: 14, step: 0.5, answer: 1, tolerance: 0.5, toleranceType: 'absolute', unit: '' };
  },

  isAnswered: (q, answer) => Number.isFinite(parseNum(answer)),

  score(q, answer) {
    const ok = withinTolerance(parseNum(answer), Number(q.answer), q.tolerance, q.toleranceType);
    return { fraction: ok ? 1 : 0, full: ok };
  },

  answerText(q, answer) {
    const x = parseNum(answer);
    return Number.isFinite(x) ? `${formatEstimate(q, x)}${q.unit ? ` ${q.unit}` : ''}` : DASH;
  },

  keyText: (q) => (isNum(q.answer) ? `${formatEstimate(q, q.answer)}${q.unit ? ` ${q.unit}` : ''} (± ${q.tolerance || 0}${q.toleranceType === 'percent' ? '%' : ''})` : DASH),

  correctAnswer: (q) => q.answer,
};

registerType(def);
export default def;
