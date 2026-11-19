// Student test runner: focus/scroll modes, question widgets, navigator drawer, keyboard shortcuts,
// autosave/resume, timer, integrity counters and the submit flow.
//
// render(root, ctx, { test, source, preview }) -> cleanup()
//
// The pieces live in sibling modules. Each exports a factory that takes the shared runtime object `rt` (the test,
// the attempt, the elements and the actions) and adds to it, so modules call each other through `rt`.

import { h, mount, icon, toast } from '../../ui.js';
import { isAnswered } from '../../lib/grading.js';
import { groupQuestions } from '../../lib/sections.js';
import { load } from '../../lib/storage.js';
import { openAttempt } from '../../lib/attempt.js';
import { referencePane } from '../reference-pane.js';
import { toolsFor } from '../tools/tools-config.js';
import { calculatorPanel } from '../tools/calculator.js';
import { constantsPanel } from '../tools/constants-tab.js';
import { normalizeScratchMap } from '../tools/scratch-model.js';
import { stopSpeaking } from '../tools/readaloud.js';
import { createTimer } from './timer.js';
import { buildChrome } from './chrome.js';
import { createDrawer } from './drawer.js';
import { createCards } from './cards.js';
import { createNav } from './nav.js';
import { openSubmit, finish } from './submit.js';
import { installListeners } from './shortcuts.js';
import { startLivePing } from './live.js';

// Re-exported so results.js, export-view.js and unit tests keep importing these from the runner.
export { formatInterpreted, optionImageEl, choiceImagesEl } from './widgets.js';

const modeOk = (m) => (m === 'focus' || m === 'scroll' ? m : null);

/** Opens the attempt and collects everything the other modules read from the test. */
function createRuntime(ctx, params, user) {
  const { test, preview = false } = params;
  // The attempt owns the question order, the answers, flags and autosave. Game modes open the same attempt,
  // so work done there shows up here and the other way round.
  const attempt = openAttempt(test, { user, email: user.email, preview, tools: true });
  const groups = groupQuestions(test);
  const ordered = attempt.questions;
  // Section of each question (by id) and the sections' calculated point totals; a header goes on the first
  // card of each section as displayed.
  const sectionById = new Map(groups.filter((g) => g.section).map((g) => [g.section.id, g]));
  const sectionOfQ = (q) => (q.section && sectionById.has(q.section) ? sectionById.get(q.section) : null);
  const headerFor = new Set(ordered.filter((q, i) => sectionOfQ(q) && (i === 0 || sectionOfQ(ordered[i - 1]) !== sectionOfQ(q))).map((q) => q.id));
  const byId = new Map(ordered.map((q) => [q.id, q]));
  const state = attempt.state; // shared with the attempt: answers, confidence, hints, flagged, index, startedAt, …
  const defaultMode = modeOk(test.defaultMode) || modeOk(ctx.config?.DEFAULT_MODE) || 'focus';
  if (!(test.allowModeToggle !== false && modeOk(state.mode))) state.mode = defaultMode;
  state.scratch = normalizeScratchMap(state.scratch, [...byId.keys()]);
  if (attempt.lastMode !== 'study') attempt.setMode('study');
  return {
    test, ctx, params, user, preview, attempt, groups, ordered, total: ordered.length, sectionOfQ, headerFor, byId, state,
    limitSec: test.timeLimitMinutes ? Number(test.timeLimitMinutes) * 60 : 0,
    tools: toolsFor(test, { accommodations: user.accommodations }),
    answeredCount: () => ordered.reduce((n, q) => n + (isAnswered(q, state.answers[q.id]) ? 1 : 0), 0),
    submitModal: null,
    shortcutsModal: null,
    refPane: null,
  };
}

/** Autosave plumbing: persist(), the brief "Saved" tick, and the attempt subscription. Returns a stop function. */
function wirePersistence(rt) {
  const { preview, state, attempt } = rt;
  let savedT = null;
  rt.saveNow = () => attempt.save(true);
  rt.persist = (debounce = false) => {
    if (preview || state.done) return;
    if (debounce) attempt.save(); else rt.saveNow();
  };
  const off = attempt.subscribe((ev) => {
    if (ev.type !== 'save') return;
    rt.savedEl.classList.add('is-visible');
    clearTimeout(savedT);
    savedT = setTimeout(() => rt.savedEl.classList.remove('is-visible'), 1400);
  });
  return () => { clearTimeout(savedT); off(); };
}

/** Builds the page element tree and mounts it. The reference pane is a sibling of the questions, so stage rerenders never reset it. */
function mountRunner(root, rt) {
  const { test, preview } = rt;
  const extraTabs = [];
  if (rt.tools.calculator) extraTabs.push({ id: 'tool-calc', title: 'Calculator', build: calculatorPanel });
  if (rt.tools.constants) extraTabs.push({ id: 'tool-constants', title: 'Units & constants', build: constantsPanel });
  rt.refPane = referencePane(test, { storageKey: `refpane:${test.code}`, extraTabs });
  // Teacher announcement shown above the questions (dismissible); late-work notice when in the late window.
  const announceEl = test.announcement && String(test.announcement).trim()
    ? h('div', { class: 'notice notice--info runner-announcement', role: 'note', dataset: { testid: 'test-announcement' } }, icon('info'),
      h('span', { class: 'runner-announcement__text' }, String(test.announcement)),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Dismiss announcement', on: { click: (e) => e.currentTarget.parentElement.remove() } }, icon('x', { size: 16 })))
    : null;
  const lateEl = test.instance?.late ? h('div', { class: 'notice notice--warning', role: 'note', dataset: { testid: 'late-notice' } }, icon('clock'),
    h('span', {}, 'This test is past its due date. Your teacher accepts late work, but a late penalty may apply.')) : null;
  const mainEl = h('main', { class: 'runner-main' }, announceEl, lateEl, rt.stage, rt.actions, rt.announcer);
  rt.runnerEl = h('div', { class: ['runner', preview && 'runner--preview'], dataset: { testid: 'runner' } },
    h('div', { class: 'runner-top' }, rt.header, rt.runnerBar, rt.progressBar, rt.previewBanner, rt.netBanner?.el),
    rt.refPane ? h('div', { class: 'runner-split', dataset: { testid: 'runner-split' } }, mainEl, rt.refPane.el) : mainEl,
    rt.footer,
    h('div', { class: 'nav-host' }, rt.overlay, rt.drawer),
  );
  mount(root, rt.runnerEl);
}

/** Wires the factories together in dependency order. */
function assemble(rt) {
  Object.assign(rt, createTimer(rt)); // the header shows the timer, so it is built first
  Object.assign(rt, buildChrome(rt));
  const drawer = createDrawer(rt);
  Object.assign(rt, drawer, { drawerIsOpen: drawer.isOpen });
  Object.assign(rt, createCards(rt));
  createNav(rt);
  rt.finish = (opts) => finish(rt, opts);
  rt.openSubmit = () => openSubmit(rt);
}

/** Stylesheets this view needs; app.js loads them before the first render (js/lib/css-loader.js). */
export const styles = ['runner', 'qtypes', 'tools', 'references', 'diagrams'];

export function render(root, ctx, params = {}) {
  const { test, preview = false } = params;
  const user = ctx.user || (preview ? { name: 'Preview', email: 'preview@local', picture: null, provider: 'demo' } : null);
  if (!user) { ctx.navigate('landing', { code: test?.code }); return undefined; }

  const rt = createRuntime(ctx, params, user);
  assemble(rt);
  const stopPersistence = wirePersistence(rt);
  mountRunner(root, rt);
  const removeListeners = installListeners(rt);

  if (rt.isRail() && load('navRail', null)?.open === true) rt.openDrawer({ restore: true });
  rt.applyMode();
  rt.tick(true);
  rt.startTimer();
  if (!preview) rt.saveNow();
  if (rt.attempt.resumed && rt.attempt.answeredCount) toast('Your answers were restored', { type: 'success' });
  rt.cards.forEach((c) => c.refresh());
  rt.updateChrome();
  if (params.review && !preview) rt.openSubmit(); // "Review & submit" from a game mode
  const live = startLivePing(rt);

  return function cleanup() {
    live.stop();
    rt.stopTimer();
    removeListeners();
    rt.stopMoving();
    stopPersistence();
    rt.attempt.destroy();
    rt.closeDrawer();
    rt.submitModal?.close();
    rt.shortcutsModal?.close();
    rt.refPane?.destroy();
    rt.netBanner?.destroy();
    stopSpeaking();
  };
}
