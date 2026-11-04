// Student test runner: focus/scroll modes, question widgets, navigator drawer, keyboard shortcuts,
// autosave/resume, timer, integrity counters and the submit flow.
//
// render(root, ctx, { test, source, preview }) -> cleanup()

import { withQuestionImage } from './question-image.js';
import {
  h, mount, icon, richText, renderMath, toast, openModal,
  formatDuration, formatDurationLong, appHeader, userBadge, seededShuffle, prefersReducedMotion,
} from '../ui.js';
import { gradeTest, isAnswered } from '../lib/grading.js';
import { TYPE_LABELS, isRequired } from '../lib/schema.js';
import { groupQuestions } from '../lib/sections.js';
import { buildPayload, submitResults } from '../lib/submit.js';
import { preSubmitBlocked } from '../lib/student-status.js';
import { load, save, remove } from '../lib/storage.js';
import { referencePane } from './reference-pane.js';
import { buildWidget, pointsLabel } from './runner/widgets.js';

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

  const progressKey = `progress:${user.email}:${test.code}`;
  const seed = `${user.email}${test.code}`;

  // Stable per-student order (seeded); the original `test` is what gets graded.
  // Canonical order = unsectioned questions, then each section in order. Shuffling happens inside a group only.
  const groups = groupQuestions(test);
  let ordered = groups.flatMap((g) => (test.shuffleQuestions ? seededShuffle(g.questions, seed + (g.section ? g.section.id : '')) : g.questions.slice()));
  ordered = ordered.map((q) => {
    if (!test.shuffleOptions) return q;
    if (q.type === 'mcq' || q.type === 'multi') return { ...q, options: seededShuffle(q.options, seed + q.id) };
    // Matching: shuffle both the rows (left) and the columns (right). Grading is by id, so order is display-only.
    if (q.type === 'matching') {
      return { ...q, left: seededShuffle(q.left, `${seed}${q.id}left`), right: seededShuffle(q.right, `${seed}${q.id}right`) };
    }
    if (q.type === 'categorize') return { ...q, items: seededShuffle(q.items, `${seed}${q.id}items`) };
    return q;
  });
  // Ordering items always start scrambled (never already in the correct order).
  ordered = ordered.map((q) => {
    if (q.type !== 'ordering') return q;
    let items = seededShuffle(q.items, `${seed}${q.id}order`);
    const key = Array.isArray(q.correctAnswer) ? q.correctAnswer.join('|') : '';
    if (items.length > 1 && items.map((it) => it.id).join('|') === key) items = [...items.slice(1), items[0]];
    return { ...q, items };
  });
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

  const state = {
    answers: {}, flagged: new Set(), index: 0, mode: defaultMode, startedAt: Date.now(),
    tabSwitches: 0, submitting: false, done: false,
  };

  // ---- restore
  const saved = preview ? null : load(progressKey, null);
  if (saved && typeof saved === 'object') {
    for (const [k, v] of Object.entries(saved.answers || {})) if (byId.has(k) && isAnswered(byId.get(k), v)) state.answers[k] = v;
    for (const k of saved.flagged || []) if (byId.has(k)) state.flagged.add(k);
    state.index = Math.min(Math.max(Number(saved.index) || 0, 0), total - 1);
    if (test.allowModeToggle !== false && modeOk(saved.mode)) state.mode = saved.mode;
    if (Number(saved.startedAt) > 0) state.startedAt = Number(saved.startedAt);
    state.tabSwitches = Number(saved.tabSwitches) || 0;
  }

  const answeredCount = () => ordered.reduce((n, q) => n + (isAnswered(q, state.answers[q.id]) ? 1 : 0), 0);

  /* ---- persistence */
  let saveTimer = null;
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (preview || state.done) return;
    save(progressKey, {
      answers: state.answers, flagged: [...state.flagged], index: state.index, startedAt: state.startedAt,
      tabSwitches: state.tabSwitches, mode: state.mode, updatedAt: Date.now(), title: test.title,
    });
    flashSaved();
  }
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
    if (debounce) { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); } else saveNow();
  }

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
    dataset: { testid: 'navigator-toggle' }, on: { click: () => (drawerOpen ? closeDrawer() : openDrawer()) },
  }, icon('grid', { size: 16 }), h('span', { class: 'runner-hbtn__label' }, 'Questions'));

  const header = appHeader({
    subtitle: test.title,
    onHome: () => ctx.navigate(preview ? 'admin' : 'landing'),
    right: [timerEl, timerAnnouncer, modeBtn, navToggle, userBadge(user)],
  });

  const progressFill = h('div', { class: 'runner-progress__fill' });
  const progressBar = h('div', {
    class: 'runner-progress', role: 'progressbar', 'aria-label': 'Questions answered',
    'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': '0', dataset: { testid: 'progress-bar' },
  }, progressFill);

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

  function buildCard(q, i) {
    const widget = buildWidget(q, api);
    const flagBtn = h('button', {
      type: 'button', class: 'q-flag', 'aria-pressed': 'false', title: 'Flag for review (G)',
      dataset: { testid: 'flag-btn' }, on: { click: () => toggleFlag(q.id) },
    }, icon('flag', { size: 16 }), h('span', { class: 'q-flag__label' }, 'Flag'));
    const clearBtn = h('button', {
      type: 'button', class: 'q-clear', dataset: { testid: 'clear-answer' },
      on: { click: () => { delete state.answers[q.id]; refreshQuestion(q.id); card.el.focus({ preventScroll: true }); } },
    }, 'Clear answer');
    const clearSlot = h('div', { class: 'q-clear-slot' });
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
        flagBtn),
      // a hotspot's image is the diagram inside the widget, so it is not repeated beside the question text
      withQuestionImage(q.type === 'hotspot' ? { ...q, image: undefined } : q, widget.textEl || richText(q.text, 'div', 'q-text')),
      widget.el,
      clearSlot,
    );
    el.querySelector('.q-text').id = `qt-${q.id}`;
    const card = {
      q, i, el, widget,
      refresh() {
        const ans = state.answers[q.id];
        widget.refresh(ans);
        const answered = isAnswered(q, ans);
        if (answered && !clearBtn.isConnected) clearSlot.appendChild(clearBtn);
        else if (!answered) clearBtn.remove();
        const flagged = state.flagged.has(q.id);
        flagBtn.setAttribute('aria-pressed', String(flagged));
        flagBtn.classList.toggle('is-flagged', flagged);
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
  let drawerOpen = false;
  const tiles = new Map();
  const cntAnswered = h('b', {}), cntFlagged = h('b', {}), cntUnanswered = h('b', {});
  const makeTile = (q, i) => {
    const t = h('button', {
      type: 'button', class: 'nav-tile', dataset: { testid: `nav-item-${q.id}` },
      on: { click: () => {
        goTo(i, { focus: true });
        if (matchMedia('(max-width: 720px)').matches) closeDrawer();
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
  const drawerClose = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close navigator', on: { click: () => closeDrawer() } }, icon('x'));
  const drawer = h('aside', { class: 'nav-drawer', id: 'runner-navigator', 'aria-label': 'Question navigator', dataset: { testid: 'navigator' } },
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
  const overlay = h('div', { class: 'nav-overlay', on: { click: () => closeDrawer() } });

  function openDrawer() {
    if (drawerOpen) return;
    drawerOpen = true;
    drawer.inert = false;
    drawer.classList.add('is-open');
    runnerEl.classList.add('is-drawer-open');
    overlay.classList.add('is-open');
    navToggle.setAttribute('aria-expanded', 'true');
    setTimeout(() => tiles.get(ordered[state.index].id)?.focus({ preventScroll: true }), 60);
  }
  function closeDrawer() {
    if (!drawerOpen) return;
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
    progressFill.style.width = `${total ? (done / total) * 100 : 0}%`;
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
    if (isAnswered(q, val)) state.answers[qid] = val; else delete state.answers[qid];
    refreshQuestion(qid, debounce);
  }

  function toggleFlag(qid) {
    if (state.flagged.has(qid)) state.flagged.delete(qid); else state.flagged.add(qid);
    refreshQuestion(qid);
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
    clearTimeout(saveTimer);
    if (auto) { submitModal?.close(); shortcutsModal?.close(); closeDrawer(); }
    const confirmBtn = submitModal?.el.querySelector('[data-testid="confirm-submit"]');
    const cancelBtn = submitModal?.el.querySelector('[data-testid="cancel-submit"]');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.classList.add('is-loading'); }
    if (cancelBtn) cancelBtn.disabled = true;
    submitBtn.disabled = true;
    runnerEl.classList.add('is-submitting');
    try {
      const grade = gradeTest(test, state.answers);
      if (preview) {
        state.done = true;
        submitModal?.close();
        ctx.navigate('results', { test, grade, payload: null, submission: null, preview: true });
      } else {
        // V3-02: re-check just before sending (second tab / device). Network errors send anyway (server backstop).
        if (test.singleSubmission && await preSubmitBlocked(ctx, test)) {
          state.done = true;
          remove(progressKey);
          submitModal?.close();
          openModal({
            title: 'Already submitted',
            testid: 'already-submitted-modal',
            body: 'You’ve already submitted this test, so this attempt was not sent. Ask your teacher if you need a retake.',
            actions: [{ label: 'OK', variant: 'primary', onClick: (close) => { close(); ctx.openTest(test.code); } }],
          });
          return;
        }
        const payload = buildPayload({
          test, grade, user, startedAt: state.startedAt, submittedAt: Date.now(),
          flags: { tabSwitches: state.tabSwitches, autoSubmitted: auto, mode: state.mode },
        });
        const submission = await submitResults(payload, { config: ctx.config });
        state.done = true;
        remove(progressKey);
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
    if (e.key === 'Escape' && drawerOpen) { closeDrawer(); return; }
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
    if (lower === 'n') { e.preventDefault(); drawerOpen ? closeDrawer() : openDrawer(); return; }
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
  const onPageHide = () => { if (saveTimer) saveNow(); };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);

  /* ---- mount */
  // Built once: the pane is a sibling of the questions, so stage rerenders never rebuild or reset it.
  const refPane = referencePane(test, { storageKey: `refpane:${test.code}` });
  const mainEl = h('main', { class: 'runner-main' }, stage, actions, announcer);
  const runnerEl = h('div', { class: ['runner', preview && 'runner--preview'], dataset: { testid: 'runner' } },
    h('div', { class: 'runner-top' }, header, progressBar, previewBanner),
    refPane ? h('div', { class: 'runner-split', dataset: { testid: 'runner-split' } }, mainEl, refPane.el) : mainEl,
    footer,
    h('div', { class: 'nav-host' }, overlay, drawer),
  );
  mount(root, runnerEl);
  applyMode();
  tick(true);
  startTimer();
  if (!preview) saveNow();
  if (saved && typeof saved === 'object') toast('Welcome back — your answers were restored', { type: 'success' });
  cards.forEach((c) => c.refresh());
  updateChrome();

  return function cleanup() {
    stopTimer();
    clearTimeout(savedT);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onBeforeUnload);
    io?.disconnect();
    io = null;
    if (saveTimer) saveNow();
    cards.forEach((c) => clearTimeout(c.el._leaveT));
    closeDrawer();
    submitModal?.close();
    shortcutsModal?.close();
    refPane?.destroy();
  };
}
