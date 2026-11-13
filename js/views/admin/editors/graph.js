// Builder editor for `graph`: read a value off a drawn chart, or plot points on an empty grid.
import { h } from '../../../ui.js';
import { chartSvg, pointsText } from '../../../lib/qtypes/graph.js';
import { field, switchEl } from '../common.js';

/** Parse "(0, 0), (5, 10)" (or "0,0; 5,10") into [[x, y], …]. Unreadable pairs become NaN so validation flags them. */
function parsePairs(text) {
  const src = String(text);
  const groups = [...src.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]);
  const chunks = groups.length ? groups : src.split(/[;\n]+/).map((x) => x.trim()).filter(Boolean);
  return chunks.map((chunk) => {
    const n = chunk.split(/[,\s]+/).filter(Boolean).map(Number);
    return n.length === 2 ? n : [NaN, NaN];
  });
}

export function graphEditor(q, redraw, changed) {
  q.chart = q.chart && typeof q.chart === 'object' ? q.chart : {};
  const c = q.chart;
  c.series = Array.isArray(c.series) ? c.series : [];
  if (!c.series.length) c.series.push({ points: [] });
  const preview = h('div', { class: 'q-graph__frame', dataset: { testid: 'graph-editor-preview' } });
  const drawPrev = () => { preview.innerHTML = chartSvg(c, { series: true, points: q.mode === 'plot' && Array.isArray(q.targets) ? q.targets.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])) : [], label: 'Chart preview' }); };

  const text = (key, label, tid, hint) => {
    const el = h('input', { class: 'input', value: c[key] ?? '', dataset: { testid: tid }, on: { input: () => { c[key] = el.value; drawPrev(); changed(); } } });
    return field(label, el, hint);
  };
  const num = (key, label, tid) => {
    const el = h('input', { class: 'input', type: 'number', step: 'any', value: c[key] ?? '', dataset: { testid: tid }, on: { input: () => { c[key] = el.value.trim() === '' ? NaN : Number(el.value); drawPrev(); changed(); } } });
    return field(label, el);
  };
  const seriesInput = h('textarea', { class: 'textarea', rows: 3, spellcheck: 'false', value: c.series.map((s) => pointsText(s.points)).join('\n'), placeholder: '(0, 20), (5, 45), (10, 70)', dataset: { testid: 'graph-series' },
    on: { input: () => { c.series = seriesInput.value.split('\n').map((line) => ({ points: parsePairs(line) })).filter((s) => s.points.length); drawPrev(); changed(); } } });

  const mode = h('select', { class: 'select', dataset: { testid: 'graph-mode' }, on: { change: () => {
    q.mode = mode.value;
    if (q.mode === 'plot') { q.targets = Array.isArray(q.targets) && q.targets.length ? q.targets : [[0, 0]]; q.toleranceX ??= 0; q.toleranceY ??= 0; q.partialCredit ??= true; }
    else { q.answer ??= 0; q.tolerance ??= 0; }
    redraw(); changed();
  } } }, h('option', { value: 'read' }, 'Read a value from a chart'), h('option', { value: 'plot' }, 'Plot points on an empty grid'));
  mode.value = q.mode === 'plot' ? 'plot' : 'read';

  let modeFields;
  if (q.mode === 'plot') {
    const targets = h('textarea', { class: 'textarea', rows: 3, spellcheck: 'false', value: pointsText(q.targets), placeholder: '(0, 20), (5, 45)', dataset: { testid: 'graph-targets' },
      on: { input: () => { q.targets = parsePairs(targets.value); drawPrev(); changed(); } } });
    const tol = (key, label, tid) => {
      const el = h('input', { class: 'input', type: 'number', min: '0', step: 'any', value: q[key] ?? 0, dataset: { testid: tid }, on: { input: () => { q[key] = el.value.trim() === '' ? 0 : Number(el.value); changed(); } } });
      return field(label, el);
    };
    modeFields = h('div', { class: 'stack' },
      field('Correct points students must plot', targets, 'Pairs like (x, y), separated by commas. Students may place no more points than this.'),
      h('div', { class: 'adm-grid adm-grid--2' }, tol('toleranceX', 'Tolerance in x (±)', 'graph-tol-x'), tol('toleranceY', 'Tolerance in y (±)', 'graph-tol-y')),
      switchEl({ label: 'Partial credit', hint: 'Points for each target point that has a placed point within the tolerance box', checked: q.partialCredit !== false, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }));
  } else {
    const ans = h('input', { class: 'input', value: q.answer ?? '', dataset: { testid: 'graph-answer' }, on: { input: () => { q.answer = ans.value.trim() === '' ? NaN : Number(ans.value); changed(); } } });
    const tol = h('input', { class: 'input', type: 'number', min: '0', step: 'any', value: q.tolerance ?? 0, dataset: { testid: 'graph-tolerance' }, on: { input: () => { q.tolerance = tol.value.trim() === '' ? 0 : Number(tol.value); changed(); } } });
    const unit = h('input', { class: 'input', value: q.unit || '', placeholder: 'optional, e.g. °C', dataset: { testid: 'graph-unit' }, on: { input: () => { q.unit = unit.value; changed(); } } });
    modeFields = h('div', { class: 'adm-grid adm-grid--3' }, field('Correct value', ans), field('Tolerance (absolute ±)', tol), field('Unit', unit));
  }
  drawPrev();
  return h('div', { class: 'stack' },
    field('Mode', mode),
    h('div', { class: 'adm-grid adm-grid--2' }, text('xLabel', 'x-axis label', 'graph-xlabel'), text('yLabel', 'y-axis label', 'graph-ylabel')),
    h('div', { class: 'adm-grid adm-grid--4' }, num('xMin', 'x min', 'graph-xmin'), num('xMax', 'x max', 'graph-xmax'), num('yMin', 'y min', 'graph-ymin'), num('yMax', 'y max', 'graph-ymax')),
    q.mode === 'plot' ? null : field('Series drawn on the chart (one line per row)', seriesInput, 'Pairs like (x, y), separated by commas'),
    preview,
    modeFields);
}
