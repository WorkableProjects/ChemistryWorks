// "Units & constants" reference-pane tab: constants table with a copy-into-calculator-friendly value, and a unit converter.
import { h } from '../../ui.js';
import { CONSTANTS, UNIT_CATEGORIES, convert } from './units.js';
import { formatResult } from './calc-parser.js';

function converter() {
  const cat = h('select', { class: 'select', 'aria-label': 'Quantity', dataset: { testid: 'conv-category' } },
    Object.entries(UNIT_CATEGORIES).map(([id, c]) => h('option', { value: id }, c.label)));
  const value = h('input', { class: 'input', type: 'text', inputmode: 'decimal', 'aria-label': 'Value to convert', value: '1', dataset: { testid: 'conv-value' } });
  const from = h('select', { class: 'select', 'aria-label': 'From unit', dataset: { testid: 'conv-from' } });
  const to = h('select', { class: 'select', 'aria-label': 'To unit', dataset: { testid: 'conv-to' } });
  const out = h('output', { class: 'conv__out', 'aria-live': 'polite', dataset: { testid: 'conv-result' } });
  function fill() {
    const units = Object.keys(UNIT_CATEGORIES[cat.value].units);
    for (const sel of [from, to]) sel.replaceChildren(...units.map((u) => h('option', { value: u }, u)));
    to.selectedIndex = Math.min(1, units.length - 1);
    update();
  }
  function update() {
    const v = Number(String(value.value).replace(',', '.'));
    const r = convert(v, from.value, to.value, cat.value);
    out.textContent = Number.isFinite(r) ? `${value.value} ${from.value} = ${formatResult(r)} ${to.value}` : 'Enter a number';
  }
  cat.addEventListener('change', fill);
  for (const el of [value, from, to]) el.addEventListener('input', update);
  fill();
  return h('section', { class: 'conv', 'aria-label': 'Unit converter', dataset: { testid: 'unit-converter' } },
    h('h4', { class: 'conv__title' }, 'Unit converter'),
    cat,
    h('div', { class: 'conv__row' }, value, from, h('span', { 'aria-hidden': 'true' }, '→'), to),
    out);
}

export function constantsPanel() {
  return h('div', { class: 'consts', dataset: { testid: 'constants-panel' } },
    h('table', { class: 'ref-consts' },
      h('caption', { class: 'sr-only' }, 'Physical constants'),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Constant'), h('th', { scope: 'col' }, 'Value'), h('th', { scope: 'col' }, 'Unit'))),
      h('tbody', {}, CONSTANTS.map((c) => h('tr', { dataset: { testid: `const-${c.id}` } },
        h('th', { scope: 'row' }, `${c.name} (${c.symbol.replace('_', '')})`),
        h('td', { class: 'ref-consts__v' }, c.value),
        h('td', {}, c.unit))))),
    converter());
}
