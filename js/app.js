// ChemistryWorks entry point: view router + shared context.
//
// View contract: each view module exports `render(root, ctx, params)` which builds its DOM inside
// `root` and may return a cleanup function (remove listeners, stop timers). Views:
//   landing  params: { code?: string, error?: string }
//   runner   params: { test, source, preview?: boolean }
//   results  params: { test, grade, payload, submission, preview?: boolean }
//   admin    params: {}
//
// URL state: ?code=CHEM101 (or /test?code=CHEM101) opens a test; ?admin=true opens the admin panel.

import { CONFIG } from './config.js';
import { getUser, signOut, onAuthChange } from './lib/auth.js';
import { loadTest, normalizeCode } from './lib/tests.js';
import { load, save } from './lib/storage.js';
import { h, mount, openModal, toast } from './ui.js';
import * as landing from './views/landing.js';
import * as runner from './views/runner.js';
import * as results from './views/results.js';
import * as admin from './views/admin.js';

const VIEWS = { landing, runner, results, admin };
const root = document.getElementById('app');
let cleanup = null;
let currentView = null;

function setUrl(params) {
  const url = new URL(location.href);
  url.search = '';
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  if (url.pathname.endsWith('/test') && !params.code) url.pathname = url.pathname.replace(/test$/, '');
  history.replaceState(null, '', url);
}

export const ctx = {
  config: CONFIG,
  get user() { return getUser(); },
  signOut() {
    signOut();
    navigate('landing');
  },
  navigate,
  openTest,
};

function navigate(view, params = {}) {
  if (!VIEWS[view]) throw new Error(`Unknown view ${view}`);
  try { cleanup?.(); } catch (e) { console.error(e); }
  cleanup = null;
  currentView = view;
  document.body.dataset.view = view;
  if (view === 'admin') setUrl({ admin: 'true' });
  else if (view === 'runner' && !params.preview) setUrl({ code: params.test.code });
  else if (view === 'landing') setUrl({ code: params.code || null });
  window.scrollTo({ top: 0 });
  root.classList.remove('view-enter');
  void root.offsetWidth; // restart the enter animation
  root.classList.add('view-enter');
  const res = VIEWS[view].render(root, ctx, params);
  cleanup = typeof res === 'function' ? res : null;
}

/** Load a test by code and open it in the runner (student mode). Errors return to landing. */
async function openTest(code) {
  const c = normalizeCode(code);
  try {
    const { test, source } = await loadTest(c, { config: CONFIG });
    navigate('runner', { test, source });
  } catch (err) {
    navigate('landing', { code: c, error: err.message });
  }
}

function adminGate() {
  if (load('adminUnlocked', false, 'session')) return navigate('admin');
  const input = h('input', { class: 'input', type: 'password', placeholder: 'Admin access code', autocomplete: 'off', dataset: { testid: 'admin-code-input' } });
  const err = h('p', { class: 'field-error', role: 'alert' });
  const tryUnlock = (close) => {
    if (input.value === CONFIG.ADMIN_ACCESS_CODE) {
      save('adminUnlocked', true, 'session');
      close();
      navigate('admin');
    } else {
      err.textContent = 'Incorrect access code.';
      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 400);
    }
  };
  navigate('landing');
  const m = openModal({
    title: 'Admin access',
    testid: 'admin-gate',
    body: h('form', { class: 'stack', on: { submit: (e) => { e.preventDefault(); tryUnlock(m.close); } } },
      h('p', { class: 'muted' }, 'Enter the admin access code to configure tests and view analytics.'), input, err),
    actions: [
      { label: 'Cancel', variant: 'ghost', onClick: (close) => { close(); } },
      { label: 'Unlock', variant: 'primary', testid: 'admin-unlock', onClick: (close) => tryUnlock(close) },
    ],
  });
  setTimeout(() => input.focus(), 50);
}

function start() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');

  if (params.get('admin') === 'true') return adminGate();

  if (code && getUser()) return openTest(code);
  navigate('landing', { code: code ? normalizeCode(code) : undefined });
}

// When a student signs in on the landing screen with a pending ?code=, continue to the test.
onAuthChange((user) => {
  if (!user || currentView !== 'landing') return;
  const code = new URLSearchParams(location.search).get('code');
  toast(`Signed in as ${user.name}`, { type: 'success' });
  if (code) openTest(code);
  else navigate('landing');
});

window.addEventListener('error', (e) => console.error('[ChemistryWorks]', e.error || e.message));
start();
