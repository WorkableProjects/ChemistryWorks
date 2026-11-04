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

import { CONFIG } from './config.js';
import { getUser, signOut, onAuthChange } from './lib/auth.js';
import { loadTest, normalizeCode } from './lib/tests.js';
import { load, save } from './lib/storage.js';
import { h, mount, icon, openModal, toast, viewTransition } from './ui.js';
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
    const { test, source } = await loadTest(c, { config: CONFIG });
    // V3-01 / V3-02: ask the backend whether this student already submitted (fails open when unavailable).
    mount(root, h('div', { class: 'status-check', role: 'status', 'aria-live': 'polite', dataset: { testid: 'submission-status-check' } },
      h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Checking your submission…'));
    const state = await checkSubmissionState(ctx, test);
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
  if (!user || currentView !== 'landing') return;
  const code = new URLSearchParams(location.search).get('code');
  toast(`Signed in as ${user.name}`, { type: 'success' });
  if (code) openTest(code);
  else navigate('landing');
});

window.addEventListener('error', (e) => console.error('[ChemistryWorks]', e.error || e.message));
start();
