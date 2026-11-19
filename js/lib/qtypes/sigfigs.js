import { registerType } from './registry.js';
import { bool, isNum } from './shared.js';

// `sigfigs` (significant figures) with its counting helpers. Pure functions, no DOM.
//   countSigFigs("0.00450") -> 3     countSigFigs("4.50e-3") -> 3     countSigFigs("1500") -> 2 (ambiguous zeros)

const SUP_MAP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '+': '⁺' };

/** Split "4.50e-3" / "4.50 × 10^-3" into { mantissa: "4.50", exponent: -3 }; plain numbers have exponent 0. null if not a number. */
export function splitNumber(input) {
  if (typeof input === 'number') input = String(input);
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/[−–]/g, '-');
  if (!s) return null;
  s = s.replace(/\s*([x×*⋅·])\s*(?=10)/i, '$1').replace(/(10)\s*\^\s*/, '$1^');
  if (/\s/.test(s)) return null;
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, (run) => '^' + [...run].map((c) => SUP_MAP[c]).join(''));
  let mant = s;
  let exp = 0;
  const m = /^([+-]?[\d.,]+)(?:[x×*⋅·]10\^?|e)([+-]?\d+)$/i.exec(s);
  if (m) { mant = m[1]; exp = Number(m[2]); }
  mant = mant.replace(/^[+-]/, '');
  if (mant.includes(',')) {
    if (!/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(mant)) return null;
    mant = mant.replace(/,/g, '');
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(mant)) return null;
  return { mantissa: mant, exponent: exp };
}

/**
 * Number of significant figures in what the student typed, or null when it is not a number.
 * Leading zeros never count; zeros after a decimal point count; trailing zeros of an integer written without a
 * decimal point are ambiguous and are treated as not significant. An all-zero number counts as 1.
 */
export function countSigFigs(input) {
  const parts = splitNumber(input);
  if (!parts) return null;
  const { mantissa } = parts;
  const hasPoint = mantissa.includes('.');
  let digits = mantissa.replace('.', '').replace(/^0+/, '');
  if (!digits) return 1;
  if (!hasPoint) digits = digits.replace(/0+$/, '');
  return digits.length || 1;
}

/** Value rounded to `n` significant figures as text: 0.0045 -> "0.00450", 4500 (n=2) -> "4.5 × 10³". */
export function formatWithSigFigs(value, n) {
  const x = Number(value);
  const sf = Math.min(100, Math.max(1, Math.round(Number(n)) || 1));
  if (!Number.isFinite(x)) return String(value);
  const p = x.toPrecision(sf);
  if (!/e/i.test(p)) return p;
  const [mant, exp] = p.split(/e/i);
  const e = String(Number(exp));
  return `${mant} × 10${[...e].map((c) => SUPERSCRIPT[c] ?? c).join('')}`;
}

const answered = (answer) => (typeof answer === 'string' && answer.trim() !== '') || (typeof answer === 'number' && Number.isFinite(answer));

export const def = {
  type: 'sigfigs',
  label: 'Significant figures',
  shortLabel: 'Sig figs',
  group: 'Chemistry',
  manual: false,

  normalize(q) {
    if (typeof q.answer === 'string' && q.answer.trim() !== '' && Number.isFinite(Number(q.answer))) q.answer = Number(q.answer);
    if (typeof q.sigFigs === 'string' && q.sigFigs.trim() !== '' && Number.isFinite(Number(q.sigFigs))) q.sigFigs = Number(q.sigFigs);
    q.tolerance = q.tolerance === undefined || q.tolerance === null || q.tolerance === '' ? 0 : Number(q.tolerance);
    q.partialCredit = bool(q.partialCredit, true);
  },

  validate(q, where, errors) {
    if (!isNum(q.answer)) errors.push(`${where}: answer must be a number.`);
    if (!Number.isInteger(q.sigFigs) || q.sigFigs < 1 || q.sigFigs > 15) errors.push(`${where}: sigFigs must be a whole number from 1 to 15.`);
    if (q.tolerance !== undefined && (!isNum(q.tolerance) || q.tolerance < 0)) errors.push(`${where}: tolerance must be a number that is 0 or greater.`);
  },

  blank: (base) => ({ ...base, text: 'Write 0.00450 g in scientific notation with the correct number of significant figures.', answer: 0.0045, sigFigs: 3, tolerance: 0.000001, partialCredit: true }),

  isAnswered: (q, answer) => answered(answer),

  grade(q, answer, H) {
    const raw = typeof answer === 'number' ? String(answer) : answer;
    const x = H.parseNumber(raw);
    const key = Number(q.answer);
    if (Number.isNaN(x) || !Number.isFinite(key) || q.answer === null || q.answer === '' || typeof q.answer === 'boolean') return { fraction: 0, full: false };
    const tol = Number(q.tolerance) > 0 ? Number(q.tolerance) : 0;
    const valueOk = Math.abs(x - key) <= tol + 1e-9 * Math.abs(key);
    const sfOk = countSigFigs(raw) === Number(q.sigFigs);
    if (valueOk && sfOk) return { fraction: 1, full: true };
    if (q.partialCredit !== false && (valueOk || sfOk)) return { fraction: 0.5, full: false };
    return { fraction: 0, full: false };
  },

  format: (q, answer) => String(answer).trim(),

  keyText(q) {
    const n = Number(q.sigFigs);
    return Number.isFinite(Number(q.answer)) && q.answer !== null && q.answer !== '' ? `${formatWithSigFigs(q.answer, n)} (${n} significant ${n === 1 ? 'figure' : 'figures'})` : '—';
  },

  correctAnswer: (q) => q.answer,
};

registerType(def);
export default def;
