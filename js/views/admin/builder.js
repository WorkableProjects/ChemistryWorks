// Admin "Builder" tab: visual + JSON test editor with live validation.
// The in-memory test (S.test) is the single source of truth. Inputs mutate it directly and only
// refresh the pieces that depend on the changed value, so typing never loses focus.

import { h, mount, icon, richText, renderMath, toast, openModal, prefersReducedMotion } from '../../ui.js';
import { CONFIG } from '../../config.js';
import { load, save } from '../../lib/storage.js';
import { saveDraft } from '../../lib/tests.js';
import { QUESTION_TYPES, TYPE_LABELS, normalizeTest, validateTest, blankQuestion, nextQuestionId, blankTest } from '../../lib/schema.js';
import { formulaToHTML } from '../../lib/formula.js';
import { publishTest } from '../../lib/api.js';
import { field, switchEl, copyText, downloadFile, debounce, iconButton } from './common.js';

// ---------- module-level state (survives tab switches within the session) ----------
const S = { test: null, mode: 'visual', open: new WeakSet(), uid: 0 };
const clone = (x) => JSON.parse(JSON.stringify(x));

function ensure() {
  if (S.test) return;
  const saved = load('builderWorking', null);
  S.test = saved && typeof saved === 'object' && Array.isArray(saved.questions) ? { ...blankTest(), ...saved } : blankTest();
  openDefaults();
}
function openDefaults() {
  S.open = new WeakSet();
  const qs = S.test.questions;
  (qs.length <= 5 ? qs : qs.slice(0, 1)).forEach((q) => S.open.add(q));
}
function persistNow() { save('builderWorking', S.test); }
const persistSoon = debounce(persistNow, 400);

export function getBuilderTest() { ensure(); return S.test; }
/** Replace the working test (library edit/duplicate/import). */
export function setBuilderTest(test) {
  S.test = { ...blankTest(), ...clone(test) };
  delete S.test.updatedAt;
  openDefaults();
  persistNow();
}
export function newBuilderTest() { S.test = blankTest(); openDefaults(); persistNow(); }
/** True when the working test has anything worth confirming before discarding. */
export function builderIsDirty() {
  ensure();
  return !!(S.test.title || S.test.code || S.test.description || S.test.questions.length);
}

// ---------- helpers ----------
function safeValidate(test) {
  try {
    return validateTest(normalizeTest(test));
  } catch (e) {
    return { valid: false, errors: [`Could not validate: ${e.message}`] };
  }
}
function totalPoints(test) {
  return Math.round(test.questions.reduce((s, q) => s + (Number(q.points) || 0), 0) * 100) / 100;
}
function previewText(q) {
  const t = String(q.text || '').replace(/\s+/g, ' ').trim();
  return t ? (t.length > 90 ? `${t.slice(0, 90)}…` : t) : '(no text yet)';
}
function uniqueId(prefix, items) {
  const used = new Set(items.map((i) => i.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
function letterId(options) {
  const used = new Set(options.map((o) => o.id));
  for (const c of 'abcdefghijklmnopqrstuvwxyz') if (!used.has(c)) return c;
  return uniqueId('o', options);
}
/** Parse "6.022e23", "6.02x10^23", "6.02 × 10^23", "-3". NaN when unparseable. */
function parseSci(raw) {
  const s = String(raw).trim().replace(/−/g, '-').replace(/,/g, '');
  if (!s) return NaN;
  const m = s.match(/^(-?\d*\.?\d+)\s*[x×*]\s*10\s*\^?\s*([+-]?\d+)$/i);
  if (m) return Number(`${m[1]}e${m[2]}`);
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? Number(s) : NaN;
}
function confirmDialog({ title, body, confirmLabel = 'Delete', testid = 'confirm-dialog', onConfirm }) {
  openModal({
    title, body, testid,
    actions: [
      { label: 'Cancel', variant: 'ghost', autofocus: true },
      { label: confirmLabel, variant: 'danger', testid: 'confirm-action', onClick: (close) => { close(); onConfirm(); } },
    ],
  });
}
function jsonErrorMessage(err, text) {
  const m = /position (\d+)/i.exec(err.message);
  if (/line \d+/i.test(err.message)) return err.message;
  if (m) {
    const pos = Number(m[1]);
    const before = text.slice(0, pos).split('\n');
    return `${err.message} (line ${before.length}, column ${before[before.length - 1].length + 1})`;
  }
  return `JSON error: ${err.message}`;
}

// ---------- render ----------
export function renderBuilder(root, ctx) {
  ensure();
  const cleanups = [];
  const gasUrl = CONFIG.GAS_WEB_APP_URL;

  // Elements that live across mode switches
  const validationBox = h('div', { class: 'adm-validation', role: 'region', 'aria-label': 'Validation', dataset: { testid: 'validation-errors', count: '0' } });
  const summaryEl = h('p', { class: 'adm-summary muted' });
  const mainEl = h('div', { class: 'adm-builder__main' });
  const publishNote = h('p', { class: 'field__hint adm-publish-note' });
  const buttons = {};

  const btn = (key, label, iconName, variant, onClick, testid) => {
    const b = h('button', { class: `btn btn--${variant} btn--sm`, type: 'button', on: { click: onClick }, dataset: { testid } }, iconName ? icon(iconName, { size: 16 }) : null, label);
    buttons[key] = b;
    return b;
  };

  // ----- validation + actions -----
  let lastValidation = safeValidate(S.test);
  function refreshValidation() {
    lastValidation = safeValidate(S.test);
    const { valid, errors } = lastValidation;
    validationBox.dataset.count = String(errors.length);
    validationBox.classList.toggle('is-valid', valid);
    const list = errors.length
      ? h('ul', { class: 'adm-validation__list' }, errors.map((e) => {
        const m = /^Question (\d+)/.exec(e);
        return h('li', {}, m && S.mode === 'visual'
          ? h('button', { class: 'adm-validation__link', type: 'button', on: { click: () => focusQuestion(Number(m[1]) - 1) } }, e)
          : e);
      }))
      : null;
    mount(validationBox,
      h('div', { class: 'adm-validation__head' },
        icon(valid ? 'check' : 'alert', { size: 18 }),
        h('strong', {}, valid ? 'Ready to publish ✓' : `${errors.length} issue${errors.length === 1 ? '' : 's'} to fix`)),
      list);
    const n = S.test.questions.length;
    summaryEl.textContent = `${n} question${n === 1 ? '' : 's'} · ${totalPoints(S.test)} point${totalPoints(S.test) === 1 ? '' : 's'}`;
    const reason = valid ? '' : 'Fix the validation issues first';
    for (const k of ['save', 'preview']) {
      buttons[k].disabled = !valid;
      buttons[k].title = reason || (k === 'save' ? 'Save a draft on this device' : 'Preview as a student');
    }
    const adminKey = load('adminKey', '', 'session');
    const canPublish = valid && !!gasUrl && !!adminKey;
    buttons.publish.disabled = !canPublish;
    const why = !gasUrl ? 'Set GAS_WEB_APP_URL in js/config.js to publish to the Google Sheet.'
      : !adminKey ? 'Enter your admin key in Settings to publish.' : !valid ? reason : '';
    buttons.publish.title = why || 'Publish to the Google Sheet';
    publishNote.textContent = why && valid ? why : '';
  }
  const changed = () => { persistSoon(); refreshValidation(); };

  const normalizedOrNull = () => { try { return normalizeTest(S.test); } catch { return null; } };

  // ----- sidebar actions -----
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'adm-file', 'aria-label': 'Import test JSON file', dataset: { testid: 'import-json' },
    on: { change: async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      try {
        const parsed = JSON.parse(await f.text());
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The file must contain a test object.');
        setBuilderTest(normalizeTest(parsed));
        toast(`Imported ${S.test.code || 'test'}`, { type: 'success' });
        renderMain();
        refreshValidation();
      } catch (e) {
        toast(`Import failed: ${e.message}`, { type: 'error', timeout: 5000 });
      }
      fileInput.value = '';
    } } });

  const actions = h('div', { class: 'adm-actions' },
    btn('save', 'Save draft', 'check', 'primary', () => {
      const t = normalizedOrNull();
      if (!t || !lastValidation.valid) return;
      saveDraft(t);
      toast(`Draft ${t.code} saved on this device`, { type: 'success' });
    }, 'save-draft'),
    btn('preview', 'Preview', 'eye', 'ghost', () => {
      const t = normalizedOrNull();
      if (!t || !lastValidation.valid) return;
      persistNow();
      ctx.navigate('runner', { test: t, source: 'draft', preview: true });
    }, 'preview-test'),
    btn('download', 'Download JSON', 'download', 'ghost', () => {
      const t = normalizedOrNull() || S.test;
      downloadFile(`${t.code || 'test'}.json`, `${JSON.stringify(t, null, 2)}\n`);
    }, 'download-json'),
    h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => fileInput.click() } }, icon('upload', { size: 16 }), 'Import JSON'),
    fileInput,
    btn('copy', 'Copy JSON', 'copy', 'ghost', async () => {
      const ok = await copyText(JSON.stringify(normalizedOrNull() || S.test, null, 2));
      toast(ok ? 'JSON copied' : 'Copy failed', { type: ok ? 'success' : 'error' });
    }, 'copy-json'),
    btn('publish', 'Publish to Sheet', 'upload', 'success', async () => {
      const t = normalizedOrNull();
      if (!t || !lastValidation.valid) return;
      buttons.publish.classList.add('is-loading');
      buttons.publish.disabled = true;
      try {
        const res = await publishTest(t, { gasUrl, adminKey: load('adminKey', '', 'session') });
        toast(res.ok ? `Published ${t.code}` : `Publish failed: ${res.error || 'unknown error'}`, { type: res.ok ? 'success' : 'error', timeout: res.ok ? 3200 : 6000 });
      } catch (e) {
        toast(`Publish failed: ${e.message}`, { type: 'error', timeout: 6000 });
      } finally {
        buttons.publish.classList.remove('is-loading');
        refreshValidation();
      }
    }, 'publish-test'),
  );

  const side = h('aside', { class: 'adm-builder__side' },
    h('div', { class: 'card adm-side-card' },
      h('h3', { class: 'adm-h3' }, 'Checks'),
      validationBox, summaryEl, actions, publishNote,
      h('p', { class: 'field__hint adm-bundle-note' },
        icon('info', { size: 14 }),
        ' To bundle a test permanently: Download JSON, commit the file to data/tests/, and add it to data/tests/index.json.'),
    ),
  );

  // ----- mode toggle -----
  const modeBtn = (mode, label, iconName, testid) => h('button', {
    class: 'adm-seg__btn', type: 'button', role: 'tab', 'aria-selected': String(S.mode === mode), dataset: { testid, mode },
    on: { click: () => setMode(mode) },
  }, icon(iconName, { size: 16 }), label);
  const segEl = h('div', { class: 'adm-seg', role: 'tablist', 'aria-label': 'Builder mode' },
    modeBtn('visual', 'Visual', 'grid', 'builder-mode-visual'),
    modeBtn('json', 'JSON', 'list', 'builder-mode-json'));
  let jsonText = null, jsonErrEl = null;

  function updateSeg() {
    segEl.querySelectorAll('.adm-seg__btn').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === S.mode)));
  }
  function setMode(mode) {
    if (mode === S.mode) return;
    if (S.mode === 'json' && jsonText && jsonText.value !== jsonText.dataset.base) {
      if (!applyJson({ silent: true })) return; // stay in JSON mode with the error visible
    }
    S.mode = mode;
    updateSeg();
    renderMain();
    refreshValidation();
  }

  // ----- JSON mode -----
  function applyJson({ silent = false } = {}) {
    const text = jsonText.value;
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Top level must be a test object { … }.');
      S.test = { ...blankTest(), ...normalizeTest(parsed) };
      openDefaults();
      persistNow();
      jsonText.value = JSON.stringify(S.test, null, 2);
      jsonText.dataset.base = jsonText.value;
      jsonErrEl.textContent = '';
      jsonText.classList.remove('is-invalid');
      refreshValidation();
      if (!silent) toast('JSON applied', { type: 'success' });
      return true;
    } catch (e) {
      jsonErrEl.textContent = e instanceof SyntaxError ? jsonErrorMessage(e, text) : e.message;
      jsonText.classList.add('is-invalid');
      jsonText.classList.add('shake');
      setTimeout(() => jsonText.classList.remove('shake'), 400);
      return false;
    }
  }
  function renderJson() {
    const base = JSON.stringify(S.test, null, 2);
    jsonText = h('textarea', { class: 'textarea textarea--code adm-json', spellcheck: 'false', 'aria-label': 'Test JSON', dataset: { testid: 'json-textarea', base } });
    jsonText.value = base;
    jsonErrEl = h('p', { class: 'field-error', role: 'alert' });
    return h('div', { class: 'card adm-json-card' },
      h('div', { class: 'row row--wrap' },
        h('h3', { class: 'adm-h3' }, 'Test JSON'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => { jsonText.value = JSON.stringify(S.test, null, 2); jsonText.dataset.base = jsonText.value; jsonErrEl.textContent = ''; jsonText.classList.remove('is-invalid'); } } }, icon('refresh', { size: 16 }), 'Reset to builder'),
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', on: { click: () => applyJson() }, dataset: { testid: 'apply-json' } }, icon('check', { size: 16 }), 'Apply JSON')),
      h('p', { class: 'field__hint' }, 'Edit the whole test as JSON. Press Apply to load it into the builder (defaults are filled in automatically).'),
      jsonText, jsonErrEl);
  }

  // ----- visual mode -----
  let listEl = null, emptyHint = null;
  const editors = () => (listEl ? [...listEl.querySelectorAll(':scope > .adm-q')] : []);

  function settingsCard() {
    const t = S.test;
    const codeInput = h('input', { class: 'input adm-code', value: t.code || '', maxlength: 32, autocomplete: 'off', spellcheck: 'false', placeholder: 'e.g. CHEM102', dataset: { testid: 'test-code' },
      on: { input: () => {
        const pos = codeInput.selectionStart;
        const v = codeInput.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (v !== codeInput.value) { codeInput.value = v; codeInput.setSelectionRange(pos, pos); }
        S.test.code = v;
        changed();
      } } });
    const title = h('input', { class: 'input', value: t.title || '', placeholder: 'Test title', dataset: { testid: 'test-title' }, on: { input: () => { S.test.title = title.value; changed(); } } });
    const desc = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Optional description shown to students', dataset: { testid: 'test-description' }, on: { input: () => { S.test.description = desc.value; changed(); } } });
    desc.value = t.description || '';
    const time = h('input', { class: 'input', type: 'number', min: '1', step: '1', value: t.timeLimitMinutes ?? '', placeholder: 'Untimed', dataset: { testid: 'test-time-limit' },
      on: { input: () => { const v = time.value.trim(); S.test.timeLimitMinutes = v === '' ? null : Number(v); changed(); } } });
    const pass = h('input', { class: 'input', type: 'number', min: '0', max: '100', step: '1', value: t.passingPercent ?? '', placeholder: 'None', dataset: { testid: 'passing-percent' },
      on: { input: () => { const v = pass.value.trim(); S.test.passingPercent = v === '' ? null : Number(v); changed(); } } });
    const mode = h('select', { class: 'select', dataset: { testid: 'default-mode' }, on: { change: () => { S.test.defaultMode = mode.value || null; changed(); } } },
      h('option', { value: '' }, `Site default (${CONFIG.DEFAULT_MODE})`),
      h('option', { value: 'focus' }, 'Focus (one at a time)'),
      h('option', { value: 'scroll' }, 'Scroll (all on one page)'));
    mode.value = t.defaultMode || '';
    const sw = (key, label, hint, def) => switchEl({ label, hint, checked: t[key] ?? def, testid: `opt-${key}`, onChange: (v) => { S.test[key] = v; changed(); } });
    return h('section', { class: 'card adm-settings', 'aria-label': 'Test settings' },
      h('h3', { class: 'adm-h3' }, 'Test settings'),
      h('div', { class: 'adm-grid adm-grid--code' },
        field('Test code', codeInput, 'Letters, numbers, - and _ (2–32)'),
        field('Title', title)),
      field('Description', desc),
      h('div', { class: 'adm-grid adm-grid--3' },
        field('Time limit (minutes)', time, 'Leave empty for untimed'),
        field('Passing percent', pass, 'Shows a Pass / Not yet badge'),
        field('Default layout', mode)),
      h('div', { class: 'adm-switches' },
        sw('shuffleQuestions', 'Shuffle questions', null, false),
        sw('shuffleOptions', 'Shuffle options', 'Multiple choice / select', false),
        sw('showResults', 'Show score to students', null, true),
        sw('showCorrectAnswers', 'Show correct answers', 'Review with explanations', true),
        sw('allowModeToggle', 'Allow layout toggle', 'Focus / scroll switch', true)),
    );
  }

  function renumber() {
    const total = S.test.questions.length;
    editors().forEach((el, k) => el._setIndex(k, total));
    emptyHint.hidden = total > 0;
  }

  function focusQuestion(i) {
    const el = editors()[i];
    if (!el) return;
    S.open.add(S.test.questions[i]);
    el._sync();
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => el.querySelector('[data-testid="q-text"]')?.focus({ preventScroll: true }), 120);
  }

  function renderList() {
    mount(listEl, S.test.questions.map((q, i) => buildEditor(q, i)));
    renumber();
    renderMath(listEl);
  }

  function moveQuestion(i, dir) {
    const j = i + dir;
    const qs = S.test.questions;
    if (j < 0 || j >= qs.length) return;
    const els = editors();
    const a = els[i], b = els[j];
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    [qs[i], qs[j]] = [qs[j], qs[i]];
    if (j > i) listEl.insertBefore(b, a); else listEl.insertBefore(a, b);
    renumber();
    a.querySelector(dir < 0 ? '[data-testid="q-up"]' : '[data-testid="q-down"]')?.focus({ preventScroll: true });
    if (!prefersReducedMotion()) {
      const na = a.getBoundingClientRect(), nb = b.getBoundingClientRect();
      for (const [el, from, to] of [[a, ra, na], [b, rb, nb]]) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${from.top - to.top}px)`;
        void el.offsetWidth;
        el.style.transition = 'transform 260ms var(--ease)';
        el.style.transform = '';
        setTimeout(() => { el.style.transition = ''; }, 300);
      }
    }
    changed();
  }

  function deleteQuestion(i) {
    const q = S.test.questions[i];
    confirmDialog({
      title: `Delete question ${i + 1}?`, body: `“${previewText(q)}” will be removed from this test.`, testid: 'confirm-delete-question',
      onConfirm: () => { S.test.questions.splice(i, 1); renderList(); changed(); },
    });
  }
  function duplicateQuestion(i) {
    const copy = clone(S.test.questions[i]);
    copy.id = nextQuestionId(S.test.questions);
    S.test.questions.splice(i + 1, 0, copy);
    S.open.add(copy);
    renderList();
    changed();
    focusQuestion(i + 1);
  }
  function addQuestion(type) {
    const q = blankQuestion(type, nextQuestionId(S.test.questions));
    S.test.questions.push(q);
    S.open.add(q);
    const el = buildEditor(q, S.test.questions.length - 1);
    listEl.appendChild(el);
    renumber();
    renderMath(el);
    changed();
    el.classList.add('is-new');
    setTimeout(() => el.classList.remove('is-new'), 600);
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => el.querySelector('[data-testid="q-text"]')?.focus({ preventScroll: true }), 80);
  }

  // ----- question editor -----
  function buildEditor(q, index) {
    const uid = ++S.uid;
    const num = h('span', { class: 'adm-q__num' });
    const pointsChip = h('span', { class: 'pill' });
    const prev = h('span', { class: 'adm-q__preview' });
    const upBtn = iconButton('up', 'Move up', () => moveQuestion(Number(el.dataset.index), -1), { testid: 'q-up' });
    const downBtn = iconButton('down', 'Move down', () => moveQuestion(Number(el.dataset.index), 1), { testid: 'q-down' });
    const toggle = h('button', { class: 'adm-q__toggle', type: 'button', 'aria-expanded': 'false', on: { click: () => {
      if (S.open.has(q)) S.open.delete(q); else S.open.add(q);
      sync();
    } } }, num, h('span', { class: 'pill pill--primary' }, TYPE_LABELS[q.type] || q.type), pointsChip, prev, icon('down', { size: 16, className: 'adm-q__chev' }));
    const head = h('div', { class: 'adm-q__head' }, toggle,
      h('div', { class: 'adm-q__actions' }, upBtn, downBtn,
        iconButton('copy', 'Duplicate question', () => duplicateQuestion(Number(el.dataset.index)), { testid: 'q-duplicate' }),
        iconButton('trash', 'Delete question', () => deleteQuestion(Number(el.dataset.index)), { testid: 'q-delete', className: 'icon-btn--danger' })));

    const updateHead = () => {
      prev.textContent = previewText(q);
      const p = Number(q.points);
      pointsChip.textContent = Number.isFinite(p) ? `${p} pt${p === 1 ? '' : 's'}` : '— pts';
    };

    // common fields
    const idInput = h('input', { class: 'input', value: q.id || '', spellcheck: 'false', dataset: { testid: 'q-id' }, on: { input: () => { q.id = idInput.value.trim(); changed(); } } });
    const pts = h('input', { class: 'input', type: 'number', min: '0', step: 'any', value: q.points ?? 1, dataset: { testid: 'q-points' },
      on: { input: () => { q.points = pts.value.trim() === '' ? '' : Number(pts.value); updateHead(); changed(); } } });
    const text = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Question text. Use $…$ for math, e.g. $\\ce{H2SO4}$', dataset: { testid: 'q-text' } });
    text.value = q.text || '';
    const richPrev = h('div', { class: 'adm-richprev', 'aria-label': 'Question preview' });
    const drawPreview = () => {
      richPrev.classList.toggle('is-empty', !q.text);
      mount(richPrev, q.text ? richText(q.text, 'div') : h('span', { class: 'faint' }, 'Preview appears here'));
      renderMath(richPrev);
    };
    const drawPreviewSoon = debounce(drawPreview, 200);
    cleanups.push(() => drawPreviewSoon.cancel());
    text.addEventListener('input', () => { q.text = text.value; updateHead(); drawPreviewSoon(); changed(); });
    const expl = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Shown to students in the review (optional)', dataset: { testid: 'q-explanation' } });
    expl.value = q.explanation || '';
    expl.addEventListener('input', () => { q.explanation = expl.value; changed(); });

    const typeSection = h('div', { class: 'adm-typesec' });
    const drawType = () => { mount(typeSection, typeEditor(q, drawType, changed, uid)); renderMath(typeSection); };

    const inner = h('div', { class: 'adm-q__inner' },
      h('div', { class: 'adm-grid adm-grid--id' }, field('ID', idInput), field('Points', pts)),
      field('Question text', text), richPrev,
      typeSection,
      field('Explanation', expl));
    const collapse = h('div', { class: 'adm-q__collapse' }, inner);

    const el = h('article', { class: 'adm-q', dataset: { testid: 'question-editor', index } }, head, collapse);
    function sync() {
      const open = S.open.has(q);
      el.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      collapse.inert = !open;
    }
    el._sync = sync;
    el._setIndex = (k, total) => {
      el.dataset.index = String(k);
      num.textContent = `Q${k + 1}`;
      upBtn.disabled = k === 0;
      downBtn.disabled = k === total - 1;
    };
    updateHead();
    drawPreview();
    drawType();
    sync();
    el._setIndex(index, S.test.questions.length);
    return el;
  }

  // ----- add-question menu -----
  function addMenu() {
    let open = false;
    const menu = h('div', { class: 'adm-menu', role: 'menu', hidden: true },
      QUESTION_TYPES.map((t) => h('button', { class: 'adm-menu__item', type: 'button', role: 'menuitem', dataset: { testid: `add-question-${t}` },
        on: { click: () => { setOpen(false); addQuestion(t); } } }, TYPE_LABELS[t])));
    const trigger = h('button', { class: 'btn btn--ghost', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', dataset: { testid: 'add-question' },
      on: { click: (e) => { e.stopPropagation(); setOpen(!open); } } }, icon('plus', { size: 16 }), 'Add question');
    function setOpen(v) {
      open = v;
      menu.hidden = !v;
      trigger.setAttribute('aria-expanded', String(v));
      if (v) menu.querySelector('button')?.focus();
    }
    const onDoc = (e) => { if (open && !wrap.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (open && e.key === 'Escape') { setOpen(false); trigger.focus(); } };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    cleanups.push(() => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); });
    const wrap = h('div', { class: 'adm-addwrap' }, trigger, menu);
    return wrap;
  }

  function renderVisual() {
    listEl = h('div', { class: 'adm-qlist' });
    emptyHint = h('div', { class: 'adm-qempty', hidden: S.test.questions.length > 0 },
      icon('flask', { size: 24 }), h('p', {}, 'No questions yet. Add your first question below.'));
    const wrap = h('div', { class: 'stack adm-visual' },
      settingsCard(),
      h('section', { class: 'adm-questions', 'aria-label': 'Questions' },
        h('div', { class: 'row' }, h('h3', { class: 'adm-h3' }, 'Questions'),
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn btn--subtle btn--sm', type: 'button', on: { click: () => { const all = S.test.questions; const anyClosed = all.some((q) => !S.open.has(q)); all.forEach((q) => (anyClosed ? S.open.add(q) : S.open.delete(q))); editors().forEach((e) => e._sync()); } } }, 'Expand / collapse all')),
        emptyHint, listEl,
        h('div', { class: 'adm-addrow' }, addMenu())));
    renderList();
    return wrap;
  }

  function renderMain() {
    mount(mainEl, S.mode === 'json' ? renderJson() : renderVisual());
  }

  mount(root, h('div', { class: 'adm-builder', dataset: { testid: 'builder' } },
    h('div', { class: 'adm-builder__col' }, h('div', { class: 'adm-toolbar' }, segEl), mainEl),
    side));
  renderMain();
  refreshValidation();

  return () => {
    persistSoon.cancel();
    persistNow();
    cleanups.forEach((fn) => fn());
  };
}

// ---------- per-type editors ----------
function typeEditor(q, redraw, changed, uid) {
  switch (q.type) {
    case 'mcq':
    case 'multi': return choiceEditor(q, redraw, changed, uid);
    case 'numeric': return numericEditor(q, changed);
    case 'formula': return formulaEditor(q, changed);
    case 'truefalse': return tfEditor(q, changed);
    case 'matching': return matchingEditor(q, redraw, changed);
    default: return h('p', { class: 'muted' }, `Unknown question type “${q.type}”.`);
  }
}

function choiceEditor(q, redraw, changed, uid) {
  const multi = q.type === 'multi';
  q.options = Array.isArray(q.options) ? q.options : [];
  if (multi && !Array.isArray(q.correctAnswer)) q.correctAnswer = q.correctAnswer ? [q.correctAnswer] : [];
  const rows = q.options.map((o, i) => {
    const checked = multi ? q.correctAnswer.includes(o.id) : q.correctAnswer === o.id;
    const mark = h('input', { type: multi ? 'checkbox' : 'radio', name: `correct-${uid}`, checked, 'aria-label': `Option ${i + 1} is correct`, dataset: { testid: `option-correct-${i}` },
      on: { change: () => {
        if (multi) {
          const set = new Set(q.correctAnswer);
          if (mark.checked) set.add(o.id); else set.delete(o.id);
          q.correctAnswer = q.options.map((x) => x.id).filter((id) => set.has(id));
        } else {
          q.correctAnswer = o.id;
        }
        changed();
      } } });
    const txt = h('input', { class: 'input', value: o.text || '', placeholder: `Option ${i + 1}`, 'aria-label': `Option ${i + 1} text`, dataset: { testid: `option-text-${i}` },
      on: { input: () => { o.text = txt.value; changed(); } } });
    const rm = iconButton('x', 'Remove option', () => {
      q.options.splice(i, 1);
      if (multi) q.correctAnswer = q.correctAnswer.filter((id) => id !== o.id);
      else if (q.correctAnswer === o.id) q.correctAnswer = q.options[0]?.id ?? '';
      redraw();
      changed();
    }, { testid: `option-remove-${i}` });
    return h('div', { class: 'adm-opt' }, mark, txt, rm);
  });
  return h('div', { class: 'stack' },
    h('div', { class: 'field__label' }, multi ? 'Options (tick every correct one)' : 'Options (select the correct one)'),
    h('div', { class: 'adm-opts' }, rows),
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-option' }, on: { click: (e) => {
        const sec = e.currentTarget.closest('.adm-typesec');
        q.options.push({ id: letterId(q.options), text: '' });
        redraw();
        changed();
        sec?.querySelector(`[data-testid="option-text-${q.options.length - 1}"]`)?.focus();
      } } }, icon('plus', { size: 16 }), 'Add option'),
      multi ? switchEl({ label: 'Partial credit', checked: !!q.partialCredit, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }) : null));
}

function numericEditor(q, changed) {
  const parsedEl = h('span', { class: 'field__hint' });
  const showParsed = () => {
    const n = q.correctAnswer;
    parsedEl.textContent = typeof n === 'number' && Number.isFinite(n) ? `Parsed value: ${n}` : ans.value.trim() ? 'Not a valid number yet' : '';
  };
  const ans = h('input', { class: 'input', value: q.correctAnswer ?? '', placeholder: 'e.g. 18.02 or 6.022e23', inputmode: 'text', autocomplete: 'off', dataset: { testid: 'numeric-answer' },
    on: { input: () => { const n = parseSci(ans.value); q.correctAnswer = Number.isNaN(n) ? '' : n; showParsed(); changed(); } } });
  const tol = h('input', { class: 'input', type: 'number', min: '0', step: 'any', value: q.tolerance ?? 0, dataset: { testid: 'numeric-tolerance' },
    on: { input: () => { q.tolerance = tol.value.trim() === '' ? 0 : Number(tol.value); changed(); } } });
  const type = h('select', { class: 'select', dataset: { testid: 'numeric-tolerance-type' }, on: { change: () => { q.toleranceType = type.value; changed(); } } },
    h('option', { value: 'absolute' }, 'Absolute (±)'), h('option', { value: 'percent' }, 'Percent (±%)'));
  type.value = q.toleranceType || 'absolute';
  const unit = h('input', { class: 'input', value: q.unit || '', placeholder: 'e.g. g/mol', dataset: { testid: 'numeric-unit' }, on: { input: () => { q.unit = unit.value; changed(); } } });
  showParsed();
  return h('div', { class: 'adm-grid adm-grid--4' },
    field('Correct answer', ans, null), field('Tolerance', tol), field('Tolerance type', type), field('Unit', unit, 'Optional, shown to students'),
    h('div', { class: 'adm-span-all' }, parsedEl));
}

function formulaEditor(q, changed) {
  const accepted = Array.isArray(q.correctAnswer) ? q.correctAnswer : q.correctAnswer ? [q.correctAnswer] : [];
  const chips = h('div', { class: 'adm-chips', 'aria-label': 'Accepted answers preview' });
  const drawChips = () => {
    const list = Array.isArray(q.correctAnswer) ? q.correctAnswer : q.correctAnswer ? [q.correctAnswer] : [];
    mount(chips, list.length ? list.map((f) => h('span', { class: 'adm-chip formula', html: formulaToHTML(f) })) : h('span', { class: 'faint' }, 'Accepted formulas preview here'));
  };
  const inp = h('input', { class: 'input', value: accepted.join(', '), placeholder: 'e.g. H2SO4, H₂SO₄', autocomplete: 'off', spellcheck: 'false', dataset: { testid: 'formula-answers' },
    on: { input: () => {
      const parts = inp.value.split(',').map((s) => s.trim()).filter(Boolean);
      q.correctAnswer = parts.length > 1 ? parts : parts[0] || '';
      drawChips();
      changed();
    } } });
  drawChips();
  return h('div', { class: 'stack' },
    field('Accepted answers (comma-separated)', inp, 'Subscripts and charges are normalized when grading: SO4^2- = SO₄²⁻'),
    chips,
    switchEl({ label: 'Case sensitive', hint: 'Off lets "nacl" match "NaCl"', checked: q.caseSensitive !== false, testid: 'case-sensitive', onChange: (v) => { q.caseSensitive = v; changed(); } }));
}

function tfEditor(q, changed) {
  const sel = h('select', { class: 'select', dataset: { testid: 'tf-answer' }, on: { change: () => { q.correctAnswer = sel.value === 'true'; changed(); } } },
    h('option', { value: 'true' }, 'True'), h('option', { value: 'false' }, 'False'));
  sel.value = q.correctAnswer === false ? 'false' : 'true';
  if (typeof q.correctAnswer !== 'boolean') q.correctAnswer = true;
  return field('Correct answer', sel, null, { className: 'adm-narrow' });
}

function matchingEditor(q, redraw, changed) {
  q.left = Array.isArray(q.left) ? q.left : [];
  q.right = Array.isArray(q.right) ? q.right : [];
  if (!q.correctAnswer || typeof q.correctAnswer !== 'object' || Array.isArray(q.correctAnswer)) q.correctAnswer = {};
  const selects = [];
  const rightLabel = (r, i) => (r.text ? r.text : `(item ${i + 1})`);
  const fillSelect = (sel, leftId) => {
    const cur = q.correctAnswer[leftId] ?? '';
    mount(sel, h('option', { value: '' }, 'Choose…'), q.right.map((r, i) => h('option', { value: r.id }, rightLabel(r, i))));
    sel.value = q.right.some((r) => r.id === cur) ? cur : '';
  };
  const refreshSelects = () => selects.forEach(({ sel, id }) => fillSelect(sel, id));

  const leftRows = q.left.map((l, i) => {
    const txt = h('input', { class: 'input', value: l.text || '', placeholder: `Left item ${i + 1}`, 'aria-label': `Left item ${i + 1}`, dataset: { testid: `match-left-${i}` }, on: { input: () => { l.text = txt.value; changed(); } } });
    const sel = h('select', { class: 'select', 'aria-label': `Correct match for left item ${i + 1}`, dataset: { testid: `match-correct-${i}` }, on: { change: () => { q.correctAnswer[l.id] = sel.value; changed(); } } });
    selects.push({ sel, id: l.id });
    fillSelect(sel, l.id);
    const rm = iconButton('x', 'Remove left item', () => { q.left.splice(i, 1); delete q.correctAnswer[l.id]; redraw(); changed(); }, { testid: `match-left-remove-${i}` });
    return h('div', { class: 'adm-match-row' }, txt, h('span', { class: 'adm-match-arrow', 'aria-hidden': 'true' }, icon('right', { size: 16 })), sel, rm);
  });
  const rightRows = q.right.map((r, i) => {
    const txt = h('input', { class: 'input', value: r.text || '', placeholder: `Right item ${i + 1}`, 'aria-label': `Right item ${i + 1}`, dataset: { testid: `match-right-${i}` },
      on: { input: () => { r.text = txt.value; refreshSelects(); changed(); } } });
    const rm = iconButton('x', 'Remove right item', () => {
      q.right.splice(i, 1);
      for (const l of q.left) if (q.correctAnswer[l.id] === r.id) q.correctAnswer[l.id] = q.right[0]?.id ?? '';
      redraw();
      changed();
    }, { testid: `match-right-remove-${i}` });
    return h('div', { class: 'adm-opt adm-opt--plain' }, txt, rm);
  });
  return h('div', { class: 'stack' },
    h('div', { class: 'field__label' }, 'Left items and their correct match'),
    h('div', { class: 'adm-opts' }, leftRows),
    h('button', { class: 'btn btn--ghost btn--sm adm-self-start', type: 'button', dataset: { testid: 'add-match-left' }, on: { click: () => {
      const id = uniqueId('l', q.left);
      q.left.push({ id, text: '' });
      q.correctAnswer[id] = q.right[0]?.id ?? '';
      redraw();
      changed();
    } } }, icon('plus', { size: 16 }), 'Add left item'),
    h('div', { class: 'field__label' }, 'Right items (distractors allowed; each can be reused)'),
    h('div', { class: 'adm-opts' }, rightRows),
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-match-right' }, on: { click: () => {
        q.right.push({ id: uniqueId('r', q.right), text: '' });
        redraw();
        changed();
      } } }, icon('plus', { size: 16 }), 'Add right item'),
      switchEl({ label: 'Partial credit', checked: q.partialCredit !== false, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } })));
}
