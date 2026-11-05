// Periodic Puzzle: element tiles go into their empty spots on the first five periods of the periodic table, using clues
// (period, family). Click or press Enter on a tile, then on a spot. Timed or relaxed. Pure; deterministic for a given rand.

import { ELEMENTS } from '../elements.js';
import { shuffle } from './common.js';

export const PUZZLE_SECONDS = 120;
export const TILE_COUNT = 8;
export const POINTS_PER_TILE = 100;
export const WRONG_PENALTY = 20;
export const TIME_BONUS_PER_SECOND = 2;
export const NOBLE_GASES = ['He', 'Ne', 'Ar', 'Kr', 'Xe'];
export const TABLE_ELEMENTS = ELEMENTS.filter((e) => e.number <= 54);

const FAMILY = { 1: 'alkali metal', 2: 'alkaline earth metal', 13: 'boron group', 14: 'carbon group', 15: 'nitrogen group', 16: 'oxygen group', 17: 'halogen', 18: 'noble gas' };

/** Family word for an element ('halogen', 'transition metal', ...). Hydrogen is its own thing. */
export function familyOf(el) {
  if (!el) return '';
  if (el.number === 1) return 'hydrogen';
  if (FAMILY[el.group]) return FAMILY[el.group];
  return el.group >= 3 && el.group <= 12 ? 'transition metal' : '';
}

/** Clue text for a tile. 'position' gives period and group; 'family' gives period and family only (harder). */
export function clueFor(el, style = 'position') {
  if (style === 'family') return `Period ${el.period}, ${familyOf(el)}`;
  return `Period ${el.period}, group ${el.group} (${familyOf(el)})`;
}

/** A puzzle: { tiles: [element], given: [element numbers pre-filled], count }. Tiles are shuffled. */
export function makePuzzle(count = TILE_COUNT, rand = Math.random) {
  const n = Math.max(1, Math.min(20, Math.floor(Number(count) || TILE_COUNT)));
  const tiles = shuffle(TABLE_ELEMENTS, rand).slice(0, n);
  const ids = new Set(tiles.map((t) => t.number));
  return { tiles: shuffle(tiles, rand), given: TABLE_ELEMENTS.filter((e) => !ids.has(e.number)).map((e) => e.number), count: n };
}

/** A tile belongs in the spot of the same element. */
export const checkPlacement = (tileNumber, spotNumber) => Number(tileNumber) === Number(spotNumber);

/** Points for the whole puzzle: tiles placed first time, minus wrong tries, plus a time bonus when timed. Never below 0. */
export function puzzleScore({ placed = 0, wrong = 0, secondsLeft = 0, untimed = false } = {}) {
  const base = placed * POINTS_PER_TILE - wrong * WRONG_PENALTY;
  const bonus = untimed ? 0 : Math.round(Math.max(0, secondsLeft) * TIME_BONUS_PER_SECOND);
  return Math.max(0, base) + (placed > 0 ? bonus : 0);
}

/** Highest possible score of a puzzle (every tile first try, whole clock left). */
export const puzzleMax = (count = TILE_COUNT, seconds = PUZZLE_SECONDS) => count * POINTS_PER_TILE + seconds * TIME_BONUS_PER_SECOND;

/** Noble gases among the placed tile symbols (for the Noble gas master badge). */
export const nobleIn = (symbols) => [...new Set((symbols || []).filter((s) => NOBLE_GASES.includes(s)))];

export const periodicpuzzle = {
  id: 'periodicpuzzle',
  title: 'Periodic Puzzle',
  blurb: 'Place element tiles into their empty spots on the periodic table using period and family clues.',
  icon: 'grid',
  playableTypes: [],
  minQuestions: 0,
  scored: true,
  timed: true,
  availability: () => ({ playable: true, reason: '', questions: [], note: 'Timed or relaxed' }),
};
