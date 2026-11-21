// Builder import and export helpers: the authoring guide, the JSON editing mode and the "Import JSON" file input.

import { h, icon, toast, openModal } from '../../../ui.js';
import { normalizeTest, blankTest } from '../../../lib/schema.js';
import { mapTagNames, applyTagNames } from '../../../lib/importers.js';
import { listLocal, sheetTags, sheetTagsResource, createTag } from '../../../lib/tags.js';
import { hasAdminAuth } from '../../../lib/admin-session.js';
import { copyText } from '../common.js';
import { S, openDefaults, persistNow, setBuilderTest } from './state.js';

/** Asks what to do with imported tag names nothing matched. Resolves { name: id } (new local tags) or {} (leave them out). */
function unmatchedTagsDialog(names) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    openModal({
      title: 'Some tags are new', testid: 'import-tags-modal',
      body: h('div', { class: 'stack' },
        h('p', {}, `${names.length === 1 ? 'This tag is' : 'These tags are'} in the file but not in your tags or on the Sheet:`),
        h('ul', { dataset: { testid: 'import-tags-list' } }, names.map((n) => h('li', {}, n))),
        h('p', { class: 'faint' }, 'Create them as local tags on this device, or leave them out.')),
      onClose: () => done({}),
      actions: [
        { label: 'Leave them out', variant: 'ghost', testid: 'import-tags-skip', onClick: (close) => { close(); } },
        { label: `Create ${names.length === 1 ? 'tag' : 'tags'}`, variant: 'primary', testid: 'import-tags-create', onClick: (close) => {
          const ids = {};
          for (const n of names) { try { ids[n] = createTag({ name: n }).id; } catch { /* empty name: left out */ } }
          done(ids);
          close();
        } },
      ],
    });
  });
}

/** Maps tag names in an imported test to ids (local tags, then Sheet tags) and asks about the rest. Resolves the new test. */
export async function settleImportedTags(parsed, bc) {
  const res = bc?.gasUrl && hasAdminAuth() ? sheetTagsResource(bc.gasUrl) : null;
  if (res) await res.get().catch(() => {});
  const { test, unmatched } = mapTagNames(parsed, { local: listLocal(), sheet: sheetTags() });
  if (!unmatched.length) return test;
  return applyTagNames(test, await unmatchedTagsDialog(unmatched));
}

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

/** The "Copy guide" button. */
export function guideButton() {
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
  return guideBtn;
}

/** The "Import JSON" file input. Loads the file into the builder and redraws. */
export function importFileInput(bc) {
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'adm-file', 'aria-label': 'Import test JSON file', dataset: { testid: 'import-json' },
    on: { change: async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      try {
        const parsed = JSON.parse(await f.text());
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The file must contain a test object.');
        setBuilderTest(normalizeTest(await settleImportedTags(parsed, bc)));
        toast(`Imported ${S.test.code || 'test'}`, { type: 'success' });
        bc.renderMain();
        bc.refreshValidation();
      } catch (e) {
        toast(`Import failed: ${e.message}`, { type: 'error', timeout: 5000 });
      }
      fileInput.value = '';
    } } });
  return fileInput;
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

/** Loads the JSON text into the builder. Returns false (and shows the error) when it is not a valid test object. */
export function applyJson(bc, { silent = false } = {}) {
  const { jsonText, jsonErrEl } = bc;
  const text = jsonText.value;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Top level must be a test object { … }.');
    const { test: mapped, unmatched } = mapTagNames(parsed, { local: listLocal(), sheet: sheetTags() });
    S.test = { ...blankTest(), ...normalizeTest(mapped) };
    openDefaults();
    persistNow();
    jsonText.value = JSON.stringify(S.test, null, 2);
    jsonText.dataset.base = jsonText.value;
    jsonErrEl.textContent = '';
    jsonText.classList.remove('is-invalid');
    bc.refreshValidation();
    if (!silent) toast('JSON applied', { type: 'success' });
    if (unmatched.length) {
      // Names stay in the JSON until the teacher decides; then the builder is updated in place.
      unmatchedTagsDialog(unmatched).then((ids) => {
        S.test = { ...blankTest(), ...normalizeTest(applyTagNames(S.test, ids)) };
        persistNow();
        if (jsonText.isConnected) { jsonText.value = JSON.stringify(S.test, null, 2); jsonText.dataset.base = jsonText.value; }
        bc.refreshValidation();
        bc.onTagsChanged?.();
      });
    }
    return true;
  } catch (e) {
    jsonErrEl.textContent = e instanceof SyntaxError ? jsonErrorMessage(e, text) : e.message;
    jsonText.classList.add('is-invalid');
    jsonText.classList.add('shake');
    setTimeout(() => jsonText.classList.remove('shake'), 400);
    return false;
  }
}

/** True when the JSON textarea holds edits that were not applied. */
export function jsonHasEdits(bc) {
  return !!bc.jsonText && bc.jsonText.value !== bc.jsonText.dataset.base;
}

/** The JSON editing card. The textarea and its error line are kept on the builder context. */
export function renderJson(bc) {
  const base = JSON.stringify(S.test, null, 2);
  const jsonText = h('textarea', { class: 'textarea textarea--code adm-json', spellcheck: 'false', 'aria-label': 'Test JSON', dataset: { testid: 'json-textarea', base } });
  jsonText.value = base;
  const jsonErrEl = h('p', { class: 'field-error', role: 'alert' });
  bc.jsonText = jsonText;
  bc.jsonErrEl = jsonErrEl;
  const reset = () => {
    jsonText.value = JSON.stringify(S.test, null, 2);
    jsonText.dataset.base = jsonText.value;
    jsonErrEl.textContent = '';
    jsonText.classList.remove('is-invalid');
  };
  return h('div', { class: 'card adm-json-card' },
    h('div', { class: 'row row--wrap' },
      h('h3', { class: 'adm-h3' }, 'Test JSON'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: reset } }, icon('refresh', { size: 16 }), 'Reset to builder'),
      h('button', { class: 'btn btn--primary btn--sm', type: 'button', on: { click: () => applyJson(bc) }, dataset: { testid: 'apply-json' } }, icon('check', { size: 16 }), 'Apply JSON')),
    h('p', { class: 'field__hint' }, 'Edit the whole test as JSON. Press Apply to load it into the builder (defaults are filled in automatically).'),
    jsonText, jsonErrEl);
}
