// Settings -> Admins (owner only) and Settings -> Activity log (V4-07). Both talk to the Apps Script backend:
// the Admins sheet is the single source of truth, so edits here and edits made directly in the sheet are the same.
import { h, mount, icon, toast, openModal } from '../../ui.js';
import { CONFIG } from '../../config.js';
import { whoAmI, listAdmins, saveAdmin, removeAdmin, getLog } from '../../lib/api.js';
import { field, fmtDate } from './common.js';

const ERRORS = {
  owner_only: 'Only an owner can change the admin list.',
  last_owner: 'There must always be at least one owner.',
  cannot_remove_self: 'You cannot remove yourself. Ask another owner to do it.',
  invalid_email: 'Enter a valid email address.',
  invalid_role: 'Choose Owner or Admin.',
  not_found: 'That admin is no longer on the list.',
  not_admin: 'Your account is not on the admin list.',
};
export const adminErrorText = (e) => ERRORS[e] || String(e || 'Something went wrong.');

/** The Admins card. Renders nothing unless the backend says the caller is an owner. -> cleanup fn */
export function renderAdmins(host, ctx) {
  let alive = true;
  const gasUrl = CONFIG.GAS_WEB_APP_URL;
  if (!gasUrl) return () => {};

  const err = h('p', { class: 'field-error', role: 'alert', dataset: { testid: 'admins-error' } });
  const listHost = h('div', { dataset: { testid: 'admins-list' } }, h('p', { class: 'muted' }, 'Loading…'));
  const emailInput = h('input', { class: 'input', type: 'email', autocomplete: 'off', placeholder: 'teacher@school.org', dataset: { testid: 'admin-email-input' } });
  const roleSelect = h('select', { class: 'input', 'aria-label': 'Role', dataset: { testid: 'admin-role-select' } },
    h('option', { value: 'admin' }, 'Admin'), h('option', { value: 'owner' }, 'Owner'));
  let me = { email: '', role: 'admin' };
  let admins = [];

  const fail = (e) => { err.textContent = adminErrorText(e); };

  async function refresh() {
    const res = await listAdmins({ gasUrl });
    if (!alive) return;
    if (!res.ok) { fail(res.error); admins = []; } else { err.textContent = ''; admins = res.admins; }
    drawList();
  }

  async function changeRole(a, role) {
    err.textContent = '';
    const res = await saveAdmin({ gasUrl, email: a.email, role });
    if (!alive) return;
    if (!res.ok) fail(res.error); else toast(`${a.email} is now ${role}`, { type: 'success' });
    await refresh();
  }

  function confirmRemove(a) {
    openModal({
      title: 'Remove this admin?', testid: 'confirm-remove-admin',
      body: `${a.email} will no longer be able to open the admin panel.`,
      actions: [
        { label: 'Cancel', variant: 'ghost', autofocus: true },
        { label: 'Remove', variant: 'danger', testid: 'confirm-action', onClick: async (close) => {
          close();
          err.textContent = '';
          const res = await removeAdmin({ gasUrl, email: a.email });
          if (!alive) return;
          if (!res.ok) fail(res.error); else toast(`Removed ${a.email}`, { type: 'success' });
          await refresh();
        } },
      ],
    });
  }

  function drawList() {
    if (!admins.length) { mount(listHost, h('p', { class: 'muted' }, 'No admins on the list yet.')); return; }
    mount(listHost, h('div', { class: 'adm-tablewrap' }, h('table', { class: 'adm-table' },
      h('thead', {}, h('tr', {}, ['Email', 'Role', 'Added by', 'Added', ''].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, admins.map((a) => {
        const self = a.email === me.email;
        const sel = h('select', { class: 'input', 'aria-label': `Role for ${a.email}`, dataset: { testid: `admin-role-${a.email}` },
          on: { change: () => changeRole(a, sel.value) } },
        h('option', { value: 'admin', selected: a.role !== 'owner' }, 'Admin'), h('option', { value: 'owner', selected: a.role === 'owner' }, 'Owner'));
        return h('tr', { dataset: { admin: a.email } },
          h('td', {}, a.email, self ? h('span', { class: 'faint' }, ' (you)') : null),
          h('td', {}, sel),
          h('td', {}, a.added_by || '—'),
          h('td', {}, a.added_at ? fmtDate(a.added_at) : '—'),
          h('td', {}, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', disabled: self, title: self ? 'You cannot remove yourself' : 'Remove this admin',
            dataset: { testid: `admin-remove-${a.email}` }, on: { click: () => confirmRemove(a) } }, icon('trash', { size: 16 }), 'Remove')));
      })))));
  }

  const addBtn = h('button', { class: 'btn btn--primary', type: 'button', dataset: { testid: 'admin-add' }, on: { click: async () => {
    err.textContent = '';
    const email = emailInput.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fail('invalid_email'); return; }
    addBtn.disabled = true;
    const res = await saveAdmin({ gasUrl, email, role: roleSelect.value });
    addBtn.disabled = false;
    if (!alive) return;
    if (!res.ok) { fail(res.error); return; }
    emailInput.value = '';
    toast(res.updated ? `Updated ${email}` : `Added ${email}`, { type: 'success' });
    await refresh();
  } } }, icon('plus', { size: 16 }), 'Add admin');

  const card = h('section', { class: 'card stack', 'aria-label': 'Admins', dataset: { testid: 'admins-card' } },
    h('h3', { class: 'adm-h3' }, 'Admins'),
    h('p', { class: 'muted' }, 'Admins sign in with Google and need no password. This list is the Admins sheet in your Google Sheet: you can also edit it there.'),
    listHost,
    h('form', { class: 'row row--wrap', on: { submit: (e) => { e.preventDefault(); addBtn.click(); } } },
      field('Email', emailInput), field('Role', roleSelect), addBtn),
    err);

  // Owner only: ask the backend who we are, and render nothing for anyone else.
  (async () => {
    const res = await whoAmI({ gasUrl });
    if (!alive || !res.ok || res.role !== 'owner') return;
    me = { email: String(res.email || '').toLowerCase(), role: res.role };
    host.append(card);
    await refresh();
  })();

  return () => { alive = false; card.remove(); };
}

/** The Activity log card: latest 100 admin write actions, newest first. -> cleanup fn */
export function renderActivityLog(host) {
  let alive = true;
  const gasUrl = CONFIG.GAS_WEB_APP_URL;
  if (!gasUrl) return () => {};
  const body = h('div', { dataset: { testid: 'activity-log' } }, h('p', { class: 'muted' }, 'Loading…'));
  const card = h('section', { class: 'card stack', 'aria-label': 'Activity log', dataset: { testid: 'activity-log-card' } },
    h('h3', { class: 'adm-h3' }, 'Activity log'), body);
  host.append(card);
  (async () => {
    const res = await getLog({ gasUrl, limit: 100 });
    if (!alive) return;
    if (!res.ok) { mount(body, h('p', { class: 'muted' }, `Activity log unavailable: ${adminErrorText(res.error)}`)); return; }
    if (!res.rows.length) { mount(body, h('p', { class: 'muted' }, 'No activity recorded yet.')); return; }
    mount(body, h('div', { class: 'adm-tablewrap' }, h('table', { class: 'adm-table' },
      h('thead', {}, h('tr', {}, ['Time', 'Admin', 'Action', 'Target', 'Details'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, res.rows.map((r) => h('tr', {},
        h('td', {}, r.time ? fmtDate(r.time) : '—'), h('td', {}, r.admin || '—'), h('td', {}, r.action || '—'), h('td', {}, r.target || '—'), h('td', {}, r.details || '')))))));
  })();
  return () => { alive = false; card.remove(); };
}
