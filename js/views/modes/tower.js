// Tower mode view: a stack of blocks that wobbles on a wrong answer (js/lib/modes/tower.js).
import { h } from '../../ui.js';
import { playSeq } from './play.js';
import { tower, newTower, applyTower, MAX_WOBBLES } from '../../lib/modes/tower.js';

export function render(host, attempt, ctx) {
  let state = newTower();
  let wobbled = false;
  const visual = () => {
    const blocks = Array.from({ length: state.blocks }, (_, i) => h('span', { class: 'tower__block' }, String(i + 1)));
    return h('div', { class: ['tower', wobbled && !ctx.reducedMotion && 'is-wobble', state.fell && 'is-fallen'], dataset: { testid: 'tower', blocks: state.blocks, wobbles: state.wobbles }, role: 'img',
      'aria-label': `Tower with ${state.blocks} ${state.blocks === 1 ? 'block' : 'blocks'}, ${state.wobbles} of ${MAX_WOBBLES} wobbles` },
    h('div', { class: 'tower__stack' }, blocks, h('span', { class: 'tower__base' })));
  };
  return playSeq(host, attempt, ctx, {
    mode: tower,
    ids: attempt.questions.map((q) => q.id),
    lead: 'Stack a block for every right answer. A wrong answer makes the tower wobble',
    notes: [`The third wobble knocks it down. Each block is worth 100 points`],
    visual,
    hud: () => [{ testid: 'mode-lives', text: `Wobbles ${state.wobbles} of ${MAX_WOBBLES}` }, { testid: 'mode-height', text: `Height ${state.blocks}`, fig: true }],
    step(q, outcome) {
      const res = applyTower(state, { outcome });
      state = res.state;
      wobbled = res.wobbled;
      const lines = [];
      if (res.points) lines.push(`+${res.points} points`);
      if (res.wobbled) lines.push(state.fell ? 'The tower fell' : `Wobble ${state.wobbles} of ${MAX_WOBBLES}`);
      return { points: res.points, lines, over: res.over };
    },
  });
}
