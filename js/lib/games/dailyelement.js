// Daily Element: one mystery element per day (the same for everyone on a given date), revealed clue by clue. A streak
// counts consecutive days solved. Pure: dates are passed in as 'YYYY-MM-DD' keys.

import { ELEMENTS } from '../elements.js';
import { makeRng } from './common.js';
import { familyOf } from './periodicpuzzle.js';

export const CLUE_COUNT = 6;
export const MAX_POINTS = 600;
export const CLUE_COST = 100;
export const MIN_POINTS = 100;
export const POOL = ELEMENTS.filter((e) => e.number <= 86 && !/^Un/.test(e.symbol));

/** Local date as YYYY-MM-DD. */
export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The day before a date key. */
export function dayBefore(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Today's element for a date key (deterministic). */
export function dailyElement(key) {
  const rand = makeRng(`daily-element:${key}`);
  return POOL[Math.floor(rand() * POOL.length)];
}

const blockOf = (el) => (el.group === null ? 'f' : el.group <= 2 || el.number === 2 ? 's' : el.group <= 12 ? 'd' : 'p');

/** Six clues from vague to specific: [{ label, text }]. Never contains the name or symbol. */
export function dailyClues(el) {
  const mass = parseFloat(String(el.mass).replace(/[()]/g, ''));
  return [
    { label: 'Family', text: familyOf(el) || (el.group === null ? 'inner transition metal' : 'main-group element') },
    { label: 'Period', text: `Period ${el.period}` },
    { label: 'Mass', text: `Atomic mass is about ${Math.round(mass)}` },
    { label: 'Block', text: `It sits in the ${blockOf(el)} block${el.group ? `, group ${el.group}` : ''}` },
    { label: 'Name length', text: `Its name has ${el.name.length} letters` },
    { label: 'Atomic number', text: `Atomic number ${el.number}` },
  ];
}

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z]/g, '');

/** A guess by name or symbol (case-insensitive; "aluminium" is accepted for aluminum, "caesium" for cesium). */
export function matchGuess(el, text) {
  const g = norm(text);
  if (!g) return false;
  const alt = { aluminum: 'aluminium', cesium: 'caesium', sulfur: 'sulphur' }[el.name.toLowerCase()];
  return g === norm(el.name) || g === norm(el.symbol) || (alt && g === alt);
}

/** Points for a solve with `cluesShown` clues (1-6): 600 down to 100. Not solved: 0. */
export const dailyPoints = (cluesShown, solved = true) => (solved ? Math.max(MIN_POINTS, MAX_POINTS - CLUE_COST * (Math.max(1, Number(cluesShown) || 1) - 1)) : 0);

export const emptyDaily = () => ({ last: '', streak: 0, best: 0, days: {} });

/** Normalise stored state. */
export function normalizeDaily(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const days = r.days && typeof r.days === 'object' ? r.days : {};
  const keep = Object.keys(days).sort().slice(-30);
  return { last: typeof r.last === 'string' ? r.last : '', streak: Math.max(0, Number(r.streak) || 0), best: Math.max(0, Number(r.best) || 0), days: Object.fromEntries(keep.map((k) => [k, days[k]])) };
}

/** Has the daily been played on `key`? */
export const playedToday = (state, key) => !!(state && state.days && state.days[key]);

/** Record today's result. Solving continues the streak when yesterday was solved, else starts it at 1; a miss resets it to 0. */
export function advanceDaily(raw, key, { solved, score = 0, clues = CLUE_COUNT } = {}) {
  const state = normalizeDaily(raw);
  if (playedToday(state, key)) return state;
  const streak = solved ? (state.last === dayBefore(key) && state.days[state.last]?.solved ? state.streak + 1 : 1) : 0;
  return normalizeDaily({ last: key, streak, best: Math.max(state.best, streak), days: { ...state.days, [key]: { solved: !!solved, score, clues } } });
}

/** The streak as shown today: it lapses to 0 if neither today nor yesterday was played. */
export function currentStreak(raw, key) {
  const s = normalizeDaily(raw);
  return s.last === key || s.last === dayBefore(key) ? s.streak : 0;
}

export const dailyKey = (email) => `daily:${String(email || '').toLowerCase()}`;

export const dailyelement = {
  id: 'dailyelement',
  title: 'Daily Element',
  blurb: 'One mystery element a day. Fewer clues means more points. Keep your streak alive.',
  icon: 'sparkle',
  playableTypes: [],
  minQuestions: 0,
  scored: true,
  againLabel: 'See today again',
  availability: () => ({ playable: true, reason: '', questions: [], note: 'New every day' }),
};
