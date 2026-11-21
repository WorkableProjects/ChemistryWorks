// `fillblank` editor: the blanks, their accepted answers and the grading switches.
import { h, icon } from '../../../ui.js';
import { BLANK_KINDS, markerIds } from '../../../lib/blanks.js';
import { field, switchEl, iconButton } from '../common.js';
import { uniqueId, formatHelpField } from './shared.js';

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

export default { type: 'fillblank', edit: ({ q, redraw, changed }) => fillBlankEditor(q, redraw, changed) };
