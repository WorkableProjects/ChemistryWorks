// classic mode view: the shared round loop with the classic rules (js/lib/modes/classic.js).
import { playRound } from './round.js';
import { classic } from '../../lib/modes/classic.js';

export const render = (host, attempt, ctx) => playRound(host, attempt, ctx, classic);
