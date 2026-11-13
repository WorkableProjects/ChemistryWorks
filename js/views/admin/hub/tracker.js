// Assignment tracker: roster grid with status chips, filters, % and last mode for in progress, Remind missing.
import { h, mount, icon, toast, openModal } from '../../../ui.js';
import { remindMissing, deleteAssignment, previewGradeSync, syncGrades } from '../../../lib/api.js';
import { skeleton, emptyState } from '../common.js';
import { statusRes, assignmentsRes, creds, STATUS, STATUS_ORDER, fmtWhen, studentHref } from './data.js';
import { openAssignDialog } from './assign.js';

const detail = (r) => {
  if (r.status === 'in_progress') return `${Math.round(r.percentDone || 0)}%${r.lastMode ? ` · ${r.lastMode}` : ''}`;
  if (r.submittedAt) return `${r.late ? 'Late, ' : ''}${fmtWhen(r.submittedAt)}`;
  if (r.score !== undefined && r.score !== null) return `${Math.round(r.score)}%`;
  return '';
};

const syncCell = (s) => {
  if (!s) return h('span', { class: 'faint' }, '—');
  const at = new Date(s.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return s.status === 'ok' ? h('span', {}, `Synced ${at}`) : h('span', { class: 'pill pill--danger', title: s.error || '' }, 'Not synced');
};

const ACTION_LABELS = { new: 'New', update: 'Update', no_change: 'No change', not_on_roster: 'Not on the Classroom roster', skip_teacher_changed: 'Changed in Classroom (kept)', no_score: 'No score yet' };

// Preview what would be sent, then send in batches until the backend reports no cursor.
function openGradeSync(assignment, onDone) {
  const overwrite = h('input', { type: 'checkbox', dataset: { testid: 'sync-overwrite' } });
  const table = h('div', { class: 'adm-table-wrap', dataset: { testid: 'sync-preview' } }, h('p', { class: 'faint' }, 'Checking Google Classroom…'));
  const load = async () => {
    const r = await previewGradeSync({ ...creds(), assignmentId: assignment.id, overwrite: overwrite.checked });
    if (!r.ok) { mount(table, h('p', { class: 'field-error' }, `Could not read Google Classroom: ${r.error.replace(/_/g, ' ')}`)); return; }
    mount(table, h('table', { class: 'adm-table' },
      h('thead', {}, h('tr', {}, ['Email', 'Score', 'In Classroom', 'Action'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, r.data.rows.map((x) => h('tr', { dataset: { testid: `sync-row-${x.email}`, action: x.action } },
        h('td', { class: 'hub-mono' }, x.email), h('td', {}, x.score == null ? '—' : `${x.score}${x.released ? '' : ' (draft)'}`),
        h('td', {}, x.classroom == null ? '—' : String(x.classroom)), h('td', {}, ACTION_LABELS[x.action] || x.action))))),
      h('p', { class: 'faint' }, r.data.runsAs ? `Sync runs as ${r.data.runsAs}. Unreleased scores go as draft grades only you can see.` : ''));
  };
  overwrite.addEventListener('change', load);
  load();
  openModal({ title: 'Sync grades to Google Classroom', testid: 'grade-sync', wide: true,
    body: h('div', { class: 'stack' }, table, h('label', { class: 'row' }, overwrite, h('span', {}, 'Overwrite Classroom changes'))),
    actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Sync grades', variant: 'primary', testid: 'sync-go', onClick: async (close) => {
      let cursor = null, sent = 0, failed = 0;
      do {
        const r = await syncGrades({ ...creds(), assignmentId: assignment.id, overwrite: overwrite.checked, cursor });
        if (!r.ok) { toast(`Sync stopped: ${r.error.replace(/_/g, ' ')}`, { type: 'error' }); break; }
        r.data.results.forEach((x) => { if (x.status === 'ok') sent++; else failed++; });
        cursor = r.data.cursor;
      } while (cursor !== null && cursor !== undefined);
      close();
      toast(`Sent ${sent} grade${sent === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}`, { type: failed ? 'warning' : 'success' });
      onDone();
    } }] });
}

export function renderTracker(host, ctx, { assignment, classes, onBack, onChanged }) {
  const res = statusRes(assignment.id);
  const posted = !!assignment.classroomCourseWorkId;
  let alive = true;
  let filter = 'all';
  const body = h('div', { class: 'stack' }, skeleton(4));

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
    mount(body,
      h('div', { class: 'hub-chips', role: 'group', 'aria-label': 'Filter by status' }, chip('all', 'All', rows.length), ...STATUS_ORDER.filter((s) => counts[s]).map((s) => chip(s, STATUS[s].label, counts[s]))),
      !rows.length ? h('p', { class: 'hub-empty' }, 'This class has no students yet')
        : h('div', { class: 'adm-table-wrap' }, h('table', { class: 'adm-table hub-table' },
          h('thead', {}, h('tr', {}, ['Student', 'Status', 'Detail', ...(posted ? ['Classroom'] : [])].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, shown.map((r) => h('tr', { dataset: { testid: `tracker-row-${r.email}` } },
            h('td', {}, h('a', { class: 'hub-link', href: studentHref(r.email), dataset: { testid: `tracker-student-${r.email}` } }, r.name || r.email), r.name ? h('div', { class: 'faint hub-mono' }, r.email) : null),
            h('td', {}, h('span', { class: `pill ${STATUS[r.status] ? STATUS[r.status].cls : ''}`.trim(), dataset: { status: r.status } }, STATUS[r.status] ? STATUS[r.status].label : r.status)),
            h('td', { class: 'hub-mono' }, detail(r)),
            posted ? h('td', { dataset: { testid: `tracker-sync-${r.email}` } }, syncCell(data.sync?.[String(r.email).toLowerCase()])) : null))))));
  }
  const unsub = res.subscribe(paint);

  const remind = h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: 'remind-missing' }, on: { click: async () => {
    remind.disabled = true;
    const r = await remindMissing({ ...creds(), id: assignment.id });
    remind.disabled = false;
    if (!r.ok) { toast(`Could not send reminders: ${r.error}`, { type: 'error' }); return; }
    const n = r.data.reminded;
    toast(`Reminded ${typeof n === 'number' ? n : (n && n.length) || 0} student${(typeof n === 'number' ? n : (n && n.length) || 0) === 1 ? '' : 's'}`, { type: 'success' });
  } } }, icon('send', { size: 14 }), 'Remind missing');

  const alsoClassroom = h('input', { type: 'checkbox', dataset: { testid: 'assignment-delete-classroom' } });
  const del = () => openModal({ title: 'Delete this assignment?', testid: 'assignment-delete-modal',
    body: h('div', { class: 'stack' }, h('p', {}, 'Students no longer see it. Their submissions stay in Grading.'),
      posted ? h('label', { class: 'row' }, alsoClassroom, h('span', {}, 'Also delete it from Google Classroom')) : null),
    actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Delete', variant: 'danger', testid: 'assignment-delete-confirm', onClick: async (close) => {
      close();
      const out = await assignmentsRes().optimistic((d) => (d || []).filter((x) => x.id !== assignment.id), () => deleteAssignment({ ...creds(), id: assignment.id, deleteClassroom: alsoClassroom.checked }), { message: 'Could not delete the assignment' });
      if (out.ok) { toast('Assignment deleted', { type: 'success' }); onBack(); }
    } }] });

  mount(host, h('div', { class: 'stack', dataset: { testid: 'tracker' } },
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: onBack } }, icon('left', { size: 14 }), 'Assignments'),
      h('h3', { class: 'adm-h3' }, assignment.title || assignment.testCode),
      h('span', { class: 'faint' }, assignment.dueAt ? `Due ${fmtWhen(assignment.dueAt)}` : 'No due date'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => openAssignDialog(ctx, { classes, assignment, onSaved: onChanged }) } }, icon('pen', { size: 14 }), 'Edit'),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-label': 'Delete assignment', on: { click: del } }, icon('trash', { size: 14 })),
      posted ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'sync-grades' }, on: { click: () => openGradeSync(assignment, () => res.refresh()) } }, icon('upload', { size: 14 }), 'Sync grades') : null,
      remind),
    body));
  res.get().then(() => { paint(); }).catch((e) => { if (alive && !res.peek()) mount(body, emptyState('alert', 'Could not load the tracker', e.message, 'tracker-error')); });
  res.refresh();
  return () => { alive = false; unsub(); };
}
