// lightning mode view: the shared round loop with the lightning rules (js/lib/modes/lightning.js).
import { playRound } from './round.js';
import { lightning } from '../../lib/modes/lightning.js';

export const render = (host, attempt, ctx) => playRound(host, attempt, ctx, lightning);
