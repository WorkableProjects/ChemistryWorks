// Power-up bar shared by Classic and Survival: 50/50 (multiple choice), Freeze (+seconds, timed games only),
// Skip (move on without scoring or breaking the streak) and Hint (a one-line nudge). One use of each per game.
// powerBar({ shell, q, board, state, allow, seedKey, onFreeze, onSkip, locked }) -> { el, draw }
//   state: { fifty, freeze, skip, hint } booleans (true = still available), mutated here.
//   allow: { fifty, freeze, skip, hint } what this game offers right now (already filtered by gameOptions).

import { h, seededShuffle } from '../../ui.js';
import { fiftyFiftyRemovals, FREEZE_SECONDS } from '../../lib/game.js';
import { hintFor } from '../../lib/games/options.js';

export function powerBar({ shell, q, board, state, allow, seedKey, onFreeze, onSkip, locked }) {
  const el = h('div', { class: 'game-powers', dataset: { testid: 'game-powers' } });
  const hintText = h('p', { class: 'game-hint-text', role: 'status', dataset: { testid: 'game-hint-text' } });
  const btn = (testid, label, onClick) => h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid }, on: { click: onClick } }, label);

  function draw() {
    el.replaceChildren();
    if (locked()) return;
    if (allow.fifty && state.fifty && q.type === 'mcq' && fiftyFiftyRemovals(q).length > 0) {
      el.append(btn('game-fifty', '50/50', () => {
        state.fifty = false;
        const order = seededShuffle(q.options.map((o) => o.id), `${q.id}${seedKey}`);
        for (const id of fiftyFiftyRemovals(q, order)) board.hide(id);
        shell.announce('Two wrong answers removed.');
        draw();
      }));
    }
    if (allow.freeze && state.freeze) {
      el.append(btn('game-freeze', `Freeze +${FREEZE_SECONDS}s`, () => {
        state.freeze = false; onFreeze();
        shell.announce(`Time frozen: ${FREEZE_SECONDS} seconds added.`);
        draw();
      }));
    }
    if (allow.hint && state.hint && hintFor(q)) {
      el.append(btn('game-power-hint', 'Hint', () => {
        state.hint = false;
        hintText.textContent = `Hint: ${hintFor(q)}`;
        shell.announce(hintText.textContent);
        draw();
      }));
    }
    if (allow.skip && state.skip) {
      el.append(btn('game-power-skip', 'Skip question', () => { state.skip = false; draw(); onSkip(); }));
    }
    el.append(hintText);
  }
  draw();
  return { el, draw };
}
