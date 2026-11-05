// "Opens on …" / "This test is closed" / "Only for students on the class roster" (V4-02 S11/S12).
// render(root, ctx, { reason: 'not_open'|'closed'|'not_on_roster', title, opensAt, closesAt, code })
import { mount, h, icon, appHeader, userBadge } from '../ui.js';
import { statusPage } from './status-page.js';
import { formatWhen } from '../lib/schedule.js';

export function render(root, ctx, params = {}) {
  const { reason, title = '', opensAt, closesAt, code } = params;
  const copy = {
    not_open: { icon: 'clock', title: 'Not open yet', lines: [opensAt ? `This test opens on ${formatWhen(opensAt)}.` : 'This test is not open yet.', 'Come back then with the same code.'] },
    closed: { icon: 'lock', title: 'This test is closed', lines: [closesAt ? `It closed on ${formatWhen(closesAt)}.` : 'It is no longer accepting answers.', 'Ask your teacher if you need more time.'] },
    not_on_roster: { icon: 'user', title: 'Not on the class list', lines: ['This test is only for students on the class roster.', `You are signed in as ${ctx.user?.email || 'unknown'}. Ask your teacher to add you, or sign in with your school account.`] },
  }[reason] || { icon: 'info', title: 'Not available', lines: ['This test is not available right now.'] };
  const page = statusPage({
    icon: copy.icon, tone: 'warning', art: 'badge', title: title ? `${title}: ${copy.title}` : copy.title, lines: copy.lines, testid: `test-${reason}`,
    actions: [h('button', { class: 'btn btn--ghost', type: 'button', on: { click: () => ctx.navigate('landing') } }, icon('home', { size: 16 }), 'Back to start')],
  });
  mount(root, h('div', { class: 'status-shell', dataset: { code: code || '' } }, appHeader({ subtitle: title, onHome: () => ctx.navigate('landing'), right: userBadge(ctx.user) }), page));
  const t = setTimeout(() => page.querySelector('.status-page__title')?.focus({ preventScroll: true }), 50);
  return () => clearTimeout(t);
}
