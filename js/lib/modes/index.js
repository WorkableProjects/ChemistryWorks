// V5-01 game mode registry. `modesForTest(test, attempt?)` -> [{ mode, available, reason }] in `order`.
// Pure, no DOM. DOM renderers live in js/views/modes/index.js. Contract: docs/ARCHITECTURE.md -> Game mode definition.

import { normalizeGameOptions } from '../games/options.js';
import { study } from './study.js';
import { classic } from './classic.js';
import { lightning } from './lightning.js';
import { survival } from './survival.js';
import { flashcards } from './flashcards.js';
import { mistakes } from './mistakes.js';
import { tower } from './tower.js';
import { boss } from './boss.js';
import { matchup } from './matchup.js';
import { quizshow } from './quizshow.js';
import { race } from './race.js';
import { bingo } from './bingo.js';

/** Every mode id in the contract. */
export const MODE_IDS = ['study', 'classic', 'lightning', 'survival', 'flashcards', 'mistakes', 'tower', 'boss', 'matchup', 'quizshow', 'race', 'bingo'];

/** Registered modes. Later sessions append here. */
export const MODES = [study, classic, lightning, survival, flashcards, mistakes, tower, boss, matchup, quizshow, race, bingo].sort((a, b) => a.order - b.order);

export const modeById = (id) => MODES.find((m) => m.id === id) || null;
export const isModeId = (id) => MODE_IDS.includes(id);

/**
 * Modes a test offers. A test that has not opted into game modes (`gameMode !== true`) offers Study only.
 * `gameOptions.games` limits the list; removed or unknown ids (and ids with no mode yet) are ignored and,
 * if none is left, every mode is offered.
 */
export function modesForTest(test, attempt = null) {
  const toRow = (mode) => {
    const a = (mode.available ? mode.available(test, attempt) : { ok: true }) || { ok: true };
    return { mode, available: a.ok !== false, reason: a.reason || '' };
  };
  if (!test || test.gameMode !== true) return [toRow(study)];
  const wanted = (normalizeGameOptions(test).games || []).filter((id) => id !== 'study' && modeById(id));
  const allowed = wanted.length ? MODES.filter((m) => m.id === 'study' || wanted.includes(m.id)) : MODES;
  return allowed.map(toRow);
}
