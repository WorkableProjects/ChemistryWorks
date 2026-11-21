// `multipart` question type — student widget (each part's own widget under one stem) and builder editor.
// buildWidget / typeEditor are imported from modules that import this one, but only called at render time (safe cycle).
import { h, richText } from '../../ui.js';
import { isAnswered } from '../../lib/grading.js';
import { blankQuestion, QUESTION_TYPES, TYPE_LABELS } from '../../lib/schema.js';
import { isAutoPartType, partLabel, partLetter, partsPoints } from '../../lib/qtypes/multipart.js';
import { buildWidget } from '../runner/widgets.js';
import { typeEditor } from '../admin/editors/core.js';
import { registerTypeUI } from './registry.js';
import { field } from '../admin/common.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function widget(q, api) {
  const parts = Array.isArray(q.parts) ? q.parts : [];
  const cur = () => (isObj(api.get(q.id)) ? api.get(q.id) : {});
  const built = parts.map((part, i) => {
    const pid = `${q.id}__${part.id}`; // unique element ids even when two multipart questions both have part "a"
    const partQ = { ...part, id: pid };
    const sub = {
      get: () => cur()[part.id],
      set: (_id, val, opts) => {
        const next = { ...cur() };
        if (isAnswered(part, val)) next[part.id] = val; else delete next[part.id];
        api.set(q.id, Object.keys(next).length ? next : undefined, opts);
      },
    };
    const w = buildWidget(partQ, sub);
    const label = partLabel(part, i);
    const textEl = w.textEl || richText(part.text, 'div', 'q-text');
    textEl.id = `qt-${pid}`;
    const pts = part.points ?? 1;
    const el = h('section', { class: 'mp-part', 'aria-labelledby': `qt-${pid}`, dataset: { testid: `multipart-part-${part.id}`, partId: part.id } },
      h('div', { class: 'mp-part__head' },
        h('span', { class: 'mp-part__label' }, `(${label})`),
        h('span', { class: 'pill' }, `${pts} ${Number(pts) === 1 ? 'pt' : 'pts'}`)),
      h('div', { class: 'mp-part__body' }, textEl, w.el));
    return { part, w, el };
  });
  return {
    el: h('div', { class: 'q-multipart' },
      q.stem ? richText(q.stem, 'div', 'mp-stem') : null,
      built.map((b) => b.el)),
    refresh(answer) {
      const a = isObj(answer) ? answer : {};
      for (const b of built) b.w.refresh?.(a[b.part.id]);
    },
    focus: () => built[0]?.w.focus?.(),
  };
}

function editor(q, redraw, changed, uid) {
  q.parts = Array.isArray(q.parts) ? q.parts : [];
  const addTypes = QUESTION_TYPES.filter((t) => isAutoPartType({ type: t }));
  const root = h('div', { class: 'stack mp-ed' });
  const syncPoints = () => {
    q.points = partsPoints(q);
    const input = root.closest('[data-testid="question-editor"]')?.querySelector('[data-testid="q-points"]');
    if (input) { input.value = q.points; input.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  const stem = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Shared stem shown above the parts (optional)', dataset: { testid: 'multipart-stem' } });
  stem.value = q.stem || '';
  stem.addEventListener('input', () => { q.stem = stem.value; changed(); });
  const rows = q.parts.map((part, i) => {
    const move = (d) => { const j = i + d; if (j < 0 || j >= q.parts.length) return; [q.parts[i], q.parts[j]] = [q.parts[j], q.parts[i]]; redraw(); changed(); };
    const idIn = h('input', { class: 'input', value: part.id || '', 'aria-label': `Part ${i + 1} id`, dataset: { testid: `multipart-id-${i}` }, on: { input: () => { part.id = idIn.value.trim(); changed(); } } });
    const ptsIn = h('input', { class: 'input', type: 'number', min: '0', step: 'any', value: part.points ?? 1, 'aria-label': `Part ${i + 1} points`, dataset: { testid: `multipart-points-${i}` },
      on: { input: () => { part.points = ptsIn.value.trim() === '' ? '' : Number(ptsIn.value); syncPoints(); changed(); } } });
    const txt = h('textarea', { class: 'textarea', rows: 2, 'aria-label': `Part ${i + 1} question text`, dataset: { testid: `multipart-text-${i}` } });
    txt.value = part.text || '';
    txt.addEventListener('input', () => { part.text = txt.value; changed(); });
    const btn = (label, fn, testid, disabled) => h('button', { type: 'button', class: 'btn btn--ghost btn--sm', disabled, dataset: { testid }, 'aria-label': `${label} part ${i + 1}`, on: { click: fn } }, label);
    return h('fieldset', { class: 'mp-ed__part', dataset: { testid: `multipart-editor-part-${i}` } },
      h('legend', {}, `Part (${partLabel(part, i)}) — ${TYPE_LABELS[part.type] || part.type}`),
      h('div', { class: 'adm-grid adm-grid--2' }, field('Part id', idIn), field('Points', ptsIn)),
      field('Part text', txt),
      typeEditor(part, redraw, changed, `${uid}-${i}`),
      h('div', { class: 'mp-ed__actions' },
        btn('Up', () => move(-1), `multipart-up-${i}`, i === 0), btn('Down', () => move(1), `multipart-down-${i}`, i === q.parts.length - 1),
        btn('Remove', () => { q.parts.splice(i, 1); syncPoints(); redraw(); changed(); }, `multipart-remove-${i}`)));
  });
  const picker = h('select', { class: 'select', 'aria-label': 'Type of the new part', dataset: { testid: 'multipart-add-type' } },
    addTypes.map((t) => h('option', { value: t }, TYPE_LABELS[t] || t)));
  picker.value = 'mcq';
  const add = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: 'multipart-add' }, on: { click: () => {
    const used = new Set(q.parts.map((p) => p.id));
    let k = q.parts.length;
    while (used.has(partLetter(k))) k++;
    const part = blankQuestion(picker.value, partLetter(k));
    part.text = `Part (${partLetter(k)}) question`;
    q.parts.push(part);
    syncPoints();
    redraw(); changed();
  } } }, 'Add part');
  root.append(field('Stem', stem), ...rows, h('div', { class: 'mp-ed__add' }, picker, add),
    h('p', { class: 'field__hint' }, 'The question\'s points are the sum of the parts\' points. Only auto-graded types can be parts.'));
  return root;
}

export default registerTypeUI({ type: 'multipart', widget, editor });
