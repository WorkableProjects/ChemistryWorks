// "My dashboard" for the signed-in landing page (V4-05). dashboardSection(ctx, { progress, results }) -> HTMLElement | null
// Mounts the practice card from ../practice-card.js when that module exists (built by the games work) via a dynamic import.

import { h, icon } from '../../ui.js';
import { buildDashboard, STATUS_LABELS } from './dashboard-model.js';

const PILL = { 'in-progress': 'pill--primary', upcoming: '', submitted: 'pill--warning', released: 'pill--success' };
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');

export function dashboardSection(ctx, { progress = [], results = [] } = {}) {
  const rows = buildDashboard({ progress, results });
  const practiceSlot = h('div', { class: 'dash__practice', dataset: { testid: 'dash-practice' }, hidden: true });
  import('../practice-card.js').then((m) => {
    const node = typeof m.practiceCard === 'function' ? m.practiceCard({ ctx, user: ctx.user }) : null;
    if (node instanceof Node) { practiceSlot.appendChild(node); practiceSlot.hidden = false; }
  }).catch(() => { /* practice card not built yet */ });
  if (!rows.length) {
    return h('section', { class: 'tests-block dash', 'aria-label': 'My dashboard', dataset: { testid: 'my-dashboard' } },
      h('h3', { class: 'tests-block__title' }, 'My dashboard'),
      h('p', { class: 'muted', dataset: { testid: 'dash-empty' } }, 'Your tests will show up here once you start one.'), practiceSlot);
  }
  const counts = (s) => rows.filter((r) => r.status === s).length;
  return h('section', { class: 'tests-block dash', 'aria-label': 'My dashboard', dataset: { testid: 'my-dashboard' } },
    h('h3', { class: 'tests-block__title' }, 'My dashboard'),
    h('p', { class: 'dash__summary muted' }, `${counts('in-progress')} in progress · ${counts('submitted')} submitted · ${counts('released')} released`),
    h('ul', { class: 'dash__list' }, rows.map((r) => h('li', { class: 'dash__item', dataset: { testid: `dash-row-${r.code}` } },
      h('div', { class: 'dash__main' },
        h('span', { class: 'dash__title' }, r.title),
        h('span', { class: 'dash__code muted' }, r.code),
        r.dueSoon ? h('span', { class: 'pill pill--warning' }, 'Closing soon') : null),
      h('div', { class: 'dash__meta' },
        h('span', { class: ['pill', PILL[r.status]], dataset: { testid: 'dash-status' } }, STATUS_LABELS[r.status]),
        r.score ? h('span', { class: 'dash__score', dataset: { testid: 'dash-score' } }, r.status === 'released' || !r.score.pending ? `${r.score.percentage}%` : `${r.score.percentage}% so far`) : null,
        r.status === 'in-progress' ? h('span', { class: 'muted' }, `${r.answered} answered`) : null,
        r.opensAt ? h('span', { class: 'muted' }, `Opens ${fmtDate(r.opensAt)}`) : null,
        r.closesAt ? h('span', { class: 'muted' }, `Closes ${fmtDate(r.closesAt)}`) : null),
      r.status === 'in-progress'
        ? h('button', { type: 'button', class: 'btn btn--sm', dataset: { testid: `dash-resume-${r.code}` }, on: { click: () => ctx.openTest(r.code) } }, 'Resume', icon('right', { size: 14 }))
        : null))),
    practiceSlot);
}
