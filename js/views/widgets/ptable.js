// Student widget for `ptable`: a clickable periodic table (V3-05). Answer = array of element symbols.
// Layout follows reference-pane.js periodicTable(), reduced to number + symbol so it fits inside a question.
import { h } from '../../ui.js';
import { ELEMENTS, GROUP_LABELS } from '../../lib/elements.js';

export function ptableWidget(q, api) {
  const multiple = q.multiple !== false;
  const buttons = new Map();
  const at = (period, group) => ELEMENTS.find((x) => x.period === period && x.group === group);
  const status = h('p', { class: 'q-hint q-ptable__status', 'aria-live': 'polite', dataset: { testid: 'ptable-status' } });

  const current = () => (Array.isArray(api.get(q.id)) ? api.get(q.id) : []);
  function toggle(sym) {
    if (!multiple) return api.set(q.id, current().includes(sym) ? undefined : [sym]);
    const cur = new Set(current());
    if (cur.has(sym)) cur.delete(sym); else cur.add(sym);
    const next = ELEMENTS.map((e) => e.symbol).filter((s) => cur.has(s));
    api.set(q.id, next.length ? next : undefined);
  }

  const cell = (e) => {
    const b = h('button', {
      type: 'button', class: 'qpt-el', 'aria-pressed': 'false', 'aria-label': e.name, title: e.name, dataset: { testid: `ptable-${e.symbol}` },
      on: { click: () => toggle(e.symbol) },
    }, h('span', { class: 'qpt-el__n', 'aria-hidden': 'true' }, String(e.number)), h('span', { class: 'qpt-el__s', 'aria-hidden': 'true' }, e.symbol));
    buttons.set(e.symbol, b);
    return h('td', { class: 'qpt-cell' }, b);
  };
  const gap = () => h('td', { class: 'qpt-gap', 'aria-hidden': 'true' });

  const head = h('tr', {}, h('td', {}), GROUP_LABELS.map((label, i) => h('th', { scope: 'col', class: 'qpt-head', 'aria-label': `Group ${i + 1}` }, String(i + 1))));
  const rows = [];
  for (let period = 1; period <= 7; period++) {
    const tds = [h('th', { scope: 'row', class: 'qpt-head' }, String(period))];
    for (let g = 1; g <= 18; g++) {
      const e = at(period, g);
      tds.push(e ? cell(e) : gap());
    }
    rows.push(h('tr', {}, tds));
  }
  const fRow = (from, to, label) => h('tr', {},
    h('th', { scope: 'row', class: 'qpt-head' }, h('span', { class: 'sr-only' }, label)),
    gap(), gap(), gap(), ELEMENTS.filter((e) => e.number >= from && e.number <= to).map(cell), gap());
  rows.push(h('tr', { class: 'qpt-spacer', 'aria-hidden': 'true' }, h('td', { colspan: '19' })), fRow(58, 71, 'Lanthanides'), fRow(90, 103, 'Actinides'));

  return {
    el: h('div', { class: 'q-ptable' },
      h('p', { class: 'q-hint' }, multiple ? 'Select every element that fits. Select an element again to remove it.' : 'Select one element.'),
      h('div', { class: 'qpt-scroll' },
        h('table', { class: 'qpt-table', 'aria-labelledby': `qt-${q.id}` }, h('caption', { class: 'sr-only' }, 'Periodic table'), h('thead', {}, head), h('tbody', {}, rows))),
      status),
    refresh(answer) {
      const sel = new Set(Array.isArray(answer) ? answer : []);
      for (const [sym, b] of buttons) {
        const on = sel.has(sym);
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('is-selected', on);
      }
      status.textContent = sel.size
        ? `Selected: ${ELEMENTS.filter((e) => sel.has(e.symbol)).map((e) => `${e.name} (${e.symbol})`).join(', ')}`
        : 'Nothing selected yet';
    },
  };
}
