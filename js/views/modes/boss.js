// Boss Battle mode view: a health bar for the boss, three lives for you (js/lib/modes/boss.js).
import { h } from '../../ui.js';
import { playSeq } from './play.js';
import { boss, applyBoss, BOSS_NAME } from '../../lib/modes/boss.js';
import { normalizeGameOptions } from '../../lib/games/options.js';

export function render(host, attempt, ctx) {
  const rules = boss.rules(attempt.test, normalizeGameOptions(attempt.test));
  const ids = rules.order(attempt.questions);
  let state = rules.init(attempt.questions);
  const visual = () => {
    const pct = Math.round((state.health / state.maxHealth) * 100);
    const fill = h('span', { class: 'boss__fill' });
    fill.style.transform = `scaleX(${state.health / state.maxHealth})`;
    return h('div', { class: ['boss', state.health === 0 && 'is-defeated'], dataset: { testid: 'boss', health: state.health } },
      h('div', { class: 'boss__head' },
        h('span', { class: 'boss__tile' }, 'Cx'),
        h('span', { class: 'boss__name' }, BOSS_NAME),
        h('span', { class: 'boss__hp' }, `${state.health} of ${state.maxHealth}`)),
      h('div', { class: 'boss__bar', role: 'meter', 'aria-label': 'Boss health', 'aria-valuemin': '0', 'aria-valuemax': String(state.maxHealth), 'aria-valuenow': String(state.health), 'aria-valuetext': `${pct}%` }, fill));
  };
  return playSeq(host, attempt, ctx, {
    mode: boss, ids,
    lead: `Answer to attack ${BOSS_NAME}. Harder questions hit harder`,
    notes: [`A wrong answer costs a life. You have ${state.maxLives}. Questions run easiest first`],
    visual,
    hud: () => [{ testid: 'mode-lives', text: `Lives ${state.lives}` }, { testid: 'mode-streak', text: state.streak ? `Streak ${state.streak}` : '' }],
    step(q, outcome) {
      const res = applyBoss(state, { q, outcome });
      state = res.state;
      const lines = [];
      if (res.damage) lines.push(`${res.damage} damage`);
      if (res.points) lines.push(`+${res.points} points`);
      if (res.lifeGained) lines.push('You earned a life back');
      if (res.lifeLost) lines.push(`${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left`);
      if (res.defeated) lines.push(`${BOSS_NAME} is defeated`);
      else if (res.over) lines.push(`${BOSS_NAME} wins this round`);
      return { points: res.points, lines, over: res.over };
    },
  });
}
