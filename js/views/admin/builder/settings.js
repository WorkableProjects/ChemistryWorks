// Builder cards for the test itself: settings, sections and references.

import { h, mount, icon, renderMath } from '../../../ui.js';
import { resourcesTable } from '../../reference-pane.js';
import { CONFIG } from '../../../config.js';
import { nextSectionId, nextReferenceId, orderQuestions, REFERENCE_TYPES, REFERENCE_LABELS, DEFAULT_RESOURCES, safeImageUrl } from '../../../lib/sections.js';
import { gameOptionsPanel } from '../game-options.js';
import { testExtrasPanel } from '../test-extras.js';
import { field, switchEl, debounce, iconButton } from '../common.js';
import { S, confirmDialog, sectionSummary, sectionTitleOf } from './state.js';
import { renderList } from './questions.js';

/** The "Test settings" card: code, title, limits and the on/off options. */
export function settingsCard(bc) {
  const { changed, ctx } = bc;
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
    S.test.gameMode ? (gameOptionsPanel(S.test, changed) || null) : null,
    testExtrasPanel(S.test, changed, ctx),
  );
}

/** The "Sections" card: named headings with instructions. */
export function sectionsCard(bc) {
  const { changed } = bc;
  const body = h('div', { class: 'stack adm-secrows' });
  const redrawAll = () => { S.test.questions = orderQuestions(S.test); draw(); if (bc.listEl) renderList(bc); changed(); };
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

/** The "References" card: periodic table, resources, text and image panes for students. */
export function referencesCard(bc) {
  const { changed } = bc;
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
        bc.cleanups.push(() => drawPrevSoon.cancel());
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
