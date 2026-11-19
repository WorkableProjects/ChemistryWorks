// Admin "Builder" tab: visual + JSON test editor with live validation.
// The in-memory test (S.test) is the single source of truth. Inputs mutate it directly and only
// refresh the pieces that depend on the changed value, so typing never loses focus.
//
// The pieces live in sibling modules and share one builder context object (`bc`): the root element, the page
// elements, the cleanups, and the functions that other modules call (changed, renderMain, refreshValidation, …).

import { h, mount, icon } from '../../../ui.js';
import { CONFIG } from '../../../config.js';
import { S, ensure, persistNow, persistSoon } from './state.js';
import { settingsCard, sectionsCard, referencesCard } from './settings.js';
import { editors, renderList, updateSectionLabels } from './questions.js';
import { addMenu } from './menu.js';
import { createOutline, drawOutline } from './outline.js';
import { createPublishPanel } from './publish.js';
import { renderJson, applyJson, jsonHasEdits, guideButton } from './import.js';
import { renderPreview } from './preview.js';

// Public API of the builder, used by the admin shell, the library, the bank and the importer.
export { getBuilderTest, setBuilderTest, newBuilderTest, builderIsDirty } from './state.js';
export { fetchGuide } from './import.js';
export { TYPE_ICONS, TYPE_DESCRIPTIONS } from './menu.js';

/** The visual editor: settings, sections, references and the question list. */
function renderVisual(bc) {
  bc.listEl = h('div', { class: 'adm-qlist' });
  bc.emptyHint = h('div', { class: 'adm-qempty', hidden: S.test.questions.length > 0 },
    icon('flask', { size: 24 }), h('p', {}, 'No questions yet. Add your first question below.'));
  const toggleAll = () => {
    const all = S.test.questions;
    const anyClosed = all.some((q) => !S.open.has(q));
    all.forEach((q) => (anyClosed ? S.open.add(q) : S.open.delete(q)));
    editors(bc).forEach((e) => e._sync());
  };
  const wrap = h('div', { class: 'stack adm-visual' },
    settingsCard(bc),
    sectionsCard(bc),
    referencesCard(bc),
    h('section', { class: 'adm-questions', 'aria-label': 'Questions' },
      h('div', { class: 'row' }, h('h3', { class: 'adm-h3' }, 'Questions'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn--subtle btn--sm', type: 'button', on: { click: toggleAll } }, 'Expand / collapse all')),
      bc.emptyHint, bc.listEl,
      h('div', { class: 'adm-addrow' }, addMenu(bc))));
  renderList(bc);
  return wrap;
}

/** The Visual / JSON switch and the "Preview as student" toggle. Sets bc.toolbar and bc.renderMain. */
function createToolbar(bc) {
  const modeBtn = (mode, label, iconName, testid) => h('button', {
    class: 'adm-seg__btn', type: 'button', role: 'tab', 'aria-selected': String(S.mode === mode), dataset: { testid, mode },
    on: { click: () => setMode(mode) },
  }, icon(iconName, { size: 16 }), label);
  const segEl = h('div', { class: 'adm-seg', role: 'tablist', 'aria-label': 'Builder mode' },
    modeBtn('visual', 'Visual', 'grid', 'builder-mode-visual'),
    modeBtn('json', 'JSON', 'list', 'builder-mode-json'));
  let previewOn = false;
  const previewBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-pressed': 'false', dataset: { testid: 'builder-preview-toggle' },
    on: { click: () => { previewOn = !previewOn; previewBtn.setAttribute('aria-pressed', String(previewOn)); bc.renderMain(); } } }, icon('eye', { size: 16 }), 'Preview as student');

  function setMode(mode) {
    if (mode === S.mode) return;
    if (S.mode === 'json' && jsonHasEdits(bc) && !applyJson(bc, { silent: true })) return; // stay in JSON mode with the error visible
    S.mode = mode;
    segEl.querySelectorAll('.adm-seg__btn').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === S.mode)));
    bc.renderMain();
    bc.refreshValidation();
  }
  bc.renderMain = function renderMain() {
    if (previewOn && S.mode === 'visual') {
      bc.listEl = null; // the visual editor is not on screen while previewing
      mount(bc.mainEl, h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'This is what a student sees. Switch the preview off to keep editing.')));
      renderPreview(bc).then((node) => { if (previewOn) bc.mainEl.appendChild(node); });
      drawOutline(bc);
      return;
    }
    mount(bc.mainEl, S.mode === 'json' ? renderJson(bc) : renderVisual(bc));
    drawOutline(bc);
  };
  bc.toolbar = h('div', { class: 'adm-toolbar' }, segEl, h('span', { class: 'spacer' }), previewBtn, guideButton());
}

export function renderBuilder(root, ctx) {
  ensure();
  S.test.sections = Array.isArray(S.test.sections) ? S.test.sections : [];
  S.test.references = Array.isArray(S.test.references) ? S.test.references : [];
  const bc = {
    root, ctx, cleanups: [], gasUrl: CONFIG.GAS_WEB_APP_URL,
    mainEl: h('div', { class: 'adm-builder__main' }),
    listEl: null, emptyHint: null,
  };
  // The admin shell listens for this to refresh the breadcrumb and in-test tabs (test code changes).
  bc.changed = () => {
    persistSoon();
    bc.refreshValidation();
    updateSectionLabels(bc);
    drawOutline(bc);
    document.dispatchEvent(new CustomEvent('cw:builder-change'));
  };
  createOutline(bc);
  createPublishPanel(bc);
  createToolbar(bc);

  mount(root, h('div', { class: 'adm-builder bld2', dataset: { testid: 'builder' } },
    bc.outlineEl,
    h('div', { class: 'adm-builder__col' }, bc.toolbar, bc.mainEl),
    bc.side));
  bc.renderMain();
  bc.refreshValidation();

  return () => {
    persistSoon.cancel();
    persistNow();
    bc.cleanups.forEach((fn) => fn());
  };
}
