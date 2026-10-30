// Admin "Settings" tab: admin key, backend ping, setup checklist, current config.
import { h, mount, icon, toast } from '../../ui.js';
import { CONFIG, netlifyFormsEnabled } from '../../config.js';
import { load, save, remove } from '../../lib/storage.js';
import { pingBackend } from '../../lib/api.js';
import { field } from './common.js';

const truncate = (s, n = 18) => (s && s.length > n + 6 ? `${s.slice(0, n)}…${s.slice(-6)}` : s || '');

export function setupChecks(config = CONFIG) {
  const gsi = !!config.GOOGLE_CLIENT_ID;
  return [
    { key: 'client-id', ok: gsi, label: 'Google Client ID configured', fix: 'Set GOOGLE_CLIENT_ID in js/config.js.', doc: 'DEPLOYMENT.md#2-google-cloud-oauth-client-for-google-sign-in' },
    { key: 'gas-url', ok: !!config.GAS_WEB_APP_URL, label: 'Apps Script URL configured', fix: 'Deploy apps-script/Code.gs and set GAS_WEB_APP_URL.', doc: 'DEPLOYMENT.md#3-google-sheet-and-apps-script' },
    { key: 'sheet-url', ok: !!config.SHEET_URL, label: 'Sheet URL configured', fix: 'Set SHEET_URL so the admin header can link to your sheet.', doc: 'DEPLOYMENT.md#3-google-sheet-and-apps-script' },
    { key: 'netlify', ok: netlifyFormsEnabled(config), label: 'Netlify Forms backup active', fix: 'Netlify Forms are skipped on localhost; deploy to Netlify (or set NETLIFY_FORMS: true).', doc: 'DEPLOYMENT.md#5-netlify', warnOnly: true },
    { key: 'demo', ok: !(config.ALLOW_DEMO_SIGNIN && !gsi), label: 'Demo sign-in disabled in production', fix: 'Demo sign-in is on because no Google Client ID is set. Set ALLOW_DEMO_SIGNIN to false once Google sign-in works.', doc: 'DEPLOYMENT.md#2-google-cloud-oauth-client-for-google-sign-in', warnOnly: true },
  ];
}

export function renderSettings(root, ctx, { onKeyChange } = {}) {
  let alive = true;
  const keyInput = h('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: 'ADMIN_KEY script property', value: load('adminKey', '', 'session'), dataset: { testid: 'admin-key-input' } });
  const status = h('p', { class: 'adm-status', role: 'status', dataset: { testid: 'backend-status' } }, CONFIG.GAS_WEB_APP_URL ? 'Not checked yet' : 'No Apps Script URL configured');
  const ping = h('button', { class: 'btn btn--ghost', type: 'button', disabled: !CONFIG.GAS_WEB_APP_URL, title: CONFIG.GAS_WEB_APP_URL ? 'Check the Apps Script backend' : 'Set GAS_WEB_APP_URL in js/config.js first', dataset: { testid: 'ping-backend' },
    on: { click: async () => {
      ping.classList.add('is-loading');
      status.className = 'adm-status';
      status.textContent = 'Checking…';
      let res;
      try { res = await pingBackend({ gasUrl: CONFIG.GAS_WEB_APP_URL }); } catch (e) { res = { ok: false, error: e.message }; }
      ping.classList.remove('is-loading');
      if (!alive) return;
      status.className = `adm-status ${res.ok ? 'is-ok' : 'is-bad'}`;
      status.textContent = res.ok ? `Connected · ${res.version ? `v${String(res.version).replace(/^v/i, '')}` : 'ok'}` : `Error · ${res.error || 'no response'}`;
    } } }, icon('refresh', { size: 16 }), 'Test connection');

  const checks = setupChecks();
  const checklist = h('ul', { class: 'adm-checklist', dataset: { testid: 'setup-checklist' } },
    checks.map((c) => h('li', { class: ['adm-check', c.ok ? 'is-ok' : c.warnOnly ? 'is-warn' : 'is-bad'], dataset: { check: c.key, ok: String(c.ok) } },
      h('span', { class: 'adm-check__mark' }, icon(c.ok ? 'check' : 'alert', { size: 16 })),
      h('div', { class: 'adm-check__text' }, h('strong', {}, c.label), c.ok ? null : h('span', { class: 'muted' }, c.fix)),
      h('a', { class: 'adm-check__link', href: c.doc, target: '_blank', rel: 'noopener' }, 'Guide'))));

  const cfgRow = (k, v) => h('tr', {}, h('th', { scope: 'row' }, k), h('td', {}, v === '' || v == null || (Array.isArray(v) && !v.length) ? h('span', { class: 'faint' }, '(not set)') : h('code', {}, String(Array.isArray(v) ? v.join(', ') : v))));

  mount(root, h('div', { class: 'adm-settings-tab' },
    h('div', { class: 'adm-two-col' },
      h('section', { class: 'card stack', 'aria-label': 'Admin key' },
        h('h3', { class: 'adm-h3' }, icon('key', { size: 18 }), ' Admin key'),
        h('p', { class: 'muted' }, 'Required to publish tests and read results from the Google Sheet. It is kept for this browser session only.'),
        field('Admin key', keyInput),
        h('div', { class: 'row row--wrap' },
          h('button', { class: 'btn btn--primary', type: 'button', dataset: { testid: 'save-admin-key' }, on: { click: () => {
            const v = keyInput.value.trim();
            if (v) save('adminKey', v, 'session'); else remove('adminKey', 'session');
            toast(v ? 'Admin key saved for this session' : 'Admin key cleared', { type: 'success' });
            onKeyChange?.();
          } } }, icon('check', { size: 16 }), 'Save key'), ping),
        status),
      h('section', { class: 'card stack', 'aria-label': 'Current configuration' },
        h('h3', { class: 'adm-h3' }, 'Current configuration'),
        h('table', { class: 'adm-table adm-table--cfg' }, h('tbody', {},
          cfgRow('GOOGLE_CLIENT_ID', truncate(CONFIG.GOOGLE_CLIENT_ID)), cfgRow('GAS_WEB_APP_URL', truncate(CONFIG.GAS_WEB_APP_URL, 32)), cfgRow('SHEET_URL', truncate(CONFIG.SHEET_URL, 32)),
          cfgRow('NETLIFY_FORMS', String(CONFIG.NETLIFY_FORMS)), cfgRow('ALLOW_DEMO_SIGNIN', String(CONFIG.ALLOW_DEMO_SIGNIN)), cfgRow('ALLOWED_EMAIL_DOMAINS', CONFIG.ALLOWED_EMAIL_DOMAINS), cfgRow('DEFAULT_MODE', CONFIG.DEFAULT_MODE))),
        h('p', { class: 'field__hint' }, 'Edit js/config.js (or define window.CHEMISTRYWORKS_CONFIG) to change these.'))),
    h('section', { class: 'card stack', 'aria-label': 'Setup checklist' },
      h('h3', { class: 'adm-h3' }, 'Setup checklist'), checklist)));
  return () => { alive = false; };
}
