// `ionbuilder` question type (V5-07, S11b): atom and ion builder. Pure definition, no DOM.
//   mode 'particles': given symbol, mass number and charge; student sets protons, neutrons, electrons (steppers).
//   mode 'symbol':    given protons, neutrons, electrons; student writes the symbol, mass number and charge.
//   { type: 'ionbuilder', mode: 'particles'|'symbol',
//     element: 'Cl', massNumber: 35, charge: -1,                 (mode 'particles')
//     p: 17, n: 18, e: 18,                                       (mode 'symbol')
//     randomize?: { elements: ['Na','Mg','Cl'], charges: [-2,-1,1,2] } }  picks one element and charge per student.
//   Answer: { p, n, e }   (mode 'particles')   or   { symbol, massNumber, charge }   (mode 'symbol')
//   Score: exact per field; fraction = fields right / fields (partialCredit: false gives 0 unless all right).
import { registerType } from './registry.js';
import { addInstantiateStep } from '../instantiate-steps.js';
import { ELEMENTS } from '../elements.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === undefined || v === null ? '' : String(v));
export const MODES = ['particles', 'symbol'];
export const MODE_LABELS = { particles: 'Given symbol, mass and charge: set the particles', symbol: 'Given particles: write the symbol, mass and charge' };
export const CHARGE_MIN = -4;
export const CHARGE_MAX = 4;
const DASH = '—';
const MINUS = '−';

/** Element record by symbol (case-insensitive), or null. */
export function elementOf(symbol) {
  const s = str(symbol).trim().toLowerCase();
  return s ? ELEMENTS.find((e) => e.symbol.toLowerCase() === s) || null : null;
}
/** Symbol in standard case: "cl" and " CL " both give "Cl". */
export const normSymbol = (s) => { const t = str(s).trim().toLowerCase(); return t ? t[0].toUpperCase() + t.slice(1) : ''; };
/** Typical mass number for an element: its average mass rounded (2 × Z when the mass is not a number). */
export function typicalMass(el) {
  const m = Math.round(parseFloat(String(el.mass).replace(/[()]/g, '')));
  return Number.isFinite(m) && m >= el.number ? m : 2 * el.number;
}
/** Signed charge text: "+2", "−1", "0". */
export const chargeText = (c) => (c > 0 ? `+${c}` : c < 0 ? `${MINUS}${Math.abs(c)}` : '0');
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
const toInt = (v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
};

/** The particle key for mode 'particles': p = Z, n = A - Z, e = Z - charge. */
export function particlesKey(q) {
  const el = elementOf(q.element);
  if (!el) return null;
  const A = Number(q.massNumber);
  const c = Number(q.charge) || 0;
  return { p: el.number, n: A - el.number, e: el.number - c };
}
/** The symbol key for mode 'symbol': derived from the given particles. */
export function symbolKey(q) {
  const p = Number(q.p), n = Number(q.n), e = Number(q.e);
  const el = ELEMENTS.find((x) => x.number === p);
  if (!el) return null;
  return { symbol: el.symbol, massNumber: p + n, charge: p - e };
}
/** The key for the current mode, or null when the question is incomplete. */
export const keyOf = (q) => (q.mode === 'symbol' ? symbolKey(q) : particlesKey(q));

/** Field-by-field comparison. Returns { ok: { field: bool }, total }. */
function fieldMatches(q, a) {
  const key = keyOf(q);
  const x = isObj(a) ? a : {};
  if (!key) return { ok: {}, total: 3 };
  if (q.mode === 'symbol') {
    return { ok: {
      symbol: normSymbol(x.symbol) === key.symbol,
      massNumber: toInt(x.massNumber) === key.massNumber,
      charge: toInt(x.charge) === key.charge,
    }, total: 3 };
  }
  return { ok: { p: toInt(x.p) === key.p, n: toInt(x.n) === key.n, e: toInt(x.e) === key.e }, total: 3 };
}

export const def = {
  type: 'ionbuilder',
  label: 'Atom or ion builder',
  shortLabel: 'Atom / ion builder',
  group: 'Chemistry',
  v5: true,

  normalize(q) {
    q.mode = MODES.includes(q.mode) ? q.mode : 'particles';
    q.element = normSymbol(q.element);
    const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));
    q.massNumber = num(q.massNumber);
    q.charge = num(q.charge);
    q.p = num(q.p); q.n = num(q.n); q.e = num(q.e);
    if (q.randomize !== undefined && !isObj(q.randomize)) delete q.randomize;
    if (isObj(q.randomize)) {
      q.randomize.elements = (Array.isArray(q.randomize.elements) ? q.randomize.elements : [])
        .map(normSymbol).filter((s) => elementOf(s));
      q.randomize.charges = (Array.isArray(q.randomize.charges) ? q.randomize.charges : [])
        .map((c) => Number(c)).filter(isInt);
    }
    q.partialCredit = q.partialCredit === undefined ? true : Boolean(q.partialCredit);
  },

  validate(q, where, errors) {
    if (!MODES.includes(q.mode)) errors.push(`${where}: choose a mode.`);
    if (q.mode === 'symbol') {
      if (!Number.isInteger(q.p) || q.p < 1 || q.p > ELEMENTS.length) errors.push(`${where}: protons must be a whole number from 1 to ${ELEMENTS.length}.`);
      if (!Number.isInteger(q.n) || q.n < 0) errors.push(`${where}: neutrons must be a whole number, 0 or more.`);
      if (!Number.isInteger(q.e) || q.e < 0) errors.push(`${where}: electrons must be a whole number, 0 or more.`);
      if (Number.isInteger(q.p) && Number.isInteger(q.e) && (q.p - q.e < CHARGE_MIN || q.p - q.e > CHARGE_MAX)) errors.push(`${where}: the charge must be from ${CHARGE_MIN} to +${CHARGE_MAX}.`);
    } else {
      const el = elementOf(q.element);
      if (!el) errors.push(`${where}: choose an element from the periodic table.`);
      if (!Number.isInteger(q.massNumber) || (el && q.massNumber < el.number)) errors.push(`${where}: the mass number must be a whole number, at least the number of protons.`);
      if (!Number.isInteger(q.charge) || q.charge < CHARGE_MIN || q.charge > CHARGE_MAX) errors.push(`${where}: the charge must be a whole number from ${CHARGE_MIN} to +${CHARGE_MAX}.`);
      else if (el && q.charge > el.number) errors.push(`${where}: the charge cannot be above +${el.number} for ${el.symbol}.`);
    }
    if (isObj(q.randomize)) {
      if (!q.randomize.elements.length) errors.push(`${where}: list at least one element to change for each student.`);
      if (!q.randomize.charges.length) errors.push(`${where}: list at least one charge to change for each student.`);
    }
  },

  blank(base) {
    return { ...base, text: 'Chloride ion has a mass number of 35 and a charge of −1. How many protons, neutrons and electrons does it have?',
      mode: 'particles', element: 'Cl', massNumber: 35, charge: -1, partialCredit: true };
  },

  isAnswered(q, a) {
    if (!isObj(a)) return false;
    if (q.mode === 'symbol') return str(a.symbol).trim() !== '' || (a.massNumber !== undefined && a.massNumber !== '') || (a.charge !== undefined && a.charge !== '');
    return ['p', 'n', 'e'].some((k) => a[k] !== undefined && a[k] !== '');
  },

  score(q, a) {
    if (!keyOf(q)) return { fraction: 0, full: false };
    const { ok, total } = fieldMatches(q, a);
    const right = Object.values(ok).filter(Boolean).length;
    if (right === total) return { fraction: 1, full: true };
    return { fraction: q.partialCredit === false ? 0 : right / total, full: false };
  },

  answerText(q, a) {
    const x = isObj(a) ? a : {};
    if (q.mode === 'symbol') {
      const sym = normSymbol(x.symbol) || DASH;
      const mass = x.massNumber === undefined || x.massNumber === '' ? DASH : String(x.massNumber);
      const ch = x.charge === undefined || x.charge === '' ? DASH : chargeText(Number(x.charge));
      return `${sym}, mass ${mass}, charge ${ch}`;
    }
    const f = (v) => (v === undefined || v === '' ? DASH : String(v));
    return `${f(x.p)} protons, ${f(x.n)} neutrons, ${f(x.e)} electrons`;
  },

  keyText(q) {
    const k = keyOf(q);
    if (!k) return DASH;
    if (q.mode === 'symbol') return `${k.symbol}, mass ${k.massNumber}, charge ${chargeText(k.charge)}`;
    return `${k.p} protons, ${k.n} neutrons, ${k.e} electrons`;
  },

  correctAnswer: (q) => keyOf(q) || {},
};

/** Random element and charge from the teacher's lists; pure given `rand`. Returns the fields to set, or null. */
export function drawIon(q, rand) {
  const r = isObj(q.randomize) ? q.randomize : {};
  const elements = (r.elements || []).map(elementOf).filter(Boolean);
  if (!elements.length) return null;
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
  const el = pick(elements);
  const charges = (r.charges || []).filter((c) => isInt(c) && c >= CHARGE_MIN && c <= CHARGE_MAX && c <= el.number);
  if (!charges.length) return null;
  const charge = pick(charges);
  const A = typicalMass(el);
  if (q.mode === 'symbol') return { p: el.number, n: A - el.number, e: el.number - charge };
  return { element: el.symbol, massNumber: A, charge };
}

addInstantiateStep('ionbuilder', (test, { rand }) => {
  for (const q of (test && test.questions) || []) {
    if (!q || q.type !== 'ionbuilder' || !isObj(q.randomize) || q.drawn) continue;
    try {
      const next = drawIon(q, rand);
      if (!next) continue;
      Object.assign(q, next);
      q.drawn = { ...next };
    } catch (e) { console.error(`[ionbuilder:${q.id}]`, e); }
  }
});

registerType(def);
export default def;
