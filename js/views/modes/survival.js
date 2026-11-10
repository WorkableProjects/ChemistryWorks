// survival mode view: the shared round loop with the survival rules (js/lib/modes/survival.js).
import { playRound } from './round.js';
import { survival } from '../../lib/modes/survival.js';

export const render = (host, attempt, ctx) => playRound(host, attempt, ctx, survival);
