// Student test runner: focus/scroll modes, six question widgets, navigator drawer, keyboard shortcuts,
// autosave/resume, timer, integrity counters and the submit flow.
//
// render(root, ctx, { test, source, preview }) -> cleanup()

import {
  h, mount, icon, richText, renderMath, toast, openModal,
  formatDuration, formatDurationLong, appHeader, userBadge, seededShuffle, prefersReducedMotion,
} from '../ui.js';
import { gradeTest, isAnswered, parseNumber } from '../lib/grading.js';
import { formulaToHTML } from '../lib/formula.js';
import { TYPE_LABELS } from '../lib/schema.js';
import { buildPayload, submitResults } from '../lib/submit.js';
import { load, save, remove } from '../lib/storage.js';

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '+': '⁺' };

/** 1.204e24 -> "1.204 × 10²⁴"; plain numbers are shown without float noise. */
export function formatInterpreted(x) {
  if (!Number.isFinite(x)) return String(x);
  const abs = Math.abs(x);
  if (abs !== 0 && (abs >= 1e5 || abs < 1e-3)) {
    const [mant, exp] = x.toExponential().split('e');
    const e = String(parseInt(exp, 10));
    return `${mant} × 10${[...e].map((c) => SUP[c] ?? c).join('')}`;
  }
  return String(Number(x.toPrecision(12)));
}

const letter = (i) => String.fromCharCode(65 + i);
const pointsLabel = (p) => `${p} ${Number(p) === 1 ? 'pt' : 'pts'}`;

/* ------------------------------------------------------------------ widgets */
// Every widget returns { el, refresh(answer), focus?(), shortcut?(key) }. Widgets never own state: they call
// api.set(questionId, value, { debounce }) and the runner calls refresh() with the stored answer.

function choiceWidget(q, api, multi) {
  const n = q.options.length;
  const btns = q.options.map((o, idx) => {
    const b = h('button', {
      type: 'button',
      class: 'opt',
      role: multi ? 'checkbox' : 'radio',
      'aria-checked': 'false',
      tabindex: multi || idx === 0 ? '0' : '-1',
      dataset: { testid: `option-${o.id}`, optionId: o.id },
      on: {
        click: () => choose(o.id),
        keydown: (e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          const j = (idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
          btns[j].focus();
          if (!multi) api.set(q.id, q.options[j].id);
        },
      },
    },
      h('span', { class: 'opt__badge', 'aria-hidden': 'true' }, letter(idx)),
      richText(o.text, 'span', 'opt__text'),
      h('span', { class: 'opt__check' }, icon('check', { size: 15 })),
    );
    return b;
  });

  function choose(id) {
    if (!multi) return api.set(q.id, id);
    const cur = new Set(Array.isArray(api.get(q.id)) ? api.get(q.id) : []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    api.set(q.id, q.options.map((o) => o.id).filter((x) => cur.has(x)));
  }

  return {
    el: h('div', { class: 'q-choices' },
      multi ? h('p', { class: 'q-hint', id: `hint-${q.id}` }, 'Select all that apply') : null,
      h('div', { class: 'q-choices__list', role: multi ? 'group' : 'radiogroup', 'aria-labelledby': `qt-${q.id}` }, btns),
    ),
    refresh(answer) {
      const sel = multi ? new Set(Array.isArray(answer) ? answer : []) : new Set(answer == null ? [] : [answer]);
      const firstSel = q.options.findIndex((o) => sel.has(o.id));
      btns.forEach((b, i) => {
        const on = sel.has(q.options[i].id);
        b.classList.toggle('is-selected', on);
        b.setAttribute('aria-checked', String(on));
        if (!multi) b.tabIndex = i === (firstSel >= 0 ? firstSel : 0) ? 0 : -1;
      });
    },
    shortcut(key) {
      let idx = -1;
      if (/^[1-9]$/.test(key)) idx = Number(key) - 1;
      else if (/^[a-z]$/.test(key) && key !== 'g' && key !== 'n') idx = key.charCodeAt(0) - 97;
      if (idx < 0 || idx >= n) return false;
      btns[idx].focus({ preventScroll: true });
      choose(q.options[idx].id);
      return true;
    },
  };
}

function numericWidget(q, api) {
  const previewId = `np-${q.id}`;
  const preview = h('p', { class: 'q-preview', id: previewId, 'aria-live': 'polite', dataset: { testid: 'numeric-preview' } });
  const updatePreview = () => {
    const v = input.value.trim();
    preview.classList.remove('is-error');
    if (!v) { preview.textContent = 'Scientific notation works: 6.02e23 or 6.02 × 10^23'; return; }
    const x = parseNumber(v, { unit: q.unit || '' });
    if (Number.isNaN(x)) { preview.textContent = 'Not a number yet'; preview.classList.add('is-error'); return; }
    preview.textContent = `Interpreted as ${formatInterpreted(x)}`;
  };
  const input = h('input', {
    class: 'input q-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false',
    autocapitalize: 'off', placeholder: 'Enter a number', 'aria-label': 'Your answer', 'aria-describedby': previewId,
    dataset: { testid: 'numeric-input' },
    on: { input: () => { api.set(q.id, input.value, { debounce: true }); updatePreview(); } },
  });
  updatePreview();
  return {
    el: h('div', { class: 'q-numeric' },
      h('div', { class: 'q-field' }, input, q.unit ? h('span', { class: 'q-unit' }, q.unit) : null),
      preview),
    refresh(answer) {
      if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : answer == null ? '' : String(answer);
      updatePreview();
    },
    focus: () => input.focus(),
  };
}

function formulaWidget(q, api) {
  const preview = h('div', { class: 'q-formula-preview', 'aria-live': 'polite', dataset: { testid: 'formula-preview' } });
  const updatePreview = () => {
    const v = input.value.trim();
    if (!v) {
      preview.classList.add('is-empty');
      preview.textContent = 'Formatted preview appears here';
    } else {
      preview.classList.remove('is-empty');
      // formulaToHTML escapes its input; this is the only HTML string rendered from student input.
      preview.innerHTML = `<span class="formula">${formulaToHTML(input.value)}</span>`;
    }
  };
  const input = h('input', {
    class: 'input q-input q-input--formula', type: 'text', autocomplete: 'off', spellcheck: 'false',
    autocapitalize: 'off', autocorrect: 'off', placeholder: 'e.g. H2SO4', 'aria-label': 'Your answer (chemical formula)',
    dataset: { testid: 'formula-input' },
    on: { input: () => { api.set(q.id, input.value, { debounce: true }); updatePreview(); } },
  });
  updatePreview();
  return {
    el: h('div', { class: 'q-formula' },
      input,
      h('p', { class: 'q-hint' }, 'Type H2O, CuSO4.5H2O, SO4^2-'),
      preview),
    refresh(answer) {
      if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : '';
      updatePreview();
    },
    focus: () => input.focus(),
  };
}

function trueFalseWidget(q, api) {
  const mk = (val, label, ic) => h('button', {
    type: 'button', class: 'q-tf__btn', role: 'radio', 'aria-checked': 'false', tabindex: '0',
    dataset: { testid: val ? 'tf-true' : 'tf-false' },
    on: { click: () => api.set(q.id, val) },
  }, h('span', { class: 'q-tf__icon' }, icon(ic, { size: 22 })), h('span', {}, label));
  const t = mk(true, 'True', 'check');
  const f = mk(false, 'False', 'x');
  return {
    el: h('div', { class: 'q-tf', role: 'radiogroup', 'aria-labelledby': `qt-${q.id}` }, t, f),
    refresh(answer) {
      t.classList.toggle('is-selected', answer === true);
      f.classList.toggle('is-selected', answer === false);
      t.setAttribute('aria-checked', String(answer === true));
      f.setAttribute('aria-checked', String(answer === false));
    },
    shortcut(key) {
      if (key === 't') { api.set(q.id, true); return true; }
      if (key === 'f') { api.set(q.id, false); return true; }
      return false;
    },
  };
}

function matchingWidget(q, api) {
  const inputs = {}; // `${l}|${r}` -> input
  const head = h('tr', {}, h('td', { class: 'q-match__corner' }),
    q.right.map((r) => h('th', { scope: 'col', class: 'q-match__col' }, richText(r.text))));
  const rows = q.left.map((l) => h('tr', {},
    h('th', { scope: 'row', class: 'q-match__row' }, richText(l.text)),
    q.right.map((r) => {
      const input = h('input', {
        type: 'radio', class: 'q-dot__input', name: `m-${q.id}-${l.id}`, value: r.id,
        'aria-label': `${l.text} matches ${r.text}`,
        dataset: { testid: `match-${l.id}-${r.id}` },
        on: { change: () => api.set(q.id, { ...(api.get(q.id) || {}), [l.id]: r.id }) },
      });
      inputs[`${l.id}|${r.id}`] = input;
      return h('td', { class: 'q-match__cell' }, h('label', { class: 'q-dot' }, input, h('span', { class: 'q-dot__mark', 'aria-hidden': 'true' })));
    }),
  ));
  return {
    el: h('div', { class: 'q-matching' },
      h('p', { class: 'q-hint' }, 'Match each item on the left with one option. Options can be used more than once.'),
      h('div', { class: 'q-match', role: 'group', 'aria-labelledby': `qt-${q.id}` },
        h('table', {}, h('thead', {}, head), h('tbody', {}, rows)))),
    refresh(answer) {
      const a = answer && typeof answer === 'object' ? answer : {};
      for (const l of q.left) for (const r of q.right) inputs[`${l.id}|${r.id}`].checked = a[l.id] === r.id;
    },
  };
}

function shortWidget(q, api) {
  const countId = `sc-${q.id}`;
  const count = h('p', { class: 'q-hint q-short__count', id: countId, 'aria-live': 'polite' });
  const updateCount = () => {
    const n = input.value.trim() ? input.value.trim().split(/\s+/).length : 0;
    count.textContent = `${n} ${n === 1 ? 'word' : 'words'} · Your teacher will grade this answer`;
  };
  const input = h('textarea', {
    class: 'textarea q-short', rows: 6, maxlength: '5000', spellcheck: 'true', placeholder: 'Type your answer',
    'aria-label': 'Your answer', 'aria-describedby': countId, dataset: { testid: 'short-input' },
    on: { input: () => { api.set(q.id, input.value, { debounce: true }); updateCount(); } },
  });
  updateCount();
  return {
    el: h('div', { class: 'q-short-wrap' }, input, count),
    refresh(answer) {
      if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : '';
      updateCount();
    },
    focus: () => input.focus(),
  };
}

function buildWidget(q, api) {
  switch (q.type) {
    case 'mcq': return choiceWidget(q, api, false);
    case 'multi': return choiceWidget(q, api, true);
    case 'numeric': return numericWidget(q, api);
    case 'formula': return formulaWidget(q, api);
    case 'truefalse': return trueFalseWidget(q, api);
    case 'matching': return matchingWidget(q, api);
    case 'short': return shortWidget(q, api);
    default: return { el: h('p', { class: 'muted' }, `Unsupported question type: ${q.type}`), refresh() {} };
  }
}

/* ------------------------------------------------------------------ view */

export function render(root, ctx, params = {}) {
  const { test, preview = false } = params;
  const user = ctx.user || (preview ? { name: 'Preview', email: 'preview@local', picture: null, provider: 'demo' } : null);
  if (!user) { ctx.navigate('landing', { code: test?.code }); return undefined; }

  const progressKey = `progress:${user.email}:${test.code}`;
  const seed = `${user.email}${test.code}`;

  // Stable per-student order (seeded); the original `test` is what gets graded.
  let ordered = test.shuffleQuestions ? seededShuffle(test.questions, seed) : test.questions.slice();
  ordered = ordered.map((q) => (test.shuffleOptions && (q.type === 'mcq' || q.type === 'multi')
    ? { ...q, options: seededShuffle(q.options, seed + q.id) } : q));
  const total = ordered.length;
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
  }
  function persist(debounce = false) {
    if (preview || state.done) return;
    if (debounce) { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); } else saveNow();
  }

  /* ---- header chrome */
  const timerText = h('span', { class: 'runner-timer__text' }, '0:00');
  const timerEl = h('div', { class: 'runner-timer', role: 'timer', dataset: { testid: 'timer' } }, icon('clock', { size: 16 }), timerText);

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
    right: [timerEl, modeBtn, navToggle, userBadge(user)],
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
      h('div', { class: 'q-card__head' },
        h('h2', { class: 'q-card__num' }, `Question ${i + 1} of ${total}`),
        h('span', { class: 'pill pill--primary' }, TYPE_LABELS[q.type] || q.type),
        h('span', { class: 'pill' }, pointsLabel(q.points ?? 1)),
        h('span', { class: 'spacer' }),
        flagBtn),
      richText(q.text, 'div', 'q-text'),
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
  const submitBtn = h('button', { type: 'button', class: 'btn btn--primary', dataset: { testid: 'submit-btn' }, on: { click: () => openSubmit() } }, icon('check', { size: 16 }), 'Submit test');
  const footer = h('footer', { class: 'runner-footer' },
    h('div', { class: 'runner-footer__inner' },
      progressText,
      h('button', { type: 'button', class: 'btn btn--subtle btn--sm runner-footer__hint', dataset: { testid: 'shortcuts-btn' }, on: { click: () => openShortcuts() } },
        icon('keyboard', { size: 16 }), h('span', {}, 'Keyboard shortcuts (?)')),
      h('span', { class: 'spacer' }),
      submitBtn));

  /* ---- navigator drawer */
  let drawerOpen = false;
  const tiles = new Map();
  const cntAnswered = h('b', {}), cntFlagged = h('b', {}), cntUnanswered = h('b', {});
  const tileGrid = h('div', { class: 'nav-grid' }, ordered.map((q, i) => {
    const t = h('button', {
      type: 'button', class: 'nav-tile', dataset: { testid: `nav-item-${q.id}` },
      on: { click: () => {
        goTo(i, { focus: true });
        if (matchMedia('(max-width: 720px)').matches) closeDrawer();
      } },
    }, String(i + 1));
    tiles.set(q.id, t);
    return t;
  }));
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
  function tick(initial = false) {
    const elapsed = (Date.now() - state.startedAt) / 1000;
    if (!limitSec) { timerText.textContent = formatDuration(elapsed); return; }
    const rem = Math.ceil(limitSec - elapsed);
    timerText.textContent = formatDuration(Math.max(0, rem));
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
      h('p', { class: 'muted' }, 'Once you submit, you cannot change your answers.'),
    );
    submitModal = openModal({
      title: 'Submit your test?',
      testid: 'submit-modal',
      body,
      onClose: () => { submitModal = null; },
      actions: [
        { label: 'Keep working', variant: 'ghost', testid: 'cancel-submit', autofocus: true, onClick: (close) => close() },
        { label: 'Submit test', variant: 'primary', testid: 'confirm-submit', onClick: () => finish({ auto: false }) },
      ],
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
        row(['Enter'], 'In an answer box: go to the next question'),
        row(['?'], 'Show this help')),
      actions: [{ label: 'Got it', variant: 'primary', onClick: (close) => close() }],
    });
  }

  /* ---- global listeners */
  function onKeyDown(e) {
    if (state.submitting || state.done) return;
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
  const runnerEl = h('div', { class: ['runner', preview && 'runner--preview'], dataset: { testid: 'runner' } },
    h('div', { class: 'runner-top' }, header, progressBar, previewBanner),
    h('main', { class: 'runner-main' }, stage, actions, announcer),
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
  };
}
