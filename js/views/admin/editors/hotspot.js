// Builder editor for `hotspot` (V3-05). The diagram itself is the question's Image field (above); here the teacher adds
// labels and sets where each belongs: type x / y (0-1) or select a label and click the preview.
import { h, icon } from '../../../ui.js';
import { safeImageUrl } from '../../../lib/sections.js';
import { field, switchEl, iconButton } from '../common.js';

const clamp = (n) => Math.min(1, Math.max(0, n));
const r3 = (n) => Math.round(n * 1000) / 1000;

export function hotspotEditor(q, redraw, changed) {
  q.labels = Array.isArray(q.labels) ? q.labels : [];
  let sel = q.labels.length ? 0 : -1;
  const url = q.image && safeImageUrl(q.image.url);

  const pins = h('div', { class: 'q-hot__pins' });
  const drawPins = () => {
    pins.replaceChildren(...q.labels.map((l, i) => h('span', {
      class: ['q-hot__pin q-hot__pin--static', i === sel ? 'is-selected' : ''], 'aria-hidden': 'true',
      style: `left:${Number(l.x) * 100}%;top:${Number(l.y) * 100}%`,
    }, String(i + 1))));
  };
  const img = h('img', { class: 'q-hot__img', src: url || '', alt: (q.image && q.image.alt) || '', draggable: 'false' });
  const stage = h('div', {
    class: 'q-hot__stage q-hot__stage--edit', dataset: { testid: 'hotspot-preview' },
    on: { click: (e) => {
      const l = q.labels[sel];
      if (!l) return;
      const r = img.getBoundingClientRect();
      if (!r.width || !r.height) return;
      l.x = r3(clamp((e.clientX - r.left) / r.width));
      l.y = r3(clamp((e.clientY - r.top) / r.height));
      redraw(); changed();
    } },
  }, url ? img : h('p', { class: 'muted' }, 'Set the question Image above (URL and description). Then click here to position the selected label.'), pins);
  drawPins();

  const rows = q.labels.map((l, i) => {
    const text = h('input', { class: 'input', value: l.text || '', placeholder: 'e.g. Beaker', 'aria-label': `Label ${i + 1} text`, dataset: { testid: `hot-text-${i}` }, on: { input: () => { l.text = text.value; changed(); } } });
    const num = (key, tid) => {
      const el = h('input', { class: 'input', type: 'number', min: '0', max: '1', step: '0.01', value: l[key] ?? 0, style: 'width:6.5em', 'aria-label': `Label ${i + 1} ${key} (0 to 1)`, dataset: { testid: tid },
        on: { input: () => { const n = Number(el.value); l[key] = el.value.trim() === '' || !Number.isFinite(n) ? NaN : n; drawPins(); changed(); } } });
      return el;
    };
    return h('div', { class: ['adm-opt', i === sel ? 'is-selected' : ''] },
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'aria-pressed': String(i === sel), dataset: { testid: `hot-select-${i}` }, on: { click: () => { sel = i; redraw(); } } }, `${i + 1}`),
      text, num('x', `hot-x-${i}`), num('y', `hot-y-${i}`),
      iconButton('x', 'Remove label', () => { q.labels.splice(i, 1); redraw(); changed(); }, { testid: `hot-remove-${i}` }));
  });

  const radius = h('input', { class: 'input', type: 'number', min: '0.01', max: '1', step: '0.01', value: q.radius ?? 0.06, dataset: { testid: 'hot-radius' },
    on: { input: () => { q.radius = radius.value.trim() === '' ? NaN : Number(radius.value); changed(); } } });

  return h('div', { class: 'stack' },
    h('div', { class: 'field__label' }, 'Labels: pick one, then click the picture to set its spot (or type x and y as fractions from 0 to 1)'),
    stage,
    h('div', { class: 'adm-opts' }, rows),
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-hot-label' }, on: { click: () => {
        const used = new Set(q.labels.map((l) => l.id));
        let n = q.labels.length + 1;
        while (used.has(`l${n}`)) n++;
        q.labels.push({ id: `l${n}`, text: '', x: 0.5, y: 0.5 });
        sel = q.labels.length - 1; redraw(); changed();
      } } }, icon('plus', { size: 16 }), 'Add label'),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => redraw() } }, 'Refresh picture')),
    h('div', { class: 'adm-grid adm-grid--2' }, field('Accepted distance (fraction of image width)', radius, 'For example 0.06 = 6% of the width')),
    switchEl({ label: 'Partial credit', hint: 'Points for each label placed within the distance', checked: q.partialCredit !== false, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }));
}
