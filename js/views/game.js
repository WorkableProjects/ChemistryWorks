// Game mode dispatcher: picks the board for params.gameId (default 'classic') and renders it inside the shared shell.
// Nothing is submitted anywhere; no game calls the backend, submit.js or fetch.
// render(root, ctx, { test, source, gameId?, studyBlocked? }) -> cleanup()

import { createShell } from './game-shell.js';
import { getGame } from '../lib/games/index.js';
import * as classic from './games/classic.js';
import * as survival from './games/survival.js';
import * as lightning from './games/lightning.js';
import * as elementhunt from './games/elementhunt.js';
import * as matchup from './games/matchup.js';
import * as flashcards from './games/flashcards.js';
import * as tower from './games/tower.js';
import * as mistakes from './games/mistakes.js';
import * as boss from './games/boss.js';
import * as unitdash from './games/unitdash.js';

const BOARDS = { classic, survival, lightning, elementhunt, matchup, flashcards, tower, mistakes, boss, unitdash };

export function render(root, ctx, params = {}) {
  const { test, source, studyBlocked, cleared } = params;
  const user = ctx.user;
  if (!user) { ctx.navigate('landing', { code: test?.code }); return undefined; }

  const game = getGame(params.gameId || 'classic') || getGame('classic');
  const shell = createShell(root, ctx, { test, source, game, studyBlocked: !!studyBlocked, cleared: !!cleared });
  BOARDS[game.id].play(shell);
  return () => shell.cleanup();
}
