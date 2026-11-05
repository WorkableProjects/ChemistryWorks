// Mode chooser shown for tests with gameMode === true: Study mode (the normal runner) or Game mode (practice).
// "Game mode" opens a game picker (Classic, Survival, Lightning Round, Element Hunt, Match-Up, Flashcards).
// render(root, ctx, { test, source, studyBlocked?, picker? }) -> cleanup()
// studyBlocked (V3-02): the student already submitted a single-submission test, so only Game mode is offered.
// picker: open on the game picker directly (used by "Back to games").

import { h, mount, icon, richText, renderMath, appHeader, userBadge } from '../ui.js';
import { splitGameQuestions } from '../lib/game.js';
import { playableGames, loadBest } from '../lib/games/index.js';
import { getLocalResults } from '../lib/submit.js';
import { pickerLeaderboard } from './games/progress.js';

export function render(root, ctx, params = {}) {
  const { test, source } = params;
  const user = ctx.user;
  if (!user) { ctx.navigate('landing', { code: test?.code }); return undefined; }

  const { skipped } = splitGameQuestions(test);
  const games = playableGames(test, { email: user.email, localResults: getLocalResults() });
  const anyPlayable = games.some((g) => g.playable);
  const view = h('div', { class: 'mode-view' });
  let timer = null;

  const focusTitle = () => { clearTimeout(timer); timer = setTimeout(() => view.querySelector('.mode-select__title')?.focus({ preventScroll: true }), 50); };

  const choice = (kind, glyph, title, text, extra, onClick, disabled = false) => h('button', {
    type: 'button', class: `mode-choice mode-choice--${kind}`, disabled, on: { click: onClick }, dataset: { testid: `mode-${kind}` },
  },
  h('span', { class: 'mode-choice__icon' }, icon(glyph, { size: 28 })),
  h('span', { class: 'mode-choice__title' }, title),
  h('span', { class: 'mode-choice__text' }, text),
  extra);

  function showModes() {
    const page = h('main', { class: 'mode-select', dataset: { testid: 'mode-select' } },
      h('div', { class: 'mode-select__head' },
        h('h1', { class: 'mode-select__title', tabindex: '-1' }, test.title || test.code),
        test.description ? richText(test.description, 'p', 'muted') : null,
        h('p', { class: 'muted' }, 'How do you want to work through this test?')),
      h('div', { class: 'mode-select__grid' },
        params.studyBlocked ? null : choice('study', 'book', 'Study mode',
          'The normal test: every question, at your own pace. Your answers are submitted when you finish.',
          h('span', { class: 'mode-choice__go' }, 'Start studying'),
          () => ctx.navigate('runner', { test, source, cleared: !!params.cleared })),
        choice('game', 'gamepad', 'Game mode',
          `${games.length} game${games.length === 1 ? '' : 's'} to choose from: race the clock, survive, stack a tower, fight a boss, match pairs, drill units or use flashcards.`,
          h('span', { class: 'mode-choice__go' }, anyPlayable ? 'Choose a game' : 'No playable games'),
          showPicker, !anyPlayable)),
      h('p', { class: 'mode-select__note', dataset: { testid: 'game-practice-note' } }, icon('info', { size: 16 }),
        h('span', {}, 'Game mode is practice — your score is not submitted.',
          skipped.length ? ` ${skipped.length} question${skipped.length === 1 ? '' : 's'} (open-ended or drawn) are skipped in game mode.` : '')));
    mount(view, appHeader({ subtitle: test.title, onHome: () => ctx.navigate('landing'), right: [userBadge(user)] }), page);
    renderMath(view);
    focusTitle();
  }

  function showPicker() {
    const cards = games.map(({ game, playable, reason, note }) => {
      const best = game.scored === false ? 0 : loadBest(user.email, test.code, game.id);
      const status = playable
        ? (game.scored === false ? 'Study, not scored' : best ? `Best ${best.toLocaleString()}` : 'No score yet')
        : reason;
      return h('button', {
        type: 'button', class: ['mode-choice', 'game-pick', !playable && 'is-unplayable'], disabled: !playable, dataset: { testid: `game-pick-${game.id}` },
        'aria-describedby': `gp-${game.id}`,
        on: { click: () => ctx.navigate('game', { test, source, gameId: game.id, studyBlocked: !!params.studyBlocked, cleared: !!params.cleared }) },
      },
      h('span', { class: 'mode-choice__icon' }, icon(game.icon, { size: 28 })),
      h('span', { class: 'mode-choice__title' }, game.title),
      h('span', { class: 'mode-choice__text' }, game.blurb),
      h('span', { class: ['mode-choice__go', !playable && 'is-reason'], id: `gp-${game.id}`, dataset: { testid: `game-pick-status-${game.id}` } }, status),
      playable && note ? h('span', { class: 'game-pick__note' }, note) : null);
    });
    const page = h('main', { class: 'mode-select', dataset: { testid: 'game-picker' } },
      h('div', { class: 'mode-select__head' },
        h('h1', { class: 'mode-select__title', tabindex: '-1' }, 'Choose a game'),
        h('p', { class: 'muted' }, test.title || test.code)),
      h('div', { class: 'mode-select__grid game-picker__grid' }, cards),
      pickerLeaderboard({ ctx, test, user, games: games.filter((g) => g.playable && g.game.scored !== false).map((g) => g.game) }),
      h('div', { class: 'game-actions' },
        h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'game-picker-back' }, on: { click: showModes } }, 'Back'),
        params.studyBlocked ? null : h('button', { class: 'btn btn--ghost', type: 'button', on: { click: () => ctx.navigate('runner', { test, source, cleared: !!params.cleared }) } }, 'Study mode instead')),
      h('p', { class: 'mode-select__note' }, icon('info', { size: 16 }), h('span', {}, 'Game mode is practice — your score is not submitted.')));
    mount(view, appHeader({ subtitle: test.title, onHome: () => ctx.navigate('landing'), right: [userBadge(user)] }), page);
    renderMath(view);
    focusTitle();
  }

  mount(root, view);
  if (params.picker && anyPlayable) showPicker(); else showModes();
  return () => clearTimeout(timer);
}
