// Assignment tracker: roster grid with status chips, filters, % and last mode for in progress, Remind missing.
import { h, mount, icon, toast, openModal } from '../../../ui.js';
import { remindMissing, deleteAssignment, previewGradeSync } from '../../../lib/api.js';
import { skeleton, emptyState } from '../common.js';
import { statusRes, assignmentsRes, creds, STATUS, STATUS_ORDER, studentHref } from './data.js';
import { openAssignDialog } from './assign.js';
import { openSyncDialog, runSync, classroomErrorText, getSynced, getFailure } from '../classroom-sync.js';
import { formatDate } from '../../../lib/dates.js';
import { resultsResource } from '../data.js';
import { normalizeRow, STATUS as RESULT_STATUS } from '../stats.js';
import { loadTest } from '../../../lib/tests.js';
import { CONFIG } from '../../../config.js';
import { adminTagStats } from '../../../lib/tag-stats.js';
import { sheetTagsResource } from '../../../lib/tags.js';
import { tagSummary } from '../../tag-summary.js';

const detail = (r) => {
  if (r.status === 'in_progress') return `${Math.round(r.percentDone || 0)}%${r.lastMode ? ` · ${r.lastMode}` : ''}`;
  if (r.submittedAt) return `${r.late ? 'Late, ' : ''}${formatDate(r.submittedAt)}`;
  if (r.score !== undefined && r.score !== null) return `${Math.round(r.score)}%`;
  return '';
};

export function renderTracker(host, ctx, { assignment, classes, onBack, onChanged }) {
  const res = statusRes(assignment.id);
  let alive = true;
  let filter = 'all';
  const body = h('div', { class: 'stack' }, skeleton(4));
  const live = () => (res.peek() && res.peek().assignment) || assignment;
  const isPosted = () => !!live().classroomCourseWorkId;
  let sentBefore = new Set(); // students Classroom already holds a grade from us for
  const loadSent = async () => {
    if (!isPosted()) return;
    const r = await previewGradeSync({ ...creds(), assignmentId: assignment.id });
    if (!alive || !r.ok) return;
    sentBefore = new Set((r.data.rows || []).filter((x) => x.lastSent !== null && x.lastSent !== undefined).map((x) => x.email));
    paint();
  };
  // Tag results: this assignment's submissions plus the test, so each tag gets a class average and each student a breakdown.
  let tagRows = []; // normalized submissions of this assignment, one per student (the latest)
  let tagTest = null;
  const loadTagData = async () => {
    try {
      const [d, t] = await Promise.all([resultsResource().get(), loadTest(assignment.testCode, { config: CONFIG, includeDrafts: true }).then((x) => x.test).catch(() => null)]);
      if (!alive || !t) return;
      const mine = (d?.rows || []).filter((raw) => raw && raw.assignmentId === assignment.id).map(normalizeRow).filter((r) => r.status !== RESULT_STATUS.EXTRA);
      const latest = new Map();
      for (const r of mine) { const k = String(r.student_email || '').toLowerCase(); if (!latest.has(k) || String(r.timestamp) > String(latest.get(k).timestamp)) latest.set(k, r); }
      tagRows = [...latest.values()];
      tagTest = t;
      paint();
    } catch { /* the tracker works without tag results */ }
  };
  const tagsRes = sheetTagsResource(CONFIG.GAS_WEB_APP_URL);
  const offTags = tagsRes.subscribe(() => paint());
  tagsRes.get().catch(() => { /* local tag names still show */ });
  const rowTags = (email) => {
    const mine = tagRows.filter((r) => String(r.student_email || '').toLowerCase() === String(email).toLowerCase());
    return tagTest ? adminTagStats(mine, () => tagTest) : [];
  };
  const showStudentTags = (r) => openModal({ title: `${r.name || r.email}: by tag`, testid: 'tracker-student-tags-modal',
    body: tagSummary(rowTags(r.email), { title: 'By tag', testid: 'tracker-student-tags', tag: 'h4', hint: 'Points earned per tag on this assignment, graded answers only.' }) || h('p', { class: 'faint' }, 'No tagged questions answered yet.'),
    actions: [{ label: 'Close', variant: 'primary' }] });
  const syncCell = (r) => {
    const failed = getFailure(assignment.id, r.email);
    if (failed) {
      return h('span', { class: 'hub-sync is-failed', dataset: { testid: `tracker-sync-${r.email}`, sync: 'failed' } }, classroomErrorText(failed),
        h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: `tracker-retry-${r.email}` }, on: { click: async () => {
          const out = await runSync(assignment.id, { emails: [r.email] });
          if (out.error) toast(classroomErrorText(out.error), { type: 'error' });
          await loadSent(); paint();
        } } }, 'Retry'));
    }
    const at = getSynced(assignment.id, r.email);
    if (at) return h('span', { class: 'hub-sync', dataset: { testid: `tracker-sync-${r.email}`, sync: 'synced' } }, `Synced ${formatDate(new Date(at).toISOString())}`);
    if (sentBefore.has(r.email)) return h('span', { class: 'hub-sync', dataset: { testid: `tracker-sync-${r.email}`, sync: 'synced' } }, 'Synced');
    return h('span', { class: 'hub-sync', dataset: { testid: `tracker-sync-${r.email}`, sync: 'none' } }, 'Not synced');
  };

  function paint() {
    if (!alive) return;
    const data = res.peek();
    if (!data) return;
    const rows = data.rows;
    const counts = {};
    rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const shown = rows.filter((r) => filter === 'all' || r.status === filter)
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || String(a.name || a.email).localeCompare(String(b.name || b.email)));
    const chip = (id, label, n) => h('button', { class: `hub-chip${filter === id ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(filter === id), dataset: { testid: `tracker-filter-${id}` }, on: { click: () => { filter = id; paint(); } } },
      label, h('span', { class: 'hub-chip__n' }, String(n)));
    const classTags = tagTest ? adminTagStats(tagRows, () => tagTest) : [];
    mount(body,
      tagSummary(classTags, { title: 'Class average by tag', testid: 'tracker-tags', tag: 'h4', hint: 'Average points per tag across the students who have submitted, graded answers only.' }),
      h('div', { class: 'hub-chips', role: 'group', 'aria-label': 'Filter by status' }, chip('all', 'All', rows.length), ...STATUS_ORDER.filter((s) => counts[s]).map((s) => chip(s, STATUS[s].label, counts[s]))),
      !rows.length ? h('p', { class: 'hub-empty' }, 'This class has no students yet')
        : h('div', { class: 'adm-table-wrap' }, h('table', { class: 'adm-table hub-table' },
          h('thead', {}, h('tr', {}, ['Student', 'Status', 'Detail', ...(classTags.length ? ['By tag'] : []), ...(isPosted() ? ['Classroom'] : [])].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, shown.map((r) => h('tr', { dataset: { testid: `tracker-row-${r.email}` } },
            h('td', {}, h('a', { class: 'hub-link', href: studentHref(r.email), dataset: { testid: `tracker-student-${r.email}` } }, r.name || r.email), r.name ? h('div', { class: 'faint hub-mono' }, r.email) : null),
            h('td', {}, h('span', { class: `pill ${STATUS[r.status] ? STATUS[r.status].cls : ''}`.trim(), dataset: { status: r.status } }, STATUS[r.status] ? STATUS[r.status].label : r.status)),
            h('td', { class: 'hub-mono' }, detail(r)),
            classTags.length ? h('td', {}, rowTags(r.email).length ? h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: `tracker-tags-${r.email}` }, on: { click: () => showStudentTags(r) } }, 'By tag') : h('span', { class: 'faint' }, '—')) : null,
            isPosted() ? h('td', {}, syncCell(r)) : null))))));
  }
  const unsub = res.subscribe(() => { showSync(); paint(); });

  const remind = h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: 'remind-missing' }, on: { click: async () => {
    remind.disabled = true;
    const r = await remindMissing({ ...creds(), id: assignment.id });
    remind.disabled = false;
    if (!r.ok) { toast(`Could not send reminders: ${r.error}`, { type: 'error' }); return; }
    const n = r.data.reminded;
    toast(`Reminded ${typeof n === 'number' ? n : (n && n.length) || 0} student${(typeof n === 'number' ? n : (n && n.length) || 0) === 1 ? '' : 's'}`, { type: 'success' });
  } } }, icon('send', { size: 14 }), 'Remind missing');

  const del = () => {
    const alsoClassroom = h('input', { type: 'checkbox', dataset: { testid: 'delete-in-classroom' } });
    return openModal({ title: 'Delete this assignment?', testid: 'assignment-delete-modal',
      body: h('div', { class: 'stack' }, h('p', {}, 'Students no longer see it. Their submissions stay in Grading.'),
        isPosted() ? h('label', { class: 'row' }, alsoClassroom, h('span', {}, 'Also delete the assignment in Google Classroom')) : null),
      actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Delete', variant: 'danger', testid: 'assignment-delete-confirm', onClick: async (close) => {
        close();
        const deleteInClassroom = isPosted() && alsoClassroom.checked;
        const out = await assignmentsRes().optimistic((d) => (d || []).filter((x) => x.id !== assignment.id), () => deleteAssignment({ ...creds(), id: assignment.id, deleteInClassroom }), { message: 'Could not delete the assignment' });
        if (!out.ok) return;
        const cErr = out.result && out.result.data && out.result.data.classroomError;
        if (cErr) toast(`Assignment deleted, but not in Classroom. ${classroomErrorText(cErr)}`, { type: 'warning', timeout: 10000 });
        else toast('Assignment deleted', { type: 'success' });
        onBack();
      } }] });
  };
  const syncBtn = h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: 'sync-grades' }, hidden: true, on: { click: () => openSyncDialog(ctx, { assignment: live(), onDone: () => { loadSent(); paint(); } }) } }, icon('upload', { size: 14 }), 'Sync grades');
  const showSync = () => { syncBtn.hidden = !isPosted(); };

  mount(host, h('div', { class: 'stack', dataset: { testid: 'tracker' } },
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: onBack } }, icon('left', { size: 14 }), 'Assignments'),
      h('h3', { class: 'adm-h3' }, assignment.title || assignment.testCode),
      h('span', { class: 'faint' }, assignment.dueAt ? `Due ${formatDate(assignment.dueAt)}` : 'No due date'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => openAssignDialog(ctx, { classes, assignment, onSaved: onChanged }) } }, icon('pen', { size: 14 }), 'Edit'),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-label': 'Delete assignment', on: { click: del } }, icon('trash', { size: 14 })),
      syncBtn, remind),
    body));
  res.get().then(() => { showSync(); paint(); loadSent(); loadTagData(); }).catch((e) => { if (alive && !res.peek()) mount(body, emptyState('alert', 'Could not load the tracker', e.message, 'tracker-error')); });
  res.refresh();
  return () => { alive = false; unsub(); offTags(); };
}
