// Google Classroom grade sync: error copy, the preview dialog (email, score, released, Classroom grade, action),
// the sync loop on the cursor, and the per-student "Synced" memory the tracker shows.
import { h, mount, icon, openModal, toast } from '../../ui.js';
import { previewGradeSync, syncGrades } from '../../lib/api.js';
import { creds } from './hub/data.js';

const ERRORS = {
  classroom_not_our_coursework: 'This assignment was made in Classroom, not here. Post it from ChemistryWorks to sync grades.',
  classroom_not_teacher: 'The account that syncs is not a teacher of this Classroom course. Add it as a teacher in Classroom, then try again.',
  classroom_not_linked: 'Link this class to a Google Classroom course first.',
  classroom_course_not_found: 'That course is not one of the syncing account\'s active courses.',
  classroom_rate_limited: 'Google Classroom asked us to slow down. Try again in a minute.',
  classroom_error: 'Google Classroom could not finish that.',
};

/** Plain sentence for a Classroom error code; `detail` is appended for the generic error. */
export function classroomErrorText(code, detail = '') {
  const base = ERRORS[code];
  if (!base) return code ? `Google Classroom problem: ${code}` : ERRORS.classroom_error;
  return code === 'classroom_error' && detail ? `${base} ${detail}` : base;
}

const RATE_PAUSE_MS = 2000;
const fmtPts = (n) => (n === null || n === undefined || n === '' ? '—' : String(Math.round(Number(n) * 100) / 100));

/** What the action means for the teacher, in words. */
export function actionLabel(row) {
  const a = row.action;
  if (a === 'new' || a === 'update') return row.target === 'assigned' ? 'Send and release' : 'Send as draft';
  if (a === 'same') return 'Up to date';
  if (a === 'skipped_not_on_roster') return 'Skip: not in the Classroom course';
  if (a === 'skipped_not_graded') return 'Skip: not graded yet';
  if (a === 'skipped_teacher_changed') return 'Skip: changed in Classroom';
  return a || '';
}

// "Synced <time>" is kept per assignment and student for this browser session.
const syncedAt = new Map();
const failedBy = new Map();
const keyOf = (id, email) => `${id}|${String(email).toLowerCase()}`;
export const getSynced = (id, email) => syncedAt.get(keyOf(id, email)) || null;
export const getFailure = (id, email) => failedBy.get(keyOf(id, email)) || null;
function record(id, results) {
  const now = Date.now();
  for (const r of results || []) {
    const k = keyOf(id, r.email);
    if (r.status === 'failed') failedBy.set(k, r.error || 'classroom_error');
    else if (r.status === 'draft' || r.status === 'assigned') { syncedAt.set(k, now); failedBy.delete(k); }
  }
}

/** Run syncGrades on its cursor until done. onProgress(n) gets the count handled so far. */
export async function runSync(assignmentId, { overwrite = false, emails, onProgress } = {}) {
  const total = { synced: 0, failed: 0, skipped: 0, results: [], error: '' };
  let cursor;
  for (let guard = 0; guard < 200; guard++) {
    const r = await syncGrades({ ...creds(), assignmentId, overwrite, emails, cursor });
    if (!r.ok) {
      // A rate limit is retried after a pause; rows already sent come back as up to date.
      if (r.error === 'classroom_rate_limited') { await new Promise((res) => { setTimeout(res, RATE_PAUSE_MS); }); continue; }
      total.error = r.error || 'classroom_error';
      break;
    }
    const d = r.data;
    total.synced += d.synced || 0; total.failed += d.failed || 0; total.skipped += d.skipped || 0;
    total.results.push(...(d.results || []));
    onProgress?.(total.results.length);
    if (d.done) break;
    cursor = d.cursor;
  }
  record(assignmentId, total.results);
  return total;
}

/** The preview dialog. `onDone` runs after a sync so the tracker can repaint. */
export function openSyncDialog(ctx, { assignment, onDone } = {}) {
  const body = h('div', { class: 'stack classroom-sync', dataset: { testid: 'sync-body' } }, h('p', { class: 'faint' }, 'Checking Classroom'));
  const overwriteBox = h('input', { type: 'checkbox', dataset: { testid: 'sync-overwrite' } });
  let rows = [];
  let busy = false;
  const isSend = (r) => r.action === 'new' || r.action === 'update';

  function paintPreview(data) {
    rows = data.rows || [];
    const sendN = rows.filter(isSend).length;
    const skipN = rows.filter((r) => String(r.action).startsWith('skipped')).length;
    const sameN = rows.filter((r) => r.action === 'same').length;
    const changed = rows.filter((r) => r.action === 'skipped_teacher_changed').length;
    mount(body,
      h('p', { class: 'faint', dataset: { testid: 'sync-account' } }, data.syncAccount ? `Syncs as ${data.syncAccount}` : ''),
      data.courseWorkState === 'DRAFT' ? h('p', { class: 'notice' }, icon('info'), h('span', {}, 'The Classroom assignment is still a draft, so students who have not been given it yet are skipped.')) : null,
      h('p', { class: 'muted', dataset: { testid: 'sync-counts' } }, `${sendN} to send, ${skipN} skipped, ${sameN} up to date`),
      rows.length ? h('div', { class: 'adm-table-wrap' }, h('table', { class: 'adm-table classroom-sync__table' },
        h('thead', {}, h('tr', {}, ['Email', 'ChemistryWorks score', 'Released', 'Classroom grade', 'Action'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, rows.map((r) => h('tr', { dataset: { testid: `sync-row-${r.email}`, action: r.action, target: r.target || '' } },
          h('td', { class: 'hub-mono' }, r.email),
          h('td', {}, r.points === null || r.points === undefined ? '—' : `${fmtPts(r.points)} / ${fmtPts(r.possible)}`),
          h('td', {}, r.released ? 'Yes' : 'No'),
          h('td', {}, r.classroomAssigned !== null && r.classroomAssigned !== undefined ? `${fmtPts(r.classroomAssigned)} (returned)` : r.classroomDraft !== null && r.classroomDraft !== undefined ? `${fmtPts(r.classroomDraft)} (draft)` : '—'),
          h('td', { dataset: { testid: `sync-action-${r.email}` } }, actionLabel(r))))))) : h('p', { class: 'hub-empty' }, 'No students to sync yet'),
      changed ? h('label', { class: 'row' }, overwriteBox, h('span', {}, 'Overwrite Classroom changes'), h('span', { class: 'field__hint' }, `${changed} grade${changed === 1 ? ' was' : 's were'} changed in Classroom after the last sync. Leave this off to keep them.`)) : null);
  }

  async function load() {
    const r = await previewGradeSync({ ...creds(), assignmentId: assignment.id });
    if (!r.ok) { mount(body, h('p', { class: 'notice notice--error', role: 'alert', dataset: { testid: 'sync-error' } }, icon('alert'), h('span', {}, classroomErrorText(r.error)))); return; }
    paintPreview(r.data);
  }

  const m = openModal({
    title: 'Sync grades to Google Classroom', testid: 'sync-dialog', wide: true, body,
    actions: [{ label: 'Close', variant: 'ghost', testid: 'sync-close' }, { label: 'Sync grades', variant: 'primary', testid: 'sync-run', onClick: async () => {
      if (busy || !rows.length) return;
      busy = true;
      const overwrite = overwriteBox.checked;
      const todo = rows.filter((r) => isSend(r) || (overwrite && r.action === 'skipped_teacher_changed')).length;
      const bar = h('progress', { max: Math.max(todo, 1), value: 0, 'aria-label': 'Sync progress', dataset: { testid: 'sync-progress' } });
      mount(body, h('p', {}, 'Syncing grades'), bar);
      const out = await runSync(assignment.id, { overwrite, onProgress: (n) => { bar.value = n; } });
      busy = false;
      const failures = out.results.filter((x) => x.status === 'failed');
      mount(body,
        out.error ? h('p', { class: 'notice notice--error', role: 'alert', dataset: { testid: 'sync-error' } }, icon('alert'), h('span', {}, classroomErrorText(out.error))) : null,
        h('p', { class: 'adm-h3', dataset: { testid: 'sync-result' } }, `${out.synced} synced, ${out.failed} failed, ${out.skipped} skipped`),
        failures.length ? h('ul', { class: 'classroom-sync__fails' }, failures.map((f) => h('li', {}, `${f.email}: ${classroomErrorText(f.error)}`))) : null);
      if (!out.error) toast(out.failed ? 'Sync finished with some failures' : 'Grades synced', { type: out.failed ? 'warning' : 'success' });
      onDone?.(out);
    } }],
  });
  load();
  return m;
}
