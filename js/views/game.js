// Game route: renders a v5 mode in the mode shell. Old `?game=<id>` ids map to the matching mode, or to Study.
// render(root, ctx, { test, source, gameId?, cleared? }) -> cleanup()

import { renderModeShell } from './mode-shell.js';
import { modeById } from '../lib/modes/index.js';

// Old game ids that have a differently named mode.
const LEGACY_TO_MODE = { elementhunt: 'matchup' };

export function render(root, ctx, params = {}) {
  const { test } = params;
  const user = ctx.user;
  if (!user) { ctx.navigate('landing', { code: test?.code }); return undefined; }
  const id = LEGACY_TO_MODE[params.gameId] || params.gameId;
  if (id && id !== 'study' && modeById(id)) return renderModeShell(root, ctx, { ...params, gameId: id });
  // Study and removed games go to the runner.
  ctx.navigate('runner', { test, source: params.source, cleared: true });
  return undefined;
}
