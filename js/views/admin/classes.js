// Admin › Classes (V4-07, S11): create classes by pasting emails or importing a roster CSV (Google Classroom / Aeries),
// edit, delete; per-member accommodations. Tests are assigned to classes in the builder's test settings.
import { h, mount, icon, toast, openModal } from '../../ui.js';
import { adminCall, listClassroomCourses, linkClassroomCourse, importClassroomRoster } from '../../lib/api.js';
import { hasAdminAuth } from '../../lib/admin-session.js';
import { resource } from '../../lib/store.js';
import { parseRoster } from '../../lib/importers.js';
import { field, emptyState, skeleton, fmtDate } from './common.js';
import { openAccommodationEditor } from './accommodations.js';
import { enabled } from '../../config.js';
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
        enabled('classHub') ? h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: `class-open-${c.id}` }, on: { click: () => openHub(c) } }, 'Open class page') : null,
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `class-classroom-${c.id}` }, on: { click: () => classroomDialog(c) } },
          c.classroomCourseId ? 'Google Classroom: linked' : 'Link to Google Classroom'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `class-edit-${c.id}` }, on: { click: () => edit(c) } }, icon('pen', { size: 14 }), 'Edit'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `class-delete-${c.id}` }, on: { click: () => remove(c) } }, icon('trash', { size: 14 }), 'Delete')),
      h('details', { class: 'adm-class__roster' }, h('summary', {}, 'Roster'),
        h('ul', { class: 'adm-roster' }, c.emails.map((e) => h('li', {}, enabled('classHub') ? h('a', { class: 'hub-link', href: studentHref(e) }, e) : h('span', {}, e),
          h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: `acc-open-${e}` }, on: { click: () => openAccommodationEditor(ctx, { email: e }) } }, 'Accommodations'))))),
      h('p', { class: 'faint' }, `Updated ${fmtDate(c.updated_at)} by ${c.updated_by || '—'}`))));
  }
  // Pick a course from the deploying account's active courses; optionally import its roster and auto-sync on release.
  function classroomDialog(c) {
    const sel = h('select', { class: 'select', dataset: { testid: 'classroom-course' } }, h('option', { value: '' }, 'Loading courses…'));
    const auto = h('input', { type: 'checkbox', checked: !!c.classroomAutoSync, dataset: { testid: 'classroom-autosync' } });
    const note = h('p', { class: 'faint' });
    listClassroomCourses({ gasUrl }).then((r) => {
      if (!r.ok) { sel.replaceChildren(h('option', { value: '' }, 'Google Classroom is not connected')); note.textContent = `Re-run setup in Apps Script to approve the Classroom permissions (${r.error.replace(/_/g, ' ')}).`; return; }
      sel.replaceChildren(h('option', { value: '' }, 'Not linked'), ...r.data.courses.map((k) => h('option', { value: k.id, selected: k.id === c.classroomCourseId }, k.section ? `${k.name} · ${k.section}` : k.name)));
      note.textContent = r.data.runsAs ? `Courses where ${r.data.runsAs} is a teacher. Grades sync as this account.` : '';
    });
    const save = async (close, importRoster) => {
      const r = await linkClassroomCourse({ gasUrl, classId: c.id, courseId: sel.value, autoSync: auto.checked });
      if (!r.ok) { toast(`Could not link: ${r.error}`, { type: 'error' }); return; }
      if (importRoster && sel.value) {
        const ir = await importClassroomRoster({ gasUrl, classId: c.id });
        toast(ir.ok ? `Imported ${ir.data.cls?.emails?.length ?? 0} students from Google Classroom` : `Roster import failed: ${ir.error}`, { type: ir.ok ? 'success' : 'error' });
      } else toast(sel.value ? 'Linked to Google Classroom' : 'Link removed', { type: 'success' });
      close();
      classesRes.refresh();
    };
    openModal({ title: `Google Classroom · ${c.name}`, testid: 'classroom-link',
      body: h('div', { class: 'stack' }, field('Course', sel), note, h('label', { class: 'row' }, auto, h('span', {}, 'Sync grades when I release them'))),
      actions: [{ label: 'Cancel', variant: 'ghost' },
        { label: 'Save and import roster', variant: 'ghost', testid: 'classroom-import', onClick: (close) => save(close, true) },
        { label: 'Save', variant: 'primary', testid: 'classroom-save', onClick: (close) => save(close, false) }] });
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
