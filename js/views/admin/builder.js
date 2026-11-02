// Admin "Builder" tab: visual + JSON test editor with live validation.
// The in-memory test (S.test) is the single source of truth. Inputs mutate it directly and only
// refresh the pieces that depend on the changed value, so typing never loses focus.

import { h, mount, icon, richText, renderMath, toast, openModal, prefersReducedMotion } from '../../ui.js';
import { CONFIG } from '../../config.js';
import { load, save } from '../../lib/storage.js';
import { saveDraft } from '../../lib/tests.js';
import { QUESTION_TYPES, TYPE_LABELS, normalizeTest, validateTest, blankQuestion, nextQuestionId, blankTest } from '../../lib/schema.js';
import { formulaToHTML } from '../../lib/formula.js';
import { normalizeSymbol, valenceOf, canonicalDots } from '../../lib/lewis.js';
import { lewisDiagram } from '../lewis-view.js';
import { structureDiagram } from '../structure-view.js';
import { acceptedStructures, valenceTotal, electronsDrawn, bondEnds } from '../../lib/structure.js';
import { formatHelpFor } from '../../lib/hints.js';
import { BLANK_KINDS, markerIds } from '../../lib/blanks.js';
import { publishTest } from '../../lib/api.js';
import { testLink } from './library.js';
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
  const linkBox = h('div', { class: 'adm-linkbox', hidden: true, dataset: { testid: 'published-link' } });
  function showLink(code) {
    const url = testLink(code);
    const input = h('input', { class: 'input', readonly: true, value: url, 'aria-label': 'Student link', on: { focus: () => input.select() } });
    mount(linkBox,
      h('span', { class: 'field__label' }, 'Student link'),
      h('div', { class: 'row' }, input,
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: 'copy-published-link' }, on: { click: async () => {
          const ok = await copyText(url);
          toast(ok ? 'Link copied' : 'Could not copy link', { type: ok ? 'success' : 'error' });
        } } }, icon('copy', { size: 14 }), 'Copy')),
      h('span', { class: 'field__hint' }, 'Share this one link (Google Classroom, email). Students sign in with Google and the test opens. No code to type.'));
    linkBox.hidden = false;
  }
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
        if (res.ok) showLink(t.code);
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
      validationBox, summaryEl, actions, publishNote, linkBox,
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
        sw('showResults', 'Show score to students', 'Off: students only see “Submission received”. Grade in the Grading tab.', true),
        sw('showCorrectAnswers', 'Show correct answers', 'Review with explanations (only when the score is shown)', true),
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
    setTimeout(() => { if (!el.contains(document.activeElement)) el.querySelector('[data-testid="q-text"]')?.focus({ preventScroll: true }); }, 120);
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
    setTimeout(() => { if (!el.contains(document.activeElement)) el.querySelector('[data-testid="q-text"]')?.focus({ preventScroll: true }); }, 80);
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
    case 'lewis': return lewisEditor(q, changed);
    case 'short': return shortEditor(q, changed);
    case 'ordering': return orderingEditor(q, redraw, changed);
    case 'fillblank': return fillBlankEditor(q, redraw, changed);
    case 'structure': return structureEditor(q, redraw, changed);
    case 'open': return openEditor(q, redraw, changed);
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
  return h('div', { class: 'stack' },
    h('div', { class: 'adm-grid adm-grid--4' },
      field('Correct answer', ans, null), field('Tolerance', tol), field('Tolerance type', type), field('Unit', unit, 'Optional, shown to students'),
      h('div', { class: 'adm-span-all' }, parsedEl)),
    formatHelpField(q, changed));
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
    switchEl({ label: 'Case sensitive', hint: 'Off lets "nacl" match "NaCl"', checked: q.caseSensitive !== false, testid: 'case-sensitive', onChange: (v) => { q.caseSensitive = v; changed(); } }),
    formatHelpField(q, changed));
}

function lewisEditor(q, changed) {
  const previewEl = h('div', { class: 'adm-lewis-preview', dataset: { testid: 'lewis-preview' } });
  const hintEl = h('span', { class: 'field__hint' });
  const drawPreview = () => {
    const sym = normalizeSymbol(q.element);
    const n = Number(q.correctAnswer);
    const known = valenceOf(sym);
    hintEl.textContent = !sym ? 'Enter an element symbol, e.g. O, Cl, Mg'
      : known === null ? 'Not a main-group element: enter its valence electrons yourself'
        : known === n ? `${sym} has ${known} valence electrons` : `Note: ${sym} normally has ${known} valence electrons`;
    mount(previewEl, sym && Number.isInteger(n) && n >= 1 && n <= 8
      ? [lewisDiagram(sym, canonicalDots(n, sym), { size: 'lg' }), h('span', { class: 'faint' }, 'Correct diagram')]
      : h('span', { class: 'faint' }, 'Diagram preview appears here'));
  };
  const el = h('input', { class: 'input', value: q.element || '', placeholder: 'e.g. O', maxlength: '3', autocomplete: 'off', spellcheck: 'false', dataset: { testid: 'lewis-element' },
    on: { input: () => {
      const sym = normalizeSymbol(el.value);
      q.element = sym || el.value.trim();
      const v = valenceOf(sym);
      if (v !== null) { q.correctAnswer = v; ve.value = String(v); }
      drawPreview();
      changed();
    } } });
  const ve = h('input', { class: 'input', type: 'number', min: '1', max: '8', step: '1', value: q.correctAnswer ?? '', dataset: { testid: 'lewis-valence' },
    on: { input: () => { q.correctAnswer = ve.value.trim() === '' ? '' : Number(ve.value); drawPreview(); changed(); } } });
  drawPreview();
  return h('div', { class: 'stack' },
    h('div', { class: 'adm-grid adm-grid--4' },
      field('Element symbol', el, null), field('Valence electrons (dots)', ve, 'Filled in automatically for main-group elements')),
    hintEl,
    previewEl,
    switchEl({ label: 'Check dot placement', hint: 'On: one dot per side before pairing (He may be a pair). Off: only the number of dots is graded.',
      checked: q.checkPlacement !== false, testid: 'lewis-placement', onChange: (v) => { q.checkPlacement = v; changed(); } }));
}

function shortEditor(q, changed) {
  const ta = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Model answer or rubric (optional)', dataset: { testid: 'short-sample' },
    on: { input: () => { q.sampleAnswer = ta.value; changed(); } } });
  ta.value = q.sampleAnswer || '';
  return h('div', { class: 'stack' },
    h('p', { class: 'notice notice--info' }, icon('info'), h('span', {}, 'Not auto-graded. Students’ answers appear in the Grading tab, where you assign points.')),
    field('Sample answer', ta, 'Shown to you while grading. Students see it in the review only if “Show correct answers” is on.'));
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

/**
 * "Typing help" setting for formula / numeric / fill-in questions plus a live note of what students will see.
 * Auto shows charge help when an answer has a charge (or the text mentions ions) and exponent help when the
 * answer needs scientific notation.
 */
function formatHelpField(q, changed) {
  const note = h('p', { class: 'adm-helpnote', dataset: { testid: 'format-help-note' } });
  const update = () => {
    const help = formatHelpFor(q);
    const parts = [help.charges && 'how to type charges (^2-, ^+)', help.exponents && 'how to type powers of ten (6.02e23)'].filter(Boolean);
    note.hidden = !parts.length;
    mount(note, icon('info', { size: 14 }), h('span', {}, `Students will see a help box on ${parts.join(' and ')}, with insert buttons.`));
  };
  const sel = h('select', { class: 'select', dataset: { testid: 'format-help' }, on: { change: () => { q.formatHelp = sel.value; update(); changed(); } } },
    h('option', { value: 'auto' }, 'Auto (when the answer has a charge or exponent)'),
    h('option', { value: 'always' }, 'Always show'),
    h('option', { value: 'never' }, 'Never show'));
  sel.value = ['auto', 'always', 'never'].includes(q.formatHelp) ? q.formatHelp : 'auto';
  const wrap = h('div', { class: 'stack' }, field('Typing help for students', sel, 'Explains how to type charges / exponents'), note);
  update();
  // Re-check whenever anything in this question changes (answer, text, blank kinds).
  requestAnimationFrame(() => wrap.closest('.adm-q')?.addEventListener('input', update));
  requestAnimationFrame(() => wrap.closest('.adm-q')?.addEventListener('change', update));
  return wrap;
}

function orderingEditor(q, redraw, changed) {
  q.items = Array.isArray(q.items) ? q.items : [];
  const sync = () => { q.correctAnswer = q.items.map((it) => it.id); };
  sync();
  const rows = q.items.map((it, i) => {
    const txt = h('input', { class: 'input', value: it.text || '', placeholder: `Item ${i + 1}`, 'aria-label': `Item ${i + 1} (correct position ${i + 1})`, dataset: { testid: `order-item-${i}` },
      on: { input: () => { it.text = txt.value; changed(); } } });
    const mv = (d) => { const j = i + d; if (j < 0 || j >= q.items.length) return; [q.items[i], q.items[j]] = [q.items[j], q.items[i]]; sync(); redraw(); changed(); };
    return h('div', { class: 'adm-opt adm-opt--plain' },
      h('span', { class: 'adm-blank__num' }, String(i + 1)), txt,
      iconButton('up', 'Move up', () => mv(-1), { testid: `order-up-${i}` }),
      iconButton('down', 'Move down', () => mv(1), { testid: `order-down-${i}` }),
      iconButton('x', 'Remove item', () => { q.items.splice(i, 1); sync(); redraw(); changed(); }, { testid: `order-remove-${i}` }));
  });
  const top = h('input', { class: 'input', value: q.topLabel || '', placeholder: 'e.g. Lowest', dataset: { testid: 'order-top-label' }, on: { input: () => { q.topLabel = top.value; changed(); } } });
  const bottom = h('input', { class: 'input', value: q.bottomLabel || '', placeholder: 'e.g. Highest', dataset: { testid: 'order-bottom-label' }, on: { input: () => { q.bottomLabel = bottom.value; changed(); } } });
  return h('div', { class: 'stack' },
    h('div', { class: 'field__label' }, 'Items in the CORRECT order (students see them scrambled)'),
    h('div', { class: 'adm-opts' }, rows),
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-order-item' }, on: { click: () => {
        q.items.push({ id: uniqueId('i', q.items), text: '' }); sync(); redraw(); changed();
      } } }, icon('plus', { size: 16 }), 'Add item'),
      switchEl({ label: 'Partial credit', hint: 'Points for each item in the right position', checked: q.partialCredit !== false, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } })),
    h('div', { class: 'adm-grid adm-grid--4' }, field('Label above the list', top, 'Optional'), field('Label below the list', bottom, 'Optional')));
}

function fillBlankEditor(q, redraw, changed) {
  q.blanks = Array.isArray(q.blanks) ? q.blanks : [];
  const textArea = () => document.activeElement?.closest?.('.adm-q')?.querySelector('[data-testid="q-text"]');
  const markers = h('p', { class: 'field__hint', dataset: { testid: 'blank-markers' } });
  const checkMarkers = () => {
    const marks = markerIds(q.text);
    const missing = q.blanks.filter((b) => !marks.includes(b.id)).map((b) => `{{${b.id}}}`);
    markers.textContent = missing.length ? `Add ${missing.join(', ')} to the question text where each blank goes.` : 'Each {{id}} in the question text becomes a blank for students.';
    markers.classList.toggle('field-error', missing.length > 0);
  };
  const rows = q.blanks.map((b, i) => {
    const list = Array.isArray(b.answers) ? b.answers : [];
    const ans = h('input', { class: 'input', value: list.join(', '), placeholder: 'Accepted answers, comma-separated', 'aria-label': `Blank ${i + 1} accepted answers`, dataset: { testid: `blank-answers-${i}` },
      on: { input: () => { b.answers = ans.value.split(',').map((x) => x.trim()).filter(Boolean); changed(); } } });
    const kind = h('select', { class: 'select', 'aria-label': `Blank ${i + 1} kind`, dataset: { testid: `blank-kind-${i}` }, on: { change: () => {
      b.kind = kind.value;
      if (b.kind === 'number') { b.tolerance ??= 0; b.toleranceType ??= 'absolute'; b.unit ??= ''; }
      redraw(); changed();
    } } }, BLANK_KINDS.map((k) => h('option', { value: k }, { text: 'Word / text', number: 'Number', formula: 'Formula' }[k])));
    kind.value = b.kind || 'text';
    const rm = iconButton('x', 'Remove blank', () => { q.blanks.splice(i, 1); redraw(); changed(); }, { testid: `blank-remove-${i}` });
    const row = h('div', { class: 'adm-blank' }, h('span', { class: 'adm-blank__num' }, `{{${b.id}}}`), ans, kind, rm);
    if (b.kind !== 'number') return row;
    const tol = h('input', { class: 'input', type: 'number', min: '0', step: 'any', value: b.tolerance ?? 0, 'aria-label': `Blank ${i + 1} tolerance`, on: { input: () => { b.tolerance = tol.value.trim() === '' ? 0 : Number(tol.value); changed(); } } });
    const tt = h('select', { class: 'select', 'aria-label': `Blank ${i + 1} tolerance type`, on: { change: () => { b.toleranceType = tt.value; changed(); } } },
      h('option', { value: 'absolute' }, 'Absolute (±)'), h('option', { value: 'percent' }, 'Percent (±%)'));
    tt.value = b.toleranceType || 'absolute';
    const unit = h('input', { class: 'input', value: b.unit || '', placeholder: 'Unit (optional)', 'aria-label': `Blank ${i + 1} unit`, on: { input: () => { b.unit = unit.value; changed(); } } });
    return h('div', { class: 'stack' }, row, h('div', { class: 'adm-grid adm-grid--4' }, field('Tolerance', tol), field('Tolerance type', tt), field('Unit', unit)));
  });
  const distractors = h('input', { class: 'input', value: (q.distractors || []).join(', '), placeholder: 'Extra wrong words, comma-separated', dataset: { testid: 'blank-distractors' },
    on: { input: () => { q.distractors = distractors.value.split(',').map((x) => x.trim()).filter(Boolean); changed(); } } });
  checkMarkers();
  requestAnimationFrame(() => markers.closest('.adm-q')?.addEventListener('input', checkMarkers));
  return h('div', { class: 'stack' },
    h('p', { class: 'notice notice--info' }, icon('info'), h('span', {}, 'Write the sentence in the question text and put {{b1}}, {{b2}}, … where each blank goes.')),
    h('div', { class: 'field__label' }, 'Blanks'),
    h('div', { class: 'adm-opts' }, rows),
    markers,
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-blank' }, on: { click: (e) => {
        const id = uniqueId('b', q.blanks);
        q.blanks.push({ id, answers: [], kind: 'text' });
        const ta = e.currentTarget.closest('.adm-q')?.querySelector('[data-testid="q-text"]') || textArea();
        if (ta && !markerIds(ta.value).includes(id)) {
          ta.value = `${ta.value.replace(/\s+$/, '')} {{${id}}}`;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
        redraw(); changed();
      } } }, icon('plus', { size: 16 }), 'Add blank'),
      switchEl({ label: 'Partial credit', hint: 'Points for each correct blank', checked: q.partialCredit !== false, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }),
      switchEl({ label: 'Case sensitive (text blanks)', checked: !!q.caseSensitive, testid: 'case-sensitive', onChange: (v) => { q.caseSensitive = v; changed(); } }),
      switchEl({ label: 'Word bank', hint: 'Students pick from a list instead of typing', checked: !!q.wordBank, testid: 'word-bank', onChange: (v) => { q.wordBank = v; redraw(); changed(); } })),
    q.wordBank ? field('Distractors (word bank only)', distractors, 'Wrong choices mixed into the word bank') : null,
    formatHelpField(q, changed));
}

function structureEditor(q, redraw, changed) {
  q.atoms = Array.isArray(q.atoms) ? q.atoms : [];
  q.bonds = Array.isArray(q.bonds) ? q.bonds.map((b) => bondEnds(b) || ['', '']) : [];
  if (!acceptedStructures(q).length) q.correctAnswer = { bonds: q.bonds.map(() => 1), lonePairs: {} };
  const forms = () => acceptedStructures(q);
  const key = () => forms()[0];
  for (const f of forms()) { f.bonds = Array.isArray(f.bonds) ? f.bonds : []; f.lonePairs = f.lonePairs && typeof f.lonePairs === 'object' ? f.lonePairs : {}; }

  const preview = h('div', { class: 'adm-structure-preview', dataset: { testid: 'structure-preview' } });
  const check = h('p', { class: 'field__hint', dataset: { testid: 'structure-electrons' } });
  const drawPreview = () => {
    const total = valenceTotal(q);
    const drawn = electronsDrawn(q, key());
    check.textContent = total === null ? `Correct structure uses ${drawn} electrons (electron total not checked for non-main-group atoms).`
      : drawn === total ? `✓ Correct structure uses all ${total} valence electrons.` : `Correct structure uses ${drawn} electrons, but the atoms have ${total} valence electrons. Adjust bonds or lone pairs.`;
    check.classList.toggle('field-error', total !== null && drawn !== total);
    try {
      mount(preview, forms().map((f, i) => h('div', { class: 'stack' }, h('span', { class: 'faint' }, forms().length > 1 ? `Correct form ${i + 1}` : 'Correct structure'), structureDiagram(q, f))));
    } catch {
      mount(preview, h('span', { class: 'faint' }, 'Preview appears once atoms and bonds are filled in'));
    }
  };
  const update = () => { drawPreview(); changed(); };

  const atomRows = q.atoms.map((a, i) => {
    const id = h('input', { class: 'input', value: a.id, 'aria-label': `Atom ${i + 1} id`, spellcheck: 'false', dataset: { testid: `atom-id-${i}` }, on: { change: () => {
      const old = a.id; const next = id.value.trim();
      if (!next || next === old) { id.value = old; return; }
      a.id = next;
      q.bonds = q.bonds.map((b) => b.map((x) => (x === old ? next : x)));
      for (const f of forms()) if (old in f.lonePairs) { f.lonePairs[next] = f.lonePairs[old]; delete f.lonePairs[old]; }
      redraw(); changed();
    } } });
    const sym = h('input', { class: 'input', value: a.symbol || '', maxlength: '3', 'aria-label': `Atom ${i + 1} element`, spellcheck: 'false', dataset: { testid: `atom-symbol-${i}` },
      on: { input: () => { a.symbol = normalizeSymbol(sym.value) || sym.value.trim(); update(); } } });
    const num = (k, label) => {
      const inp = h('input', { class: 'input', type: 'number', step: '0.5', value: a[k] ?? '', placeholder: 'auto', 'aria-label': `Atom ${i + 1} ${label}`, dataset: { testid: `atom-${k}-${i}` },
        on: { input: () => { if (inp.value.trim() === '') delete a[k]; else a[k] = Number(inp.value); update(); } } });
      return inp;
    };
    const lp = h('select', { class: 'select', 'aria-label': `Atom ${i + 1} lone pairs (correct)`, dataset: { testid: `atom-lp-${i}` },
      on: { change: () => { key().lonePairs[a.id] = Number(lp.value); update(); } } }, [0, 1, 2, 3, 4].map((n) => h('option', { value: String(n) }, String(n))));
    lp.value = String(key().lonePairs[a.id] ?? 0);
    const rm = iconButton('x', 'Remove atom', () => {
      q.atoms.splice(i, 1);
      const keepIdx = q.bonds.map((b, j) => (b.includes(a.id) ? -1 : j)).filter((j) => j >= 0);
      q.bonds = keepIdx.map((j) => q.bonds[j]);
      for (const f of forms()) { f.bonds = keepIdx.map((j) => f.bonds[j] ?? 1); delete f.lonePairs[a.id]; }
      redraw(); changed();
    }, { testid: `atom-remove-${i}` });
    return h('div', { class: 'adm-atom' }, id, sym, num('x', 'column (x)'), num('y', 'row (y)'), lp, rm);
  });

  const atomOptions = () => q.atoms.map((a) => h('option', { value: a.id }, `${a.symbol || '?'} (${a.id})`));
  const bondRows = q.bonds.map((b, i) => {
    const mk = (end) => {
      const sel = h('select', { class: 'select', 'aria-label': `Bond ${i + 1} atom ${end + 1}`, dataset: { testid: `bond-${end ? 'b' : 'a'}-${i}` },
        on: { change: () => { b[end] = sel.value; update(); } } }, h('option', { value: '' }, 'Atom…'), atomOptions());
      sel.value = b[end] || '';
      return sel;
    };
    const order = h('select', { class: 'select', 'aria-label': `Bond ${i + 1} correct order`, dataset: { testid: `bond-order-${i}` },
      on: { change: () => { key().bonds[i] = Number(order.value); update(); } } },
    h('option', { value: '1' }, 'Single'), h('option', { value: '2' }, 'Double'), h('option', { value: '3' }, 'Triple'));
    order.value = String(key().bonds[i] ?? 1);
    const rm = iconButton('x', 'Remove bond', () => {
      q.bonds.splice(i, 1);
      for (const f of forms()) f.bonds.splice(i, 1);
      redraw(); changed();
    }, { testid: `bond-remove-${i}` });
    return h('div', { class: 'adm-bondrow' }, mk(0), mk(1), order, rm);
  });

  const charge = h('input', { class: 'input', type: 'number', step: '1', value: q.charge ?? 0, dataset: { testid: 'structure-charge' },
    on: { input: () => { q.charge = charge.value.trim() === '' ? 0 : Number(charge.value); update(); } } });
  drawPreview();
  return h('div', { class: 'stack' },
    h('p', { class: 'notice notice--info' }, icon('info'), h('span', {},
      'Give the skeleton (atoms and which atoms are bonded) and the correct bond order and lone pairs. Students set bond orders and lone pairs themselves. ',
      'x/y place atoms on a grid (column, row); leave them empty for an automatic layout. Resonance forms can be added in JSON mode (correctAnswer as a list).')),
    forms().length > 1 ? h('p', { class: 'notice notice--warning' }, icon('alert'), h('span', {}, `This question accepts ${forms().length} resonance forms. The fields below edit form 1; edit the others in JSON mode.`)) : null,
    h('div', { class: 'field__label' }, 'Atoms'),
    h('div', { class: 'adm-atom adm-colhead', 'aria-hidden': 'true' }, h('span', {}, 'Id'), h('span', {}, 'Element'), h('span', {}, 'x'), h('span', {}, 'y'), h('span', {}, 'Lone pairs'), h('span', {})),
    h('div', { class: 'adm-opts' }, atomRows),
    h('button', { class: 'btn btn--ghost btn--sm adm-self-start', type: 'button', dataset: { testid: 'add-atom' }, on: { click: () => {
      const id = uniqueId('a', q.atoms);
      const maxX = q.atoms.reduce((m, a) => (Number.isFinite(Number(a.x)) && a.x !== '' ? Math.max(m, Number(a.x)) : m), -1);
      const atom = { id, symbol: 'H' };
      if (q.atoms.length && q.atoms.every((a) => a.x !== undefined && a.y !== undefined)) { atom.x = maxX + 1; atom.y = 0; }
      q.atoms.push(atom);
      redraw(); changed();
    } } }, icon('plus', { size: 16 }), 'Add atom'),
    h('div', { class: 'field__label' }, 'Bonds (skeleton) and the correct bond order'),
    h('div', { class: 'adm-opts' }, bondRows),
    h('button', { class: 'btn btn--ghost btn--sm adm-self-start', type: 'button', dataset: { testid: 'add-bond' }, on: { click: () => {
      q.bonds.push([q.atoms[0]?.id || '', q.atoms[1]?.id || '']);
      for (const f of forms()) f.bonds.push(1);
      redraw(); changed();
    } } }, icon('plus', { size: 16 }), 'Add bond'),
    h('div', { class: 'adm-grid adm-grid--4' }, field('Overall charge', charge, 'e.g. -1 for NO₃⁻, +1 for NH₄⁺')),
    h('div', { class: 'adm-switches' },
      switchEl({ label: 'Partial credit', hint: 'Credit for each correct bond and lone-pair count', checked: !!q.partialCredit, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }),
      switchEl({ label: 'Show electron total to students', hint: 'Counter shows “14 of 16 valence electrons drawn”', checked: !!q.showElectronCount, testid: 'structure-show-count', onChange: (v) => { q.showElectronCount = v; changed(); } })),
    check,
    preview);
}

function openEditor(q, redraw, changed) {
  q.rubric = Array.isArray(q.rubric) ? q.rubric : [];
  const sumEl = h('p', { class: 'field__hint', dataset: { testid: 'rubric-total' } });
  const fixBtn = h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: 'rubric-set-points' }, on: { click: (e) => {
    const sum = rubricSum();
    q.points = sum;
    const pts = e.currentTarget.closest('.adm-q')?.querySelector('[data-testid="q-points"]');
    if (pts) { pts.value = String(sum); pts.dispatchEvent(new Event('input', { bubbles: true })); }
    showSum(); changed();
  } } }, 'Set question points to rubric total');
  const rubricSum = () => Math.round(q.rubric.reduce((s, r) => s + (Number(r.points) || 0), 0) * 100) / 100;
  const showSum = () => {
    const sum = rubricSum();
    const ok = !q.rubric.length || sum === Number(q.points);
    sumEl.textContent = q.rubric.length ? `Rubric total: ${sum} pt${sum === 1 ? '' : 's'}${ok ? ' ✓' : ` (question is worth ${q.points})`}` : 'No rubric: you will type points freely while grading.';
    sumEl.classList.toggle('field-error', !ok);
    fixBtn.hidden = ok;
  };
  const rows = q.rubric.map((r, i) => {
    const txt = h('input', { class: 'input', value: r.text || '', placeholder: `Criterion ${i + 1}`, 'aria-label': `Rubric criterion ${i + 1}`, dataset: { testid: `rubric-text-${i}` },
      on: { input: () => { r.text = txt.value; changed(); } } });
    const pts = h('input', { class: 'input adm-points', type: 'number', min: '0', step: 'any', value: r.points ?? 1, 'aria-label': `Rubric criterion ${i + 1} points`, dataset: { testid: `rubric-points-${i}` },
      on: { input: () => { r.points = pts.value.trim() === '' ? '' : Number(pts.value); showSum(); changed(); } } });
    return h('div', { class: 'adm-opt adm-opt--plain' }, txt, pts, iconButton('x', 'Remove criterion', () => { q.rubric.splice(i, 1); redraw(); changed(); }, { testid: `rubric-remove-${i}` }));
  });
  const words = (k, label) => {
    const inp = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: q[k] ?? '', placeholder: 'None', dataset: { testid: `open-${k}` },
      on: { input: () => { q[k] = inp.value.trim() === '' ? null : Number(inp.value); changed(); } } });
    return field(label, inp);
  };
  const ta = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Model answer (optional)', dataset: { testid: 'open-sample' }, on: { input: () => { q.sampleAnswer = ta.value; changed(); } } });
  ta.value = q.sampleAnswer || '';
  requestAnimationFrame(() => sumEl.closest('.adm-q')?.querySelector('[data-testid="q-points"]')?.addEventListener('input', showSum));
  showSum();
  return h('div', { class: 'stack' },
    h('p', { class: 'notice notice--info' }, icon('info'), h('span', {}, 'Not auto-graded. In the Grading tab you tick rubric criteria (or type points) for each student.')),
    h('div', { class: 'field__label' }, 'Rubric criteria'),
    h('div', { class: 'adm-opts' }, rows),
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-rubric' }, on: { click: () => { q.rubric.push({ text: '', points: 1 }); redraw(); changed(); } } }, icon('plus', { size: 16 }), 'Add criterion'),
      fixBtn),
    sumEl,
    switchEl({ label: 'Show rubric to students', hint: 'Students see the criteria above the answer box', checked: q.showRubric !== false, testid: 'open-show-rubric', onChange: (v) => { q.showRubric = v; changed(); } }),
    h('div', { class: 'adm-grid adm-grid--4' }, words('minWords', 'Minimum words'), words('maxWords', 'Maximum words')),
    field('Sample answer', ta, 'Shown to you while grading, and to students in the review if “Show correct answers” is on.'));
}
