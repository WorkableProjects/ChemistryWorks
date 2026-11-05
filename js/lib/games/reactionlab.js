// Reaction Lab: balance equations (type the coefficients with the steppers, or the keyboard) and predict products at
// the highest level. A built-in reaction list, so it needs no test questions. Pure and deterministic for a given rand.

import { streakMultiplier } from '../game.js';

export const LAB_SECONDS = 90;
export const UNTIMED_REACTIONS = 8;
export const LEVEL_EVERY = 3; // correct answers per level
export const BASE_POINTS = 100;

// level 0 easy .. 2 hard. `coeffs` are the lowest whole-number answer for reactants then products.
export const REACTIONS = [
  { id: 'h2o', level: 0, reactants: ['H2', 'O2'], products: ['H2O'], coeffs: [2, 1, 2] },
  { id: 'nh3', level: 0, reactants: ['N2', 'H2'], products: ['NH3'], coeffs: [1, 3, 2] },
  { id: 'nacl', level: 0, reactants: ['Na', 'Cl2'], products: ['NaCl'], coeffs: [2, 1, 2] },
  { id: 'mgo', level: 0, reactants: ['Mg', 'O2'], products: ['MgO'], coeffs: [2, 1, 2] },
  { id: 'ch4', level: 0, reactants: ['CH4', 'O2'], products: ['CO2', 'H2O'], coeffs: [1, 2, 1, 2] },
  { id: 'hcl', level: 0, reactants: ['H2', 'Cl2'], products: ['HCl'], coeffs: [1, 1, 2] },
  { id: 'fe2o3', level: 1, reactants: ['Fe', 'O2'], products: ['Fe2O3'], coeffs: [4, 3, 2] },
  { id: 'al2o3', level: 1, reactants: ['Al', 'O2'], products: ['Al2O3'], coeffs: [4, 3, 2] },
  { id: 'c3h8', level: 1, reactants: ['C3H8', 'O2'], products: ['CO2', 'H2O'], coeffs: [1, 5, 3, 4] },
  { id: 'kclo3', level: 1, reactants: ['KClO3'], products: ['KCl', 'O2'], coeffs: [2, 2, 3] },
  { id: 'zn', level: 1, reactants: ['Zn', 'HCl'], products: ['ZnCl2', 'H2'], coeffs: [1, 2, 1, 1] },
  { id: 'ca', level: 1, reactants: ['Ca', 'H2O'], products: ['Ca(OH)2', 'H2'], coeffs: [1, 2, 1, 1] },
  { id: 'c2h6', level: 2, reactants: ['C2H6', 'O2'], products: ['CO2', 'H2O'], coeffs: [2, 7, 4, 6] },
  { id: 'alh2so4', level: 2, reactants: ['Al', 'H2SO4'], products: ['Al2(SO4)3', 'H2'], coeffs: [2, 3, 1, 3] },
  { id: 'caoh2', level: 2, reactants: ['Ca(OH)2', 'H3PO4'], products: ['Ca3(PO4)2', 'H2O'], coeffs: [3, 2, 1, 6] },
  { id: 'glucose', level: 2, reactants: ['C6H12O6', 'O2'], products: ['CO2', 'H2O'], coeffs: [1, 6, 6, 6] },
  { id: 'thermite', level: 2, reactants: ['Fe2O3', 'CO'], products: ['Fe', 'CO2'], coeffs: [1, 3, 2, 3] },
  { id: 'ostwald', level: 2, reactants: ['NH3', 'O2'], products: ['NO', 'H2O'], coeffs: [4, 5, 4, 6] },
];

// Level 3 "predict the missing product" cards: the missing formula plus believable wrong choices.
export const PREDICTIONS = [
  { id: 'p-zncuso4', reactants: 'Zn + CuSO4', shown: ['Cu'], answer: 'ZnSO4', wrong: ['ZnS', 'Zn(SO4)2', 'CuZn'], note: 'Zinc is more reactive, so it replaces copper.' },
  { id: 'p-neutral', reactants: 'HCl + NaOH', shown: ['NaCl'], answer: 'H2O', wrong: ['H2', 'O2', 'HNa'], note: 'Acid + base gives a salt and water.' },
  { id: 'p-decomp', reactants: 'CaCO3', shown: ['CaO'], answer: 'CO2', wrong: ['CO', 'O2', 'C'], note: 'Heating a carbonate releases carbon dioxide.' },
  { id: 'p-precip', reactants: 'AgNO3 + NaCl', shown: ['AgCl'], answer: 'NaNO3', wrong: ['NaNO2', 'AgNa', 'NO3'], note: 'Double replacement: the ions swap partners.' },
  { id: 'p-burn', reactants: 'C3H8 + O2', shown: ['H2O'], answer: 'CO2', wrong: ['CO', 'C3O', 'H2'], note: 'Complete combustion of a hydrocarbon gives CO2 and water.' },
  { id: 'p-mgcl', reactants: 'Mg + HCl', shown: ['H2'], answer: 'MgCl2', wrong: ['MgCl', 'Mg2Cl', 'MgH2'], note: 'Magnesium forms Mg2+, so it needs two chloride ions.' },
  { id: 'p-h2o2', reactants: 'H2O2', shown: ['H2O'], answer: 'O2', wrong: ['H2', 'O3', 'OH'], note: 'Hydrogen peroxide breaks down to water and oxygen.' },
  { id: 'p-na', reactants: 'Na + H2O', shown: ['H2'], answer: 'NaOH', wrong: ['NaO', 'Na2O', 'NaH'], note: 'An alkali metal and water give a hydroxide and hydrogen.' },
];

/** Atom counts of one formula: 'Ca(OH)2' -> { Ca: 1, O: 2, H: 2 }. Handles nested parentheses and leading digits. */
export function parseFormula(formula) {
  const s = String(formula || '').replace(/\s+/g, '');
  let i = 0;
  const num = () => { let n = ''; while (i < s.length && /\d/.test(s[i])) n += s[i++]; return n ? Number(n) : 1; };
  function group() {
    const counts = {};
    while (i < s.length && s[i] !== ')') {
      if (s[i] === '(') {
        i++;
        const inner = group();
        i++; // the closing parenthesis
        const m = num();
        for (const [el, c] of Object.entries(inner)) counts[el] = (counts[el] || 0) + c * m;
      } else if (/[A-Z]/.test(s[i])) {
        let el = s[i++];
        while (i < s.length && /[a-z]/.test(s[i])) el += s[i++];
        counts[el] = (counts[el] || 0) + num();
      } else i++;
    }
    return counts;
  }
  return group();
}

/** Total atoms on one side for formulas and coefficients. */
export function sideCounts(formulas, coeffs) {
  const total = {};
  formulas.forEach((f, i) => {
    const k = Number(coeffs[i]) || 0;
    for (const [el, c] of Object.entries(parseFormula(f))) total[el] = (total[el] || 0) + c * k;
  });
  return total;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** Balanced with positive whole numbers in lowest terms. `coeffs` covers reactants then products. */
export function isBalanced(reaction, coeffs) {
  const list = Array.isArray(coeffs) ? coeffs.map(Number) : [];
  const n = reaction.reactants.length + reaction.products.length;
  if (list.length !== n || !list.every((c) => Number.isInteger(c) && c >= 1)) return false;
  const left = sideCounts(reaction.reactants, list.slice(0, reaction.reactants.length));
  const right = sideCounts(reaction.products, list.slice(reaction.reactants.length));
  const els = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const el of els) if ((left[el] || 0) !== (right[el] || 0)) return false;
  return list.reduce(gcd, 0) === 1;
}

/** Level (0-3) for the number of right answers so far. */
export const labLevel = (correctCount) => Math.min(3, Math.floor((Number(correctCount) || 0) / LEVEL_EVERY));

/** Equation as text: coefficients of 1 are left out. */
export function equationText(reaction, coeffs = []) {
  const term = (f, i) => { const c = Number(coeffs[i]); return `${Number.isFinite(c) && c > 1 ? c : ''}${f}`; };
  const left = reaction.reactants.map((f, i) => term(f, i)).join(' + ');
  const right = reaction.products.map((f, i) => term(f, reaction.reactants.length + i)).join(' + ');
  return `${left} → ${right}`;
}

/**
 * One challenge for a level: { kind: 'balance', id, level, reactants, products, coeffs } or
 * { kind: 'predict', id, level, reactants, shown, answer, options (shuffled), note }. `used` ids are avoided while others remain.
 */
export function generateLab(level, rand = Math.random, used = []) {
  const lv = Math.max(0, Math.min(3, Math.floor(Number(level) || 0)));
  const fresh = (list) => { const f = list.filter((x) => !used.includes(x.id)); return f.length ? f : list; };
  const pick = (list) => list[Math.floor(rand() * list.length)];
  if (lv === 3 && rand() < 0.5) {
    const p = pick(fresh(PREDICTIONS));
    const options = [p.answer, ...p.wrong];
    for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
    return { kind: 'predict', id: p.id, level: 3, reactants: p.reactants, shown: p.shown, answer: p.answer, options, note: p.note };
  }
  const want = Math.min(2, lv);
  const pool = REACTIONS.filter((r) => (lv === 3 ? r.level >= 1 : r.level === want));
  const r = pick(fresh(pool));
  return { kind: 'balance', id: r.id, level: lv, reactants: r.reactants.slice(), products: r.products.slice(), coeffs: r.coeffs.slice() };
}

/** Right when the answer matches (balance: a balanced set, any scaling is rejected; predict: the chosen formula). */
export function checkLab(q, answer) {
  if (!q) return false;
  if (q.kind === 'predict') return String(answer) === q.answer;
  return isBalanced(q, answer);
}

/** Points for a right answer; `streak` is the streak BEFORE it. Harder reactions pay more. */
export const labPoints = (level, streak) => Math.round((BASE_POINTS + 25 * (Number(level) || 0)) * streakMultiplier((Number(streak) || 0) + 1));

export const reactionlab = {
  id: 'reactionlab',
  title: 'Reaction Lab',
  blurb: 'Balance equations on the lab bench before the clock runs out. Streaks unlock harder reactions.',
  icon: 'flask',
  playableTypes: [],
  minQuestions: 0,
  scored: true,
  timed: true,
  availability: () => ({ playable: true, reason: '', questions: [], note: 'Built-in reactions' }),
};
