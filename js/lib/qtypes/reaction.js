// `reaction` question type: predict the products. Pure definition, no DOM.
//   Question: { reactants: 'AgNO3(aq) + NaCl(aq)', products: ['AgCl(s)', 'NaNO3(aq)'], requireStates, requireCoefficients, netIonic }
//   Answer:   the typed product side as text, e.g. "AgCl(s) + NaNO3(aq)" (anything before an arrow is ignored).
// Species are compared with formulasEqual (order-free). States ((s) (l) (g) (aq)) and coefficients are only checked when the
// question requires them. `netIonic` changes the wording the student sees (write the net ionic equation's product side, with
// charges like Ag^+) but not how it is graded.
import { formulasEqual } from '../formula.js';
import { registerType } from './registry.js';

const str = (v) => (v === undefined || v === null ? '' : String(v));
const STATES = ['s', 'l', 'g', 'aq'];

/** Split "2 H2O(l) + NaCl(aq)" into species texts. A "+" splits only between species (spaces around it, or ")+Letter"). */
function splitSpecies(text) {
  return str(text).split(/\s+\+\s+|(?<=\))\+(?=[\dA-Z(\[])/).map((s) => s.trim()).filter(Boolean);
}

/** One species: { coefficient: number|null, formula, state: 's'|'l'|'g'|'aq'|'' , text }. Never throws. */
export function parseSpecies(text) {
  let s = str(text).trim();
  let coefficient = null;
  const c = /^(\d+)\s*(?=[A-Z(\[])/.exec(s);
  if (c) { coefficient = Number(c[1]); s = s.slice(c[0].length); }
  let state = '';
  const st = /\s*\((s|l|g|aq)\)\s*$/i.exec(s);
  if (st) { state = st[1].toLowerCase(); s = s.slice(0, st.index); }
  return { coefficient, formula: s.trim(), state, text: str(text).trim() };
}

/** The product side from typed text: drops everything up to the last arrow (->, →, =, ⟶). */
export function productSide(text) {
  const parts = str(text).split(/->|→|⟶|⇒|=/);
  return parts[parts.length - 1];
}

/** Parse a typed equation side into species (empty entries dropped). */
export function parseSide(text) {
  return splitSpecies(productSide(text)).map(parseSpecies).filter((p) => p.formula);
}

const speciesMatch = (want, got, q) => {
  if (!formulasEqual(got.formula, want.formula)) return false;
  if (q.requireStates && got.state !== want.state) return false;
  if (q.requireCoefficients && (got.coefficient ?? 1) !== (want.coefficient ?? 1)) return false;
  return true;
};

function score(q, answer) {
  if (typeof answer !== 'string' || !answer.trim()) return { fraction: 0, full: false };
  const want = (q.products || []).map(parseSpecies);
  const got = parseSide(answer);
  if (!want.length || !got.length) return { fraction: 0, full: false };
  const used = new Set();
  let right = 0;
  for (const w of want) {
    const i = got.findIndex((g, idx) => !used.has(idx) && speciesMatch(w, g, q));
    if (i >= 0) { used.add(i); right++; }
  }
  // An extra is a typed species that is not one of the expected products at all; a right formula with a wrong state or
  // coefficient is only a missed product, not also an extra.
  const extras = got.filter((g, idx) => !used.has(idx) && !want.some((w) => formulasEqual(g.formula, w.formula))).length;
  if (right === want.length && extras === 0) return { fraction: 1, full: true };
  return { fraction: Math.max(0, (right - extras) / want.length), full: false };
}

const def = {
  type: 'reaction',
  label: 'Predict products',
  shortLabel: 'Predict products',
  group: 'Chemistry',
  manual: false,
  normalize(q) {
    q.reactants = str(q.reactants).trim();
    q.products = (Array.isArray(q.products) ? q.products : typeof q.products === 'string' ? splitSpecies(q.products) : []).map((p) => str(p).trim()).filter(Boolean);
    q.requireStates = q.requireStates === true;
    q.requireCoefficients = q.requireCoefficients === true;
    q.netIonic = q.netIonic === true;
  },
  validate(q, where, errors) {
    if (!q.reactants) errors.push(`${where}: reactants are required (e.g. "AgNO3(aq) + NaCl(aq)").`);
    if (!q.products.length) errors.push(`${where}: list at least one product (e.g. "AgCl(s)").`);
    q.products.forEach((p, i) => {
      const sp = parseSpecies(p);
      if (!sp.formula) errors.push(`${where}: product ${i + 1} has no formula.`);
      else if (q.requireStates && !sp.state) errors.push(`${where}: product ${i + 1} (${p}) needs a state, (s), (l), (g) or (aq), because states are required.`);
    });
    for (const k of ['requireStates', 'requireCoefficients', 'netIonic']) if (typeof q[k] !== 'boolean') errors.push(`${where}: ${k} must be true or false.`);
  },
  blank(base) {
    return {
      ...base, text: 'Predict the products of this double-displacement reaction.', reactants: 'AgNO3(aq) + NaCl(aq)',
      products: ['AgCl(s)', 'NaNO3(aq)'], requireStates: true, requireCoefficients: false, netIonic: false,
    };
  },
  isAnswered: (q, answer) => typeof answer === 'string' && answer.trim() !== '',
  score,
  answerText: (q, answer) => (typeof answer === 'string' ? answer.trim() : ''),
  keyText: (q) => (q.products || []).join(' + '),
  correctAnswer: (q) => (q.products || []).join(' + '),
};

registerType(def);
export { STATES };
export default def;
