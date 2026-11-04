// Admin "Builder" tab: visual + JSON test editor with live validation.
// The in-memory test (S.test) is the single source of truth. Inputs mutate it directly and only
// refresh the pieces that depend on the changed value, so typing never loses focus.

import { h, mount, icon, richText, renderMath, toast, openModal, prefersReducedMotion } from '../../ui.js';
import { resourcesTable } from '../reference-pane.js';
import { CONFIG } from '../../config.js';
import { load, save } from '../../lib/storage.js';
import { saveDraft } from '../../lib/tests.js';
import { QUESTION_TYPES, TYPE_LABELS, MANUAL_TYPES, normalizeTest, validateTest, blankQuestion, nextQuestionId, blankTest } from '../../lib/schema.js';
import { groupQuestions, orderQuestions, sectionPoints, nextSectionId, nextReferenceId, REFERENCE_TYPES, REFERENCE_LABELS, DEFAULT_RESOURCES, safeImageUrl } from '../../lib/sections.js';
import { withQuestionImage } from '../question-image.js';
import { publishTest } from '../../lib/api.js';
import { hasAdminAuth } from '../../lib/admin-session.js';
import { testLink } from './library.js';
import { typeEditor } from './editors/core.js';
import { typeDef, registeredTypes } from '../../lib/qtypes/registry.js';
import { field, switchEl, copyText, downloadFile, debounce, iconButton } from './common.js';

const GUIDE_SOURCES = [
  'https://raw.githubusercontent.com/WorkableProjects/ChemistryWorks/main/docs/guide.md', // latest on main
  'docs/guide.md', // the deployed copy, if GitHub is unreachable
];

/** Fetch docs/guide.md, trying the repo first, then the deployed site. */
export async function fetchGuide() {
  let lastErr = null;
  for (const url of GUIDE_SOURCES) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.trim()) return text;
      throw new Error('empty file');
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('unavailable');
}

/** Copy the guide. Uses a promised ClipboardItem where supported so Safari keeps the click's permission across the fetch. */
async function copyGuideText() {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const text = fetchGuide();
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })]);
      return true;
    } catch {
      return copyText(await text); // rethrows a fetch error
    }
  }
  return copyText(await fetchGuide());
}

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
    const hasAuth = hasAdminAuth();
    const canPublish = valid && !!gasUrl && hasAuth;
    buttons.publish.disabled = !canPublish;
    const why = !gasUrl ? 'Set GAS_WEB_APP_URL in js/config.js to publish to the Google Sheet.'
      : !hasAuth ? 'Enter your admin key in Settings to publish.' : !valid ? reason : '';
    buttons.publish.title = why || 'Publish to the Google Sheet';
    publishNote.textContent = why && valid ? why : '';
  }
  const changed = () => { persistSoon(); refreshValidation(); updateSectionLabels(); };

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
        const res = await publishTest(t, { gasUrl });
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

  // ----- copy the authoring guide (docs/guide.md) -----
  const guideBtn = h('button', {
    class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'builder-copy-guide' },
    title: 'Copy docs/guide.md (latest from the repo) to the clipboard',
    on: { click: () => copyGuide() },
  }, icon('copy', { size: 16 }), 'Copy guide');
  async function copyGuide() {
    if (guideBtn.disabled) return;
    guideBtn.disabled = true;
    guideBtn.classList.add('is-loading');
    try {
      const ok = await copyGuideText();
      toast(ok ? 'Guide copied to clipboard' : 'Could not copy the guide', { type: ok ? 'success' : 'error' });
    } catch (e) {
      toast('Could not load the guide: ' + (e && e.message ? e.message : 'unavailable'), { type: 'error', timeout: 5000 });
    } finally {
      guideBtn.disabled = false;
      guideBtn.classList.remove('is-loading');
    }
  }

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
        sw('shuffleOptions', 'Shuffle options', 'Multiple choice / select / matching', false),
        sw('showResults', 'Show score to students', 'Off: students only see “Submission received”. Grade in the Grading tab.', true),
        sw('showCorrectAnswers', 'Show correct answers', 'Review with explanations (only when the score is shown)', true),
        sw('allowModeToggle', 'Allow layout toggle', 'Focus / scroll switch', true),
        sw('gameMode', 'Allow game mode', 'Practice game option; scores not submitted', false),
        sw('singleSubmission', 'One submission per student', 'Blocks a second submission from the same email. Use Grading → Allow retake for exceptions.', false),
        sw('requireAllQuestions', 'All questions required', 'Students must answer every question before they can submit. Or mark single questions Required below.', false)),
    );
  }

  S.test.sections = Array.isArray(S.test.sections) ? S.test.sections : [];
  S.test.references = Array.isArray(S.test.references) ? S.test.references : [];

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

  // ----- sections (V2-04) -----
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const sectionSummary = (id) => {
    const n = S.test.questions.filter((q) => q.section === id).length;
    return `${plural(sectionPoints(S.test, id), 'pt', 'pts')} · ${plural(n, 'question', 'questions')}`;
  };
  const sectionTitleOf = (s, i) => (String(s.title || '').trim() || `Section ${i + 1}`);
  const sectionKey = (q) => (q && q.section && (S.test.sections || []).some((s) => s.id === q.section) ? q.section : '');

  /** Cheap in-place refresh of everything that shows a section title or total (no re-render, keeps focus). */
  function updateSectionLabels() {
    const secs = S.test.sections || [];
    secs.forEach((s, i) => {
      const pts = root.querySelector(`[data-testid="section-points-${i}"]`);
      if (pts) pts.textContent = sectionSummary(s.id);
    });
    if (!listEl) return;
    listEl.querySelectorAll('.adm-qgroup').forEach((g) => {
      const id = g.dataset.section;
      const i = secs.findIndex((s) => s.id === id);
      if (i < 0) return;
      g.querySelector('.adm-qgroup__title').textContent = sectionTitleOf(secs[i], i);
      g.querySelector('.adm-qgroup__pts').textContent = sectionSummary(id);
    });
    listEl.querySelectorAll('[data-testid="q-section"]').forEach((sel) => fillSectionSelect(sel, sel.value));
  }
  function fillSectionSelect(sel, value) {
    const secs = S.test.sections || [];
    mount(sel, h('option', { value: '' }, 'No section'), secs.map((s, i) => h('option', { value: s.id }, sectionTitleOf(s, i))));
    sel.value = secs.some((s) => s.id === value) ? value : '';
  }

  function renderList() {
    S.test.questions = orderQuestions(S.test);
    const secs = S.test.sections || [];
    const nodes = [];
    if (secs.length) {
      for (const g of groupQuestions(S.test)) {
        const id = g.section ? g.section.id : '';
        const i = g.section ? secs.findIndex((s) => s.id === id) : -1;
        const head = h('div', { class: 'adm-qgroup', dataset: { testid: `builder-section-${id || 'none'}`, section: id } },
          h('strong', { class: 'adm-qgroup__title' }, g.section ? sectionTitleOf(g.section, i) : 'No section'),
          g.section ? h('span', { class: 'adm-qgroup__pts muted' }, sectionSummary(id)) : null);
        nodes.push(head);
        g.questions.forEach((q) => nodes.push(buildEditor(q, S.test.questions.indexOf(q))));
      }
    } else {
      S.test.questions.forEach((q, i) => nodes.push(buildEditor(q, i)));
    }
    mount(listEl, nodes);
    renumber();
    renderMath(listEl);
  }

  function sectionsCard() {
    const body = h('div', { class: 'stack adm-secrows' });
    const redrawAll = () => { S.test.questions = orderQuestions(S.test); draw(); if (listEl) renderList(); changed(); };
    function draw() {
      const secs = S.test.sections;
      mount(body, secs.length ? secs.map((s, i) => {
        const title = h('input', { class: 'input', value: s.title || '', placeholder: `Section ${i + 1}`, 'aria-label': `Section ${i + 1} title`, dataset: { testid: `section-title-${i}` },
          on: { input: () => { s.title = title.value; changed(); } } });
        const ins = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Instructions shown above this section (optional). $…$ math is allowed.', 'aria-label': `Section ${i + 1} instructions`, dataset: { testid: `section-instructions-${i}` },
          on: { input: () => { s.instructions = ins.value; changed(); } } });
        ins.value = s.instructions || '';
        const mv = (d) => {
          const j = i + d;
          if (j < 0 || j >= secs.length) return;
          [secs[i], secs[j]] = [secs[j], secs[i]];
          redrawAll();
          body.querySelector(`[data-testid="section-${d < 0 ? 'up' : 'down'}-${j}"]`)?.focus({ preventScroll: true });
        };
        return h('div', { class: 'adm-sec', dataset: { testid: 'section-row', section: s.id } },
          h('div', { class: 'adm-sec__top' },
            field(`Section ${i + 1} title`, title),
            h('span', { class: 'pill adm-sec__pts', dataset: { testid: `section-points-${i}` } }, sectionSummary(s.id)),
            h('div', { class: 'adm-q__actions' },
              iconButton('up', 'Move section up', () => mv(-1), { testid: `section-up-${i}`, disabled: i === 0 }),
              iconButton('down', 'Move section down', () => mv(1), { testid: `section-down-${i}`, disabled: i === secs.length - 1 }),
              iconButton('trash', 'Delete section', () => confirmDialog({
                title: `Delete “${sectionTitleOf(s, i)}”?`, body: 'Its questions are kept and become unsectioned.', testid: 'confirm-delete-section',
                onConfirm: () => {
                  secs.splice(i, 1);
                  for (const q of S.test.questions) if (q.section === s.id) delete q.section;
                  redrawAll();
                },
              }), { testid: `section-delete-${i}`, className: 'icon-btn--danger' }))),
          field(`Section ${i + 1} instructions`, ins));
      }) : h('p', { class: 'muted adm-sec__empty' }, 'No sections. Questions are shown in one list.'));
    }
    draw();
    return h('section', { class: 'card adm-settings', 'aria-label': 'Sections', dataset: { testid: 'sections-editor' } },
      h('div', { class: 'row row--wrap' }, h('h3', { class: 'adm-h3' }, 'Sections'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-section' }, on: { click: () => {
          const secs = S.test.sections;
          secs.push({ id: nextSectionId(secs), title: `Section ${secs.length + 1}`, instructions: '' });
          redrawAll();
          body.querySelector(`[data-testid="section-title-${secs.length - 1}"]`)?.focus();
        } } }, icon('plus', { size: 16 }), 'Add section')),
      h('p', { class: 'field__hint' }, 'Group questions under named headings with instructions. Section totals are calculated from their questions.'),
      body);
  }

  // ----- references (V2-02) -----
  function referencesCard() {
    const body = h('div', { class: 'stack adm-secrows' });
    const addBtns = {};
    function draw() {
      const refs = S.test.references;
      addBtns['periodic-table'].disabled = refs.some((r) => r.type === 'periodic-table');
      mount(body, refs.length ? refs.map((r, i) => {
        const title = h('input', { class: 'input', value: r.title || '', placeholder: r.type === 'periodic-table' ? 'Periodic table' : 'Title', 'aria-label': `Reference ${i + 1} title`, dataset: { testid: `ref-title-${i}` },
          on: { input: () => { r.title = title.value; changed(); } } });
        let extra = null;
        if (r.type === 'text') {
          const ta = h('textarea', { class: 'textarea', rows: 3, placeholder: 'e.g. $R = 8.314$ J/(mol·K)', 'aria-label': `Reference ${i + 1} content`, dataset: { testid: `ref-content-${i}` },
            on: { input: () => { r.content = ta.value; changed(); } } });
          ta.value = r.content || '';
          extra = field('Content', ta, 'Math with $…$ is supported.');
        } else if (r.type === 'resources') {
          r.items = Array.isArray(r.items) ? r.items : [];
          const rows = h('div', { class: 'stack adm-consts' });
          const prev = h('div', { class: 'adm-richprev adm-consts__prev', 'aria-label': 'Resources preview (as students see it)' });
          const drawPrev = () => {
            const shown = r.items.filter((it) => (it.name || '').trim() || (it.value || '').trim());
            mount(prev, shown.length ? resourcesTable({ ...r, items: shown }, { testid: `resources-preview-${i}` }) : h('span', { class: 'faint' }, 'Preview appears here'));
            renderMath(prev);
          };
          const drawPrevSoon = debounce(drawPrev, 200);
          cleanups.push(() => drawPrevSoon.cancel());
          const drawRows = () => mount(rows, r.items.map((it, k) => {
            const inp = (key, ph, label) => {
              const el = h('input', { class: `input adm-consts__${key}`, value: it[key] || '', placeholder: ph, 'aria-label': `Resource ${k + 1} ${label}`, dataset: { testid: `const-${key}-${i}-${k}` },
                on: { input: () => { it[key] = el.value; drawPrevSoon(); changed(); } } });
              return el;
            };
            return h('div', { class: 'adm-consts__row' },
              inp('name', 'Name, e.g. Molar mass of $\\ce{H2O}$', 'name'), inp('value', 'Value, e.g. $6.02 \\times 10^{23}$', 'value'), inp('unit', 'Unit, e.g. mol$^{-1}$', 'unit'),
              iconButton('trash', 'Delete resource', () => { r.items.splice(k, 1); drawRows(); drawPrev(); changed(); }, { testid: `const-delete-${i}-${k}`, className: 'icon-btn--danger' }));
          }));
          drawRows();
          drawPrev();
          const addRow = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `const-add-${i}` },
            on: { click: () => { r.items.push({ name: '', value: '', unit: '' }); drawRows(); changed(); } } }, icon('plus', { size: 16 }), 'Add resource');
          extra = h('div', { class: 'stack' }, rows, h('div', { class: 'row row--wrap' }, addRow,
            h('span', { class: 'field__hint' }, 'Use the exact values your class uses. LaTeX works in every column, like question text: $…$ for math, $\\ce{…}$ for chemistry.')),
            h('span', { class: 'field__label' }, 'Preview'), prev);
        } else if (r.type === 'image') {
          const prev = h('div', { class: 'adm-refprev' });
          const drawPrev = () => {
            const u = safeImageUrl(r.url);
            mount(prev, u ? h('img', { src: u, alt: r.alt || '', class: 'adm-refprev__img' }) : h('span', { class: 'faint' }, 'Preview appears for https:// or site-relative image URLs'));
          };
          const url = h('input', { class: 'input', value: r.url || '', placeholder: 'https://…/chart.png', 'aria-label': `Reference ${i + 1} image URL`, dataset: { testid: `ref-url-${i}` },
            on: { input: () => { r.url = url.value; drawPrev(); changed(); } } });
          const alt = h('input', { class: 'input', value: r.alt || '', placeholder: 'Describe the image for screen readers', 'aria-label': `Reference ${i + 1} alt text`, dataset: { testid: `ref-alt-${i}` },
            on: { input: () => { r.alt = alt.value; drawPrev(); changed(); } } });
          drawPrev();
          extra = h('div', { class: 'stack' }, h('div', { class: 'adm-grid' }, field('Image URL', url, 'https:// or a path on this site'), field('Alt text', alt, 'Required')), prev);
        }
        const mv = (d) => {
          const j = i + d;
          if (j < 0 || j >= refs.length) return;
          [refs[i], refs[j]] = [refs[j], refs[i]];
          draw(); changed();
          body.querySelector(`[data-testid="ref-${d < 0 ? 'up' : 'down'}-${j}"]`)?.focus({ preventScroll: true });
        };
        return h('div', { class: 'adm-sec', dataset: { testid: 'reference-row', type: r.type } },
          h('div', { class: 'adm-sec__top' },
            field(`${REFERENCE_LABELS[r.type] || r.type} title`, title, r.type === 'periodic-table' ? 'Optional' : null),
            h('span', { class: 'pill' }, REFERENCE_LABELS[r.type] || r.type),
            h('div', { class: 'adm-q__actions' },
              iconButton('up', 'Move reference up', () => mv(-1), { testid: `ref-up-${i}`, disabled: i === 0 }),
              iconButton('down', 'Move reference down', () => mv(1), { testid: `ref-down-${i}`, disabled: i === refs.length - 1 }),
              iconButton('trash', 'Delete reference', () => { refs.splice(i, 1); draw(); changed(); }, { testid: `ref-delete-${i}`, className: 'icon-btn--danger' }))),
          extra);
      }) : h('p', { class: 'muted adm-sec__empty' }, 'No reference resources.'));
    }
    const add = (type) => {
      const refs = S.test.references;
      const ref = { id: nextReferenceId(refs), type, title: '' };
      if (type === 'text') ref.content = '';
      if (type === 'resources') { ref.title = 'Resources'; ref.items = DEFAULT_RESOURCES.map((c) => ({ ...c })); }
      if (type === 'image') { ref.url = ''; ref.alt = ''; }
      refs.push(ref);
      draw(); changed();
      body.querySelector(`[data-testid="ref-title-${refs.length - 1}"]`)?.focus();
    };
    const addBtn = (type, label) => {
      const b = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `add-reference-${type}` }, on: { click: () => add(type) } }, icon('plus', { size: 16 }), label);
      addBtns[type] = b;
      return b;
    };
    const buttons = REFERENCE_TYPES.map((t) => addBtn(t, { 'periodic-table': 'Periodic table', resources: 'Resources', text: 'Text', image: 'Image' }[t]));
    S.test.references = Array.isArray(S.test.references) ? S.test.references : [];
    const card = h('section', { class: 'card adm-settings', 'aria-label': 'References', dataset: { testid: 'references-editor' } },
      h('div', { class: 'row row--wrap' }, h('h3', { class: 'adm-h3' }, 'References'), h('span', { class: 'spacer' }), h('div', { class: 'row row--wrap' }, buttons)),
      h('p', { class: 'field__hint' }, 'Shown to students in a side pane while they take the test.'),
      body);
    draw();
    return card;
  }

  function moveQuestion(i, dir) {
    const j = i + dir;
    const qs = S.test.questions;
    if (j < 0 || j >= qs.length || sectionKey(qs[i]) !== sectionKey(qs[j])) return;
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
    const last = S.test.questions[S.test.questions.length - 1];
    if (last && sectionKey(last)) q.section = last.section;
    S.test.questions.push(q);
    S.test.questions = orderQuestions(S.test);
    S.open.add(q);
    renderList();
    const el = editors()[S.test.questions.indexOf(q)];
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
    const secSel = h('select', { class: 'select', dataset: { testid: 'q-section' }, on: { change: () => {
      if (secSel.value) q.section = secSel.value; else delete q.section;
      S.test.questions = orderQuestions(S.test);
      S.open.add(q);
      renderList();
      changed();
      editors()[S.test.questions.indexOf(q)]?.querySelector('[data-testid="q-section"]')?.focus({ preventScroll: true });
    } } });
    fillSectionSelect(secSel, q.section || '');
    const text = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Question text. Use $…$ for math, e.g. $\\ce{H2SO4}$', dataset: { testid: 'q-text' } });
    text.value = q.text || '';
    const richPrev = h('div', { class: 'adm-richprev', 'aria-label': 'Question preview' });
    const drawPreview = () => {
      richPrev.classList.toggle('is-empty', !q.text);
      mount(richPrev, withQuestionImage(q, q.text ? richText(q.text, 'div') : h('span', { class: 'faint' }, 'Preview appears here')));
      renderMath(richPrev);
    };
    const drawPreviewSoon = debounce(drawPreview, 200);
    cleanups.push(() => drawPreviewSoon.cancel());
    text.addEventListener('input', () => { q.text = text.value; updateHead(); drawPreviewSoon(); changed(); });
    const expl = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Shown to students in the review (optional)', dataset: { testid: 'q-explanation' } });
    expl.value = q.explanation || '';
    expl.addEventListener('input', () => { q.explanation = expl.value; changed(); });

    // Optional image shown alongside the question text.
    const imgUrl = h('input', { class: 'input', value: q.image?.url || '', placeholder: 'https://… or images/diagram.png', autocomplete: 'off', spellcheck: 'false', dataset: { testid: 'q-image-url' } });
    const imgAlt = h('input', { class: 'input', type: 'text', value: q.image?.alt || '', placeholder: 'Describe the image for screen readers', dataset: { testid: 'q-image-alt' } });
    const imgPos = h('select', { class: 'select', dataset: { testid: 'q-image-position' } },
      h('option', { value: 'right' }, 'Right of the text'), h('option', { value: 'left' }, 'Left of the text'), h('option', { value: 'below' }, 'Below the text'));
    imgPos.value = q.image?.position || 'right';
    const syncImage = () => {
      const url = imgUrl.value.trim();
      if (url) q.image = { url, alt: imgAlt.value, position: imgPos.value };
      else delete q.image;
      drawPreviewSoon();
      changed();
    };
    for (const el of [imgUrl, imgAlt]) el.addEventListener('input', syncImage);
    imgPos.addEventListener('change', syncImage);

    const typeSection = h('div', { class: 'adm-typesec' });
    // "Label the diagram" manages its own picture (link, upload, paste, drop) inside its editor, so the generic
    // image row is hidden for it; when switching back to another type the row is refreshed from q.image.
    const drawType = () => {
      const hot = q.type === 'hotspot';
      if (imgRow) {
        imgRow.hidden = hot;
        if (!hot) { imgUrl.value = q.image?.url || ''; imgAlt.value = q.image?.alt || ''; imgPos.value = q.image?.position || 'right'; }
      }
      mount(typeSection, typeEditor(q, drawType, changed, uid));
      renderMath(typeSection);
    };
    let imgRow = null;

    const inner = h('div', { class: 'adm-q__inner' },
      h('div', { class: 'adm-grid adm-grid--idsec' }, field('ID', idInput), field('Points', pts), field('Section', secSel)),
      field('Question text', text),
      (imgRow = h('div', { class: 'adm-grid adm-grid--idsec', hidden: q.type === 'hotspot' }, field('Image (optional)', imgUrl), field('Image description', imgAlt), field('Image position', imgPos))),
      richPrev,
      typeSection,
      field('Explanation', expl),
      switchEl({ label: 'Required', hint: 'The student must answer this question before submitting (all questions are required when “All questions required” is on).',
        checked: !!q.required, testid: 'q-required',
        onChange: (v) => { if (v) q.required = true; else delete q.required; updateHead(); changed(); } }));
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
      const qs = S.test.questions;
      upBtn.disabled = k === 0 || sectionKey(qs[k - 1]) !== sectionKey(q);
      downBtn.disabled = k === total - 1 || sectionKey(qs[k + 1]) !== sectionKey(q);
    };
    updateHead();
    drawPreview();
    drawType();
    sync();
    el._setIndex(index, S.test.questions.length);
    return el;
  }

  // ----- add-question menu -----
  // Compact picker: types grouped into four categories in a two-column grid, short labels, a filter box,
  // and a "Teacher" tag instead of "(teacher graded)" in the name. Full names stay in the tooltip.
  const TYPE_GROUPS = [
    { title: 'Basics', types: ['mcq', 'multi', 'truefalse', 'numeric', 'short', 'open'] },
    { title: 'Match & sort', types: ['matching', 'ordering', 'fillblank', 'categorize'] },
    { title: 'Chemistry', types: ['formula', 'balance', 'econfig', 'sigfigs', 'ptable', 'orbital'] },
    { title: 'Diagrams & graphs', types: ['lewis', 'structure', 'hotspot', 'graph'] },
  ];
  const SHORT_LABELS = {
    truefalse: 'True / False', fillblank: 'Fill in blanks', categorize: 'Sort into groups', formula: 'Formula',
    balance: 'Balance equation', econfig: 'Electron config', sigfigs: 'Sig figs', ptable: 'Periodic table pick',
    orbital: 'Orbital diagram', short: 'Short answer', open: 'Open response', lewis: 'Lewis dots',
    structure: 'Lewis structure', hotspot: 'Label diagram', graph: 'Graph',
  };
  // V4-03: registered v4 types join their group and bring their own short label.
  for (const t of registeredTypes().filter((x) => QUESTION_TYPES.includes(x))) {
    const d = typeDef(t);
    const g = TYPE_GROUPS.find((x) => x.title === d.group);
    if (g && !g.types.includes(t)) g.types.push(t);
    if (d.shortLabel) SHORT_LABELS[t] = d.shortLabel;
  }
  function addMenu() {
    let open = false;
    const grouped = new Set(TYPE_GROUPS.flatMap((g) => g.types));
    const groups = [...TYPE_GROUPS, { title: 'More', types: QUESTION_TYPES.filter((t) => !grouped.has(t)) }]
      .map((g) => ({ ...g, types: g.types.filter((t) => QUESTION_TYPES.includes(t)) })).filter((g) => g.types.length);
    const items = [];
    const groupEls = groups.map((g) => {
      const btns = g.types.map((t) => {
        const b = h('button', { class: 'adm-menu__item', type: 'button', role: 'menuitem', title: TYPE_LABELS[t], dataset: { testid: `add-question-${t}` },
          on: { click: () => { setOpen(false); addQuestion(t); } } },
        h('span', {}, SHORT_LABELS[t] || TYPE_LABELS[t]),
        MANUAL_TYPES.includes(t) ? h('span', { class: 'adm-menu__tag' }, 'Teacher') : null);
        b._search = `${TYPE_LABELS[t]} ${SHORT_LABELS[t] || ''} ${t} ${g.title}`.toLowerCase();
        items.push(b);
        return b;
      });
      const el = h('div', { class: 'adm-menu__group', role: 'group', 'aria-label': g.title },
        h('div', { class: 'adm-menu__heading', 'aria-hidden': 'true' }, g.title), btns);
      el._btns = btns;
      return el;
    });
    const empty = h('p', { class: 'adm-menu__empty faint', hidden: true }, 'No matching question type.');
    const search = h('input', { class: 'input adm-menu__search', type: 'search', placeholder: 'Filter types…', 'aria-label': 'Filter question types', autocomplete: 'off', dataset: { testid: 'add-question-filter' },
      on: { input: () => filter() } });
    const visibleItems = () => items.filter((b) => !b.hidden);
    function filter() {
      const q = search.value.trim().toLowerCase();
      for (const b of items) b.hidden = !!q && !b._search.includes(q);
      for (const g of groupEls) g.hidden = g._btns.every((b) => b.hidden);
      empty.hidden = visibleItems().length > 0;
    }
    const menu = h('div', { class: 'adm-menu adm-menu--types', role: 'menu', 'aria-label': 'Question types', hidden: true, on: { keydown: (e) => {
      if (e.key === 'Enter' && e.target === search) { e.preventDefault(); visibleItems()[0]?.click(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const list = visibleItems();
      if (!list.length) return;
      const i = list.indexOf(document.activeElement);
      const nextI = e.key === 'ArrowDown' ? (i + 1) % list.length : i <= 0 ? list.length - 1 : i - 1;
      list[nextI].focus();
    } } }, search, h('div', { class: 'adm-menu__grid' }, groupEls), empty);
    const trigger = h('button', { class: 'btn btn--ghost', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', dataset: { testid: 'add-question' },
      on: { click: (e) => { e.stopPropagation(); setOpen(!open); } } }, icon('plus', { size: 16 }), 'Add question');
    function setOpen(v) {
      open = v;
      menu.hidden = !v;
      trigger.setAttribute('aria-expanded', String(v));
      if (v) { search.value = ''; filter(); search.focus({ preventScroll: true }); }
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
      sectionsCard(),
      referencesCard(),
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
    h('div', { class: 'adm-builder__col' }, h('div', { class: 'adm-toolbar' }, segEl, h('span', { class: 'spacer' }), guideBtn), mainEl),
    side));
  renderMain();
  refreshValidation();

  return () => {
    persistSoon.cancel();
    persistNow();
    cleanups.forEach((fn) => fn());
  };
}
