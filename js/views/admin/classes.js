// Admin › Classes (V4-07, S11): create classes by pasting emails or importing a roster CSV (Google Classroom / Aeries),
// edit, delete; per-member accommodations. Tests are assigned to classes in the builder's test settings.
import { h, mount, icon, toast, openModal } from '../../ui.js';
import { adminCall } from '../../lib/api.js';
import { hasAdminAuth } from '../../lib/admin-session.js';
import { parseRoster } from '../../lib/importers.js';
import { field, emptyState, skeleton, fmtDate } from './common.js';
import { openAccommodationEditor } from './accommodations.js';

export function renderClasses(root, ctx, { goSettings } = {}) {
  const gasUrl = ctx.config.GAS_WEB_APP_URL;
  if (!gasUrl || !hasAdminAuth()) {
    mount(root, emptyState('key', 'Connect the backend first', 'Classes are stored in the Google Sheet. Sign in as an admin or enter the admin key in Settings.', 'classes-no-auth'),
      goSettings ? h('button', { class: 'btn btn--primary', type: 'button', on: { click: goSettings } }, 'Open Settings') : null);
    return undefined;
  }
  let alive = true;
  const list = h('div', { class: 'stack', dataset: { testid: 'classes-list' } }, skeleton(3));
  const load = async () => {
    const r = await adminCall('listClasses', {}, { gasUrl });
    if (!alive) return;
    if (!r.ok) { mount(list, h('p', { class: 'notice notice--error' }, icon('alert'), h('span', {}, `Could not load classes: ${r.error}`))); return; }
    const classes = r.data.classes || [];
    if (!classes.length) { mount(list, emptyState('user', 'No classes yet', 'Create a class to assign tests, limit a test to its roster, and set accommodations.', 'classes-empty')); return; }
    mount(list, ...classes.map((c) => h('section', { class: 'card adm-class', dataset: { testid: `class-${c.id}` } },
      h('div', { class: 'row row--wrap' },
        h('h3', { class: 'adm-h3' }, c.name, c.period ? h('span', { class: 'faint' }, ` · Period ${c.period}`) : null),
        h('span', { class: 'pill' }, `${c.emails.length} student${c.emails.length === 1 ? '' : 's'}`),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `class-edit-${c.id}` }, on: { click: () => edit(c) } }, icon('pen', { size: 14 }), 'Edit'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `class-delete-${c.id}` }, on: { click: () => remove(c) } }, icon('trash', { size: 14 }), 'Delete')),
      h('details', { class: 'adm-class__roster' }, h('summary', {}, 'Roster'),
        h('ul', { class: 'adm-roster' }, c.emails.map((e) => h('li', {}, h('span', {}, e),
          h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: `acc-open-${e}` }, on: { click: () => openAccommodationEditor(ctx, { email: e }) } }, 'Accommodations'))))),
      h('p', { class: 'faint' }, `Updated ${fmtDate(c.updated_at)} by ${c.updated_by || '—'}`))));
  };
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
        close(); toast('Class saved', { type: 'success' }); load();
      } }],
    });
    setTimeout(() => name.focus(), 50);
    return m;
  }
  function remove(c) {
    openModal({ title: `Delete ${c.name}?`, testid: 'class-delete-modal', body: 'Tests assigned to this class keep working; roster-only tests will refuse its students.',
      actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Delete', variant: 'danger', testid: 'class-delete-confirm', onClick: async (close) => {
        const r = await adminCall('deleteClass', { id: c.id }, { gasUrl }); close();
        toast(r.ok ? 'Class deleted' : r.error, { type: r.ok ? 'success' : 'error' }); load();
      } }] });
  }
  mount(root, h('div', { class: 'stack adm-classes', dataset: { testid: 'classes' } },
    h('div', { class: 'row row--wrap' }, h('h2', { class: 'adm-h2' }, 'Classes'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: 'class-new' }, on: { click: () => edit() } }, icon('plus', { size: 16 }), 'New class')),
    h('p', { class: 'muted' }, 'Assign tests to classes in the builder (Test settings). A roster-only test refuses students who are not on an assigned class.'),
    list));
  load();
  return () => { alive = false; };
}
