// Game registry. Every game is { id, title, blurb, icon, playableTypes, minQuestions, scored, availability(test) }.
// Pure logic, no DOM. Nothing here (or in any game) calls the backend, submit.js or fetch.

import { load, save } from '../storage.js';
import { gameBestKey, legacyBestKey } from './common.js';
import { classic } from './classic.js';
import { survival } from './survival.js';
import { lightning } from './lightning.js';
import { elementhunt } from './elementhunt.js';
import { matchup } from './matchup.js';
import { flashcards } from './flashcards.js';

export const GAMES = [classic, survival, lightning, elementhunt, matchup, flashcards];

export const getGame = (id) => GAMES.find((g) => g.id === id) || null;

/**
 * Games a test offers, in registry order: [{ game, playable, reason, questions }].
 * `test.games` (array of ids) limits the list; missing, empty or all-unknown means every game.
 */
export function playableGames(test) {
  const wanted = Array.isArray(test && test.games) ? test.games.map(String) : [];
  const known = GAMES.filter((g) => wanted.includes(g.id));
  const list = known.length ? known : GAMES;
  return list.map((game) => {
    const a = game.availability(test || {});
    return { game, playable: !!a.playable, reason: a.reason || '', questions: a.questions || [], note: a.note || '' };
  });
}

/** Best score for a game; the classic game falls back to the pre-v3 key. */
export function loadBest(email, code, gameId) {
  const v = Number(load(gameBestKey(email, code, gameId), null));
  if (Number.isFinite(v) && v > 0) return v;
  if (gameId === 'classic') return Number(load(legacyBestKey(email, code), 0)) || 0;
  return 0;
}

/** Save `score` when it beats the stored best. Returns { best, isBest }. */
export function saveBest(email, code, gameId, score) {
  const prev = loadBest(email, code, gameId);
  const isBest = score > prev;
  if (isBest) save(gameBestKey(email, code, gameId), score);
  return { best: Math.max(prev, score), isBest };
}

export { gameBestKey, legacyBestKey };
