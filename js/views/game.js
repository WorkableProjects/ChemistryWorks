// Game mode dispatcher: picks the board for params.gameId (default 'classic') and renders it inside the shared shell.
// Nothing is submitted anywhere; no game calls the backend, submit.js or fetch.
// render(root, ctx, { test, source, gameId?, studyBlocked? }) -> cleanup()

import { createShell } from './game-shell.js';
import { renderModeShell } from './mode-shell.js';
import { modeById } from '../lib/modes/index.js';
import { feature } from '../config.js';
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
import * as reactionlab from './games/reactionlab.js';
import * as molbuilder from './games/molbuilder.js';
import * as periodicpuzzle from './games/periodicpuzzle.js';
import * as dailyelement from './games/dailyelement.js';

const BOARDS = { classic, survival, lightning, elementhunt, matchup, flashcards, tower, mistakes, boss, unitdash, reactionlab, molbuilder, periodicpuzzle, dailyelement };

export function render(root, ctx, params = {}) {
  const { test, source, studyBlocked, cleared } = params;
  const user = ctx.user;
  if (!user) { ctx.navigate('landing', { code: test?.code }); return undefined; }

  // V5-01: a v5 mode id renders in the mode shell (shared attempt); other ids keep the old boards.
  if (feature('v5Games') && params.gameId && modeById(params.gameId)) return renderModeShell(root, ctx, params);

  const game = getGame(params.gameId || 'classic') || getGame('classic');
  const shell = createShell(root, ctx, { test, source, game, studyBlocked: !!studyBlocked, cleared: !!cleared });
  BOARDS[game.id].play(shell);
  return () => shell.cleanup();
}
