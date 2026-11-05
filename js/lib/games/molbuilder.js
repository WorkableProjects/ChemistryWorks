// Molecule Builder: assemble the atoms of a target (a formula or a name), then pick its shape. Built-in target list,
// so it needs no test questions. Score by correctness and speed. Pure; deterministic for a given rand.

import { streakMultiplier } from '../game.js';
import { parseFormula } from './reactionlab.js';

export const BUILD_SECONDS = 90;
export const UNTIMED_MOLECULES = 8;
export const BUILD_POINTS = 100;
export const SHAPE_POINTS = 50;
export const SPEED_BONUS = 100; // extra for an instant build, falling to 0 at FAST_SECONDS
export const FAST_SECONDS = 20;

export const SHAPES = ['linear', 'bent', 'trigonal planar', 'trigonal pyramidal', 'tetrahedral'];

// level 0 easy .. 2 hard (more atoms or a less familiar shape)
export const TARGETS = [
  { formula: 'H2O', name: 'water', shape: 'bent', level: 0 },
  { formula: 'CO2', name: 'carbon dioxide', shape: 'linear', level: 0 },
  { formula: 'HCl', name: 'hydrogen chloride', shape: 'linear', level: 0 },
  { formula: 'NH3', name: 'ammonia', shape: 'trigonal pyramidal', level: 0 },
  { formula: 'CH4', name: 'methane', shape: 'tetrahedral', level: 0 },
  { formula: 'H2S', name: 'hydrogen sulfide', shape: 'bent', level: 1 },
  { formula: 'BF3', name: 'boron trifluoride', shape: 'trigonal planar', level: 1 },
  { formula: 'PH3', name: 'phosphine', shape: 'trigonal pyramidal', level: 1 },
  { formula: 'CCl4', name: 'carbon tetrachloride', shape: 'tetrahedral', level: 1 },
  { formula: 'BeCl2', name: 'beryllium chloride', shape: 'linear', level: 1 },
  { formula: 'N2', name: 'nitrogen gas', shape: 'linear', level: 1 },
  { formula: 'SiH4', name: 'silane', shape: 'tetrahedral', level: 2 },
  { formula: 'OF2', name: 'oxygen difluoride', shape: 'bent', level: 2 },
  { formula: 'NCl3', name: 'nitrogen trichloride', shape: 'trigonal pyramidal', level: 2 },
  { formula: 'BCl3', name: 'boron trichloride', shape: 'trigonal planar', level: 2 },
  { formula: 'CS2', name: 'carbon disulfide', shape: 'linear', level: 2 },
].map((t) => ({ ...t, atoms: parseFormula(t.formula) }));

const DECOYS = ['H', 'O', 'C', 'N', 'Cl', 'F', 'S'];

export const moleculeLevel = (builtCount) => Math.min(2, Math.floor((Number(builtCount) || 0) / 3));

const pickFrom = (list, rand) => list[Math.floor(rand() * list.length)];

/** Atom palette for a target: its own elements plus one or two decoys, sorted as in the formula first. */
export function paletteFor(target, rand = Math.random) {
  const own = Object.keys(target.atoms);
  const extra = DECOYS.filter((s) => !own.includes(s));
  const decoys = [];
  while (decoys.length < (own.length <= 2 ? 2 : 1) && extra.length) decoys.push(extra.splice(Math.floor(rand() * extra.length), 1)[0]);
  return [...own, ...decoys];
}

/** One challenge: { target, ask: 'formula'|'name', prompt, palette, shapeOptions }. Higher levels ask by name more often. */
export function generateMolecule(level, rand = Math.random, used = []) {
  const lv = Math.max(0, Math.min(2, Math.floor(Number(level) || 0)));
  const pool = TARGETS.filter((t) => t.level <= lv);
  const fresh = pool.filter((t) => !used.includes(t.formula));
  const target = pickFrom(fresh.length ? fresh : pool, rand);
  const ask = rand() < (lv === 0 ? 0.2 : 0.5) ? 'name' : 'formula';
  const wrongShapes = SHAPES.filter((s) => s !== target.shape);
  const shapeOptions = [target.shape];
  while (shapeOptions.length < 4) shapeOptions.splice(Math.floor(rand() * (shapeOptions.length + 1)), 0, wrongShapes.splice(Math.floor(rand() * wrongShapes.length), 1)[0]);
  return {
    target, ask, level: lv,
    prompt: ask === 'name' ? `Build ${target.name}.` : `Build ${target.formula}.`,
    palette: paletteFor(target, rand),
    shapeOptions,
  };
}

/** Exactly the target's atoms (counts of zero ignored). */
export function checkBuild(target, counts) {
  const have = Object.entries(counts || {}).filter(([, n]) => Number(n) > 0);
  const want = Object.entries(target.atoms);
  return have.length === want.length && want.every(([el, n]) => Number(counts[el]) === n);
}

export const checkShape = (target, shape) => String(shape) === target.shape;

/** The built atoms as a text formula in the order of the palette ('H2O' style, counts of 1 omitted). */
export function builtText(counts, order = Object.keys(counts || {})) {
  return order.filter((el) => Number(counts && counts[el]) > 0).map((el) => `${el}${counts[el] > 1 ? counts[el] : ''}`).join('');
}

/** Points for a correct build. Untimed: flat. Timed: up to SPEED_BONUS more for a fast build. `streak` is before it. */
export function buildPoints({ seconds = FAST_SECONDS, untimed = false, streak = 0 } = {}) {
  const speed = untimed ? 0 : Math.max(0, Math.min(1, 1 - (Number(seconds) || 0) / FAST_SECONDS));
  return Math.round((BUILD_POINTS + Math.round(SPEED_BONUS * speed)) * streakMultiplier((Number(streak) || 0) + 1));
}

export const molbuilder = {
  id: 'molbuilder',
  title: 'Molecule Builder',
  blurb: 'Build the molecule from atoms, then pick its shape. Faster builds score more.',
  icon: 'layers',
  playableTypes: [],
  minQuestions: 0,
  scored: true,
  timed: true,
  availability: () => ({ playable: true, reason: '', questions: [], note: 'Built-in molecules' }),
};
