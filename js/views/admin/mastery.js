// Admin › Mastery (V4-02, S13): per student and class, % mastery per topic (question tags, bank tags or section titles),
// as a heat map with the numbers written in every cell; "Who needs help with …?"; click a student for their profile.
import { h, mount, icon, openModal } from '../../ui.js';
import { fetchResults, adminCall } from '../../lib/api.js';
import { hasAdminAuth } from '../../lib/admin-session.js';
import { loadTest } from '../../lib/tests.js';
import { normalizeRow } from './stats.js';
import { masteryTable, needsHelp, studentProfile } from '../../lib/mastery.js';
import { emptyState, skeleton } from './common.js';

const band = (p) => (p === null ? 'none' : p >= 85 ? 'high' : p >= 70 ? 'mid' : p >= 50 ? 'low' : 'very-low');

function trendSvg(values) {
  if (values.length < 2) return null;
  const W = 240, H = 60, n = values.length;
  const pts = values.map((v, i) => `${(i / (n - 1)) * (W - 8) + 4},${H - 4 - (Math.max(0, Math.min(100, v)) / 100) * (H - 8)}`).join(' ');
  return h('svg', { class: 'adm-trend', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Score trend: ${values.map((v) => `${Math.round(v)}%`).join(', ')}` },
    h('polyline', { points: pts, fill: 'none', 'stroke-width': '2.5', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
}

export function openStudentProfile(ctx, rows, email) {
  const p = studentProfile(rows, email);
  const accSlot = h('p', { class: 'faint' }, 'Loading accommodations…');
  adminCall('getAccommodations', {}, { gasUrl: ctx.config.GAS_WEB_APP_URL }).then((r) => {
    const mine = (r.ok ? r.data.accommodations : []).filter((a) => a.email === p.email);
    accSlot.textContent = mine.length ? mine.map((a) => `${a.testCode === '*' ? 'All tests' : a.testCode}: ${[a.extraTime > 1 ? `× ${a.extraTime} time` : '', a.extraAttempts ? `${a.extraAttempts} extra attempt(s)` : '', a.reducedChoices ? 'reduced choices' : '', a.readAloud ? 'read-aloud' : '', a.notes].filter(Boolean).join(', ')}`).join(' · ') : 'No accommodations.';
  });
  openModal({ title: p.name, testid: 'student-profile', wide: true, body: h('div', { class: 'stack' },
    h('p', { class: 'muted' }, p.email),
    trendSvg(p.trend),
    h('div', { class: 'adm-table-wrap' }, h('table', { class: 'adm-table' }, h('thead', {}, h('tr', {}, ['Test', 'Score', 'Status', 'Released', 'Submitted'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, p.tests.map((t) => h('tr', {}, h('td', {}, t.title, h('div', { class: 'faint' }, t.code)), h('td', {}, `${Math.round(t.pct)}%`), h('td', {}, t.status || '—', t.late ? ' · Late' : ''), h('td', {}, t.released ? 'Yes' : 'No'), h('td', {}, t.submittedAt ? new Date(t.submittedAt).toLocaleDateString() : '—')))))),
    h('h3', { class: 'adm-h3' }, 'Accommodations'), accSlot), actions: [{ label: 'Close', variant: 'primary' }] });
}

export function renderMastery(root, ctx, { goSettings } = {}) {
  const gasUrl = ctx.config.GAS_WEB_APP_URL;
  if (!gasUrl || !hasAdminAuth()) {
    mount(root, emptyState('key', 'Connect the backend first', 'Mastery is computed from submissions in the Google Sheet.', 'mastery-no-auth'),
      goSettings ? h('button', { class: 'btn btn--primary', type: 'button', on: { click: goSettings } }, 'Open Settings') : null);
    return undefined;
  }
  let alive = true;
  const body = h('div', { class: 'stack', dataset: { testid: 'mastery-body' } }, skeleton(4));
  (async () => {
    const r = await fetchResults({ gasUrl });
    if (!alive) return;
    if (!r.ok) { mount(body, h('p', { class: 'notice notice--error' }, icon('alert'), h('span', {}, r.error))); return; }
    const rows = r.rows.map(normalizeRow).filter((x) => !/not counted|Not on roster|Extra attempt/.test(x.status || ''));
    const codes = [...new Set(rows.map((x) => String(x.test_code || '').toUpperCase()).filter(Boolean))];
    const tests = {};
    await Promise.all(codes.map(async (c) => { try { tests[c] = (await loadTest(c, { config: ctx.config, includeDrafts: true })).test; } catch { /* missing test */ } }));
    if (!alive) return;
    const table = masteryTable(rows, tests);
    if (!table.topics.length) { mount(body, emptyState('chart', 'No topics yet', 'Tag questions with a topic (question tags, the bank, or section titles) to see mastery per topic.', 'mastery-empty')); return; }
    const topicSel = h('select', { class: 'select adm-select-sm', 'aria-label': 'Topic', dataset: { testid: 'mastery-topic' } }, table.topics.map((t) => h('option', { value: t }, t)));
    const help = h('p', { 'aria-live': 'polite', dataset: { testid: 'mastery-help' } });
    const showHelp = () => { const list = needsHelp(table, topicSel.value); help.textContent = list.length ? `Below 70%: ${list.map((s) => `${s.name} (${s.byTopic[topicSel.value].pct}%)`).join(', ')}` : 'Everyone with work on this topic is at 70% or above.'; };
    topicSel.addEventListener('change', showHelp);
    const cell = (c) => h('td', { class: `adm-heat adm-heat--${band(c ? c.pct : null)}` }, c && c.pct !== null ? `${Math.round(c.pct)}%` : '—');
    mount(body,
      h('div', { class: 'row row--wrap' }, h('label', { class: 'field__label' }, 'Who needs help with'), topicSel, help),
      h('div', { class: 'adm-table-wrap' }, h('table', { class: 'adm-table adm-mastery', dataset: { testid: 'mastery-table' } },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Student'), ...table.topics.map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {},
          h('tr', { class: 'adm-mastery__class' }, h('th', { scope: 'row' }, 'Class'), ...table.topics.map((t) => cell(table.classByTopic[t]))),
          ...table.students.map((s) => h('tr', {}, h('th', { scope: 'row' }, h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: `mastery-student-${s.email}` }, on: { click: () => openStudentProfile(ctx, rows, s.email) } }, s.name)),
            ...table.topics.map((t) => cell(s.byTopic[t]))))))),
      h('p', { class: 'faint' }, 'Colour bands: 85%+, 70–84%, 50–69%, below 50%. Each cell also shows its number.'));
    showHelp();
  })();
  mount(root, h('div', { class: 'stack', dataset: { testid: 'mastery' } }, h('h2', { class: 'adm-h2' }, 'Mastery by topic'), body));
  return () => { alive = false; };
}
