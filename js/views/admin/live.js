// Admin › Live monitor (V4-02, S13): who has started a test, how far along, time left, who submitted, who went idle
// (no ping for 3 minutes). Auto-refreshes every 30 s while open. Students' runners ping every 60 s.
import { h, mount, icon } from '../../ui.js';
import { adminCall } from '../../lib/api.js';
import { hasAdminAuth } from '../../lib/admin-session.js';
import { liveSummary } from '../../lib/live.js';
import { emptyState, skeleton } from './common.js';
import { formatDuration } from '../../ui.js';

export function renderLive(root, ctx, { goSettings } = {}) {
  const gasUrl = ctx.config.GAS_WEB_APP_URL;
  if (!gasUrl || !hasAdminAuth()) {
    mount(root, emptyState('key', 'Connect the backend first', 'The live monitor reads progress pings stored in the Google Sheet.', 'live-no-auth'),
      goSettings ? h('button', { class: 'btn btn--primary', type: 'button', on: { click: goSettings } }, 'Open Settings') : null);
    return undefined;
  }
  let alive = true;
  let timer = null;
  const code = h('input', { class: 'input adm-select-sm', placeholder: 'Test code (all tests if empty)', 'aria-label': 'Test code', dataset: { testid: 'live-code' }, on: { change: () => load() } });
  const stamp = h('span', { class: 'faint', 'aria-live': 'polite', dataset: { testid: 'live-updated' } });
  const body = h('div', { dataset: { testid: 'live-body' } }, skeleton(3));
  async function load() {
    const r = await adminCall('getLive', { testCode: code.value.trim() }, { gasUrl });
    if (!alive) return;
    stamp.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    if (!r.ok) { mount(body, h('p', { class: 'notice notice--error' }, icon('alert'), h('span', {}, r.error))); return; }
    const list = (r.data.students || []).sort((a, b) => Number(a.submitted) - Number(b.submitted) || a.name.localeCompare(b.name));
    if (!list.length) { mount(body, emptyState('clock', 'Nobody has started yet', 'Students appear here a few seconds after they open the test.', 'live-empty')); return; }
    const s = liveSummary(list);
    mount(body,
      h('div', { class: 'row row--wrap adm-live-summary' },
        h('span', { class: 'pill pill--primary', dataset: { testid: 'live-working' } }, `${s.working} working`),
        h('span', { class: 'pill pill--warning', dataset: { testid: 'live-idle' } }, `${s.idle} idle`),
        h('span', { class: 'pill pill--success', dataset: { testid: 'live-submitted' } }, `${s.submitted} submitted`)),
      h('div', { class: 'adm-table-wrap' }, h('table', { class: 'adm-table' },
        h('thead', {}, h('tr', {}, ['Student', 'Test', 'Progress', 'Time left', 'Status', 'Last seen'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, list.map((st) => h('tr', { dataset: { testid: `live-row-${st.email}` } },
          h('td', {}, st.name || st.email, h('div', { class: 'faint' }, st.email)), h('td', {}, st.testCode),
          h('td', {}, h('span', { class: 'adm-live-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(st.total || 0), 'aria-valuenow': String(st.answered), 'aria-label': `${st.answered} of ${st.total} answered` },
            h('span', { class: 'adm-live-bar__fill', style: { transform: `scaleX(${st.total ? Math.min(1, st.answered / st.total) : 0})` } })), ` ${st.answered} / ${st.total}`),
          h('td', {}, st.timeLeft === null ? '—' : formatDuration(st.timeLeft)),
          h('td', {}, h('span', { class: ['pill', st.submitted ? 'pill--success' : st.idle ? 'pill--warning' : 'pill--primary'] }, st.submitted ? 'Submitted' : st.idle ? 'Idle' : 'Working')),
          h('td', {}, st.lastPing ? new Date(st.lastPing).toLocaleTimeString() : '—')))))));
  }
  mount(root, h('div', { class: 'stack', dataset: { testid: 'live' } },
    h('div', { class: 'row row--wrap' }, h('h2', { class: 'adm-h2' }, 'Live monitor'), code,
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'live-refresh' }, on: { click: () => load() } }, icon('refresh', { size: 14 }), 'Refresh'), stamp),
    h('p', { class: 'muted' }, 'Refreshes every 30 seconds while this page is open. Idle = no activity for 3 minutes.'),
    body));
  load();
  timer = setInterval(() => { if (document.visibilityState !== 'hidden') load(); }, 30000);
  return () => { alive = false; clearInterval(timer); };
}
