// `nuclear` question type: nuclear notation. Pure definition, no DOM.
//   mode 'isotope':  { mode: 'isotope', isotope: { A, Z, symbol } }          answer { A, Z, symbol }
//   mode 'equation': { mode: 'equation', left: [particle], right: [particle] } answer { L0: {A,Z,symbol}, R1: … }
//   particle = { A, Z, symbol } | { name: 'alpha'|'beta'|'positron'|'gamma'|'neutron'|'proton' } | the name as a string;
//   add `missing: true` to a particle the student must fill in (keys are L<index> / R<index>, e.g. "R1").
import { ELEMENTS } from '../elements.js';
import { normalizeSymbol } from '../lewis.js';
import { registerType } from './registry.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === undefined || v === null ? '' : String(v));

/** Named particles: mass number, atomic (charge) number, canonical symbol and the spellings a student may type. */
export const PARTICLES = {
  alpha: { A: 4, Z: 2, symbol: 'He', accept: ['he', 'α', 'alpha', 'a'] },
  beta: { A: 0, Z: -1, symbol: 'e', accept: ['e', 'β', 'beta', 'e-', 'β-', 'electron'] },
  positron: { A: 0, Z: 1, symbol: 'e', accept: ['e', 'β+', 'e+', 'positron', 'β'] },
  gamma: { A: 0, Z: 0, symbol: 'γ', accept: ['γ', 'gamma', 'y'] },
  neutron: { A: 1, Z: 0, symbol: 'n', accept: ['n', 'neutron'] },
  proton: { A: 1, Z: 1, symbol: 'p', accept: ['p', 'h', 'proton'] },
};
export const PARTICLE_NAMES = Object.keys(PARTICLES);

const toInt = (v) => {
  if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
  const s = str(v).trim().replace(/[−–]/g, '-');
  return /^[+-]?\d+$/.test(s) ? Number(s) : NaN;
};

/** Expected particle: { A, Z, symbol, name?, missing }. Named particles fill in their own numbers. */
function normParticle(p) {
  if (typeof p === 'string') p = { name: p };
  if (!isObj(p)) return { A: '', Z: '', symbol: '', missing: false };
  const name = str(p.name || p.particle).trim().toLowerCase();
  const spec = PARTICLES[name];
  const out = {
    A: p.A === undefined && spec ? spec.A : p.A === undefined ? '' : toIntKeep(p.A),
    Z: p.Z === undefined && spec ? spec.Z : p.Z === undefined ? '' : toIntKeep(p.Z),
    symbol: str(p.symbol).trim() || (spec ? spec.symbol : ''),
    missing: p.missing === true,
  };
  if (spec) out.name = name;
  return out;
}
const toIntKeep = (v) => { const n = toInt(v); return Number.isNaN(n) ? v : n; };

/** Does the typed { A, Z, symbol } match the expected particle? Element symbols are case-normalised. */
export function particleMatches(expected, given) {
  if (!isObj(given) || !isObj(expected)) return false;
  if (toInt(given.A) !== toInt(expected.A) || toInt(given.Z) !== toInt(expected.Z)) return false;
  const typed = str(given.symbol).trim();
  if (!typed) return false;
  const spec = expected.name ? PARTICLES[expected.name] : null;
  if (spec) return spec.accept.includes(typed.toLowerCase());
  const want = normalizeSymbol(expected.symbol);
  if (want) return normalizeSymbol(typed) === want;
  return typed.toLowerCase() === str(expected.symbol).trim().toLowerCase();
}

/** Blank keys of an equation question: ["L0", "R1", …]. */
export function blankKeys(q) {
  const keys = [];
  ['left', 'right'].forEach((side) => (q[side] || []).forEach((p, i) => { if (p && p.missing) keys.push(`${side === 'left' ? 'L' : 'R'}${i}`); }));
  return keys;
}
export function particleAt(q, key) {
  const list = key[0] === 'L' ? q.left : q.right;
  return (list || [])[Number(key.slice(1))] || null;
}

/** "Mass number and charge: balanced / not balanced" for what the student has typed so far (null while incomplete). */
export function isConserved(q, answer) {
  if (!isObj(answer)) return null;
  const sum = (side, prefix) => {
    let A = 0; let Z = 0;
    for (let i = 0; i < (q[side] || []).length; i++) {
      const p = q[side][i];
      const src = p.missing ? (answer[`${prefix}${i}`] || {}) : p;
      const a = toInt(src.A); const z = toInt(src.Z);
      if (Number.isNaN(a) || Number.isNaN(z)) return null;
      A += a; Z += z;
    }
    return { A, Z };
  };
  const l = sum('left', 'L');
  const r = sum('right', 'R');
  if (!l || !r) return null;
  return l.A === r.A && l.Z === r.Z;
}

const blankAnswered = (b) => isObj(b) && ['A', 'Z', 'symbol'].some((k) => str(b[k]).trim() !== '');

function isAnswered(q, answer) {
  if (!isObj(answer)) return false;
  if (q.mode === 'equation') return Object.values(answer).some(blankAnswered);
  return blankAnswered(answer);
}

function score(q, answer) {
  if (!isObj(answer)) return { fraction: 0, full: false };
  if (q.mode === 'equation') {
    const keys = blankKeys(q);
    if (!keys.length) return { fraction: 0, full: false };
    const right = keys.filter((k) => particleMatches(particleAt(q, k), answer[k])).length;
    return { fraction: right / keys.length, full: right === keys.length };
  }
  const iso = q.isotope || {};
  const checks = [toInt(answer.A) === toInt(iso.A), toInt(answer.Z) === toInt(iso.Z), !!normalizeSymbol(answer.symbol) && normalizeSymbol(answer.symbol) === normalizeSymbol(iso.symbol)];
  const right = checks.filter(Boolean).length;
  return { fraction: right / 3, full: right === 3 };
}

/** "²³⁸₉₂U" style plain text for A/Z/symbol (uses "^A_Z X" form that reads aloud well: "238 92 U"). */
const notation = (p) => (p && p.symbol !== '' ? `${str(p.A)}/${str(p.Z)} ${str(p.symbol)}` : '—').trim();
const typedNotation = (b) => (blankAnswered(b) ? `${str(b.A).trim() || '?'}/${str(b.Z).trim() || '?'} ${str(b.symbol).trim() || '?'}` : '—');

function equationText(q, pick) {
  const side = (name, prefix) => (q[name] || []).map((p, i) => (p.missing ? pick(`${prefix}${i}`, p) : notation(p))).join(' + ');
  return `${side('left', 'L')} → ${side('right', 'R')}`;
}

const def = {
  type: 'nuclear',
  label: 'Nuclear notation',
  shortLabel: 'Nuclear',
  group: 'Chemistry',
  manual: false,
  normalize(q) {
    q.mode = q.mode === 'equation' ? 'equation' : 'isotope';
    if (q.mode === 'isotope') {
      const iso = isObj(q.isotope) ? q.isotope : {};
      q.isotope = { A: iso.A === undefined ? '' : toIntKeep(iso.A), Z: iso.Z === undefined ? '' : toIntKeep(iso.Z), symbol: normalizeSymbol(iso.symbol) || str(iso.symbol).trim() };
      delete q.left; delete q.right;
    } else {
      q.left = (Array.isArray(q.left) ? q.left : []).map(normParticle);
      q.right = (Array.isArray(q.right) ? q.right : []).map(normParticle);
      delete q.isotope;
    }
  },
  validate(q, where, errors) {
    const isInt = (v) => Number.isInteger(v);
    if (q.mode === 'isotope') {
      const { A, Z, symbol } = q.isotope || {};
      if (!isInt(A) || A < 1) errors.push(`${where}: isotope.A (mass number) must be a whole number of 1 or more.`);
      if (!isInt(Z) || Z < 1) errors.push(`${where}: isotope.Z (atomic number) must be a whole number of 1 or more.`);
      if (isInt(A) && isInt(Z) && Z > A) errors.push(`${where}: the atomic number cannot be larger than the mass number.`);
      const el = ELEMENTS.find((e) => e.symbol === symbol);
      if (!el) errors.push(`${where}: isotope.symbol must be an element symbol.`);
      else if (isInt(Z) && el.number !== Z) errors.push(`${where}: ${symbol} has atomic number ${el.number}, not ${Z}.`);
      return;
    }
    if (!q.left.length || !q.right.length) { errors.push(`${where}: the equation needs at least one particle on each side.`); return; }
    let ok = true;
    for (const side of ['left', 'right']) {
      q[side].forEach((p, i) => {
        if (!isInt(p.A) || !isInt(p.Z) || !p.symbol) { errors.push(`${where}: ${side} particle ${i + 1} needs A, Z and a symbol (or a name: ${PARTICLE_NAMES.join(', ')}).`); ok = false; }
      });
    }
    if (!blankKeys(q).length) errors.push(`${where}: mark at least one particle as missing.`);
    if (ok) {
      const tot = (list, k) => list.reduce((s, p) => s + p[k], 0);
      if (tot(q.left, 'A') !== tot(q.right, 'A')) errors.push(`${where}: mass numbers are not conserved in the equation.`);
      if (tot(q.left, 'Z') !== tot(q.right, 'Z')) errors.push(`${where}: atomic numbers are not conserved in the equation.`);
    }
  },
  blank(base) {
    return {
      ...base, text: 'Complete the alpha decay of uranium-238.', mode: 'equation',
      left: [{ A: 238, Z: 92, symbol: 'U' }],
      right: [{ A: 234, Z: 90, symbol: 'Th', missing: true }, { name: 'alpha' }],
    };
  },
  isAnswered,
  score,
  answerText(q, answer) {
    if (!isObj(answer)) return '';
    if (q.mode === 'equation') return equationText(q, (k) => typedNotation(answer[k]));
    return typedNotation(answer);
  },
  keyText(q) {
    return q.mode === 'equation' ? equationText(q, (k, p) => notation(p)) : notation(q.isotope);
  },
  correctAnswer(q) {
    if (q.mode !== 'equation') return { A: q.isotope.A, Z: q.isotope.Z, symbol: q.isotope.symbol };
    return Object.fromEntries(blankKeys(q).map((k) => { const p = particleAt(q, k); return [k, { A: p.A, Z: p.Z, symbol: p.symbol }]; }));
  },
};

registerType(def);
export default def;
