// Admin › Accommodations (V4-02, S12): per student (by email), for all tests or one test: extra time, extra attempts,
// reduced answer choices, read-aloud, and a deadline extension. Stored in the Accommodations sheet; the backend returns
// them with getStudentStatus, so they apply on any device the student signs in on.
import { h, mount, icon, toast, openModal } from '../../ui.js';
import { feature } from '../../config.js';
import { studentHref } from './hub/data.js';
import { adminCall } from '../../lib/api.js';
import { hasAdminAuth } from '../../lib/admin-session.js';
import { field, emptyState, skeleton } from './common.js';

const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export function openAccommodationEditor(ctx, { email = '', testCode = '', current = null, onSaved } = {}) {
  const gasUrl = ctx.config.GAS_WEB_APP_URL;
  const c = current || {};
  const em = h('input', { class: 'input', type: 'email', value: email || c.email || '', dataset: { testid: 'acc-email' } });
  const code = h('input', { class: 'input', value: testCode || (c.testCode && c.testCode !== '*' ? c.testCode : ''), placeholder: 'All tests', dataset: { testid: 'acc-test' } });
  const time = h('select', { class: 'select', dataset: { testid: 'acc-time' } }, [['1', 'None'], ['1.25', '× 1.25'], ['1.5', '× 1.5'], ['2', '× 2'], ['3', '× 3']].map(([v, l]) => h('option', { value: v, selected: Number(v) === Number(c.extraTime || 1) }, l)));
  const attempts = h('input', { class: 'input', type: 'number', min: 0, max: 5, value: String(c.extraAttempts || 0), dataset: { testid: 'acc-attempts' } });
  const reduced = h('input', { type: 'checkbox', checked: !!c.reducedChoices, dataset: { testid: 'acc-reduced' } });
  const aloud = h('input', { type: 'checkbox', checked: !!c.readAloud, dataset: { testid: 'acc-readaloud' } });
  const until = h('input', { class: 'input', type: 'datetime-local', value: toLocalInput(c.extensionUntil), dataset: { testid: 'acc-until' } });
  const notes = h('input', { class: 'input', value: c.notes || '', dataset: { testid: 'acc-notes' } });
  const err = h('p', { class: 'field-error', role: 'alert' });
  openModal({
    title: 'Accommodations', testid: 'acc-modal', wide: true,
    body: h('div', { class: 'stack' }, field('Student email', em), field('Test code', code, 'Leave empty to apply to every test.'),
      field('Extra time', time), field('Extra attempts', attempts, 'Submissions allowed on top of the normal one (single-submission tests).'),
      h('label', { class: 'row' }, reduced, h('span', {}, 'Reduced answer choices (one wrong option removed in multiple choice)')),
      h('label', { class: 'row' }, aloud, h('span', {}, 'Read-aloud on')),
      field('Extended deadline', until, 'The student can still start and submit until this time, after the test closes.'), field('Notes (teachers only)', notes), err),
    actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Save', variant: 'primary', testid: 'acc-save', onClick: async (close) => {
      const r = await adminCall('saveAccommodation', {
        email: em.value, testCode: code.value.trim(), extraTime: Number(time.value), extraAttempts: Number(attempts.value) || 0,
        reducedChoices: reduced.checked, readAloud: aloud.checked, extensionUntil: until.value ? new Date(until.value).toISOString() : '', notes: notes.value,
      }, { gasUrl });
      if (!r.ok) { err.textContent = r.error; return; }
      close(); toast('Accommodations saved', { type: 'success' }); onSaved?.();
    } }],
  });
}

export function renderAccommodations(root, ctx, { goSettings } = {}) {
  const gasUrl = ctx.config.GAS_WEB_APP_URL;
  if (!gasUrl || !hasAdminAuth()) {
    mount(root, emptyState('key', 'Connect the backend first', 'Accommodations are stored in the Google Sheet. Sign in as an admin or enter the admin key in Settings.', 'acc-no-auth'),
      goSettings ? h('button', { class: 'btn btn--primary', type: 'button', on: { click: goSettings } }, 'Open Settings') : null);
    return undefined;
  }
  let alive = true;
  const table = h('div', { dataset: { testid: 'acc-list' } }, skeleton(3));
  const load = async () => {
    const r = await adminCall('getAccommodations', {}, { gasUrl });
    if (!alive) return;
    if (!r.ok) { mount(table, h('p', { class: 'notice notice--error' }, icon('alert'), h('span', {}, r.error))); return; }
    const list = r.data.accommodations || [];
    if (!list.length) { mount(table, emptyState('user', 'No accommodations yet', 'Add one for a student, for every test or a single test.', 'acc-empty')); return; }
    mount(table, h('div', { class: 'adm-table-wrap' }, h('table', { class: 'adm-table' },
      h('thead', {}, h('tr', {}, ['Student', 'Test', 'Extra time', 'Attempts', 'Reduced', 'Read-aloud', 'Extended until', ''].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, list.map((a) => h('tr', { dataset: { testid: `acc-row-${a.email}` } },
        h('td', {}, feature('classHub') ? h('a', { class: 'hub-link', href: studentHref(a.email) }, a.email) : a.email), h('td', {}, a.testCode === '*' ? 'All tests' : a.testCode), h('td', {}, a.extraTime > 1 ? `× ${a.extraTime}` : '—'),
        h('td', {}, String(a.extraAttempts || 0)), h('td', {}, a.reducedChoices ? 'Yes' : '—'), h('td', {}, a.readAloud ? 'Yes' : '—'),
        h('td', {}, a.extensionUntil ? new Date(a.extensionUntil).toLocaleString() : '—'),
        h('td', {}, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => openAccommodationEditor(ctx, { current: a, onSaved: load }) } }, 'Edit'),
          h('button', { class: 'btn btn--subtle btn--sm', type: 'button', 'aria-label': `Remove accommodations for ${a.email}`, on: { click: async () => {
            const res = await adminCall('deleteAccommodation', { email: a.email, testCode: a.testCode === '*' ? '' : a.testCode }, { gasUrl });
            toast(res.ok ? 'Removed' : res.error, { type: res.ok ? 'success' : 'error' }); load();
          } } }, icon('trash', { size: 14 })))))))));
  };
  mount(root, h('div', { class: 'stack', dataset: { testid: 'accommodations' } },
    h('div', { class: 'row row--wrap' }, h('h2', { class: 'adm-h2' }, 'Accommodations'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: 'acc-new' }, on: { click: () => openAccommodationEditor(ctx, { onSaved: load }) } }, icon('plus', { size: 16 }), 'Add')),
    h('p', { class: 'muted' }, 'Applied on any device the student signs in on. Extensions let a student start and submit after a test closes.'),
    table));
  load();
  return () => { alive = false; };
}
