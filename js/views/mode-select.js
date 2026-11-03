// Mode chooser shown for tests with gameMode === true: Study mode (the normal runner) or Game mode (practice).
// render(root, ctx, { test, source }) -> cleanup()

import { h, mount, icon, richText, renderMath, appHeader, userBadge } from '../ui.js';
import { load } from '../lib/storage.js';
import { splitGameQuestions, bestKey } from '../lib/game.js';

export function render(root, ctx, params = {}) {
  const { test, source } = params;
  const user = ctx.user;
  if (!user) { ctx.navigate('landing', { code: test?.code }); return undefined; }

  const { playable, skipped } = splitGameQuestions(test);
  const best = Number(load(bestKey(user.email, test.code), 0)) || 0;
  const canPlay = playable.length > 0;

  const choice = (kind, glyph, title, text, extra, onClick, disabled = false) => h('button', {
    type: 'button', class: `mode-choice mode-choice--${kind}`, disabled, on: { click: onClick }, dataset: { testid: `mode-${kind}` },
  },
  h('span', { class: 'mode-choice__icon' }, icon(glyph, { size: 28 })),
  h('span', { class: 'mode-choice__title' }, title),
  h('span', { class: 'mode-choice__text' }, text),
  extra);

  const page = h('main', { class: 'mode-select', dataset: { testid: 'mode-select' } },
    h('div', { class: 'mode-select__head' },
      h('h1', { class: 'mode-select__title', tabindex: '-1' }, test.title || test.code),
      test.description ? richText(test.description, 'p', 'muted') : null,
      h('p', { class: 'muted' }, 'How do you want to work through this test?')),
    h('div', { class: 'mode-select__grid' },
      choice('study', 'pen', 'Study mode',
        'The normal test: every question, at your own pace. Your answers are submitted when you finish.',
        h('span', { class: 'mode-choice__go' }, 'Start studying'),
        () => ctx.navigate('runner', { test, source })),
      choice('game', 'flag', 'Game mode',
        `${playable.length} question${playable.length === 1 ? '' : 's'}, one at a time, against the clock. Build streaks for bonus points.`,
        h('span', { class: 'mode-choice__go' }, canPlay ? (best ? `Play (best ${best.toLocaleString()})` : 'Play') : 'No playable questions'),
        () => ctx.navigate('game', { test, source }), !canPlay)),
    h('p', { class: 'mode-select__note', dataset: { testid: 'game-practice-note' } }, icon('info', { size: 16 }),
      h('span', {}, 'Game mode is practice — your score is not submitted.',
        skipped.length ? ` ${skipped.length} question${skipped.length === 1 ? '' : 's'} (open-ended or drawn) are skipped in game mode.` : '')));

  mount(root, h('div', { class: 'mode-view' },
    appHeader({ subtitle: test.title, onHome: () => ctx.navigate('landing'), right: [userBadge(user)] }), page));
  renderMath(root);
  const t = setTimeout(() => page.querySelector('.mode-select__title')?.focus({ preventScroll: true }), 50);
  return () => clearTimeout(t);
}
