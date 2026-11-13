// Teacher student view: ?admin=true&section=student&email=. Header, every test with status / score / feedback
// state, assignments, in-progress attempts, accommodations (edit link). No XP, level or badges.
import { h, mount, icon, toast } from '../../ui.js';
import { getStudentProfileAdmin } from '../../lib/api.js';
import { adminKey } from '../../lib/admin-session.js';
import { enabled } from '../../config.js';
import { skeleton, emptyState, fmtDate, round2 } from './common.js';
import { openAccommodationEditor } from './accommodations.js';
import { assignmentsRes, statusRes, STATUS } from './hub/data.js';

const emailParam = () => (new URLSearchParams(location.search).get('email') || '').trim().toLowerCase();
const mono = (t) => h('span', { class: 'as-mono' }, t);

export function renderStudent(root, ctx, { goSettings, go } = {}) {
  const email = emailParam();
  const gasUrl = ctx.config.GAS_WEB_APP_URL;
  let alive = true;
  const back = () => { const u = new URL(location.href); u.searchParams.delete('email'); u.searchParams.set('section', 'classes'); history.replaceState(null, '', u); if (go) go('classes', { force: true }); else location.reload(); };
  if (!email) { mount(root, emptyState('user', 'No student chosen', 'Open a student from a class roster, a tracker or Grading.', 'student-none')); return undefined; }
  if (!gasUrl) { mount(root, emptyState('key', 'Connect the backend first', 'Student pages read the Google Sheet.', 'student-no-auth'), goSettings ? h('button', { class: 'btn btn--primary', type: 'button', on: { click: goSettings } }, 'Open Settings') : null); return undefined; }

  const body = h('div', { class: 'stack' }, skeleton(4));
  mount(root, h('div', { class: 'stack admin-student', dataset: { testid: 'student-view' } },
    h('div', { class: 'row' }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: back } }, icon('left', { size: 14 }), 'Classes')), body));

  const section = (title, ...kids) => h('section', { class: 'as-card' }, h('h3', { class: 'as-h' }, title), ...kids);
  const table = (heads, rows, testid) => h('div', { class: 'adm-table-wrap' }, h('table', { class: 'adm-table', dataset: { testid } },
    h('thead', {}, h('tr', {}, heads.map((t) => h('th', { scope: 'col' }, t)))), h('tbody', {}, rows)));

  function feedbackState(r) {
    if (r.status === 'Needs grading' || /needs/i.test(r.status || '')) return 'Waiting for grading';
    return r.released ? 'Released' : 'Not released';
  }

  function paint(d, assignRows) {
    const p = d.profile || {};
    const classes = d.classes || [];
    const results = d.results || [];
    const attempts = d.attempts || [];
    const acc = d.accommodations || [];
    mount(body,
      h('header', { class: 'as-head' },
        p.picture ? h('img', { class: 'as-avatar', src: p.picture, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'as-avatar as-avatar--tile', 'aria-hidden': 'true' }, (p.name || email).slice(0, 2)),
        h('div', { class: 'as-id' },
          h('h2', { class: 'adm-h2' }, p.name || email), mono(email),
          h('p', { class: 'muted' }, classes.length ? classes.map((c) => c.name + (c.period ? ` · Period ${c.period}` : '')).join(', ') : 'Not on a class')),
        h('dl', { class: 'as-facts' },
          h('div', {}, h('dt', {}, 'Last seen'), h('dd', {}, p.lastSeen ? fmtDate(p.lastSeen) : 'Never')),
          h('div', {}, h('dt', {}, 'Streak'), h('dd', {}, mono(`${p.streakDays || 0} day${p.streakDays === 1 ? '' : 's'}`))))),
      assignRows.length ? section('Assignments', table(['Assignment', 'Class', 'Due', 'Status'], assignRows.map((a) => h('tr', {},
        h('td', {}, a.title), h('td', {}, a.className), h('td', {}, a.dueAt ? fmtDate(a.dueAt) : '—'),
        h('td', {}, h('span', { class: `pill ${(STATUS[a.status] || {}).cls || ''}`.trim() }, (STATUS[a.status] || {}).label || a.status || '—'), a.detail ? h('span', { class: 'faint as-mono' }, ` ${a.detail}`) : null))), 'student-assignments')) : null,
      section('Tests', results.length ? table(['Test', 'Submitted', 'Status', 'Score', 'Feedback'], results.map((r) => h('tr', {},
        h('td', {}, h('span', { class: 'as-tile' }, r.testCode), ' ', r.title), h('td', { class: 'adm-td-nowrap' }, fmtDate(r.submittedAt)), h('td', {}, r.status || '—'),
        h('td', {}, r.scoreAchieved !== undefined && r.scoreAchieved !== null ? mono(`${round2(r.scoreAchieved)} / ${round2(r.scoreTotal)}${r.percentage !== undefined ? ` (${round2(r.percentage)}%)` : ''}`) : '—'),
        h('td', {}, feedbackState(r)))), 'student-results') : h('p', { class: 'muted' }, 'No submissions yet')),
      section('In progress', attempts.length ? table(['Test', 'Mode', 'Done', 'Updated'], attempts.map((a) => h('tr', {},
        h('td', {}, h('span', { class: 'as-tile' }, a.code)), h('td', {}, a.mode || '—'), h('td', {}, mono(`${Math.round(a.percentDone || 0)}%`)), h('td', {}, a.updatedAt ? fmtDate(a.updatedAt) : '—'))), 'student-attempts') : h('p', { class: 'muted', dataset: { testid: 'student-attempts' } }, 'Nothing in progress')),
      h('section', { class: 'as-card', dataset: { testid: 'student-accommodations' } }, h('div', { class: 'row row--wrap' }, h('h3', { class: 'as-h' }, 'Accommodations'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => openAccommodationEditor(ctx, { email, onSaved: load }) } }, icon('pen', { size: 14 }), 'Edit accommodations')),
      acc.length ? h('ul', { class: 'as-list' }, acc.map((a) => h('li', {}, h('span', { class: 'as-tile' }, a.testCode === '*' ? 'All' : a.testCode), ' ',
        [a.extraTime > 1 ? `Extra time × ${a.extraTime}` : '', a.extraAttempts ? `${a.extraAttempts} extra attempt${a.extraAttempts === 1 ? '' : 's'}` : '', a.reducedChoices ? 'Reduced choices' : '', a.readAloud ? 'Read-aloud' : '', a.extensionUntil ? `Extended to ${fmtDate(a.extensionUntil)}` : ''].filter(Boolean).join(' · ') || 'No changes'))) : h('p', { class: 'muted' }, 'None set')));
  }

  async function assignmentRowsFor(d) {
    if (!enabled('classHub')) return [];
    try {
      const list = (await assignmentsRes().get()) || [];
      const ids = new Set((d.classes || []).map((c) => c.id));
      const names = Object.fromEntries((d.classes || []).map((c) => [c.id, c.name]));
      const mine = list.filter((a) => ids.has(a.classId)).slice(0, 12);
      const out = await Promise.all(mine.map(async (a) => {
        let row = null;
        try { const s = await statusRes(a.id).get(); row = (s.rows || []).find((r) => r.email === email); } catch { /* status unavailable */ }
        return { title: a.title || a.testCode, className: names[a.classId] || '', dueAt: a.dueAt, status: row ? row.status : '', detail: row && row.status === 'in_progress' ? `${Math.round(row.percentDone || 0)}%` : '' };
      }));
      return out;
    } catch { return []; }
  }

  async function load() {
    const r = await getStudentProfileAdmin({ gasUrl, adminKey: adminKey(), email });
    if (!alive) return;
    if (!r.ok) { mount(body, h('p', { class: 'notice notice--error', dataset: { testid: 'student-error' } }, icon('alert'), h('span', {}, `Could not load this student: ${r.error}`))); return; }
    paint(r.data, []);
    const rows = await assignmentRowsFor(r.data);
    if (alive && rows.length) paint(r.data, rows);
  }
  load().catch((e) => toast(e.message, { type: 'error' }));
  return () => { alive = false; };
}
