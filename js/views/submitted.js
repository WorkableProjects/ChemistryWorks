// "You already submitted this test" notice (V3-01 / V3-02), shown from the test link when a submission exists
// but grades are not released yet.
// render(root, ctx, { test, source, status, canRetake }) -> cleanup()

import { h, mount, icon, appHeader, userBadge } from '../ui.js';

function fmtWhen(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function render(root, ctx, params = {}) {
  const { test, source, status = {}, canRetake = false } = params;
  const user = ctx.user;
  const when = fmtWhen(status.latest?.submitted_at);
  const single = !!test?.singleSubmission;
  const start = () => ctx.navigate(test.gameMode === true ? 'mode-select' : 'runner', { test, source });

  const title = h('h1', { class: 'feedback__title', tabindex: '-1' }, test?.title || test?.code || 'Test');
  const lines = [
    when ? `You submitted this test on ${when}.` : 'You’ve already submitted this test.',
    status.source === 'local' ? 'It was saved on this device and will be sent when you’re back online.' : 'Your teacher hasn’t released grades yet. Check back here later.',
  ];
  const buttons = [];
  if (canRetake) {
    buttons.push(h('button', { class: 'btn btn--primary', type: 'button', on: { click: start }, dataset: { testid: 'take-again' } }, icon('right', { size: 16 }), 'Take again'));
  } else if (test?.gameMode === true) {
    buttons.push(h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'practice-game' },
      on: { click: () => ctx.navigate('mode-select', { test, source, studyBlocked: true }) } }, icon('flag', { size: 16 }), 'Practice in Game mode'));
  }
  buttons.push(h('button', { class: 'btn btn--ghost', type: 'button', on: { click: () => ctx.navigate('landing') } }, icon('home', { size: 16 }), 'Back to start'));

  mount(root, h('div', { class: 'feedback-shell' },
    appHeader({ title: 'ChemistryWorks', subtitle: test?.title, onHome: () => ctx.navigate('landing'), right: userBadge(user) }),
    h('main', { class: 'feedback', dataset: { testid: 'already-submitted' } },
      title,
      h('div', { class: 'notice notice--info', role: 'status' }, icon('check'),
        h('div', { class: 'stack' }, lines.map((l) => h('span', {}, l)),
          single && !canRetake ? h('span', { class: 'muted' }, 'This test allows one submission per student. Ask your teacher if you need a retake.') : null)),
      h('div', { class: 'feedback-actions' }, buttons))));
  const t = setTimeout(() => title.focus({ preventScroll: true }), 50);
  return () => clearTimeout(t);
}
