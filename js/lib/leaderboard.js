// Class leaderboard client. Active ONLY when the test has gameMode and gameOptions.leaderboard; otherwise nothing
// here ever touches the network. Sends only the final, capped score with the ID token. Names are "Ada L." or a nickname
// picked from a generated list ("Brave Boron"). The backend actions (submitGameScore, getLeaderboard) arrive in T21; an
// `unknown_action` answer means "leaderboard unavailable" and the UI renders nothing.

import { normalizeGameOptions } from './games/options.js';
import { load, save } from './storage.js';

export const TOP_N = 10;
export const MAX_SCORE = 100000;

/** The leaderboard is on for this test. */
export const leaderboardOn = (test) => !!test && test.gameMode === true && normalizeGameOptions(test).leaderboard === true;

/** 'real' (first name + last initial) or 'nicknames'. */
export const nameMode = (test) => (normalizeGameOptions(test).leaderboardNames === 'nicknames' ? 'nicknames' : 'real');

// ---------- names ----------
const ADJECTIVES = ['Brave', 'Bright', 'Calm', 'Clever', 'Daring', 'Eager', 'Fearless', 'Gentle', 'Happy', 'Keen', 'Lucky', 'Mighty', 'Noble', 'Quick', 'Quiet', 'Steady', 'Swift', 'Witty'];
const ELEMENT_NAMES = ['Argon', 'Boron', 'Carbon', 'Cobalt', 'Copper', 'Helium', 'Iodine', 'Iron', 'Krypton', 'Lithium', 'Neon', 'Nickel', 'Oxygen', 'Radon', 'Silicon', 'Sodium', 'Xenon', 'Zinc'];

/** The generated nickname list: every adjective with every element ("Brave Boron"), 324 names, fixed order. */
export const NICKNAMES = ADJECTIVES.flatMap((a) => ELEMENT_NAMES.map((e) => `${a} ${e}`));
export const isNickname = (s) => NICKNAMES.includes(String(s));

/** "Ada Lovelace" -> "Ada L."; one word stays as is; empty -> "Student". */
export function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Student';
  const first = parts[0].slice(0, 24);
  return parts.length === 1 ? first : `${first} ${[...parts[parts.length - 1]][0].toUpperCase()}.`;
}

/** A few nicknames to choose from (a deterministic window so the list does not jump around). */
export function nicknameChoices(count = 12, start = 0) {
  const n = NICKNAMES.length;
  return Array.from({ length: Math.min(count, n) }, (_, i) => NICKNAMES[(((start + i * 7) % n) + n) % n]);
}

const nickKey = (email) => `nick:${String(email || '').toLowerCase()}`;
export const loadNickname = (email) => { const v = load(nickKey(email), ''); return isNickname(v) ? v : ''; };
export const saveNickname = (email, nick) => (isNickname(nick) ? save(nickKey(email), nick) : false);

/** The name this student shows on a test's board: nickname mode needs a stored pick (else null = must choose). */
export function displayName(test, user) {
  if (nameMode(test) === 'nicknames') return loadNickname(user && user.email) || null;
  return shortName(user && user.name);
}

// ---------- score caps (the browser computes scores, so each game is capped at its maximum possible value) ----------
/** info: { questions, totalSeconds, lives } of the round that was played. */
export function scoreCap(gameId, info = {}) {
  const q = Math.max(1, Math.floor(Number(info.questions) || 0) || 20);
  const secs = Math.max(10, Math.floor(Number(info.totalSeconds) || 0) || 60);
  const caps = {
    classic: q * 1500,
    survival: q * 1000,
    lightning: secs * 150,
    elementhunt: q * 1500,
    matchup: 6 * 100 + 500,
    flashcards: q * 100,
    tower: q * 100,
    boss: q * 1000 + 1000,
    unitdash: secs * 150,
    reactionlab: secs * 150,
    molbuilder: secs * 100,
    periodicpuzzle: 20 * 100 + secs * 2,
    dailyelement: 600,
  };
  return Math.min(MAX_SCORE, caps[gameId] ?? MAX_SCORE);
}

/** The final score that may be sent: a whole number from 0 to the game's cap. NaN -> 0. */
export function cappedScore(gameId, score, info) {
  const n = Math.floor(Number(score));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, scoreCap(gameId, info));
}

// ---------- adapter ----------
const TEXT_HEADERS = { 'Content-Type': 'text/plain;charset=utf-8' };
const isUnknown = (d) => !!d && d.result === 'error' && /unknown_action/.test(String(d.error || ''));

/** POST one action to the Apps Script web app. Resolves { ok, unavailable, data?, error? }; never throws. */
export async function callBoard({ gasUrl, body, fetchImpl } = {}) {
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!gasUrl || !f) return { ok: false, unavailable: true, error: 'no_backend' };
  try {
    const res = await f(gasUrl, { method: 'POST', headers: TEXT_HEADERS, body: JSON.stringify(body) });
    if (!res || !res.ok) return { ok: false, unavailable: true, error: `HTTP ${res ? res.status : 'error'}` };
    const d = await res.json();
    if (isUnknown(d)) return { ok: false, unavailable: true, error: 'unknown_action' };
    if (!d || d.result !== 'success') return { ok: false, unavailable: false, error: (d && d.error) || 'unknown_error' };
    return { ok: true, unavailable: false, data: d };
  } catch (e) {
    return { ok: false, unavailable: true, error: (e && e.message) || String(e) };
  }
}

/**
 * Send the final score of a finished round. Does nothing (no network) unless leaderboardOn(test).
 * { gasUrl, idToken, test, user, gameId, score, info, fetchImpl } -> { sent, ok, unavailable, score }
 */
export async function submitGameScore({ gasUrl, idToken, test, user, gameId, score, info, fetchImpl } = {}) {
  if (!leaderboardOn(test)) return { sent: false, ok: false, unavailable: false, score: 0 };
  const name = displayName(test, user);
  if (!name) return { sent: false, ok: false, unavailable: false, score: 0, needsNickname: true };
  const final = cappedScore(gameId, score, info);
  const body = { action: 'submitGameScore', testCode: test.code, game: gameId, score: final, displayName: name };
  if (idToken) body.idToken = idToken; else if (user && user.email) body.studentEmail = user.email;
  const res = await callBoard({ gasUrl, body, fetchImpl });
  return { sent: true, ok: res.ok, unavailable: !!res.unavailable, score: final, rank: res.data && res.data.rank };
}

/** Normalise a getLeaderboard answer: { top: [{ rank, name, score, you }], own: { rank, score } | null }. */
export function normalizeBoard(data, email = '') {
  const rows = Array.isArray(data && (data.top || data.entries)) ? (data.top || data.entries) : [];
  const top = rows.slice(0, TOP_N).map((r, i) => ({
    rank: Number(r.rank) || i + 1, name: String(r.name ?? r.displayName ?? 'Student').slice(0, 40), score: Math.max(0, Math.floor(Number(r.score) || 0)),
    you: r.you === true || (!!email && String(r.email || '').toLowerCase() === String(email).toLowerCase()),
  }));
  const o = data && data.own;
  const own = o && Number(o.rank) > 0 ? { rank: Number(o.rank), score: Math.max(0, Math.floor(Number(o.score) || 0)) } : null;
  return { top, own };
}

/** Fetch a game's board. No network unless leaderboardOn(test). -> { ok, unavailable, top, own } (unavailable = render nothing). */
export async function fetchBoard({ gasUrl, idToken, test, user, gameId, fetchImpl } = {}) {
  if (!leaderboardOn(test)) return { ok: false, unavailable: true, top: [], own: null };
  const body = { action: 'getLeaderboard', testCode: test.code, game: gameId };
  if (idToken) body.idToken = idToken; else if (user && user.email) body.studentEmail = user.email;
  const res = await callBoard({ gasUrl, body, fetchImpl });
  if (!res.ok) return { ok: false, unavailable: true, top: [], own: null };
  return { ok: true, unavailable: false, ...normalizeBoard(res.data, user && user.email) };
}
