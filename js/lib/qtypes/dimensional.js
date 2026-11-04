// `dimensional` question type (V4-03): dimensional analysis. Pure definition, no DOM.
//   Question: { given: {value, unit}, answer: {value, unit}, tolerance, toleranceType: 'absolute'|'percent',
//               factors?: [{ top: {value, unit}, bottom: {value, unit} }]  (teacher's reference chain),
//               chainCredit: 0..1 (default 0) }
//   Answer:   { factors: [{ top: {value, unit}, bottom: {value, unit} }], value: '', unit: '' }  (all values are typed text)
//
// Units are compared by "unit tokens": a unit string is split on '/', '·', '*' and spaces; everything after the first
// '/' is in the denominator; a token may carry an integer exponent ("m2", "m^2", "L^-1"). "g/mol" and "g mol^-1" are the
// same unit. Symbols are case-sensitive ("mL" is not "ml"). Cancellation is by token: a unit written in a numerator
// cancels one occurrence of the same unit written in a denominator anywhere in the chain (the given quantity counts as
// a numerator).
import { splitNumber } from './sigfigs.js';
import { registerType } from './registry.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === undefined || v === null ? '' : String(v));

/** Number from a number or typed text ("1.5", "-3", "6.02e23", "6.02 x 10^23", "1,200"); NaN otherwise. Never throws. */
export function parseNum(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  if (typeof input !== 'string') return NaN;
  const s = input.trim().replace(/[−–]/g, '-');
  if (!s) return NaN;
  const sign = s[0] === '-' ? -1 : 1;
  const parts = splitNumber(s.replace(/^[+-]/, ''));
  if (!parts) return NaN;
  const x = sign * Number(parts.mantissa) * 10 ** parts.exponent;
  return Number.isFinite(x) ? x : NaN;
}

/** True when `x` is within the question's tolerance of `key` (relative 1e-9 slack like the numeric type). */
export function withinTolerance(x, key, tolerance, toleranceType) {
  if (!Number.isFinite(x) || !Number.isFinite(key)) return false;
  const tol = Number(tolerance) > 0 ? Number(tolerance) : 0;
  const allowed = (toleranceType === 'percent' ? Math.abs(key) * tol / 100 : tol) + 1e-9 * Math.abs(key);
  return Math.abs(x - key) <= allowed;
}

const norm = (u) => str(u).trim().replace(/[·*]/g, ' ').replace(/\s*\/\s*/g, '/');

/** "g/mol" -> [{ name: 'g', exp: 1 }, { name: 'mol', exp: -1 }]; empty unit -> []. Exponents of repeated tokens are kept separate. */
export function unitTokens(unit) {
  const out = [];
  const [num, ...rest] = norm(unit).split('/');
  const sides = [[num, 1], [rest.join(' '), -1]];
  for (const [text, side] of sides) {
    for (const raw of text.split(/\s+/).filter(Boolean)) {
      const m = /^(.*?)(?:\^?\(?(-?\d+)\)?)?$/.exec(raw);
      const name = m && m[1] ? m[1] : raw;
      const exp = m && m[1] && m[2] ? Number(m[2]) : 1;
      out.push({ name, exp: exp * side });
    }
  }
  return out;
}

/** Net exponent per unit name, zeros removed: "g mol^-1" -> { g: 1, mol: -1 }. */
export function unitMap(unit) {
  const map = {};
  for (const t of unitTokens(unit)) map[t.name] = (map[t.name] || 0) + t.exp;
  for (const k of Object.keys(map)) if (map[k] === 0) delete map[k];
  return map;
}

const sameMap = (a, b) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

/** Case-sensitive, whitespace-trimmed unit equality that also accepts equivalent spellings ("g/mol" = "g mol^-1"). */
export function unitsMatch(a, b) {
  const x = str(a).trim();
  const y = str(b).trim();
  if (!x || !y) return false;
  return x === y || sameMap(unitMap(x), unitMap(y));
}

const qty = (v) => (isObj(v) ? { value: v.value, unit: str(v.unit) } : { value: '', unit: '' });
const factorList = (list) => (Array.isArray(list) ? list.filter(isObj).map((f) => ({ top: qty(f.top), bottom: qty(f.bottom) })) : []);

/** Net unit of "given × factor × factor …" as a unit map. */
export function chainUnitMap(givenUnit, factors) {
  const map = unitMap(givenUnit);
  const add = (unit, sign) => { for (const t of unitTokens(unit)) map[t.name] = (map[t.name] || 0) + sign * t.exp; };
  for (const f of factorList(factors)) { add(f.top.unit, 1); add(f.bottom.unit, -1); }
  for (const k of Object.keys(map)) if (map[k] === 0) delete map[k];
  return map;
}

/** Numeric product given × Π(top / bottom); NaN when any entry is not a number (or a bottom is 0). */
export function chainProduct(givenValue, factors) {
  let x = parseNum(givenValue);
  for (const f of factorList(factors)) {
    const t = parseNum(f.top.value);
    const b = parseNum(f.bottom.value);
    if (!Number.isFinite(t) || !Number.isFinite(b) || b === 0) return NaN;
    x *= t / b;
  }
  return x;
}

/**
 * Which unit tokens cancel. Returns [{ where: 'given'|'top'|'bottom', factor: index|-1, name, cancelled }] in display
 * order (given, then each factor's numerator and denominator). Each unit written as a numerator cancels one of the same
 * unit written as a denominator.
 */
export function cancellation(givenUnit, factors) {
  const items = [];
  const push = (where, factor, unit, sign) => {
    for (const t of unitTokens(unit)) {
      const times = Math.abs(t.exp);
      const onTop = t.exp * sign > 0;
      for (let i = 0; i < times; i++) items.push({ where: onTop ? (where === 'given' ? 'given' : 'top') : 'bottom', factor, name: t.name, onTop, cancelled: false });
    }
  };
  push('given', -1, givenUnit, 1);
  factorList(factors).forEach((f, i) => { push('top', i, f.top.unit, 1); push('bottom', i, f.bottom.unit, -1); });
  const names = new Set(items.map((x) => x.name));
  for (const name of names) {
    const tops = items.filter((x) => x.name === name && x.onTop);
    const bottoms = items.filter((x) => x.name === name && !x.onTop);
    for (let i = 0; i < Math.min(tops.length, bottoms.length); i++) { tops[i].cancelled = true; bottoms[i].cancelled = true; }
  }
  return items;
}

const fmt = (v) => str(typeof v === 'number' ? Number(v.toPrecision(10)) : v).trim();
const qtyText = (x) => `${fmt(x.value)} ${x.unit}`.trim();

/** "58.44 g × (1 mol / 58.44 g) = 1 mol" style text of a chain. */
export function chainText(given, factors, value, unit) {
  const parts = [qtyText(qty(given))];
  for (const f of factorList(factors)) parts.push(`(${qtyText(f.top)} / ${qtyText(f.bottom)})`);
  const res = `${fmt(value)} ${str(unit).trim()}`.trim();
  return `${parts.join(' × ')}${res ? ` = ${res}` : ''}`;
}

function score(q, answer) {
  if (!isObj(answer)) return { fraction: 0, full: false };
  const key = parseNum(q.answer && q.answer.value);
  const tolOk = (x) => withinTolerance(x, key, q.tolerance, q.toleranceType);
  if (tolOk(parseNum(answer.value)) && unitsMatch(answer.unit, q.answer && q.answer.unit)) return { fraction: 1, full: true };
  const credit = Number(q.chainCredit);
  const factors = factorList(answer.factors);
  if (credit > 0 && factors.length) {
    const unitOk = sameMap(chainUnitMap(q.given && q.given.unit, factors), unitMap(q.answer && q.answer.unit));
    if (unitOk && tolOk(chainProduct(q.given && q.given.value, factors))) return { fraction: Math.min(1, credit), full: false };
  }
  return { fraction: 0, full: false };
}

function isAnswered(q, answer) {
  if (!isObj(answer)) return false;
  if (str(answer.value).trim() || str(answer.unit).trim()) return true;
  return factorList(answer.factors).some((f) => [f.top, f.bottom].some((p) => str(p.value).trim() || p.unit.trim()));
}

const def = {
  type: 'dimensional',
  label: 'Dimensional analysis',
  shortLabel: 'Dimensional',
  group: 'Chemistry',
  manual: false,
  normalize(q) {
    const num = (v) => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v === undefined || v === null ? '' : v);
    q.given = { value: num(isObj(q.given) ? q.given.value : ''), unit: str(isObj(q.given) ? q.given.unit : '').trim() };
    q.answer = { value: num(isObj(q.answer) ? q.answer.value : ''), unit: str(isObj(q.answer) ? q.answer.unit : '').trim() };
    q.tolerance = q.tolerance === undefined || q.tolerance === null || q.tolerance === '' ? 0 : Number(q.tolerance);
    q.toleranceType = q.toleranceType === 'absolute' || q.toleranceType === 'percent' ? q.toleranceType : 'percent';
    q.chainCredit = q.chainCredit === undefined || q.chainCredit === null || q.chainCredit === '' ? 0 : Number(q.chainCredit);
    q.factors = factorList(q.factors).map((f) => ({
      top: { value: num(f.top.value), unit: f.top.unit.trim() }, bottom: { value: num(f.bottom.value), unit: f.bottom.unit.trim() },
    }));
  },
  validate(q, where, errors) {
    const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
    if (!isNum(q.given && q.given.value)) errors.push(`${where}: given.value must be a number.`);
    if (!str(q.given && q.given.unit).trim()) errors.push(`${where}: given.unit is required.`);
    if (!isNum(q.answer && q.answer.value)) errors.push(`${where}: answer.value must be a number.`);
    if (!str(q.answer && q.answer.unit).trim()) errors.push(`${where}: answer.unit is required.`);
    if (!Number.isFinite(q.tolerance) || q.tolerance < 0) errors.push(`${where}: tolerance must be a number that is 0 or greater.`);
    if (q.toleranceType !== 'absolute' && q.toleranceType !== 'percent') errors.push(`${where}: toleranceType must be "absolute" or "percent".`);
    if (!Number.isFinite(q.chainCredit) || q.chainCredit < 0 || q.chainCredit > 1) errors.push(`${where}: chainCredit must be between 0 and 1.`);
    let factorsOk = true;
    (q.factors || []).forEach((f, i) => {
      for (const side of ['top', 'bottom']) {
        if (!isNum(f[side].value) || !str(f[side].unit).trim()) { errors.push(`${where}: factor ${i + 1} ${side} needs a number and a unit.`); factorsOk = false; }
      }
      if (isNum(f.bottom.value) && f.bottom.value === 0) { errors.push(`${where}: factor ${i + 1} bottom value cannot be 0.`); factorsOk = false; }
    });
    if (q.chainCredit > 0 && !(q.factors || []).length) errors.push(`${where}: chainCredit needs a reference chain (factors).`);
    if (factorsOk && (q.factors || []).length && isNum(q.given.value) && isNum(q.answer.value)) {
      if (!sameMap(chainUnitMap(q.given.unit, q.factors), unitMap(q.answer.unit))) errors.push(`${where}: the reference factors do not convert ${q.given.unit} to ${q.answer.unit}.`);
      else {
        const p = chainProduct(q.given.value, q.factors);
        const slack = Math.max(Math.abs(q.answer.value) * 0.05, q.toleranceType === 'percent' ? Math.abs(q.answer.value) * q.tolerance / 100 : q.tolerance);
        if (!(Math.abs(p - q.answer.value) <= slack + 1e-9)) errors.push(`${where}: the reference factors give ${fmt(p)}, not ${fmt(q.answer.value)}.`);
      }
    }
  },
  blank(base) {
    return {
      ...base, text: 'Convert the mass of sodium chloride to moles.', given: { value: 117, unit: 'g' }, answer: { value: 2, unit: 'mol' },
      tolerance: 1, toleranceType: 'percent', chainCredit: 0.5,
      factors: [{ top: { value: 1, unit: 'mol' }, bottom: { value: 58.5, unit: 'g' } }],
    };
  },
  isAnswered,
  score,
  answerText(q, answer) {
    if (!isObj(answer)) return '';
    return chainText(q.given, answer.factors, answer.value, answer.unit);
  },
  keyText(q) {
    const a = q.answer || {};
    return q.factors && q.factors.length ? chainText(q.given, q.factors, a.value, a.unit) : qtyText(qty(a));
  },
  correctAnswer(q) {
    return { factors: factorList(q.factors), value: q.answer && q.answer.value, unit: q.answer && q.answer.unit };
  },
};

registerType(def);
export default def;
