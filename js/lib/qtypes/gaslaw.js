// `gaslaw` question type (V5-07, S12e): gas-law setup. Pure definition, no DOM.
//   The student picks the law, puts each given value into its slot of the formula, then solves for the unknown.
//   { type: 'gaslaw', law: 'combined', unknown: 'V2', unit: 'L',
//     knowns: { P1: { value: '1.20', unit: 'atm' }, V1: {...}, T1: {...}, P2: {...}, T2: {...} },   (every variable but `unknown`)
//     tolerance: 1,            relative %, default 1
//     sigFigs?: 3,             when set, the answer needs this many significant figures for full numeric credit
//     vary?: { P1: { min: 0.8, max: 2, step: 0.1 } } }   algorithmic: variables drawn per student (same format as
//       js/lib/algorithmic.js); "{P1}" in text and in known values is replaced by the draw.
//   Answer: { law, setup: { P1: 'P1', ..., V2: '?' }, value: '2.5' }   (setup: slot -> key of the known placed there, or '?')
//   Score: law 0.25, setup 0.25 (share of slots right), numeric answer 0.5 (half of it when sigFigs is set and wrong).
import { registerType } from './registry.js';
import { addInstantiateStep } from '../instantiate-steps.js';
import { drawVariables, substitute } from '../algorithmic.js';
import { GAS_CONSTANT } from '../chemfuncs.js';
import { splitNumber, countSigFigs } from './sigfigs.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === undefined || v === null ? '' : String(v));
const DASH = '—';
const SUB = { 1: '₁', 2: '₂' };
export const UNKNOWN = '?';
export const DEFAULT_TOLERANCE = 1;

const VAR_LABELS = {
  P: 'Pressure', P1: 'Initial pressure', P2: 'Final pressure',
  V: 'Volume', V1: 'Initial volume', V2: 'Final volume',
  T: 'Temperature', T1: 'Initial temperature', T2: 'Final temperature',
  n: 'Moles of gas', n1: 'Initial moles', n2: 'Final moles',
};
/** Each law: sides as { n: numerator variables, d: denominator variables, k: constant factor }. */
export const LAWS = {
  boyle: { label: 'Boyle’s law', left: { n: ['P1', 'V1'], d: [] }, right: { n: ['P2', 'V2'], d: [] } },
  charles: { label: 'Charles’s law', left: { n: ['V1'], d: ['T1'] }, right: { n: ['V2'], d: ['T2'] } },
  gaylussac: { label: 'Gay-Lussac’s law', left: { n: ['P1'], d: ['T1'] }, right: { n: ['P2'], d: ['T2'] } },
  combined: { label: 'Combined gas law', left: { n: ['P1', 'V1'], d: ['T1'] }, right: { n: ['P2', 'V2'], d: ['T2'] } },
  ideal: { label: 'Ideal gas law', left: { n: ['P', 'V'], d: [] }, right: { n: ['n', 'T'], d: [], k: GAS_CONSTANT } },
  avogadro: { label: 'Avogadro’s law', left: { n: ['V1'], d: ['n1'] }, right: { n: ['V2'], d: ['n2'] } },
};
export const LAW_IDS = Object.keys(LAWS);
export const lawLabel = (id) => (LAWS[id] ? LAWS[id].label : DASH);
export const varLabel = (v) => VAR_LABELS[v] || v;
/** "P1" -> "P₁". */
export const varSymbol = (v) => str(v).replace(/([12])$/, (d) => SUB[d]);
export const lawVars = (id) => (LAWS[id] ? [...LAWS[id].left.n, ...LAWS[id].left.d, ...LAWS[id].right.n, ...LAWS[id].right.d] : []);
/** The formula as text: "P₁V₁ / T₁ = P₂V₂ / T₂", "PV = nRT". */
export function formulaText(id) {
  const law = LAWS[id];
  if (!law) return '';
  const side = (s) => {
    const top = s.n.map(varSymbol);
    if (s.k) top.splice(1, 0, 'R');
    return top.join('') + (s.d.length ? ` / ${s.d.map(varSymbol).join('')}` : '');
  };
  return `${side(law.left)} = ${side(law.right)}`;
}

/** Numeric value of a number written as text (also 1.2e3 or 1.2 × 10³), or NaN. */
function numberOf(text) {
  const parts = splitNumber(str(text));
  if (!parts) return NaN;
  const v = Number(`${parts.mantissa}e${parts.exponent}`);
  return /^\s*[-−–]/.test(str(text)) ? -v : v;
}
const knownValue = (q, v) => (isObj(q.knowns) && isObj(q.knowns[v]) ? numberOf(q.knowns[v].value) : NaN);
const knownUnit = (q, v) => (isObj(q.knowns) && isObj(q.knowns[v]) ? str(q.knowns[v].unit).trim() : '');

/** Solve the law for `unknown` from the knowns of q. Returns a number or null. */
export function solve(q) {
  const law = LAWS[q.law];
  if (!law || !lawVars(q.law).includes(q.unknown)) return null;
  const onLeft = law.left.n.includes(q.unknown) || law.left.d.includes(q.unknown);
  const S = onLeft ? law.left : law.right;
  const O = onLeft ? law.right : law.left;
  const prod = (list) => list.reduce((a, v) => a * knownValue(q, v), 1);
  const other = ((O.k || 1) * prod(O.n)) / prod(O.d);
  const kS = S.k || 1;
  const x = S.n.includes(q.unknown)
    ? (other * prod(S.d)) / (kS * prod(S.n.filter((v) => v !== q.unknown)))
    : (kS * prod(S.n)) / (other * prod(S.d.filter((v) => v !== q.unknown)));
  return Number.isFinite(x) ? x : null;
}

/** The correct slot -> known mapping: every variable holds its own known, the unknown holds "?". */
export function setupKey(q) {
  const out = {};
  for (const v of lawVars(q.law)) out[v] = v === q.unknown ? UNKNOWN : v;
  return out;
}
const swapSub = (v) => v.replace(/([12])$/, (d) => (d === '1' ? '2' : '1'));
const sameKnown = (q, a, b) => a === b || (isObj(q.knowns) && isObj(q.knowns[a]) && isObj(q.knowns[b])
  && numberOf(q.knowns[a].value) === numberOf(q.knowns[b].value) && knownUnit(q, a) === knownUnit(q, b));

/** Slots right. Swapping state 1 and state 2 everywhere gives the same equation, so that reading counts too. */
export function setupRight(q, setup) {
  const x = isObj(setup) ? setup : {};
  const slots = lawVars(q.law);
  const reading = (want) => slots.filter((slot) => {
    const w = want(slot);
    const got = str(x[slot]);
    return w === UNKNOWN ? got === UNKNOWN : got !== UNKNOWN && got !== '' && sameKnown(q, got, w);
  }).length;
  const straight = reading((s) => (s === q.unknown ? UNKNOWN : s));
  const swappable = slots.some((s) => s !== swapSub(s)) && slots.includes(swapSub(str(q.unknown)));
  const swapped = swappable ? reading((s) => (s === swapSub(q.unknown) ? UNKNOWN : swapSub(s))) : 0;
  return { right: Math.max(straight, swapped), total: slots.length };
}

/** Numeric part: `value` is within tolerance; `sig` is true when the significant figures are fine (or not asked). */
export function checkValue(q, a) {
  const key = solve(q);
  const text = str(isObj(a) ? a.value : '').trim();
  if (key === null || !text) return { value: false, sig: false };
  const v = numberOf(text);
  const t = Number.isFinite(Number(q.tolerance)) && Number(q.tolerance) >= 0 ? Number(q.tolerance) : DEFAULT_TOLERANCE;
  const value = Number.isFinite(v) && Math.abs(v - key) <= Math.abs(key) * (t / 100) + 1e-12;
  const sf = Number(q.sigFigs);
  const sig = !(Number.isInteger(sf) && sf >= 1) || countSigFigs(text) === sf;
  return { value, sig };
}

export const def = {
  type: 'gaslaw',
  label: 'Gas-law setup',
  shortLabel: 'Gas law',
  group: 'Chemistry',
  v5: true,

  normalize(q) {
    q.law = LAWS[q.law] ? q.law : 'combined';
    q.unknown = lawVars(q.law).includes(q.unknown) ? q.unknown : '';
    const src = isObj(q.knowns) ? q.knowns : {};
    const knowns = {};
    for (const v of lawVars(q.law)) {
      if (v === q.unknown) continue;
      const k = isObj(src[v]) ? src[v] : {};
      knowns[v] = { value: str(k.value).trim(), unit: str(k.unit).trim() };
    }
    q.knowns = knowns;
    q.unit = str(q.unit).trim();
    q.tolerance = q.tolerance === undefined || q.tolerance === '' || q.tolerance === null ? DEFAULT_TOLERANCE : Number(q.tolerance);
    if (q.sigFigs === '' || q.sigFigs === null || q.sigFigs === undefined || q.sigFigs === 0) delete q.sigFigs; else q.sigFigs = Number(q.sigFigs);
    if (q.vary !== undefined && !isObj(q.vary)) delete q.vary;
  },

  validate(q, where, errors) {
    if (!LAWS[q.law]) { errors.push(`${where}: choose a gas law.`); return; }
    if (!q.unknown) errors.push(`${where}: choose which quantity the student solves for.`);
    const varied = isObj(q.vary) && Object.keys(q.vary).length > 0;
    for (const v of lawVars(q.law)) {
      if (v === q.unknown) continue;
      const k = isObj(q.knowns) && isObj(q.knowns[v]) ? q.knowns[v] : {};
      const text = str(k.value).trim();
      if (!text) { errors.push(`${where}: give a value for ${varLabel(v).toLowerCase()}.`); continue; }
      if (varied && /\{[A-Za-z_]\w*\}/.test(text)) continue;
      if (!Number.isFinite(numberOf(text))) errors.push(`${where}: the value for ${varLabel(v).toLowerCase()} must be a number.`);
    }
    if (!(Number.isFinite(q.tolerance) && q.tolerance >= 0)) errors.push(`${where}: the tolerance must be a percentage, 0 or more.`);
    if (q.sigFigs !== undefined && !(Number.isInteger(q.sigFigs) && q.sigFigs >= 1 && q.sigFigs <= 15)) errors.push(`${where}: significant figures must be a whole number from 1 to 15.`);
    if (varied) {
      try { drawVariables(q.vary, () => 0.5); } catch (e) { errors.push(`${where}: ${e.message}.`); }
    } else if (q.unknown && solve(q) === null) errors.push(`${where}: the answer cannot be worked out from these values.`);
  },

  blank(base) {
    return { ...base, text: 'A gas has a volume of 2.00 L at 1.00 atm and 300 K. What is its volume at 2.00 atm and 450 K?',
      law: 'combined', unknown: 'V2', unit: 'L', tolerance: DEFAULT_TOLERANCE,
      knowns: { P1: { value: '1.00', unit: 'atm' }, V1: { value: '2.00', unit: 'L' }, T1: { value: '300', unit: 'K' }, P2: { value: '2.00', unit: 'atm' }, T2: { value: '450', unit: 'K' } } };
  },

  isAnswered(q, a) {
    if (!isObj(a)) return false;
    return str(a.law) !== '' || str(a.value).trim() !== '' || (isObj(a.setup) && Object.values(a.setup).some((v) => str(v) !== ''));
  },

  score(q, a) {
    if (!LAWS[q.law] || solve(q) === null) return { fraction: 0, full: false };
    const x = isObj(a) ? a : {};
    const lawOk = x.law === q.law;
    const { right, total } = setupRight(q, x.setup);
    const { value, sig } = checkValue(q, x);
    const full = lawOk && right === total && value && sig;
    if (full) return { fraction: 1, full: true };
    const f = (lawOk ? 0.25 : 0) + 0.25 * (right / total) + (value ? (sig ? 0.5 : 0.25) : 0);
    return { fraction: Math.min(f, 0.99), full: false };
  },

  answerText(q, a) {
    const x = isObj(a) ? a : {};
    const value = str(x.value).trim();
    return `${lawLabel(x.law)}; ${value ? `${value} ${q.unit}`.trim() : DASH}`;
  },

  keyText(q) {
    const k = solve(q);
    if (k === null) return `${lawLabel(q.law)}; ${DASH}`;
    const sf = Number(q.sigFigs) >= 1 ? Number(q.sigFigs) : 4;
    return `${lawLabel(q.law)}; ${`${Number(k.toPrecision(sf))} ${q.unit}`.trim()}`;
  },

  correctAnswer: (q) => {
    const k = solve(q);
    return { law: q.law, setup: setupKey(q), value: k === null ? '' : String(Number(k.toPrecision(6))) };
  },
};

addInstantiateStep('gaslaw', (test, { rand }) => {
  for (const q of (test && test.questions) || []) {
    if (!q || q.type !== 'gaslaw' || !isObj(q.vary) || !Object.keys(q.vary).length || q.drawn) continue;
    try {
      const { values, texts } = drawVariables(q.vary, rand);
      const sub = (s) => substitute(s, texts);
      q.text = sub(q.text);
      if (q.explanation) q.explanation = sub(q.explanation);
      for (const k of Object.values(q.knowns || {})) if (isObj(k)) { k.value = sub(k.value); k.unit = sub(k.unit); }
      q.drawn = { ...values };
    } catch (e) { console.error(`[gaslaw:${q.id}]`, e); }
  }
});

registerType(def);
export default def;
