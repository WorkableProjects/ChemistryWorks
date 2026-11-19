// Admin › Classes: create classes by pasting emails or importing a roster CSV (Google Classroom / Aeries),
// edit, delete; per-member accommodations. Tests are assigned to classes in the builder's test settings.
import { h, mount, icon, toast, openModal } from '../../ui.js';
import { adminCall, listClassroomCourses, linkClassroomCourse, importClassroomRoster } from '../../lib/api.js';
import { hasAdminAuth } from '../../lib/admin-session.js';
import { resource } from '../../lib/store.js';
import { parseRoster } from '../../lib/importers.js';
import { field, emptyState, skeleton, fmtDate, switchEl } from './common.js';
import { classroomErrorText } from './classroom-sync.js';
import { openAccommodationEditor } from './accommodations.js';
import { renderClassHub } from './hub/index.js';
import { studentHref } from './hub/data.js';

export function renderClasses(root, ctx, { goSettings } = {}) {
  const gasUrl = ctx.config.GAS_WEB_APP_URL;
  if (!gasUrl || !hasAdminAuth()) {
    mount(root, emptyState('key', 'Connect the backend first', 'Classes are stored in the Google Sheet. Sign in as an admin or enter the admin key in Settings.', 'classes-no-auth'),
      goSettings ? h('button', { class: 'btn btn--primary', type: 'button', on: { click: goSettings } }, 'Open Settings') : null);
    return undefined;
  }
  let alive = true;
  const list = h('div', { class: 'stack', dataset: { testid: 'classes-list' } }, skeleton(3));
  // Classes live on the store: coming back to this section paints the cached list, then refreshes quietly.
  const classesRes = resource('classes', { fetch: async () => {
    const r = await adminCall('listClasses', {}, { gasUrl });
    if (!r.ok) throw new Error(r.error || 'Request failed');
    return r.data.classes || [];
  } });
  const unsub = classesRes.subscribe(() => { if (alive) paint(); });
  const load = async () => {
    try { await classesRes.get(); } catch (e) {
      if (!alive) return;
      if (classesRes.peek() === undefined) mount(list, h('p', { class: 'notice notice--error' }, icon('alert'), h('span', {}, `Could not load classes: ${e.message}`)));
      return;
    }
    if (alive) paint();
  };
  function paint() {
    const classes = classesRes.peek();
    if (!classes) return;
    if (!classes.length) { mount(list, emptyState('user', 'No classes yet', 'Create a class to assign tests, limit a test to its roster, and set accommodations.', 'classes-empty')); return; }
    mount(list, ...classes.map((c) => h('section', { class: 'card adm-class', dataset: { testid: `class-${c.id}` } },
      h('div', { class: 'row row--wrap' },
        h('h3', { class: 'adm-h3' }, c.name, c.period ? h('span', { class: 'faint' }, ` · Period ${c.period}`) : null),
        h('span', { class: 'pill' }, `${c.emails.length} student${c.emails.length === 1 ? '' : 's'}`),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: `class-open-${c.id}` }, on: { click: () => openHub(c) } }, 'Open class page'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `class-edit-${c.id}` }, on: { click: () => edit(c) } }, icon('pen', { size: 14 }), 'Edit'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `class-delete-${c.id}` }, on: { click: () => remove(c) } }, icon('trash', { size: 14 }), 'Delete')),
      classroomRow(c),
      h('details', { class: 'adm-class__roster' }, h('summary', {}, 'Roster'),
        h('ul', { class: 'adm-roster' }, c.emails.map((e) => h('li', {}, h('a', { class: 'hub-link', href: studentHref(e) }, e),
          h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: `acc-open-${e}` }, on: { click: () => openAccommodationEditor(ctx, { email: e }) } }, 'Accommodations'))))),
      h('p', { class: 'faint' }, `Updated ${fmtDate(c.updated_at)} by ${c.updated_by || '—'}`))));
  }
  const courseNames = new Map();
  const patchClass = (id, fields) => classesRes.patch((d) => (d || []).map((x) => (x.id === id ? { ...x, ...fields } : x)));
  function classroomRow(c) {
    const linked = !!c.classroomCourseId;
    return h('div', { class: 'adm-class__classroom', dataset: { testid: `class-classroom-${c.id}` } },
      linked ? h('span', { class: 'pill pill--success', dataset: { testid: `class-linked-${c.id}` } }, `Google Classroom: ${courseNames.get(c.classroomCourseId) || 'linked'}`) : null,
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `class-link-${c.id}` }, on: { click: () => linkDialog(c) } }, linked ? 'Change Classroom course' : 'Link to Google Classroom'),
      linked ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `class-import-${c.id}` }, on: { click: () => importDialog(c) } }, icon('download', { size: 14 }), 'Import roster from Classroom') : null,
      linked ? switchEl({ label: 'Auto-sync grades on release', hint: 'When you release grades, send them to Classroom too.', checked: !!c.autoSyncClassroom, testid: `class-autosync-${c.id}`, onChange: async (v) => {
        const r = await adminCall('saveClass', { cls: { id: c.id, name: c.name, period: c.period, emails: c.emails, autoSyncClassroom: v } }, { gasUrl });
        if (!r.ok) { toast(`Could not save: ${r.error}`, { type: 'error' }); classesRes.refresh(); return; }
        patchClass(c.id, { autoSyncClassroom: v });
        toast(v ? 'Grades will sync on release' : 'Auto-sync is off', { type: 'success' });
      } }) : null);
  }
  async function linkDialog(c) {
    const list = h('div', { class: 'classroom-picker', role: 'radiogroup', 'aria-label': 'Classroom courses' }, h('p', { class: 'faint' }, 'Loading your courses'));
    const account = h('p', { class: 'faint', dataset: { testid: 'link-account' } });
    const err = h('p', { class: 'field-error', role: 'alert' });
    let chosen = c.classroomCourseId || '';
    const m = openModal({ title: `Link ${c.name} to Google Classroom`, testid: 'classroom-link-modal', wide: true, body: h('div', { class: 'stack' }, account, list, err),
      actions: [{ label: 'Cancel', variant: 'ghost' },
        ...(c.classroomCourseId ? [{ label: 'Unlink', variant: 'ghost', testid: 'link-remove', onClick: async (close) => { await save(close, ''); } }] : []),
        { label: 'Link course', variant: 'primary', testid: 'link-save', onClick: async (close) => { if (!chosen) { err.textContent = 'Choose a course'; return; } await save(close, chosen); } }] });
    async function save(close, courseId) {
      err.textContent = '';
      const r = await linkClassroomCourse({ gasUrl, classId: c.id, courseId });
      if (!r.ok) { err.textContent = classroomErrorText(r.error); return; }
      if (courseId) courseNames.set(courseId, r.data.courseName || courseId);
      patchClass(c.id, { classroomCourseId: courseId });
      close();
      toast(courseId ? `Linked to ${r.data.courseName || 'the course'}` : 'Unlinked from Google Classroom', { type: 'success' });
    }
    const r = await listClassroomCourses({ gasUrl });
    if (!r.ok) { list.replaceChildren(h('p', { class: 'notice notice--error' }, icon('alert'), h('span', {}, classroomErrorText(r.error)))); return m; }
    account.textContent = r.data.syncAccount ? `Syncs as ${r.data.syncAccount}` : '';
    const courses = r.data.courses || [];
    (r.data.courses || []).forEach((x) => courseNames.set(x.id, x.name));
    list.replaceChildren(...(courses.length ? courses.map((x) => h('label', {}, h('input', { type: 'radio', name: 'classroom-course', value: x.id, checked: x.id === chosen, dataset: { testid: `course-${x.id}` }, on: { change: () => { chosen = x.id; } } }),
      h('span', {}, x.name, x.section ? h('span', { class: 'faint' }, ` · ${x.section}`) : null))) : [h('p', { class: 'faint' }, 'No active courses where this account is a teacher')]));
    return m;
  }
  function importDialog(c) {
    const mode = h('select', { class: 'select', 'aria-label': 'Import mode', dataset: { testid: 'import-mode' } },
      h('option', { value: 'merge' }, 'Add Classroom students to this roster'), h('option', { value: 'replace' }, 'Replace this roster with the Classroom students'));
    const err = h('p', { class: 'field-error', role: 'alert' });
    openModal({ title: 'Import roster from Classroom', testid: 'classroom-import-modal', body: h('div', { class: 'stack' }, h('p', {}, 'Students without a public email in Classroom are skipped.'), mode, err),
      actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Import', variant: 'primary', testid: 'import-run', onClick: async (close) => {
        const r = await importClassroomRoster({ gasUrl, classId: c.id, mode: mode.value });
        if (!r.ok) { err.textContent = classroomErrorText(r.error); return; }
        close();
        const d = r.data;
        toast(`${d.added} added, ${d.total} on the roster${d.skippedNoEmail ? `, ${d.skippedNoEmail} skipped (no email)` : ''}`, { type: 'success' });
        classesRes.refresh();
      } }] });
  }
  function edit(c = { name: '', period: '', emails: [] }) {
    const name = h('input', { class: 'input', value: c.name, dataset: { testid: 'class-name' } });
    const period = h('input', { class: 'input', value: c.period || '', dataset: { testid: 'class-period' } });
    const emails = h('textarea', { class: 'textarea', rows: 8, placeholder: 'One email per line, or paste a roster CSV', dataset: { testid: 'class-emails' } }, (c.emails || []).join('\n'));
    const file = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', class: 'sr-only', id: 'roster-file', on: { change: async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      const { emails: found } = parseRoster(await f.text());
      emails.value = [...new Set([...parseRoster(emails.value).emails, ...found])].join('\n');
      toast(`${found.length} email${found.length === 1 ? '' : 's'} imported`, { type: 'success' });
    } } });
    const err = h('p', { class: 'field-error', role: 'alert' });
    const m = openModal({
      title: c.id ? 'Edit class' : 'New class', testid: 'class-modal', wide: true,
      body: h('div', { class: 'stack' }, field('Class name', name), field('Period', period),
        field('Students', emails, 'Emails are cleaned and lower-cased. Paste a Google Classroom or Aeries export; every email in it is picked up.'),
        h('label', { class: 'btn btn--ghost btn--sm', for: 'roster-file' }, icon('upload', { size: 14 }), 'Import roster CSV'), file, err),
      actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Save class', variant: 'primary', testid: 'class-save', onClick: async (close) => {
        const r = await adminCall('saveClass', { cls: { id: c.id, name: name.value, period: period.value, emails: parseRoster(emails.value).emails } }, { gasUrl });
        if (!r.ok) { err.textContent = r.error; return; }
        close(); toast('Class saved', { type: 'success' });
        const saved = r.data.row || r.data.cls;
        if (saved && saved.id) classesRes.patch((d) => { const all = d || []; return all.some((x) => x.id === saved.id) ? all.map((x) => (x.id === saved.id ? saved : x)) : [...all, saved]; });
        else classesRes.refresh();
      } }],
    });
    setTimeout(() => name.focus(), 50);
    return m;
  }
  function remove(c) {
    openModal({ title: `Delete ${c.name}?`, testid: 'class-delete-modal', body: 'Tests assigned to this class keep working; roster-only tests will refuse its students.',
      actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Delete', variant: 'danger', testid: 'class-delete-confirm', onClick: async (close) => {
        close();
        const done = await classesRes.optimistic((d) => (d || []).filter((x) => x.id !== c.id), () => adminCall('deleteClass', { id: c.id }, { gasUrl }), { message: 'Could not delete the class' });
        if (done.ok) toast('Class deleted', { type: 'success' });
      } }] });
  }
  let hubStop = null;
  function openHub(c) {
    const hubHost = h('div');
    mount(root, hubHost);
    hubStop = renderClassHub(hubHost, ctx, { cls: c, classes: classesRes.peek() || [], onBack: () => { try { hubStop?.(); } catch { /* ignore */ } hubStop = null; mount(root, main); } });
  }
  const main = h('div', { class: 'stack adm-classes', dataset: { testid: 'classes' } },
    h('div', { class: 'row row--wrap' }, h('h2', { class: 'adm-h2' }, 'Classes'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: 'class-new' }, on: { click: () => edit() } }, icon('plus', { size: 16 }), 'New class')),
    h('p', { class: 'muted' }, 'Assign tests to classes in the builder (Test settings). A roster-only test refuses students who are not on an assigned class.'),
    list);
  mount(root, main);
  load();
  return () => { alive = false; unsub(); try { hubStop?.(); } catch { /* ignore */ } };
}
