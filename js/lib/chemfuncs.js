// Built-in chemistry functions. Pure, no DOM. Used by the algorithmic answer formulas
// (js/lib/algorithmic.js), the molar-mass question type and the builder previews.
//
//   parseFormulaCounts("Ca(OH)2") -> { Ca: 1, O: 2, H: 2 }      null when the formula cannot be read
//   molarMass("CuSO4.5H2O") -> 249.69   (g/mol, from the reference-sheet masses in js/lib/elements.js)
//   molarMassBreakdown(f) -> [{ symbol, count, mass, total }] | null
//   convert(value, 'mL', 'L')         units: g kg mg ug · L mL dm3 cm3 m3 · atm kPa Pa mmHg torr bar · K C F · J kJ cal kcal · m cm mm km nm
//   idealGas*, dilution*, pH* ...      see CHEM_FUNCS (the whitelist the formula parser may call)
import { ELEMENTS } from './elements.js';
import { normalizeFormula } from './formula.js';

const MASS = new Map(ELEMENTS.map((e) => [e.symbol, Number(String(e.mass).replace(/[()]/g, ''))]));

export const GAS_CONSTANT = 0.082057; // L·atm / (mol·K)
export const AVOGADRO = 6.022e23;
export const KW = 1e-14;

const round = (x, places = 6) => (Number.isFinite(x) ? Math.round(x * 10 ** places) / 10 ** places : x);

/** Symbol at the start of `s` (longest known symbol of 1-3 letters, case-exact), or ''. */
function symbolAt(s, i) {
  const m = /^[A-Z][a-z]{0,2}/.exec(s.slice(i));
  if (!m) return '';
  for (let n = m[0].length; n >= 1; n--) if (MASS.has(m[0].slice(0, n))) return m[0].slice(0, n);
  return '';
}

function parseGroup(s, pos, closer) {
  const counts = {};
  const add = (sym, n) => { counts[sym] = (counts[sym] || 0) + n; };
  let i = pos;
  while (i < s.length) {
    const ch = s[i];
    if (ch === closer) return { counts, next: i };
    if (ch === '(' || ch === '[') {
      const inner = parseGroup(s, i + 1, ch === '(' ? ')' : ']');
      if (!inner) return null;
      i = inner.next + 1;
      const m = /^\d+/.exec(s.slice(i));
      const mult = m ? Number(m[0]) : 1;
      if (m) i += m[0].length;
      for (const [k, v] of Object.entries(inner.counts)) add(k, v * mult);
      continue;
    }
    if (ch === ')' || ch === ']') return null;
    const sym = symbolAt(s, i);
    if (!sym) return null;
    i += sym.length;
    const m = /^\d+/.exec(s.slice(i));
    if (m) i += m[0].length;
    add(sym, m ? Number(m[0]) : 1);
  }
  return closer ? null : { counts, next: i };
}

/** Atoms per element: handles parentheses, brackets, hydrates ("CuSO4.5H2O", "CuSO4·5H2O") and ignores a charge. */
export function parseFormulaCounts(formula) {
  let s = normalizeFormula(String(formula ?? '')).replace(/\^\d*[+-]/g, '');
  if (!s || s.length > 200) return null;
  const total = {};
  for (const part of s.split('.')) {
    if (!part) return null;
    const lead = /^(\d+)(?=[A-Z([])/.exec(part);
    const mult = lead ? Number(lead[1]) : 1;
    const body = lead ? part.slice(lead[1].length) : part;
    const g = parseGroup(body, 0, '');
    if (!g || !Object.keys(g.counts).length) return null;
    for (const [k, v] of Object.entries(g.counts)) total[k] = (total[k] || 0) + v * mult;
  }
  return total;
}

/** [{ symbol, count, mass, total }] for each element of the formula (in order of first appearance), or null. */
export function molarMassBreakdown(formula) {
  const counts = parseFormulaCounts(formula);
  if (!counts) return null;
  return Object.entries(counts).map(([symbol, count]) => ({ symbol, count, mass: MASS.get(symbol), total: round(count * MASS.get(symbol), 4) }));
}

/** Molar mass in g/mol (sum of the reference-sheet atomic masses); NaN when the formula cannot be read. */
export function molarMass(formula) {
  const rows = molarMassBreakdown(formula);
  return rows ? round(rows.reduce((s, r) => s + r.total, 0), 4) : NaN;
}

export const moles = (massG, formula) => Number(massG) / molarMass(formula);
export const massFromMoles = (mol, formula) => Number(mol) * molarMass(formula);
export const particles = (mol) => Number(mol) * AVOGADRO;

// ---- unit conversion -------------------------------------------------------------------------------------
const FACTORS = {
  mass: { g: 1, kg: 1000, mg: 1e-3, ug: 1e-6 },
  volume: { L: 1, mL: 1e-3, dm3: 1, cm3: 1e-3, m3: 1000 },
  pressure: { atm: 1, kPa: 1 / 101.325, Pa: 1 / 101325, mmHg: 1 / 760, torr: 1 / 760, bar: 1 / 1.01325 },
  energy: { J: 1, kJ: 1000, cal: 4.184, kcal: 4184 },
  length: { m: 1, cm: 0.01, mm: 1e-3, km: 1000, nm: 1e-9, pm: 1e-12 },
};
const TEMP_TO_K = { K: (x) => x, C: (x) => x + 273.15, F: (x) => (x - 32) * 5 / 9 + 273.15 };
const TEMP_FROM_K = { K: (x) => x, C: (x) => x - 273.15, F: (x) => (x - 273.15) * 9 / 5 + 32 };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** Convert between two units of the same kind; throws on unknown or mismatched units. */
export function convert(value, from, to) {
  const x = Number(value);
  const a = String(from).trim().replace(/^°/, '');
  const b = String(to).trim().replace(/^°/, '');
  if (own(TEMP_TO_K, a) && own(TEMP_TO_K, b)) return TEMP_FROM_K[b](TEMP_TO_K[a](x));
  for (const table of Object.values(FACTORS)) {
    if (own(table, a) && own(table, b)) return x * table[a] / table[b];
  }
  throw new Error(`cannot convert ${a} to ${b}`);
}

// ---- gases (P atm, V L, n mol, T K) ------------------------------------------------------------------------
export const idealGasP = (n, T, V) => Number(n) * GAS_CONSTANT * Number(T) / Number(V);
export const idealGasV = (n, T, P) => Number(n) * GAS_CONSTANT * Number(T) / Number(P);
export const idealGasN = (P, V, T) => Number(P) * Number(V) / (GAS_CONSTANT * Number(T));
export const idealGasT = (P, V, n) => Number(P) * Number(V) / (Number(n) * GAS_CONSTANT);

// ---- solutions ---------------------------------------------------------------------------------------------
export const molarity = (mol, litres) => Number(mol) / Number(litres);
/** C1·V1 = C2·V2 solved for C2 / V2 / V1. */
export const dilutionC2 = (c1, v1, v2) => Number(c1) * Number(v1) / Number(v2);
export const dilutionV2 = (c1, v1, c2) => Number(c1) * Number(v1) / Number(c2);
export const dilutionV1 = (c2, v2, c1) => Number(c2) * Number(v2) / Number(c1);

// ---- pH ----------------------------------------------------------------------------------------------------
export const pH = (hConc) => -Math.log10(Number(hConc));
export const pOH = (ohConc) => -Math.log10(Number(ohConc));
export const hFromPH = (v) => 10 ** -Number(v);
export const ohFromPH = (v) => 10 ** -(14 - Number(v));
/** pH of a strong monoprotic acid of concentration c (mol/L), ignoring water. */
export const pHStrongAcid = (c) => -Math.log10(Number(c));
/** pH of a strong base of concentration c (mol/L). */
export const pHStrongBase = (c) => 14 + Math.log10(Number(c));
/** pH of a weak monoprotic acid (concentration c, constant Ka): exact quadratic solution. */
export function pHWeakAcid(c, Ka) {
  const k = Number(Ka);
  const x = (-k + Math.sqrt(k * k + 4 * k * Number(c))) / 2;
  return -Math.log10(x);
}
/** pH of a weak base (concentration c, constant Kb). */
export function pHWeakBase(c, Kb) {
  const k = Number(Kb);
  const x = (-k + Math.sqrt(k * k + 4 * k * Number(c))) / 2;
  return 14 + Math.log10(x);
}

// ---- plain math the formulas may use ------------------------------------------------------------------------
const num = (v) => Number(v);

/** Functions the answer-formula parser may call, by name. Nothing else is callable. */
export const CHEM_FUNCS = Object.freeze({
  molarMass, moles, massFromMoles, particles, convert, molarity,
  idealGasP, idealGasV, idealGasN, idealGasT,
  dilutionC2, dilutionV2, dilutionV1,
  pH, pOH, hFromPH, ohFromPH, pHStrongAcid, pHStrongBase, pHWeakAcid, pHWeakBase,
  sqrt: (x) => Math.sqrt(num(x)), abs: (x) => Math.abs(num(x)), exp: (x) => Math.exp(num(x)),
  ln: (x) => Math.log(num(x)), log: (x) => Math.log10(num(x)), log10: (x) => Math.log10(num(x)),
  pow: (x, y) => num(x) ** num(y),
  round: (x, d = 0) => { const p = 10 ** num(d); return Math.round(num(x) * p) / p; },
  min: (...a) => Math.min(...a.map(num)), max: (...a) => Math.max(...a.map(num)),
});

/** Constants the formulas may use (names are reserved: a variable cannot reuse them). */
export const CHEM_CONSTANTS = Object.freeze({ pi: Math.PI, NA: AVOGADRO, R: GAS_CONSTANT, Kw: KW });
