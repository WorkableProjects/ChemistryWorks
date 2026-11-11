// Race view: a lane with one step per question; you and the ghost of your last run (js/lib/modes/race.js).
import { h } from '../../ui.js';
import { playSeq } from './play.js';
import { race, applyRace, loadGhost, saveGhost, ghostAt } from '../../lib/modes/race.js';

export function render(host, attempt, ctx) {
  const ids = attempt.questions.map((q) => q.id);
  const total = ids.length;
  const code = attempt.test.code;
  const ghost = loadGhost(code, total);
  let state = { steps: 0, streak: 0 };
  let done = 0;
  const run = [];

  const marker = (cls, symbol, steps) => {
    const el = h('span', { class: ['race__marker', cls], dataset: { testid: `race-${cls.replace('race__', '')}`, steps } }, symbol);
    el.style.setProperty('--pos', String(total ? steps / total : 0));
    return el;
  };
  const visual = () => h('div', { class: 'race', role: 'img', dataset: { testid: 'race', steps: state.steps },
    'aria-label': `You are on step ${state.steps} of ${total}${ghost ? `, your last run was on step ${ghostAt(ghost, done)}` : ''}` },
  h('div', { class: 'race__lane' },
    ghost ? marker('race__ghost', 'G', ghostAt(ghost, done)) : null,
    marker('race__you', 'You', state.steps),
    h('span', { class: 'race__finish' }, total)));

  return playSeq(host, attempt, ctx, {
    mode: race,
    ids,
    lead: 'Every right answer moves you one step along the track',
    notes: [ghost ? 'The ghost is your last finished run' : 'Finish a run and it becomes your ghost next time'],
    visual,
    hud: () => [{ testid: 'race-steps', text: `Step ${state.steps} of ${total}`, fig: true }, ghost ? { testid: 'race-ghost', text: `Last run ${ghostAt(ghost, done)}` } : { text: '' }],
    step(q, outcome) {
      const res = applyRace(state, { outcome });
      state = res.state;
      done += 1;
      run.push(outcome === 'correct' ? 1 : 0);
      const lines = [];
      if (res.points) lines.push(`+${res.points} points`);
      if (ghost) {
        const g = ghostAt(ghost, done);
        lines.push(state.steps > g ? `${state.steps - g} ahead of your last run` : state.steps < g ? `${g - state.steps} behind your last run` : 'Level with your last run');
      }
      if (done === total) saveGhost(code, run);
      return { points: res.points, lines };
    },
  });
}
