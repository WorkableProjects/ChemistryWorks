// Student test runner: focus/scroll modes, question widgets, navigator drawer, keyboard shortcuts,
// autosave/resume, timer, integrity counters and the submit flow.
//
// render(root, ctx, { test, source, preview }) -> cleanup()

import { withQuestionImage } from './question-image.js';
import {
  h, mount, icon, richText, renderMath, toast, openModal,
  formatDuration, formatDurationLong, appHeader, userBadge, prefersReducedMotion,
} from '../ui.js';
import { isAnswered } from '../lib/grading.js';
import { TYPE_LABELS, isRequired } from '../lib/schema.js';
import { groupQuestions } from '../lib/sections.js';
import { submitResults } from '../lib/submit.js';
import { CONFIDENCE_LEVELS, validConfidence, hintButtonText } from '../lib/extras.js';
import { preSubmitBlocked } from '../lib/student-status.js';
import { load, save } from '../lib/storage.js';
import { openAttempt } from '../lib/attempt.js';
import { modeSwitcher } from './runner/mode-switcher.js';
import { referencePane } from './reference-pane.js';
import { feature } from '../config.js';
import { toolsFor } from './tools/tools-config.js';
import { calculatorPanel } from './tools/calculator.js';
import { constantsPanel } from './tools/constants-tab.js';
import { scratchpad } from './tools/scratchpad.js';
import { normalizeScratch, normalizeScratchMap, isEmptyScratch } from './tools/scratch-model.js';
import { marksBar } from './tools/marks.js';
import { readAloudButton, stopSpeaking } from './tools/readaloud.js';
import { questionSpeech } from './tools/speech.js';
import { networkBanner } from './tools/banner.js';
import { ensureToolsCss } from './tools/settings.js';
import { buildWidget, pointsLabel } from './runner/widgets.js';
import { publicCall } from '../lib/api.js';
import { getIdToken } from '../lib/auth.js';

// Re-exported so results.js, export-view.js and unit tests keep importing these from runner.js.
export { formatInterpreted, optionImageEl, choiceImagesEl } from './runner/widgets.js';

/** "Part A: Bonding" -> "Part A"; titles without a colon are shown whole (shortened when very long). */
function sectionPillText(title) {
  const t = String(title || '').trim();
  const head = t.includes(':') ? t.slice(0, t.indexOf(':')).trim() : t;
  return head.length > 24 ? `${head.slice(0, 23)}…` : head;
}


/* ------------------------------------------------------------------ view */

export function render(root, ctx, params = {}) {
  const { test, preview = false } = params;
  const user = ctx.user || (preview ? { name: 'Preview', email: 'preview@local', picture: null, provider: 'demo' } : null);
  if (!user) { ctx.navigate('landing', { code: test?.code }); return undefined; }

  // V4-05: tools are off unless the flag is on AND the test (or the student's accommodation) asks for them.
  const toolsOn = feature('studentTools');
  // V5-01: the attempt owns the question order, the answers, flags and autosave. Game modes open the same attempt,
  // so work done there shows up here and the other way round.
  const attempt = openAttempt(test, { user, email: user.email, preview, tools: toolsOn });
  const groups = groupQuestions(test);
  const ordered = attempt.questions;
  const total = ordered.length;
  // Section of each question (by id) and the sections' calculated point totals; a header goes on the first
  // card of each section as displayed.
  const sectionById = new Map(groups.filter((g) => g.section).map((g) => [g.section.id, g]));
  const sectionOfQ = (q) => (q.section && sectionById.has(q.section) ? sectionById.get(q.section) : null);
  const headerFor = new Set(ordered.filter((q, i) => sectionOfQ(q) && (i === 0 || sectionOfQ(ordered[i - 1]) !== sectionOfQ(q))).map((q) => q.id));
  const byId = new Map(ordered.map((q) => [q.id, q]));
  const limitSec = test.timeLimitMinutes ? Number(test.timeLimitMinutes) * 60 : 0;

  const modeOk = (m) => (m === 'focus' || m === 'scroll' ? m : null);
  const defaultMode = modeOk(test.defaultMode) || modeOk(ctx.config?.DEFAULT_MODE) || 'focus';

  const state = attempt.state; // shared with the attempt: answers, confidence, hints, flagged, index, startedAt, …
  const saved = attempt.resumed;
  if (!(test.allowModeToggle !== false && modeOk(state.mode))) state.mode = defaultMode;
  const tools = toolsFor(test, { enabled: toolsOn, accommodations: user.accommodations });
  if (toolsOn) { ensureToolsCss(); state.scratch = normalizeScratchMap(state.scratch, [...byId.keys()]); }
  if (attempt.lastMode !== 'study') attempt.setMode('study');

  const answeredCount = () => ordered.reduce((n, q) => n + (isAnswered(q, state.answers[q.id]) ? 1 : 0), 0);

  /* ---- persistence */
  function saveNow() { attempt.save(true); }
  // Brief "Saved" tick after an autosave (hidden from assistive tech; purely visual reassurance).
  let savedEl = null;
  let savedT = null;
  function flashSaved() {
    if (!savedEl) return;
    savedEl.classList.add('is-visible');
    clearTimeout(savedT);
    savedT = setTimeout(() => savedEl.classList.remove('is-visible'), 1400);
  }
  function persist(debounce = false) {
    if (preview || state.done) return;
    if (debounce) attempt.save(); else saveNow();
  }
  const offAttempt = attempt.subscribe((ev) => { if (ev.type === 'save') flashSaved(); });

  /* ---- header chrome */
  const timerText = h('span', { class: 'runner-timer__text' }, '0:00');
  const timerEl = h('div', { class: 'runner-timer', role: 'timer', 'aria-live': 'off', dataset: { testid: 'timer' } }, icon('clock', { size: 16 }), timerText);
  // Screen readers hear the time once per minute (not every second).
  const timerAnnouncer = h('span', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true', dataset: { testid: 'timer-announcer' } });

  const modeLabel = h('span', { class: 'runner-hbtn__label' });
  const modeIcon = h('span', { class: 'runner-hbtn__icon' });
  const modeBtn = test.allowModeToggle !== false
    ? h('button', {
      type: 'button', class: 'btn btn--ghost btn--sm runner-hbtn', dataset: { testid: 'mode-toggle' },
      on: { click: () => setMode(state.mode === 'focus' ? 'scroll' : 'focus') },
    }, modeIcon, modeLabel)
    : null;

  const navToggle = h('button', {
    type: 'button', class: 'btn btn--ghost btn--sm runner-hbtn', 'aria-expanded': 'false', 'aria-controls': 'runner-navigator',
    dataset: { testid: 'navigator-toggle' }, on: { click: () => (drawerOpen ? closeDrawer({ remember: true }) : openDrawer({ remember: true })) },
  }, icon('grid', { size: 16 }), h('span', { class: 'runner-hbtn__label' }, 'Questions'));

  const header = appHeader({
    subtitle: test.title,
    onHome: () => ctx.navigate(preview ? 'admin' : 'landing'),
    right: [modeBtn, navToggle, userBadge(user)],
  });
  // Calm bar under the navy header: test title, timer, and the progress bar along its bottom edge.
  const runnerBar = h('div', { class: 'runner-bar' },
    h('div', { class: 'runner-bar__inner' },
      h('span', { class: 'runner-bar__title', title: test.title }, test.title),
      !preview && feature('v5Attempt') ? modeSwitcher({
        test, attempt, current: 'study',
        onPick: (id) => { attempt.setMode(id); ctx.navigate('game', { test, source: params.source, gameId: id, cleared: true }); },
      }) : null,
      timerEl, timerAnnouncer));

  const progressFill = h('div', { class: 'runner-progress__fill' });
  const progressBar = h('div', {
    class: 'runner-progress', role: 'progressbar', 'aria-label': 'Questions answered',
    'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': '0', dataset: { testid: 'progress-bar' },
  }, progressFill);

  const netBanner = toolsOn && !preview ? networkBanner({ config: ctx.config }) : null;
  const previewBanner = preview
    ? h('div', { class: 'runner-preview', dataset: { testid: 'preview-banner' } },
      icon('eye', { size: 16 }),
      h('span', {}, 'Preview mode — answers are not submitted'),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: 'exit-preview' }, on: { click: () => ctx.navigate('admin') } }, 'Exit preview'))
    : null;

  /* ---- stage + cards */
  const stage = h('div', { class: 'runner-stage' });
  const announcer = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const api = {
    get: (id) => state.answers[id],
    set: (id, val, opts) => setAnswer(id, val, opts),
  };

  const cards = ordered.map((q, i) => buildCard(q, i));
  const cardById = new Map(cards.map((c) => [c.q.id, c]));

  function sectionHeader({ section, points }) {
    return h('header', { class: 'q-section', dataset: { testid: 'section-header', sectionId: section.id } },
      h('p', { class: 'q-section__title' }, section.title),
      section.instructions ? richText(section.instructions, 'div', 'q-section__instr') : null,
      h('span', { class: 'q-section__pts' }, `${points} pts`));
  }

  /** Per-question extras (V4-03): a point-costing hint and the "How sure are you?" row. Both are off unless the question asks. */
  function buildExtras(q) {
    if (!q.hint && !q.confidence) return { el: null, refresh() {} };
    let hintBtn = null; let hintBox = null; let confRow = null; let confBtns = [];
    if (q.hint) {
      const hintId = `hint-${q.id}`;
      hintBox = h('div', { class: 'q-hintbox', id: hintId, role: 'note', hidden: true, dataset: { testid: 'hint-text' } },
        h('span', { class: 'q-hintbox__label' }, 'Hint'), richText(q.hint.text, 'div', 'q-hintbox__text'));
      hintBtn = h('button', {
        type: 'button', class: 'btn btn--ghost btn--sm q-hintbtn', 'aria-controls': hintId, dataset: { testid: 'hint-btn' },
        on: { click: () => {
          if (state.done || state.submitting) return;
          state.hints.add(q.id);
          refreshQuestion(q.id);
          hintBox.focus({ preventScroll: true });
        } },
      }, hintButtonText(q));
      hintBox.tabIndex = -1;
    }
    if (q.confidence) {
      confBtns = CONFIDENCE_LEVELS.map((l) => h('button', {
        type: 'button', class: 'q-conf__btn', role: 'radio', 'aria-checked': 'false', dataset: { testid: `confidence-${l.value}` },
        on: { click: () => { if (state.done || state.submitting) return; state.confidence[q.id] = l.value; refreshQuestion(q.id); } },
      }, l.label));
      confRow = h('div', { class: 'q-conf', hidden: true, dataset: { testid: 'confidence-row' } },
        h('span', { class: 'q-conf__label', id: `conf-${q.id}` }, 'How sure are you?'),
        h('div', { class: 'q-conf__opts', role: 'radiogroup', 'aria-labelledby': `conf-${q.id}` }, confBtns));
    }
    return {
      el: h('div', { class: 'q-extras' }, hintBtn, hintBox, confRow),
      refresh(answered) {
        if (hintBtn) {
          const used = state.hints.has(q.id);
          hintBtn.hidden = used;
          hintBox.hidden = !used;
        }
        if (confRow) {
          confRow.hidden = !answered;
          confBtns.forEach((b, k) => {
            const on = state.confidence[q.id] === CONFIDENCE_LEVELS[k].value;
            b.setAttribute('aria-checked', String(on));
            b.classList.toggle('is-selected', on);
          });
        }
      },
    };
  }

  function buildCard(q, i) {
    const widget = buildWidget(q, api);
    const flagBtn = h('button', {
      type: 'button', class: 'q-flag', 'aria-pressed': 'false', title: 'Flag for review (G)',
      dataset: { testid: 'flag-btn' }, on: { click: () => toggleFlag(q.id, { focusNote: true }) },
    }, icon('flag', { size: 16 }), h('span', { class: 'q-flag__label' }, 'Flag'));
    const clearBtn = h('button', {
      type: 'button', class: 'q-clear', dataset: { testid: 'clear-answer' },
      on: { click: () => { delete state.answers[q.id]; delete state.confidence[q.id]; refreshQuestion(q.id); card.el.focus({ preventScroll: true }); } },
    }, 'Clear answer');
    const clearSlot = h('div', { class: 'q-clear-slot' });
    const extras = buildExtras(q);
    // V4-05: optional note to the teacher that goes with the flag.
    const noteInput = toolsOn ? h('input', {
      class: 'input q-flagnote__input', type: 'text', maxlength: '200', 'aria-label': 'Note for your teacher (optional)',
      placeholder: 'Note for your teacher (optional)', dataset: { testid: 'flag-note' },
      on: {
        input: () => { state.flagNotes[q.id] = noteInput.value; persist(true); },
        keydown: (e) => e.stopPropagation(), // typing here must not trigger runner shortcuts or Enter -> next question
      },
    }) : null;
    const noteRow = noteInput ? h('div', { class: 'q-flagnote', hidden: true, dataset: { testid: 'flag-note-row' } }, noteInput) : null;
    const readAloud = tools.readAloud ? readAloudButton({ getText: () => questionSpeech(q) }) : null;
    const el = h('section', {
      class: 'q-card', tabindex: '-1', 'aria-label': `Question ${i + 1} of ${total}`,
      dataset: { testid: 'question-card', questionId: q.id },
    },
      headerFor.has(q.id) ? sectionHeader(sectionOfQ(q)) : null,
      h('div', { class: 'q-card__head' },
        h('h2', { class: 'q-card__num' }, `Question ${i + 1} of ${total}`),
        h('span', { class: 'pill pill--primary' }, TYPE_LABELS[q.type] || q.type),
        h('span', { class: 'pill' }, pointsLabel(q.points ?? 1)),
        isRequired(test, q) ? h('span', { class: 'pill pill--warning q-required-pill', dataset: { testid: 'required-pill' } }, 'Required') : null,
        sectionOfQ(q) ? h('span', { class: 'pill q-section-pill', title: sectionOfQ(q).section.title, dataset: { testid: 'section-pill' } }, sectionPillText(sectionOfQ(q).section.title)) : null,
        h('span', { class: 'spacer' }),
        readAloud?.el,
        flagBtn),
      // a hotspot's image is the diagram inside the widget, so it is not repeated beside the question text
      withQuestionImage(q.type === 'hotspot' ? { ...q, image: undefined } : q, widget.textEl || richText(q.text, 'div', 'q-text')),
      widget.el,
      extras.el,
      clearSlot,
    );
    el.querySelector('.q-text').id = `qt-${q.id}`;
    const marks = tools.highlighter ? marksBar({
      card: el, qid: q.id, getStruck: () => state.struck[q.id] || [],
      setStruck: (ids) => { if (ids.length) state.struck[q.id] = ids; else delete state.struck[q.id]; persist(true); },
    }) : null;
    if (marks) widget.el.before(marks.el);
    const pad = tools.scratchpad ? scratchpad({
      qid: q.id, get: () => state.scratch[q.id],
      set: (v) => { const n = normalizeScratch(v); if (isEmptyScratch(n)) delete state.scratch[q.id]; else state.scratch[q.id] = n; persist(true); },
    }) : null;
    if (pad) clearSlot.before(pad.el);
    if (noteRow) clearSlot.before(noteRow); // the optional note sits under the answer, not above it
    const card = {
      q, i, el, widget,
      refresh() {
        const ans = state.answers[q.id];
        widget.refresh(ans);
        const answered = isAnswered(q, ans);
        extras.refresh(answered);
        if (answered && !clearBtn.isConnected) clearSlot.appendChild(clearBtn);
        else if (!answered) clearBtn.remove();
        const flagged = state.flagged.has(q.id);
        flagBtn.setAttribute('aria-pressed', String(flagged));
        flagBtn.classList.toggle('is-flagged', flagged);
        if (noteRow) {
          noteRow.hidden = !flagged;
          if (noteInput.value !== (state.flagNotes[q.id] || '')) noteInput.value = state.flagNotes[q.id] || '';
        }
        marks?.refresh();
        pad?.refresh();
      },
    };
    return card;
  }

  /* ---- actions row (focus mode) */
  const prevBtn = h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'prev-btn' }, on: { click: () => goTo(state.index - 1) } }, icon('left'), 'Previous');
  const reviewBtn = h('button', { type: 'button', class: 'btn btn--subtle', dataset: { testid: 'review-btn' }, on: { click: () => openDrawer() } }, icon('list'), 'Review');
  const nextLabel = h('span', {}, 'Next');
  const nextIcon = h('span', { class: 'runner-next-icon' });
  const nextBtn = h('button', {
    type: 'button', class: 'btn btn--primary', dataset: { testid: 'next-btn' },
    on: { click: () => (state.index >= total - 1 ? openSubmit() : goTo(state.index + 1)) },
  }, nextLabel, nextIcon);
  const actions = h('div', { class: 'runner-actions' }, prevBtn, reviewBtn, nextBtn);

  /* ---- footer */
  const progressText = h('span', { class: 'runner-footer__progress', dataset: { testid: 'progress-text' } });
  savedEl = h('span', { class: 'runner-saved', 'aria-hidden': 'true', dataset: { testid: 'saved-tick' } }, icon('check', { size: 14 }), 'Saved');
  const submitBtn = h('button', { type: 'button', class: 'btn btn--primary', dataset: { testid: 'submit-btn' }, on: { click: () => openSubmit() } }, icon('check', { size: 16 }), 'Submit test');
  const footer = h('footer', { class: 'runner-footer' },
    h('div', { class: 'runner-footer__inner' },
      progressText,
      savedEl,
      h('button', { type: 'button', class: 'btn btn--subtle btn--sm runner-footer__hint', dataset: { testid: 'shortcuts-btn' }, on: { click: () => openShortcuts() } },
        icon('keyboard', { size: 16 }), h('span', {}, 'Keyboard shortcuts (?)')),
      h('span', { class: 'spacer' }),
      submitBtn));

  /* ---- navigator drawer */
  // >= 1024px the navigator is a docked left rail (open/closed choice remembered per device in `cw:navRail`);
  // below that it is a bottom sheet with a backdrop.
  const railMq = typeof matchMedia === 'function' ? matchMedia('(min-width: 1024px)') : null;
  const isRail = () => !!railMq?.matches;
  let drawerOpen = false;
  const tiles = new Map();
  const cntAnswered = h('b', {}), cntFlagged = h('b', {}), cntUnanswered = h('b', {});
  const makeTile = (q, i) => {
    const t = h('button', {
      type: 'button', class: 'nav-tile', dataset: { testid: `nav-item-${q.id}` },
      on: { click: () => {
        goTo(i, { focus: true });
        if (!isRail()) closeDrawer(); // bottom sheet closes on pick; the desktop rail stays docked
      } },
    }, String(i + 1));
    tiles.set(q.id, t);
    return t;
  };
  // Tiles are grouped under section titles when the test has sections (numbers stay global).
  const tileGrid = (() => {
    if (!groups.some((g) => g.section)) return h('div', { class: 'nav-grid' }, ordered.map(makeTile));
    const wrap = h('div', { class: 'nav-groups' });
    let offset = 0;
    for (const g of groups) {
      const n = g.questions.length;
      if (!n) continue;
      const items = ordered.slice(offset, offset + n).map((q, k) => makeTile(q, offset + k));
      offset += n;
      wrap.appendChild(h('section', { class: 'nav-group', dataset: { sectionId: g.section ? g.section.id : '' }, 'aria-label': g.section ? g.section.title : 'General questions' },
        h('h3', { class: 'nav-group__title' }, g.section ? g.section.title : 'General'),
        h('div', { class: 'nav-grid' }, items)));
    }
    return wrap;
  })();
  const drawerClose = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close navigator', on: { click: () => closeDrawer({ remember: true }) } }, icon('x'));
  const drawer = h('aside', { class: 'nav-drawer', id: 'runner-navigator', 'aria-label': 'Question navigator', dataset: { testid: 'navigator' } },
    h('div', { class: 'nav-drawer__grip', 'aria-hidden': 'true' }),
    h('div', { class: 'nav-drawer__head' }, h('h2', {}, 'Questions'), drawerClose),
    h('div', { class: 'nav-drawer__body' },
      h('div', { class: 'nav-counts' },
        h('span', { class: 'nav-count nav-count--answered' }, cntAnswered, ' answered'),
        h('span', { class: 'nav-count nav-count--flagged' }, cntFlagged, ' flagged'),
        h('span', { class: 'nav-count' }, cntUnanswered, ' unanswered')),
      tileGrid,
      h('ul', { class: 'nav-legend' },
        h('li', {}, h('i', { class: 'nav-key nav-key--answered' }), 'Answered'),
        h('li', {}, h('i', { class: 'nav-key nav-key--flagged' }), 'Flagged'),
        h('li', {}, h('i', { class: 'nav-key nav-key--current' }), 'Current'))),
    h('div', { class: 'nav-drawer__foot' },
      h('button', { type: 'button', class: 'btn btn--primary btn--block', dataset: { testid: 'navigator-submit' }, on: { click: () => openSubmit() } }, 'Submit test')));
  drawer.inert = true;
  const overlay = h('div', { class: 'nav-overlay', on: { click: () => closeDrawer({ remember: true }) } });

  // `remember: true` marks a deliberate open/close by the student (stored for the desktop rail); programmatic
  // closes (submit, cleanup) never change the stored preference.
  function openDrawer({ remember = false, restore = false } = {}) {
    if (drawerOpen) return;
    if (remember && isRail()) save('navRail', { open: true });
    drawerOpen = true;
    drawer.inert = false;
    drawer.classList.add('is-open');
    runnerEl.classList.add('is-drawer-open');
    overlay.classList.add('is-open');
    navToggle.setAttribute('aria-expanded', 'true');
    if (!restore) setTimeout(() => tiles.get(ordered[state.index].id)?.focus({ preventScroll: true }), 60);
  }
  function closeDrawer({ remember = false } = {}) {
    if (!drawerOpen) return;
    if (remember && isRail()) save('navRail', { open: false });
    drawerOpen = false;
    const hadFocus = drawer.contains(document.activeElement);
    drawer.classList.remove('is-open');
    runnerEl.classList.remove('is-drawer-open');
    overlay.classList.remove('is-open');
    drawer.inert = true;
    navToggle.setAttribute('aria-expanded', 'false');
    if (hadFocus) navToggle.focus({ preventScroll: true });
  }

  /* ---- chrome refresh */
  const tileState = new Map();
  function updateChrome() {
    const done = answeredCount();
    progressBar.setAttribute('aria-valuenow', String(done));
    progressFill.style.transform = `scaleX(${total ? done / total : 0})`;
    progressText.textContent = `${done} of ${total} answered`;
    cntAnswered.textContent = String(done);
    cntFlagged.textContent = String(state.flagged.size);
    cntUnanswered.textContent = String(total - done);
    ordered.forEach((q, i) => {
      const t = tiles.get(q.id);
      const a = isAnswered(q, state.answers[q.id]);
      const f = state.flagged.has(q.id);
      const was = tileState.get(q.id);
      if (was && ((a && !was.a) || (f && !was.f)) && !prefersReducedMotion()) {
        t.classList.remove('is-pop');
        void t.offsetWidth;
        t.classList.add('is-pop');
      }
      tileState.set(q.id, { a, f });
      t.classList.toggle('is-answered', a);
      t.classList.toggle('is-flagged', f);
      t.classList.toggle('is-current', i === state.index);
      if (i === state.index) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current');
      t.setAttribute('aria-label', `Question ${i + 1}: ${a ? 'answered' : 'unanswered'}${f ? ', flagged' : ''}`);
    });
    prevBtn.disabled = state.index <= 0;
    const last = state.index >= total - 1;
    nextLabel.textContent = last ? 'Review & submit' : 'Next';
    nextIcon.replaceChildren(icon(last ? 'check' : 'right'));
    nextBtn.classList.toggle('btn--success', last);
    nextBtn.classList.toggle('btn--primary', !last);
  }

  function refreshQuestion(qid, debounce = false) {
    cardById.get(qid)?.refresh();
    updateChrome();
    persist(debounce);
  }

  function setAnswer(qid, val, { debounce = false } = {}) {
    const q = byId.get(qid);
    if (!q || state.done || state.submitting) return;
    attempt.set(qid, val, { debounce });
    cardById.get(qid)?.refresh();
    updateChrome();
  }

  // The note box gets focus only when the flag is clicked; the G shortcut leaves focus alone so G toggles again.
  function toggleFlag(qid, { focusNote = false } = {}) {
    if (state.flagged.has(qid)) { state.flagged.delete(qid); delete state.flagNotes[qid]; } else state.flagged.add(qid);
    refreshQuestion(qid);
    if (toolsOn && focusNote && state.flagged.has(qid)) cardById.get(qid)?.el.querySelector('[data-testid="flag-note"]')?.focus({ preventScroll: true });
  }

  /* ---- navigation / modes */
  let currentEl = null;
  let io = null;
  let ioMuteUntil = 0;

  function resetCardClasses(el) {
    clearTimeout(el._leaveT);
    el.classList.remove('is-leaving', 'is-leaving-next', 'is-leaving-prev', 'is-entering-next', 'is-entering-prev');
    el.inert = false;
  }

  function mountFocus(i, dir) {
    const el = cards[i].el;
    const old = currentEl && currentEl !== el && currentEl.parentNode === stage ? currentEl : null;
    [...stage.children].forEach((c) => { if (c !== el && c !== old) { clearTimeout(c._leaveT); c.remove(); } });
    resetCardClasses(el);
    const animate = !!(dir && old && !prefersReducedMotion());
    if (animate) el.classList.add(`is-entering-${dir}`);
    el.classList.add('is-active');
    if (el.parentNode !== stage) stage.appendChild(el);
    if (old) {
      old.classList.remove('is-active');
      if (animate) {
        old.inert = true;
        old.classList.add('is-leaving', `is-leaving-${dir}`);
        old._leaveT = setTimeout(() => old.remove(), 320);
      } else old.remove();
    }
    if (animate) {
      void el.offsetWidth; // commit the start position before releasing it
      requestAnimationFrame(() => el.classList.remove(`is-entering-${dir}`));
    }
    currentEl = el;
    renderMath(el);
  }

  function goTo(target, opts = {}) {
    const i = Math.min(Math.max(target, 0), total - 1);
    const changed = i !== state.index;
    const dir = i >= state.index ? 'next' : 'prev';
    state.index = i;
    cards.forEach((c, k) => c.el.classList.toggle('is-active', k === i));
    if (state.mode === 'focus') mountFocus(i, changed ? dir : null);
    else if (!opts.fromScroll) {
      ioMuteUntil = Date.now() + 700;
      cards[i].el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
    updateChrome();
    if (changed) {
      persist();
      announcer.textContent = `Question ${i + 1} of ${total}`;
    }
    if (opts.focus) {
      const c = cards[i];
      if (opts.focusInput && c.widget.focus) c.widget.focus(); else c.el.focus({ preventScroll: true });
    }
  }

  function observeScroll() {
    if (typeof IntersectionObserver === 'undefined') return;
    io = new IntersectionObserver((entries) => {
      if (Date.now() < ioMuteUntil) return;
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!hit) return;
      const i = cards.findIndex((c) => c.el === hit.target);
      if (i >= 0 && i !== state.index) goTo(i, { fromScroll: true });
    }, { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.01] });
    cards.forEach((c) => io.observe(c.el));
  }

  function applyMode() {
    runnerEl.classList.toggle('runner--focus', state.mode === 'focus');
    runnerEl.classList.toggle('runner--scroll', state.mode === 'scroll');
    io?.disconnect();
    io = null;
    stage.replaceChildren();
    currentEl = null;
    actions.hidden = state.mode !== 'focus';
    cards.forEach((c) => { resetCardClasses(c.el); c.el.classList.remove('is-active'); });
    if (state.mode === 'focus') {
      mountFocus(state.index, null);
    } else {
      cards.forEach((c) => stage.appendChild(c.el));
      cards[state.index].el.classList.add('is-active');
      renderMath(stage);
      requestAnimationFrame(() => {
        if (state.index > 0) cards[state.index].el.scrollIntoView({ block: 'start' });
        ioMuteUntil = Date.now() + 300;
        observeScroll();
      });
    }
    modeIcon.replaceChildren(icon(state.mode === 'focus' ? 'list' : 'grid', { size: 16 }));
    modeLabel.textContent = state.mode === 'focus' ? 'Scroll view' : 'Focus view';
    modeBtn?.setAttribute('aria-label', state.mode === 'focus' ? 'Switch to scroll view' : 'Switch to focus view');
    updateChrome();
  }

  function setMode(m) {
    if (m === state.mode) return;
    state.mode = m;
    applyMode();
    persist();
  }

  /* ---- timer */
  let timerId = null;
  let warned5 = false;
  let warned1 = false;
  let lastAnnouncedMin = null;
  function tick(initial = false) {
    const elapsed = (Date.now() - state.startedAt) / 1000;
    if (!limitSec) { timerText.textContent = formatDuration(elapsed); return; }
    const rem = Math.ceil(limitSec - elapsed);
    timerText.textContent = formatDuration(Math.max(0, rem));
    const remMin = Math.ceil(Math.max(0, rem) / 60);
    if (remMin !== lastAnnouncedMin) {
      lastAnnouncedMin = remMin;
      if (!initial && rem > 0) timerAnnouncer.textContent = `${remMin} ${remMin === 1 ? 'minute' : 'minutes'} remaining`;
    }
    timerEl.classList.toggle('is-warning', rem <= 300 && rem > 60);
    timerEl.classList.toggle('is-danger', rem <= 60);
    if (rem <= 300 && !warned5) { warned5 = true; if (rem > 60) toast('5 minutes left', { type: 'warning' }); }
    if (rem <= 60 && !warned1) { warned1 = true; if (rem > 0) toast('1 minute left', { type: 'warning' }); }
    if (rem <= 0 && !initial && !state.submitting && !state.done) finish({ auto: true });
  }
  function startTimer() {
    clearInterval(timerId);
    timerId = setInterval(tick, 1000);
  }
  function stopTimer() { clearInterval(timerId); timerId = null; }
  if (limitSec) {
    const rem0 = Math.ceil(limitSec - (Date.now() - state.startedAt) / 1000);
    warned5 = rem0 <= 300; // do not announce thresholds that were already passed before this render
    warned1 = rem0 <= 60;
  }

  /* ---- submit flow */
  let submitModal = null;
  let shortcutsModal = null;

  function openSubmit() {
    if (state.submitting || state.done || submitModal) return;
    closeDrawer();
    const unanswered = ordered.map((q, i) => ({ q, i })).filter(({ q }) => !isAnswered(q, state.answers[q.id]));
    const done = total - unanswered.length;
    // Required questions (per question, or all via test.requireAllQuestions) block a manual submit. A timed-out test
    // still auto-submits (finish({ auto: true }) skips this modal).
    const missingRequired = unanswered.filter(({ q }) => isRequired(test, q));
    const stat = (value, label) => h('div', { class: 'runner-stat' }, h('span', { class: 'runner-stat__v' }, value), h('span', { class: 'runner-stat__l' }, label));
    const body = h('div', { class: 'stack runner-submit' },
      h('div', { class: 'runner-stats' },
        stat(`${done} of ${total}`, 'answered'),
        stat(String(state.flagged.size), 'flagged'),
        stat(formatDurationLong((Date.now() - state.startedAt) / 1000), 'time used')),
      unanswered.length
        ? h('div', { class: 'notice notice--warning runner-unanswered', role: 'alert', dataset: { testid: 'unanswered-warning' } },
          icon('alert'),
          h('div', { class: 'stack' },
            h('span', {}, `You have ${unanswered.length} unanswered ${unanswered.length === 1 ? 'question' : 'questions'}. Jump to:`),
            h('div', { class: 'runner-jumps' }, unanswered.map(({ i }) => h('button', {
              type: 'button', class: 'runner-jump', 'aria-label': `Go to question ${i + 1}`,
              on: { click: () => { submitModal?.close(); goTo(i, { focus: true }); } },
            }, String(i + 1))))))
        : null,
      missingRequired.length
        ? h('div', { class: 'notice notice--error runner-required', role: 'alert', dataset: { testid: 'required-warning' } },
          icon('alert'),
          h('div', { class: 'stack' },
            h('span', {}, `Answer ${missingRequired.length === 1 ? 'this required question' : `these ${missingRequired.length} required questions`} before you submit:`),
            h('div', { class: 'runner-jumps' }, missingRequired.map(({ i }) => h('button', {
              type: 'button', class: 'runner-jump', 'aria-label': `Go to required question ${i + 1}`,
              on: { click: () => { submitModal?.close(); goTo(i, { focus: true }); } },
            }, String(i + 1))))))
        : h('p', { class: 'muted' }, 'Once you submit, you cannot change your answers.'),
    );
    submitModal = openModal({
      title: 'Submit your test?',
      testid: 'submit-modal',
      body,
      onClose: () => { submitModal = null; },
      actions: [
        { label: 'Keep working', variant: 'ghost', testid: 'cancel-submit', autofocus: true, onClick: (close) => close() },
        missingRequired.length ? null : { label: 'Submit test', variant: 'primary', testid: 'confirm-submit', onClick: () => finish({ auto: false }) },
      ].filter(Boolean),
    });
  }

  async function finish({ auto = false } = {}) {
    if (state.submitting || state.done) return; // timer + click race guard
    state.submitting = true;
    stopTimer();
    if (auto) { submitModal?.close(); shortcutsModal?.close(); closeDrawer(); }
    const confirmBtn = submitModal?.el.querySelector('[data-testid="confirm-submit"]');
    const cancelBtn = submitModal?.el.querySelector('[data-testid="cancel-submit"]');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.classList.add('is-loading'); }
    if (cancelBtn) cancelBtn.disabled = true;
    submitBtn.disabled = true;
    runnerEl.classList.add('is-submitting');
    try {
      const { grade, payload } = attempt.toSubmission({ auto, layout: state.mode });
      if (preview) {
        state.done = true;
        submitModal?.close();
        ctx.navigate('results', { test, grade, payload: null, submission: null, preview: true });
      } else {
        // V3-02: re-check just before sending (second tab / device). Network errors send anyway (server backstop).
        if (test.singleSubmission && await preSubmitBlocked(ctx, test)) {
          attempt.finish();
          submitModal?.close();
          openModal({
            title: 'Already submitted',
            testid: 'already-submitted-modal',
            body: 'You’ve already submitted this test, so this attempt was not sent. Ask your teacher if you need a retake.',
            actions: [{ label: 'OK', variant: 'primary', onClick: (close) => { close(); ctx.openTest(test.code); } }],
          });
          return;
        }
        const submission = await submitResults(payload, { config: ctx.config });
        attempt.finish();
        submitModal?.close();
        ctx.navigate('results', { test, grade, payload, submission, preview: false });
      }
      if (auto) {
        openModal({
          title: "Time's up — your test was submitted",
          testid: 'timeup-modal',
          body: 'Your time limit ended, so your answers were submitted automatically.',
          actions: [{ label: 'See my results', variant: 'primary', onClick: (close) => close() }],
        });
      }
    } catch (err) {
      console.error('[ChemistryWorks] submit failed', err);
      state.submitting = false;
      state.done = false;
      submitBtn.disabled = false;
      runnerEl.classList.remove('is-submitting');
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.classList.remove('is-loading'); }
      if (cancelBtn) cancelBtn.disabled = false;
      toast('Something went wrong while submitting. Your answers are saved — please try again.', { type: 'error' });
      startTimer();
    }
  }

  function openShortcuts() {
    if (shortcutsModal) return;
    const row = (keys, desc) => h('div', { class: 'runner-kbd-row' },
      h('span', { class: 'runner-kbd-keys' }, keys.map((k) => h('kbd', {}, k))), h('span', {}, desc));
    shortcutsModal = openModal({
      title: 'Keyboard shortcuts',
      testid: 'shortcuts-modal',
      onClose: () => { shortcutsModal = null; },
      body: h('div', { class: 'runner-kbd' },
        row(['←', '→'], 'Previous / next question (focus view)'),
        row(['1', '–', '9'], 'Select option by number (multiple choice / select)'),
        row(['A', '–', 'Z'], 'Select option by letter'),
        row(['T', 'F'], 'True / False'),
        row(['G'], 'Flag or unflag the current question'),
        row(['N'], 'Open the question navigator'),
        refPane ? row(['R'], 'Show or hide the reference pane') : null,
        row(['Enter'], 'In an answer box: go to the next question'),
        row(['?'], 'Show this help')),
      actions: [{ label: 'Got it', variant: 'primary', onClick: (close) => close() }],
    });
  }

  /* ---- global listeners */
  function onKeyDown(e) {
    if (e.defaultPrevented || state.submitting || state.done) return;
    if (e.key === 'Escape' && drawerOpen) { closeDrawer({ remember: true }); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('#modal-root .modal-overlay.is-open')) return;
    const t = e.target;
    const tag = t?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) {
      if (e.key === 'Enter' && tag === 'INPUT' && t.type === 'text' && state.mode === 'focus' && state.index < total - 1) {
        e.preventDefault();
        goTo(state.index + 1, { focus: true, focusInput: true });
      }
      return;
    }
    const key = e.key;
    if (key === 'ArrowRight' && state.mode === 'focus') { e.preventDefault(); goTo(state.index + 1); return; }
    if (key === 'ArrowLeft' && state.mode === 'focus') { e.preventDefault(); goTo(state.index - 1); return; }
    if (key === '?') { e.preventDefault(); openShortcuts(); return; }
    const lower = key.length === 1 ? key.toLowerCase() : '';
    if (lower === 'g') { e.preventDefault(); toggleFlag(ordered[state.index].id); return; }
    if (lower === 'n') { e.preventDefault(); drawerOpen ? closeDrawer({ remember: true }) : openDrawer({ remember: true }); return; }
    if (lower === 'r' && refPane) { e.preventDefault(); refPane.toggle(); return; }
    if (lower && cards[state.index].widget.shortcut?.(lower)) e.preventDefault();
  }
  // A reload/navigation also fires visibilitychange; beforeunload runs first, so skip those.
  let unloading = false;
  const onBeforeUnload = () => { unloading = true; };
  function onVisibility() {
    if (document.visibilityState !== 'hidden' || unloading || preview || state.done || state.submitting) return;
    state.tabSwitches += 1;
    persist();
  }
  const onPageHide = () => { if (attempt.pending()) saveNow(); };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);

  /* ---- mount */
  // Built once: the pane is a sibling of the questions, so stage rerenders never rebuild or reset it.
  const extraTabs = [];
  if (tools.calculator) extraTabs.push({ id: 'tool-calc', title: 'Calculator', build: calculatorPanel });
  if (tools.constants) extraTabs.push({ id: 'tool-constants', title: 'Units & constants', build: constantsPanel });
  const refPane = referencePane(test, { storageKey: `refpane:${test.code}`, extraTabs });
  // V4-02: teacher announcement shown above the questions (dismissible); late-work notice when in the late window.
  const announceEl = test.announcement && String(test.announcement).trim()
    ? h('div', { class: 'notice notice--info runner-announcement', role: 'note', dataset: { testid: 'test-announcement' } }, icon('info'),
      h('span', { class: 'runner-announcement__text' }, String(test.announcement)),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Dismiss announcement', on: { click: (e) => e.currentTarget.parentElement.remove() } }, icon('x', { size: 16 })))
    : null;
  const lateEl = test.instance?.late ? h('div', { class: 'notice notice--warning', role: 'note', dataset: { testid: 'late-notice' } }, icon('clock'),
    h('span', {}, 'This test is past its due date. Your teacher accepts late work, but a late penalty may apply.')) : null;
  const mainEl = h('main', { class: 'runner-main' }, announceEl, lateEl, stage, actions, announcer);
  const runnerEl = h('div', { class: ['runner', preview && 'runner--preview'], dataset: { testid: 'runner' } },
    h('div', { class: 'runner-top' }, header, runnerBar, progressBar, previewBanner, netBanner?.el),
    refPane ? h('div', { class: 'runner-split', dataset: { testid: 'runner-split' } }, mainEl, refPane.el) : mainEl,
    footer,
    h('div', { class: 'nav-host' }, overlay, drawer),
  );
  mount(root, runnerEl);
  if (isRail() && load('navRail', null)?.open === true) openDrawer({ restore: true });
  applyMode();
  tick(true);
  startTimer();
  if (!preview) saveNow();
  if (saved && attempt.answeredCount) toast('Your answers were restored', { type: 'success' });
  cards.forEach((c) => c.refresh());
  updateChrome();
  if (params.review && !preview) openSubmit(); // V5-01: "Review & submit" from a game mode

  // V4-02 S13 live monitor: tell the backend how far along this student is, every 60 s (silently stops on older backends).
  let pingTimer = null;
  const ping = async (submitted = false) => {
    if (preview || !ctx.config?.GAS_WEB_APP_URL || !user) return;
    const idToken = user.provider === 'google' ? getIdToken() : null;
    const res = await publicCall('progressPing', {
      testCode: test.code, name: user.name || '', answered: answeredCount(), total, submitted,
      timeLeft: limitSec ? Math.max(0, Math.round(limitSec - (Date.now() - state.startedAt) / 1000)) : null,
      ...(idToken ? { idToken } : { studentEmail: user.email }),
    }, { gasUrl: ctx.config.GAS_WEB_APP_URL });
    if (!res.ok && (res.unavailable || /identity|unauthorized/.test(res.error || ''))) { clearInterval(pingTimer); pingTimer = null; }
  };
  const live = !preview && test.instance?.live === true;
  if (live) { ping(); pingTimer = setInterval(() => ping(), 60000); }

  return function cleanup() {
    if (pingTimer) clearInterval(pingTimer);
    if (live && state.done) ping(true);
    stopTimer();
    clearTimeout(savedT);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onBeforeUnload);
    io?.disconnect();
    io = null;
    offAttempt();
    attempt.destroy();
    cards.forEach((c) => clearTimeout(c.el._leaveT));
    closeDrawer();
    submitModal?.close();
    shortcutsModal?.close();
    refPane?.destroy();
    netBanner?.destroy();
    stopSpeaking();
  };
}
