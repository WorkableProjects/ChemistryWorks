// Builder side panel: live validation, and the save, preview, download, copy and publish actions.

import { h, mount, icon, toast } from '../../../ui.js';
import { saveDraft } from '../../../lib/tests.js';
import { publishTest } from '../../../lib/api.js';
import { hasAdminAuth } from '../../../lib/admin-session.js';
import { testLink } from '../library.js';
import { copyText, downloadFile } from '../common.js';
import { S, persistNow, safeValidate, normalizedOrNull, totalPoints } from './state.js';
import { focusQuestion } from './questions.js';
import { importFileInput } from './import.js';
import { validateTest } from '../../../lib/schema.js';
import { tagDefsFor, markOnSheet, knownTagIds, sheetTagsResource } from '../../../lib/tags.js';

/** Warnings (never errors) about tag ids this device and the Sheet do not know. */
function tagWarnings() {
  try {
    const t = normalizedOrNull();
    return t ? validateTest(t, { knownTagIds: knownTagIds() }).warnings || [] : [];
  } catch { return []; }
}

/** Shows the student link under the buttons after a successful publish. */
function showLink(linkBox, code) {
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

function validationList(bc, errors) {
  if (!errors.length) return null;
  return h('ul', { class: 'adm-validation__list' }, errors.map((e) => {
    const m = /^Question (\d+)/.exec(e);
    return h('li', {}, m && S.mode === 'visual'
      ? h('button', { class: 'adm-validation__link', type: 'button', on: { click: () => focusQuestion(bc, Number(m[1]) - 1) } }, e)
      : e);
  }));
}

function warningList(warnings) {
  if (!warnings.length) return null;
  return h('div', { class: 'adm-validation__warn', dataset: { testid: 'validation-warnings' } },
    h('strong', {}, `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`),
    h('ul', { class: 'adm-validation__list' }, warnings.map((w) => h('li', {}, w))));
}

/** Re-runs validation and updates the box, the summary line and which buttons are enabled. */
function makeRefreshValidation(bc, parts) {
  const { validationBox, summaryEl, publishNote, buttons } = parts;
  return function refreshValidation() {
    bc.lastValidation = safeValidate(S.test);
    const { valid, errors } = bc.lastValidation;
    validationBox.dataset.count = String(errors.length);
    validationBox.classList.toggle('is-valid', valid);
    mount(validationBox,
      h('div', { class: 'adm-validation__head' },
        icon(valid ? 'check' : 'alert', { size: 18 }),
        h('strong', {}, valid ? 'Ready to publish ✓' : `${errors.length} issue${errors.length === 1 ? '' : 's'} to fix`)),
      validationList(bc, errors),
      warningList(tagWarnings()));
    const n = S.test.questions.length;
    summaryEl.textContent = `${n} question${n === 1 ? '' : 's'} · ${totalPoints(S.test)} point${totalPoints(S.test) === 1 ? '' : 's'}`;
    const reason = valid ? '' : 'Fix the validation issues first';
    for (const k of ['save', 'preview']) {
      buttons[k].disabled = !valid;
      buttons[k].title = reason || (k === 'save' ? 'Save a draft on this device' : 'Preview as a student');
    }
    const canPublish = valid && !!bc.gasUrl && hasAdminAuth();
    buttons.publish.disabled = !canPublish;
    const why = !bc.gasUrl ? 'Set GAS_WEB_APP_URL in js/config.js to publish to the Google Sheet.'
      : !hasAdminAuth() ? 'Enter your admin key in Settings to publish.' : !valid ? reason : '';
    buttons.publish.title = why || 'Publish to the Google Sheet';
    publishNote.textContent = why && valid ? why : '';
  };
}

/** `unknown_tag`: nothing was published. Lists the questions that use the missing tags, each a link to the question. */
function showUnknownTags(bc, parts, test, ids) {
  const bad = new Set(ids);
  const rows = test.questions.map((q, i) => ({ q, i })).filter(({ q }) => (q.tags || []).some((id) => bad.has(id)));
  mount(parts.tagError,
    h('strong', {}, 'Not published: some tags are not on this device or the Sheet.'),
    h('ul', { class: 'adm-validation__list' }, rows.map(({ i }) => h('li', {},
      S.mode === 'visual'
        ? h('button', { class: 'adm-validation__link', type: 'button', dataset: { testid: `unknown-tag-q${i + 1}` }, on: { click: () => focusQuestion(bc, i) } }, `Question ${i + 1}`)
        : `Question ${i + 1}`))),
    h('span', { class: 'field__hint' }, 'Remove the tag from those questions, or create it again, then publish.'));
  parts.tagError.hidden = false;
  toast('Publish failed: some tags are missing', { type: 'error', timeout: 6000 });
}

async function publish(bc, parts) {
  const { buttons, linkBox } = parts;
  const t = normalizedOrNull();
  if (!t || !bc.lastValidation.valid) return;
  buttons.publish.classList.add('is-loading');
  buttons.publish.disabled = true;
  parts.tagError.hidden = true;
  try {
    const res = await publishTest(t, { gasUrl: bc.gasUrl, tagDefs: tagDefsFor(t) });
    if (res.ok) markOnSheet(res.tags);
    if (!res.ok && res.error === 'unknown_tag') showUnknownTags(bc, parts, t, res.ids || []);
    else toast(res.ok ? `Published ${t.code}` : `Publish failed: ${res.error || 'unknown error'}`, { type: res.ok ? 'success' : 'error', timeout: res.ok ? 3200 : 6000 });
    if (res.ok) {
      showLink(linkBox, t.code);
      if (t.questions.some((q) => q.tags?.length)) sheetTagsResource(bc.gasUrl).refresh().then(() => bc.onTagsChanged?.());
    }
  } catch (e) {
    toast(`Publish failed: ${e.message}`, { type: 'error', timeout: 6000 });
  } finally {
    buttons.publish.classList.remove('is-loading');
    bc.refreshValidation();
  }
}

function buildActions(bc, parts) {
  const { buttons } = parts;
  const btn = (key, label, iconName, variant, onClick, testid) => {
    const b = h('button', { class: `btn btn--${variant} btn--sm`, type: 'button', on: { click: onClick }, dataset: { testid } }, iconName ? icon(iconName, { size: 16 }) : null, label);
    buttons[key] = b;
    return b;
  };
  const fileInput = importFileInput(bc);
  return h('div', { class: 'adm-actions' },
    btn('save', 'Save draft', 'check', 'primary', () => {
      const t = normalizedOrNull();
      if (!t || !bc.lastValidation.valid) return;
      saveDraft(t);
      toast(`Draft ${t.code} saved on this device`, { type: 'success' });
    }, 'save-draft'),
    btn('preview', 'Preview', 'eye', 'ghost', () => {
      const t = normalizedOrNull();
      if (!t || !bc.lastValidation.valid) return;
      persistNow();
      bc.ctx.navigate('runner', { test: t, source: 'draft', preview: true });
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
    btn('publish', 'Publish to Sheet', 'upload', 'success', () => publish(bc, parts), 'publish-test'),
  );
}

/** Builds the side panel. Sets bc.side, bc.refreshValidation and bc.lastValidation. */
export function createPublishPanel(bc) {
  const parts = {
    validationBox: h('div', { class: 'adm-validation', role: 'region', 'aria-label': 'Validation', dataset: { testid: 'validation-errors', count: '0' } }),
    summaryEl: h('p', { class: 'adm-summary muted' }),
    publishNote: h('p', { class: 'field__hint adm-publish-note' }),
    linkBox: h('div', { class: 'adm-linkbox', hidden: true, dataset: { testid: 'published-link' } }),
    tagError: h('div', { class: 'field-error adm-tag-error', role: 'alert', hidden: true, dataset: { testid: 'publish-tag-error' } }),
    buttons: {},
  };
  bc.lastValidation = safeValidate(S.test);
  bc.refreshValidation = makeRefreshValidation(bc, parts);
  const actions = buildActions(bc, parts);
  bc.side = h('aside', { class: 'adm-builder__side' },
    h('div', { class: 'card adm-side-card' },
      h('h3', { class: 'adm-h3' }, 'Checks'),
      parts.validationBox, parts.summaryEl, actions, parts.publishNote, parts.tagError, parts.linkBox,
      h('p', { class: 'field__hint adm-bundle-note' },
        icon('info', { size: 14 }),
        ' To bundle a test permanently: Download JSON, commit the file to data/tests/, then run npm run build:catalog.'),
    ),
  );
}
