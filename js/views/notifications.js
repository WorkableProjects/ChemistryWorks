// Student bell (V5-10): unread count, panel of derived notifications; opening marks them read.
import { h, icon } from '../ui.js';
import { CONFIG } from '../config.js';
import { markNotificationsRead } from '../lib/api.js';
import { toMs } from './home/upnext.js';
import { formatRelative } from '../lib/dates.js';
import { ensureCss } from '../lib/css-loader.js';

const LABEL = { assignment: 'New assignment', due_soon: 'Due soon', feedback: 'Feedback released', reminder: 'Reminder' };

/** Bell button + dropdown panel. `getHub()` returns the current hub; call `bell.update()` after a profile refresh. */
export function bell(ctx, getHub) {
  ensureCss('hub');
  const readIds = new Set();
  let open = false;
  const count = h('span', { class: 'bell__count mono', dataset: { testid: 'bell-count' } });
  const btn = h('button', { type: 'button', class: 'btn btn--subtle btn--sm bell__btn', 'aria-label': 'Notifications', 'aria-expanded': 'false', dataset: { testid: 'bell' } },
    icon('bell', { size: 16 }), count);
  const panel = h('div', { class: 'bell__panel hub-student', hidden: true, role: 'region', 'aria-label': 'Notifications', dataset: { testid: 'bell-panel' } });
  const wrap = h('div', { class: 'bell' }, btn, panel);
  const items = () => { const hub = getHub(); return hub && Array.isArray(hub.notifications) ? hub.notifications : []; };
  const unread = () => items().filter((n) => !n.read && !readIds.has(n.id));
  const setOpen = (v) => { open = v; panel.hidden = !v; btn.setAttribute('aria-expanded', String(v)); };

  function paint() {
    const u = unread().length;
    count.textContent = u > 0 ? String(u) : '';
    count.hidden = u === 0;
    btn.setAttribute('aria-label', u > 0 ? `Notifications, ${u} unread` : 'Notifications');
    const list = items().slice().sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0)).slice(0, 20);
    panel.replaceChildren(list.length
      ? h('ul', { class: 'bell__list' }, list.map((n) => h('li', { class: ['bell__item', n.read || readIds.has(n.id) ? '' : 'is-unread'], dataset: { testid: `notification-${n.id}` } },
        h('span', { class: 'bell__title' }, n.title || LABEL[n.type] || 'Notification'),
        h('span', { class: 'bell__meta' }, [LABEL[n.type], formatRelative(n.createdAt)].filter(Boolean).join(' · ')))))
      : h('p', { class: 'empty' }, 'Nothing new'));
  }

  function toggle() {
    setOpen(!open);
    if (!open) return;
    paint(); // unread styling shows once, then the items are marked read
    const ids = unread().map((n) => n.id);
    if (!ids.length) return;
    ids.forEach((id) => readIds.add(id));
    count.textContent = ''; count.hidden = true;
    btn.setAttribute('aria-label', 'Notifications');
    markNotificationsRead({ gasUrl: CONFIG.GAS_WEB_APP_URL, ids }).catch(() => {});
  }
  btn.addEventListener('click', toggle);
  document.addEventListener('click', (e) => { if (open && !wrap.contains(e.target)) setOpen(false); });
  wrap.update = paint;
  paint();
  return wrap;
}
