// UI for `vsepr`: three radio-card groups (electron geometry, molecular geometry, bond angle) with small
// ball-and-stick pictures. Native radio inputs, so arrow keys / Tab / screen readers work with no extra code.
// Answer = { electron, molecular, angle }.
import { h } from '../../ui.js';
import { field, switchEl } from '../admin/common.js';
import { ELECTRON_GEOMETRIES, MOLECULAR_GEOMETRIES, BOND_ANGLES, FIELDS, FIELD_LABELS, angleLabel, fieldsOf } from '../../lib/qtypes/vsepr.js';
import { formulaToHTML } from '../../lib/formula.js';
import { registerTypeUI } from './registry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of kids) if (c) el.appendChild(c);
  return el;
};

/** Centre position and ligand positions on a 60 x 60 canvas; `back` ligands are drawn dashed (pointing away). */
const SHAPES = {
  linear: { c: [30, 30], l: [[6, 30], [54, 30]] },
  'trigonal planar': { c: [30, 34], l: [[30, 6], [6, 48], [54, 48]] },
  tetrahedral: { c: [30, 28], l: [[30, 4], [6, 46], [54, 46]], back: [[38, 54]] },
  bent: { c: [30, 22], l: [[8, 46], [52, 46]] },
  'trigonal pyramidal': { c: [30, 20], l: [[6, 44], [54, 44]], back: [[34, 56]] },
  'see-saw': { c: [30, 30], l: [[30, 4], [30, 56], [54, 38]], back: [[8, 38]] },
  'T-shaped': { c: [30, 28], l: [[6, 28], [54, 28], [30, 56]] },
  'trigonal bipyramidal': { c: [30, 30], l: [[30, 4], [30, 56], [6, 40], [54, 40]], back: [[38, 20]] },
  'square pyramidal': { c: [30, 34], l: [[30, 4], [6, 44], [54, 44]], back: [[18, 56], [46, 56]] },
  'square planar': { c: [30, 30], l: [[6, 30], [54, 30], [30, 6], [30, 54]] },
  octahedral: { c: [30, 30], l: [[30, 4], [30, 56], [6, 30], [54, 30]], back: [[12, 48], [48, 12]] },
};

/** Inline SVG of a geometry (decorative: the card's text carries the name). */
export function shapeSvg(name, size = 56) {
  const s = SHAPES[name];
  const root = svg('svg', { viewBox: '0 0 60 60', width: size, height: size, class: 'q-vsepr__svg', 'aria-hidden': 'true', focusable: 'false' });
  if (!s) return root;
  const [cx, cy] = s.c;
  for (const [x, y] of s.l) root.appendChild(svg('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'q-vsepr__bond' }));
  for (const [x, y] of s.back || []) root.appendChild(svg('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'q-vsepr__bond q-vsepr__bond--back' }));
  for (const [x, y] of [...s.l, ...(s.back || [])]) root.appendChild(svg('circle', { cx: x, cy: y, r: 4.5, class: 'q-vsepr__lig' }));
  root.appendChild(svg('circle', { cx, cy, r: 6.5, class: 'q-vsepr__core' }));
  return root;
}

export const slug = (v) => String(v).replace(/</g, 'lt').replace(/\s*&\s*/g, '-and-').replace(/\./g, '-').replace(/\s+/g, '-').toLowerCase();
const OPTIONS = { electron: ELECTRON_GEOMETRIES, molecular: MOLECULAR_GEOMETRIES, angle: BOND_ANGLES };

function widget(q, api) {
  const fields = fieldsOf(q);
  const inputs = new Map(); // field -> Map(value -> input)
  const current = () => { const a = api.get(q.id); return a && typeof a === 'object' && !Array.isArray(a) ? a : {}; };
  const choose = (f, v) => api.set(q.id, { ...current(), [f]: v });
  const group = (f) => {
    const name = `vsepr-${q.id}-${f}`;
    const map = new Map();
    inputs.set(f, map);
    const cards = OPTIONS[f].map((v) => {
      const input = h('input', { type: 'radio', name, value: v, class: 'q-vsepr__radio', on: { change: () => choose(f, v) } });
      map.set(v, input);
      return h('label', { class: ['q-vsepr__card', f === 'angle' && 'q-vsepr__card--angle'], dataset: { testid: `vsepr-${f}-${slug(v)}` } },
        input, f === 'angle' ? null : shapeSvg(v), h('span', { class: 'q-vsepr__name' }, f === 'angle' ? angleLabel(v) : v));
    });
    return h('fieldset', { class: 'q-vsepr__group', dataset: { testid: `vsepr-${f}` } },
      h('legend', { class: 'q-vsepr__legend' }, FIELD_LABELS[f]), h('div', { class: 'q-vsepr__cards' }, cards));
  };
  const groups = fields.map(group);
  return {
    el: h('div', { class: 'q-vsepr' },
      h('p', { class: 'q-vsepr__formula' }, h('strong', null, 'Molecule: '), h('span', { class: 'formula', html: formulaToHTML(q.formula) })),
      groups),
    refresh(answer) {
      const a = answer && typeof answer === 'object' ? answer : {};
      for (const [f, map] of inputs) for (const [v, input] of map) input.checked = a[f] === v;
    },
    focus: () => [...inputs.values()][0]?.values().next().value?.focus(),
  };
}

function review(q, answer, { key } = {}) {
  const a = key ? { electron: q.electronGeometry, molecular: q.molecularGeometry, angle: q.bondAngle } : answer;
  if (!a || typeof a !== 'object') return null;
  const fields = fieldsOf(q);
  const shown = fields.includes('molecular') ? a.molecular : fields.includes('electron') ? a.electron : '';
  if (!shown && !a.angle) return null;
  return h('span', { class: 'q-vsepr-review', dataset: { testid: 'vsepr-review' } },
    shown ? shapeSvg(shown, 44) : null, h('span', { class: 'q-vsepr-review__text' }, [shown, a.angle ? angleLabel(a.angle) : ''].filter(Boolean).join(', ')));
}

function editor(q, redraw, changed) {
  const select = (f, key, label) => {
    const sel = h('select', { class: 'select', dataset: { testid: `vsepr-edit-${f}` }, on: { change: () => { q[key] = sel.value; changed(); } } },
      h('option', { value: '' }, 'Choose…'), OPTIONS[f].map((v) => h('option', { value: v, selected: q[key] === v }, f === 'angle' ? angleLabel(v) : v)));
    return field(label, sel);
  };
  const formula = h('input', { class: 'input', value: q.formula, autocomplete: 'off', placeholder: 'e.g. NH3', dataset: { testid: 'vsepr-edit-formula' }, on: { input: () => { q.formula = formula.value; changed(); } } });
  const use = FIELDS.map((f) => switchEl({ label: `Ask for ${FIELD_LABELS[f].toLowerCase()}`, checked: q.fields.includes(f), testid: `vsepr-edit-use-${f}`,
    onChange: (v) => { q.fields = FIELDS.filter((x) => (x === f ? v : q.fields.includes(x))); changed(); } }));
  return h('div', { class: 'stack' }, field('Molecule formula', formula),
    h('div', { class: 'adm-grid adm-grid--3' }, select('electron', 'electronGeometry', 'Electron geometry'), select('molecular', 'molecularGeometry', 'Molecular geometry'), select('angle', 'bondAngle', 'Bond angle')),
    h('p', { class: 'field__hint' }, 'Each field you ask for is worth an equal share of the points.'), use);
}

registerTypeUI({ type: 'vsepr', widget, editor, review });
export default null;
