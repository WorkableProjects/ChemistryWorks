// ChemistryWorks entry point: view router + shared context.
//
// View contract: each view module exports `render(root, ctx, params)` which builds its DOM inside
// `root` and may return a cleanup function (remove listeners, stop timers). Views:
//   landing  params: { code?: string, error?: string }
//   mode-select params: { test, source }  (Study vs Game chooser; only for tests with gameMode === true)
//   game     params: { test, source }     (single-player practice; never submits)
//   runner   params: { test, source, preview?: boolean }
//   results  params: { test, grade, payload, submission, preview?: boolean }
//   feedback params: { payload } (a past submission from getLocalResults()) | { test, source, status, canRetake, practiceOnly } (V3-01)
//   submitted params: { test, source, status, canRetake }  (V3-01/02: submitted, not released yet)
//   admin    params: {}
//
// URL state: ?code=CHEM101 (or /test?code=CHEM101) opens a test; ?admin=true opens the admin panel.

import { CONFIG, feature } from './config.js';
import { getUser, signOut, onAuthChange, googleConfigured, renderGoogleButton, getIdToken, getFreshIdToken } from './lib/auth.js';
import { whoAmI } from './lib/api.js';
import { confirmedAdminEmail, setAdminConfirmed, clearAdminConfirmed } from './lib/admin-session.js';
import { checkBackendVersion, versionBanner } from './lib/version-check.js';
import { loadTest, normalizeCode } from './lib/tests.js';
import { instantiateTest } from './lib/instantiate.js';
import { windowState, applyAccommodations } from './lib/schedule.js';
import { installErrorReporting } from './lib/errors.js';
import { load, save } from './lib/storage.js';
import { h, mount, icon, openModal, toast, viewTransition, flaskLoader } from './ui.js';
import { checkSubmissionState } from './lib/student-status.js';
import { applyRole } from './lib/theme.js';
import * as landing from './views/landing.js';
import * as runner from './views/runner.js';
import * as results from './views/results.js';
import * as feedback from './views/feedback.js';
import * as submitted from './views/submitted.js';

// Rarely needed heavy views are lazy: an entry may be a loader `() => import(...)` that navigate() awaits once.
const VIEWS = {
  landing, runner, results, feedback, submitted,
  'mode-select': () => import('./views/mode-select.js'),
  unavailable: () => import('./views/unavailable.js'),
  game: () => import('./views/game.js'),
  admin: () => import('./views/admin.js'),
};
const root = document.getElementById('app');
let cleanup = null;
let currentView = null;
let navSeq = 0;
const loaded = new Map();
const resolveView = (view) => loaded.get(view) || VIEWS[view];

function setUrl(params) {
  const url = new URL(location.href);
  const features = url.searchParams.get('features'); // keep ?features= (V4-08 flags) across navigation
  url.search = '';
  if (features) url.searchParams.set('features', features);
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
  // Single-submission tests may only be started after openTest() has checked this student's submissions;
  // every other route into the runner (back buttons, game mode, stale links) goes back through that check.
  if (view === 'runner' && !params.preview && params.test?.singleSubmission === true && params.cleared !== true) {
    return openTest(params.test.code);
  }
  try { cleanup?.(); } catch (e) { console.error(e); }
  cleanup = null;
  currentView = view;
  document.body.dataset.view = view;
  // Teacher accent in the admin panel and in admin previews of a test; student accent everywhere else.
  applyRole(view === 'admin' || params.preview ? 'admin' : 'student');
  if (view === 'admin') setUrl({ admin: 'true' });
  else if ((view === 'runner' || view === 'mode-select' || view === 'game') && !params.preview) setUrl({ code: params.test.code });
  else if (view === 'landing') setUrl({ code: params.code || null });
  else if ((view === 'feedback' || view === 'submitted') && params.test?.code) setUrl({ code: params.test.code });
  window.scrollTo({ top: 0 });
  const seq = ++navSeq;
  const swap = () => {
    if (seq !== navSeq) return; // a newer navigation won the race
    const res = resolveView(view).render(root, ctx, params);
    cleanup = typeof res === 'function' ? res : null;
  };
  const start = () => {
    if (seq !== navSeq) return;
    transition();
  };
  const transition = () => {
  root.classList.remove('view-enter');
  // View Transitions API where supported and motion is allowed (skipped under automation so renders stay synchronous);
  // otherwise the CSS view-enter animation.
  if (typeof document.startViewTransition === 'function' && !navigator.webdriver) {
    viewTransition(swap);
  } else {
    void root.offsetWidth; // restart the enter animation
    root.classList.add('view-enter');
    swap();
  }
  };
  const entry = VIEWS[view];
  if (typeof entry === 'function') {
    // Lazy view: load its module first (once), then run the same transition/swap path.
    entry().then((mod) => { loaded.set(view, mod); start(); }).catch((e) => {
      console.error(e);
      if (seq === navSeq) { toast('Could not load this page. Check your connection and try again.', { type: 'error' }); if (view !== 'landing') navigate('landing'); }
    });
  } else {
    start();
  }
}

/** Load a test by code and open it in the runner (student mode). Errors return to landing. */
async function openTest(code) {
  const c = normalizeCode(code);
  try {
    const idToken = ctx.user?.provider === 'google' ? getIdToken() : null;
    const loaded = await loadTest(c, { config: CONFIG, idToken });
    // V4-09 / V4-02: per-student instance (randomized numbers, drawn pool questions), stable across devices.
    let test = instantiateTest(loaded.test, { email: ctx.user?.email || '' });
    const { source } = loaded;
    // V3-01 / V3-02: ask the backend whether this student already submitted (fails open when unavailable).
    mount(root, h('div', { class: 'status-check' }, flaskLoader({ size: 88, label: 'Checking your submission…', testid: 'submission-status-check' })));
    const state = await checkSubmissionState(ctx, test);
    // V4-02 S11/S12: roster-only and the open/close window (server state wins: it knows this student's extension).
    if (state.roster && state.roster.required && state.roster.ok === false) return navigate('unavailable', { reason: 'not_on_roster', title: test.title, code: test.code });
    const win = state.window || windowState(test, state.accommodations);
    if (win.state === 'before') return navigate('unavailable', { reason: 'not_open', title: test.title, opensAt: win.opensAt, code: test.code });
    if (win.state === 'closed') return navigate('unavailable', { reason: 'closed', title: test.title, closesAt: win.closesAt, code: test.code });
    if (win.state === 'late') test = { ...test, instance: { ...(test.instance || {}), late: true } };
    // A v4 backend answered (it sends the window): the runner may send live-monitor pings.
    if (state.window) test = { ...test, instance: { ...(test.instance || {}), live: true } };
    if (state.accommodations) test = applyAccommodations(test, state.accommodations, test.instance?.seed || ctx.user?.email || '');
    const single = test.singleSubmission === true;
    // Single-submission tests: one attempt, period — "Take again" only when the teacher allowed a retake.
    if (single && state.blocking) {
      if (state.feedback) return navigate('feedback', { test, source, status: state, canRetake: false, practiceOnly: true });
      return navigate('submitted', { test, source, status: state, canRetake: false });
    }
    const canRetake = !single || state.retakeAllowed === true;
    const practiceOnly = false;
    if (state.feedback) return navigate('feedback', { test, source, status: state, canRetake, practiceOnly });
    const showNotice = !single && state.source === 'server' && state.submitted;
    if (showNotice) return navigate('submitted', { test, source, status: state, canRetake });
    // Only tests that explicitly opt in (gameMode === true) offer the Study / Game choice.
    // `cleared` marks that this student passed the submission check (required for single-submission tests).
    navigate(test.gameMode === true ? 'mode-select' : 'runner', { test, source, cleared: true });
  } catch (err) {
    if (['not_open', 'closed', 'not_on_roster'].includes(err.code)) return navigate('unavailable', { reason: err.code, title: err.title, opensAt: err.opensAt, closesAt: err.closesAt, code: c });
    navigate('landing', { code: c, error: err.message });
  }
}

// Opens the admin panel and, for admins only, checks the backend version (banner when the Apps Script is older).
function openAdmin() {
  navigate('admin');
  runVersionCheck();
}

async function runVersionCheck() {
  if (!feature('adminAccounts') || !CONFIG.GAS_WEB_APP_URL) return; // behind the flag until the v4 backend is the norm
  const info = await checkBackendVersion({ gasUrl: CONFIG.GAS_WEB_APP_URL });
  if (!info.outdated) return;
  for (let i = 0; i < 40 && !(currentView === 'admin' && loaded.has('admin') && root.firstChild); i++) await new Promise((r) => setTimeout(r, 50));
  if (currentView !== 'admin' || root.querySelector('[data-testid="version-banner"]')) return;
  root.insertBefore(versionBanner(info), root.firstChild);
}

let adminGateBusy = false; // true while the Google admin sign-in modal is open (the landing sign-in toast stays quiet)

// V4-07: the signed-in Google user is the admin. Falls back to the access-code flow when the flag is off,
// Google or the backend is not configured, the user is not signed in (offered a Google button + a code link),
// or the account is not on the Admins list.
async function adminGate() {
  if (load('adminUnlocked', false, 'session')) return openAdmin();
  if (!feature('adminAccounts') || !googleConfigured(CONFIG) || !CONFIG.GAS_WEB_APP_URL) return accessCodeGate();
  if (confirmedAdminEmail()) return openAdmin();

  const u = getUser();
  if (u && u.provider === 'google') {
    const token = getIdToken() || await getFreshIdToken();
    if (token) {
      const res = await whoAmI({ gasUrl: CONFIG.GAS_WEB_APP_URL, idToken: token });
      if (res.ok && String(res.email).toLowerCase() === String(u.email).trim().toLowerCase()) {
        setAdminConfirmed(res.email);
        return openAdmin();
      }
      clearAdminConfirmed();
      return googleGateModal({ notice: res.error === 'not_admin'
        ? `${u.email} is not on the admin list. Ask an owner to add you, or use the access code.`
        : `Could not confirm admin access (${res.error || 'no response'}). You can use the access code instead.` });
    }
  }
  return googleGateModal({});
}

function googleGateModal({ notice = '' }) {
  navigate('landing');
  adminGateBusy = true;
  const msgEl = h('p', { class: notice ? 'field-error' : 'muted', role: 'alert', dataset: { testid: 'admin-google-message' } }, notice || 'Sign in with the Google account that is on the admin list.');
  const buttonHost = h('div', { dataset: { testid: 'admin-google-button' } });
  let off = () => {};
  const done = () => { adminGateBusy = false; off(); };
  const m = openModal({
    title: 'Admin access', testid: 'admin-gate', onClose: done,
    body: h('div', { class: 'stack' }, msgEl, buttonHost,
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'admin-use-code' }, on: { click: () => { m.close(); accessCodeGate(); } } }, 'Use access code instead')),
    actions: [{ label: 'Cancel', variant: 'ghost', onClick: (close) => { close(); } }],
  });
  const confirm = async (user) => {
    if (!user || user.provider !== 'google') return;
    msgEl.className = 'muted';
    msgEl.textContent = 'Checking your admin access…';
    const token = user.idToken || await getFreshIdToken();
    const res = token ? await whoAmI({ gasUrl: CONFIG.GAS_WEB_APP_URL, idToken: token }) : { ok: false, error: 'invalid_token' };
    if (res.ok && String(res.email).toLowerCase() === String(user.email).trim().toLowerCase()) {
      setAdminConfirmed(res.email);
      m.close();
      return openAdmin();
    }
    msgEl.className = 'field-error';
    msgEl.textContent = res.error === 'not_admin'
      ? `${user.email} is not on the admin list. Ask an owner to add you, or use the access code.`
      : `Could not confirm admin access (${res.error || 'no response'}). You can use the access code instead.`;
  };
  off = onAuthChange(confirm);
  renderGoogleButton(buttonHost, CONFIG, { onError: (e) => { msgEl.className = 'field-error'; msgEl.textContent = e; } });
}

function accessCodeGate() {
  if (load('adminUnlocked', false, 'session')) return openAdmin();
  const input = h('input', { class: 'input', type: 'password', placeholder: 'Admin access code', autocomplete: 'off', dataset: { testid: 'admin-code-input' } });
  const err = h('p', { class: 'field-error', role: 'alert' });
  const tryUnlock = (close) => {
    if (input.value === CONFIG.ADMIN_ACCESS_CODE) {
      save('adminUnlocked', true, 'session');
      close();
      openAdmin();
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
      h('p', { class: 'muted' }, 'Enter the admin access code to build tests and grade submissions.'), input, err),
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
  if (!user || currentView !== 'landing' || adminGateBusy) return;
  const code = new URLSearchParams(location.search).get('code');
  toast(`Signed in as ${user.name}`, { type: 'success' });
  if (code) openTest(code);
  else navigate('landing');
});

window.addEventListener('error', (e) => console.error('[ChemistryWorks]', e.error || e.message));
// V4-08: opt-in error reports (the backend refuses them unless Settings > Error reports is on).
if (!navigator.webdriver) installErrorReporting(CONFIG);
start();
