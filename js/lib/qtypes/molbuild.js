// `molbuild` question type (V5-07, S12f): molecule builder. Pure definition, no DOM.
//   { type: 'molbuild', atoms: ['C','O','O'], bonds: [[0,1,2],[0,2,2]], extraAtoms?: ['H'] }
//   Target: atoms (symbols) and bonds [indexA, indexB, order 1..3] by 0-based position in `atoms`.
//   Answer: { atoms: ['O','C','O'], bonds: [[0,1,2],[1,2,2]] } built by the student, in any order and layout.
//   Score: formula match 0.5 + connectivity match 0.5 (same graph, element labels and bond orders, ignoring layout).
import { registerType } from './registry.js';
import { elementOf, normSymbol } from './ionbuilder.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const MAX_ATOMS = 12;
export const MAX_ORDER = 3;
const DASH = '—';
/** Usual number of bonds per atom, for the valence hint. */
export const VALENCE = { H: 1, Li: 1, Na: 1, K: 1, F: 1, Cl: 1, Br: 1, I: 1, Be: 2, Mg: 2, O: 2, S: 2, B: 3, Al: 3, N: 3, P: 3, C: 4, Si: 4 };
export const ORDER_MARK = { 1: '-', 2: '=', 3: '#' };
const DECOYS = ['H', 'C', 'N', 'O', 'Cl'];

const cleanAtoms = (v) => (Array.isArray(v) ? v : []).map(normSymbol).filter((s) => elementOf(s)).slice(0, MAX_ATOMS);
function cleanBonds(v, n) {
  const seen = new Set();
  const out = [];
  for (const b of Array.isArray(v) ? v : []) {
    if (!Array.isArray(b)) continue;
    let [i, j, o] = b.map(Number);
    if (!Number.isInteger(i) || !Number.isInteger(j) || i === j || i < 0 || j < 0 || i >= n || j >= n) continue;
    if (!Number.isInteger(o) || o < 1 || o > MAX_ORDER) o = 1;
    if (i > j) [i, j] = [j, i];
    const k = `${i}-${j}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([i, j, o]);
  }
  return out;
}

/** Parse "1=2, 1-3" (1-based atom numbers; - single, = double, # triple) into bond triples (0-based). */
export function parseBondText(text) {
  const out = [];
  for (const part of String(text || '').split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d+)([-=#])(\d+)$/.exec(part);
    if (m) out.push([Number(m[1]) - 1, Number(m[3]) - 1, m[2] === '=' ? 2 : m[2] === '#' ? 3 : 1]);
  }
  return out;
}
export const bondsToText = (bonds) => (bonds || []).map(([i, j, o]) => `${i + 1}${ORDER_MARK[o] || '-'}${j + 1}`).join(', ');

/** Symbol counts: { O: 1, H: 2 }. */
export function countAtoms(atoms) {
  const c = {};
  for (const s of atoms || []) c[s] = (c[s] || 0) + 1;
  return c;
}
/** Formula text, C then H first when carbon is present, otherwise alphabetical: "H2O", "CO2". */
export function formulaText(atoms) {
  const c = countAtoms(atoms);
  const hasC = c.C !== undefined;
  const rank = (s) => (hasC ? (s === 'C' ? 0 : s === 'H' ? 1 : 2) : 0);
  const syms = Object.keys(c).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return syms.map((s) => `${s}${c[s] > 1 ? c[s] : ''}`).join('');
}
export const sameFormula = (a, b) => {
  const x = countAtoms(a), y = countAtoms(b);
  const ks = Object.keys(x);
  return ks.length === Object.keys(y).length && ks.every((k) => x[k] === y[k]);
};

/** Same labelled graph (element and bond order), whatever the atom order. Backtracking; fine for up to 12 atoms. */
export function sameGraph(a, b) {
  if (a.atoms.length !== b.atoms.length || a.bonds.length !== b.bonds.length || !sameFormula(a.atoms, b.atoms)) return false;
  const n = a.atoms.length;
  const mat = (g) => { const m = Array.from({ length: n }, () => Array(n).fill(0)); for (const [i, j, o] of g.bonds) { m[i][j] = o; m[j][i] = o; } return m; };
  const A = mat(a), B = mat(b);
  const deg = (m, i) => m[i].reduce((s, o) => s + (o ? 1 : 0), 0);
  const map = Array(n).fill(-1);
  const used = Array(n).fill(false);
  const go = (i) => {
    if (i === n) return true;
    for (let t = 0; t < n; t++) {
      if (used[t] || a.atoms[i] !== b.atoms[t] || deg(A, i) !== deg(B, t)) continue;
      let ok = true;
      for (let k = 0; k < i && ok; k++) if (A[i][k] !== B[t][map[k]]) ok = false;
      if (!ok) continue;
      map[i] = t; used[t] = true;
      if (go(i + 1)) return true;
      used[t] = false; map[i] = -1;
    }
    return false;
  };
  return go(0);
}

/** The student's build as { atoms, bonds }, cleaned. */
export function toBuild(a) {
  const x = isObj(a) ? a : {};
  const atoms = cleanAtoms(x.atoms);
  return { atoms, bonds: cleanBonds(x.bonds, atoms.length) };
}
/** Valence hint per atom: { symbol, have, want, ok }. `want` is null for elements with no usual valence listed. */
export function valenceHints(build) {
  const have = Array(build.atoms.length).fill(0);
  for (const [i, j, o] of build.bonds) { have[i] += o; have[j] += o; }
  return build.atoms.map((symbol, i) => {
    const want = VALENCE[symbol] === undefined ? null : VALENCE[symbol];
    return { symbol, have: have[i], want, ok: want === null || have[i] === want };
  });
}
/** Atoms offered to the student: the target's elements, the teacher's extras, then decoys up to five. */
export function paletteFor(q) {
  const own = [...new Set(cleanAtoms(q.atoms))];
  const extra = [...new Set(cleanAtoms(q.extraAtoms))].filter((s) => !own.includes(s));
  const base = [...own, ...extra];
  const decoys = DECOYS.filter((s) => !base.includes(s)).slice(0, Math.max(0, 5 - base.length));
  return [...base, ...decoys];
}

export const keyOf = (q) => { const atoms = cleanAtoms(q.atoms); return atoms.length ? { atoms, bonds: cleanBonds(q.bonds, atoms.length) } : null; };
const describe = (g) => `${formulaText(g.atoms) || DASH}${g.bonds.length ? ` (${bondsToText(g.bonds)})` : ''}`;

export const def = {
  type: 'molbuild',
  label: 'Molecule builder',
  shortLabel: 'Molecule builder',
  group: 'Chemistry',
  v5: true,

  normalize(q) {
    q.atoms = cleanAtoms(q.atoms);
    q.bonds = cleanBonds(q.bonds, q.atoms.length);
    if (q.extraAtoms !== undefined) q.extraAtoms = cleanAtoms(q.extraAtoms);
  },

  validate(q, where, errors) {
    if (!q.atoms.length) { errors.push(`${where}: list the atoms of the molecule.`); return; }
    if (q.atoms.length > 1 && !q.bonds.length) errors.push(`${where}: add the bonds between the atoms.`);
  },

  blank(base) {
    return { ...base, text: 'Build a molecule of water. Add the atoms, then join them with bonds.',
      atoms: ['O', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1]] };
  },

  isAnswered(q, a) { return toBuild(a).atoms.length > 0; },

  score(q, a) {
    const key = keyOf(q);
    if (!key) return { fraction: 0, full: false };
    const got = toBuild(a);
    const formula = sameFormula(got.atoms, key.atoms);
    const graph = formula && sameGraph(got, key);
    const fraction = (formula ? 0.5 : 0) + (graph ? 0.5 : 0);
    return { fraction, full: fraction === 1 };
  },

  answerText(q, a) { const g = toBuild(a); return g.atoms.length ? describe(g) : DASH; },
  keyText(q) { const k = keyOf(q); return k ? describe(k) : DASH; },
  correctAnswer: (q) => keyOf(q) || {},
};

registerType(def);
export default def;
