// "You already submitted this test" notice, shown from the test link when a submission exists
// but grades are not released yet.
// render(root, ctx, { test, source, status, canRetake }) -> cleanup()

import { h, mount, icon, appHeader, userBadge } from '../ui.js';
import { statusPage } from './status-page.js';
import { formatDateTime } from '../lib/dates.js';

const fmtWhen = (iso) => formatDateTime(iso);

export function render(root, ctx, params = {}) {
  const { test, source, status = {} } = params;
  const user = ctx.user;
  const when = fmtWhen(status.latest?.submitted_at);
  const single = !!test?.singleSubmission;
  const canRetake = params.canRetake === true;
  const start = () => ctx.navigate('runner', { test, source, cleared: true });

  const lines = [
    when ? `You submitted this test on ${when}.` : 'You’ve already submitted this test.',
    status.source === 'local' ? 'It was saved on this device and will be sent when you’re back online.' : 'Your teacher hasn’t released grades yet. Check back here later.',
  ];
  const buttons = [];
  if (canRetake) {
    buttons.push(h('button', { class: 'btn btn--primary', type: 'button', on: { click: start }, dataset: { testid: 'take-again' } }, icon('right', { size: 16 }), 'Take again'));
  } else if (test?.gameMode === true) {
    buttons.push(h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'practice-game' },
      on: { click: () => ctx.navigate('game', { test, source, gameId: 'classic', studyBlocked: true }) } }, icon('flag', { size: 16 }), 'Practice in Game mode'));
  }
  buttons.push(h('button', { class: 'btn btn--ghost', type: 'button', on: { click: () => ctx.navigate('landing') } }, icon('home', { size: 16 }), 'Back to start'));

  const page = statusPage({
    icon: 'check', tone: 'info', art: 'badge', testid: 'already-submitted',
    title: test?.title || test?.code || 'Test',
    lines,
    note: single && !canRetake ? 'This test allows one submission per student. Ask your teacher if you need a retake.' : null,
    actions: buttons,
  });
  mount(root, h('div', { class: 'status-shell' },
    appHeader({ title: 'ChemistryWorks', subtitle: test?.title, onHome: () => ctx.navigate('landing'), right: userBadge(user) }),
    page));
  const title = page.querySelector('.status-page__title');
  const t = setTimeout(() => title.focus({ preventScroll: true }), 50);
  return () => clearTimeout(t);
}
