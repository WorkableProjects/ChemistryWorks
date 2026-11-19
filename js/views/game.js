// Game route: renders a mode in the mode shell. Study and unknown ids go to the runner.
// render(root, ctx, { test, source, gameId?, cleared? }) -> cleanup()

import { renderModeShell } from './mode-shell.js';
import { modeById } from '../lib/modes/index.js';

export function render(root, ctx, params = {}) {
  const { test } = params;
  const user = ctx.user;
  if (!user) { ctx.navigate('landing', { code: test?.code }); return undefined; }
  const id = params.gameId;
  if (id && id !== 'study' && modeById(id)) return renderModeShell(root, ctx, { ...params, gameId: id });
  // Study and removed games go to the runner.
  ctx.navigate('runner', { test, source: params.source, cleared: true });
  return undefined;
}
