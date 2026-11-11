// "My dashboard" for the signed-in landing page (V4-05). dashboardSection(ctx, { progress, results }) -> HTMLElement | null
// Mounts the practice card from ../practice-card.js when that module exists (built by the games work) via a dynamic import.

import { h, icon } from '../../ui.js';
import { buildDashboard, STATUS_LABELS } from './dashboard-model.js';

const PILL = { 'in-progress': 'pill--primary', upcoming: '', submitted: 'pill--warning', released: 'pill--success' };
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');

const ofTotal = (n, t) => (t > 0 ? `${n} of ${t}` : `${n}`);

export function dashboardSection(ctx, { progress = [], results = [], practice = true, onRemove = null, title = 'Your tests' } = {}) {
  const rows = buildDashboard({ progress, results });
  // The practice slot is only added to the page once the card has content (no empty white card).
  const practiceSlot = h('div', { class: 'dash__practice', dataset: { testid: 'dash-practice' } });
  const section = h('section', { class: 'tests-block dash', 'aria-label': title, dataset: { testid: 'my-dashboard' } });
  if (practice) {
    import('../practice-card.js').then((m) => {
      const node = typeof m.practiceCard === 'function' ? m.practiceCard({ ctx, user: ctx.user }) : null;
      if (!(node instanceof Node)) return;
      practiceSlot.appendChild(node);
      new MutationObserver(() => { if (!node.hidden && !practiceSlot.isConnected) section.appendChild(practiceSlot); }).observe(node, { attributes: true, attributeFilter: ['hidden'] });
      if (!node.hidden) section.appendChild(practiceSlot);
    }).catch(() => { /* practice card not available */ });
  }
  if (!rows.length) {
    section.append(h('h3', { class: 'tests-block__title' }, title),
      h('p', { class: 'muted', dataset: { testid: 'dash-empty' } }, 'Enter a test code above to start your first test'));
    return section;
  }
  const counts = (s) => rows.filter((r) => r.status === s).length;
  const summary = [['in progress', counts('in-progress')], ['submitted', counts('submitted')], ['released', counts('released')]]
    .filter(([, n]) => n > 0).map(([l, n]) => `${n} ${l}`).join(' · ');
  const hasResult = rows.some((r) => r.result);
  const list = h('ul', { class: 'dash__list', dataset: { testid: hasResult ? 'past-results' : 'dash-list' } }, rows.map((r) => {
    const li = h('li', { class: 'dash__item', dataset: { testid: `dash-row-${r.code}` } },
      h('div', { class: 'dash__main' },
        h('span', { class: 'dash__title' }, r.title),
        h('span', { class: 'dash__code muted' }, r.code),
        r.dueSoon ? h('span', { class: 'pill pill--warning' }, 'Closing soon') : null),
      h('div', { class: 'dash__meta' },
        h('span', { class: ['pill', PILL[r.status]], dataset: { testid: 'dash-status' } }, STATUS_LABELS[r.status]),
        r.score && r.score.total > 0 ? h('span', { class: 'dash__score', dataset: { testid: 'dash-score' } }, `${ofTotal(r.score.achieved, r.score.total)}${r.score.pending && r.status !== 'released' ? ' so far' : ''}`)
          : r.score ? h('span', { class: 'dash__score', dataset: { testid: 'dash-score' } }, `${r.score.percentage}%`) : null,
        r.opensAt ? h('span', { class: 'muted' }, `Opens ${fmtDate(r.opensAt)}`) : null,
        r.closesAt ? h('span', { class: 'muted' }, `Closes ${fmtDate(r.closesAt)}`) : null),
      r.status === 'in-progress' && r.answered > 0
        ? h('span', { class: 'dash__act', dataset: { testid: `dash-resume-${r.code}` } },
          h('button', { type: 'button', class: 'btn btn--sm', dataset: { testid: `resume-${r.code}` }, on: { click: () => ctx.openTest(r.code) } },
            `${ofTotal(r.answered, r.total)} answered`, ' · Resume', icon('right', { size: 14 })))
        : null,
      r.status === 'in-progress' && r.answered === 0
        ? h('span', { class: 'dash__act' },
          h('button', { type: 'button', class: 'btn btn--sm', dataset: { testid: `dash-resume-${r.code}` }, on: { click: () => ctx.openTest(r.code) } }, 'Open', icon('right', { size: 14 })),
          onRemove ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: `dash-remove-${r.code}` }, 'aria-label': `Remove ${r.title}`,
            on: { click: () => { onRemove(r.code); li.remove(); } } }, 'Remove') : null)
        : null,
      r.result && r.result.submission_id && r.status !== 'in-progress'
        ? h('button', { type: 'button', class: 'btn btn--sm', dataset: { testid: `view-feedback-${r.result.submission_id}` }, 'aria-label': `View feedback for ${r.title}`,
          on: { click: () => ctx.navigate('feedback', { payload: r.result }) } }, 'View feedback') : null);
    return li;
  }));
  section.append(h('h3', { class: 'tests-block__title' }, title), summary ? h('p', { class: 'dash__summary muted' }, summary) : null, list);
  return section;
}
