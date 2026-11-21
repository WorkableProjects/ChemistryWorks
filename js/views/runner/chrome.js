// Runner chrome: header, title bar, progress bar, banners, the focus-view action row and the footer.

import { h, icon, appHeader, userBadge } from '../../ui.js';
import { killed } from '../../config.js';
import { networkBanner } from '../tools/banner.js';
import { modeSwitcher } from './mode-switcher.js';
import { openShortcuts } from './shortcuts.js';

function buildHeader(rt) {
  const { test, ctx, params, user, preview, attempt, state } = rt;
  const modeLabel = h('span', { class: 'runner-hbtn__label' });
  const modeIcon = h('span', { class: 'runner-hbtn__icon' });
  const modeBtn = test.allowModeToggle !== false
    ? h('button', {
      type: 'button', class: 'btn btn--ghost btn--sm runner-hbtn', dataset: { testid: 'mode-toggle' },
      on: { click: () => rt.setMode(state.mode === 'focus' ? 'scroll' : 'focus') },
    }, modeIcon, modeLabel)
    : null;
  const navToggle = h('button', {
    type: 'button', class: 'btn btn--ghost btn--sm runner-hbtn', 'aria-expanded': 'false', 'aria-controls': 'runner-navigator', 'aria-label': 'Questions',
    dataset: { testid: 'navigator-toggle' },
    on: { click: () => (rt.drawerIsOpen() ? rt.closeDrawer({ remember: true }) : rt.openDrawer({ remember: true })) },
  }, icon('grid', { size: 16 }), h('span', { class: 'runner-hbtn__label' }, 'Questions'));
  const header = appHeader({
    subtitle: test.title,
    onHome: () => ctx.navigate(preview ? 'admin' : 'landing'),
    right: [modeBtn, navToggle, userBadge(user)],
  });
  // Calm bar under the navy header: test title, timer, and the progress bar along its bottom edge.
  const runnerBar = h('div', { class: 'runner-bar' },
    h('div', { class: 'runner-bar__inner' },
      h('span', { class: 'runner-bar__title', title: test.title, dataset: { viewTitle: '' } }, test.title),
      !preview && !killed('gameModes') ? modeSwitcher({
        test, attempt, current: 'study',
        onPick: (id) => { attempt.setMode(id); ctx.navigate('game', { test, source: params.source, gameId: id, cleared: true }); },
      }) : null,
      rt.timerEl, rt.timerAnnouncer));
  return { modeLabel, modeIcon, modeBtn, navToggle, header, runnerBar };
}

function buildTop(rt) {
  const { ctx, preview, total } = rt;
  const progressFill = h('div', { class: 'runner-progress__fill' });
  const progressBar = h('div', {
    class: 'runner-progress', role: 'progressbar', 'aria-label': 'Questions answered',
    'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': '0', dataset: { testid: 'progress-bar' },
  }, progressFill);
  const netBanner = !preview ? networkBanner({ config: ctx.config }) : null;
  const previewBanner = preview
    ? h('div', { class: 'runner-preview', dataset: { testid: 'preview-banner' } },
      icon('eye', { size: 16 }),
      h('span', {}, 'Preview mode — answers are not submitted'),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: 'exit-preview' }, on: { click: () => ctx.navigate('admin') } }, 'Exit preview'))
    : null;
  return { progressFill, progressBar, netBanner, previewBanner };
}

function buildBottom(rt) {
  const { state, total } = rt;
  const prevBtn = h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'prev-btn' }, on: { click: () => rt.goTo(state.index - 1) } }, icon('left'), 'Previous');
  const reviewBtn = h('button', { type: 'button', class: 'btn btn--subtle', dataset: { testid: 'review-btn' }, on: { click: () => rt.openDrawer() } }, icon('list'), 'Review');
  const nextLabel = h('span', {}, 'Next');
  const nextIcon = h('span', { class: 'runner-next-icon' });
  const nextBtn = h('button', {
    type: 'button', class: 'btn btn--primary', dataset: { testid: 'next-btn' },
    on: { click: () => (state.index >= total - 1 ? rt.openSubmit() : rt.goTo(state.index + 1)) },
  }, nextLabel, nextIcon);
  const actions = h('div', { class: 'runner-actions' }, prevBtn, reviewBtn, nextBtn);

  const progressText = h('span', { class: 'runner-footer__progress', dataset: { testid: 'progress-text' } });
  const savedEl = h('span', { class: 'runner-saved', 'aria-hidden': 'true', dataset: { testid: 'saved-tick' } }, icon('check', { size: 14 }), 'Saved');
  const submitBtn = h('button', { type: 'button', class: 'btn btn--primary', dataset: { testid: 'submit-btn' }, on: { click: () => rt.openSubmit() } }, icon('check', { size: 16 }), 'Submit test');
  const footer = h('footer', { class: 'runner-footer' },
    h('div', { class: 'runner-footer__inner' },
      progressText,
      savedEl,
      h('button', { type: 'button', class: 'btn btn--subtle btn--sm runner-footer__hint', 'aria-label': 'Keyboard shortcuts', dataset: { testid: 'shortcuts-btn' }, on: { click: () => openShortcuts(rt) } },
        icon('keyboard', { size: 16 }), h('span', {}, 'Keyboard shortcuts (?)')),
      h('span', { class: 'spacer' }),
      submitBtn));
  return { prevBtn, nextBtn, nextLabel, nextIcon, actions, progressText, savedEl, submitBtn, footer };
}

/** Builds every static piece of the runner chrome. Returns an object to merge into rt. */
export function buildChrome(rt) {
  return {
    ...buildHeader(rt),
    ...buildTop(rt),
    ...buildBottom(rt),
    stage: h('div', { class: 'runner-stage' }),
    announcer: h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' }),
  };
}
