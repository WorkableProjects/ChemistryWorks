// Student widget for `graph`.
//   mode 'read': the chart is drawn as inline SVG and the student types a number.
//   mode 'plot': an empty grid; click to add a point, click a point to remove it. Keyboard: arrow keys move a crosshair
//                (Shift = 5 steps), Enter adds a point (or removes one already under the crosshair), Delete removes the last point.
// Contract (see runner.js): returns { el, refresh(answer), focus() }. read answer = text; plot answer = [[x, y], …].
import { h } from '../../ui.js';
import { chartSvg, chartRange, fromPx, toPx, snap, W, H, pointsText } from '../../lib/qtypes/graph.js';

const readWidget = (q, api) => {
  const input = h('input', {
    class: 'input q-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off',
    placeholder: q.unit ? `Enter a number (${q.unit})` : 'Enter a number', 'aria-label': `Your answer${q.unit ? ` (${q.unit})` : ''}`, dataset: { testid: 'graph-input' },
    on: { input: () => api.set(q.id, input.value, { debounce: true }) },
  });
  return {
    el: h('div', { class: 'q-graph q-graph--read' },
      h('div', { class: 'q-graph__frame', dataset: { testid: 'graph-chart' }, html: chartSvg(q.chart, { series: true, label: `Graph of ${q.chart.yLabel || 'y'} against ${q.chart.xLabel || 'x'}` }) }),
      h('div', { class: 'q-numeric' }, input, q.unit ? h('span', { class: 'q-unit' }, q.unit) : null)),
    refresh(answer) { if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : answer == null ? '' : String(answer); },
    focus: () => input.focus(),
  };
};

const plotWidget = (q, api) => {
  const r = chartRange(q.chart);
  const targets = Array.isArray(q.targets) ? q.targets.length : 0;
  let cursor = [(r.xMin + r.xMax) / 2, (r.yMin + r.yMax) / 2];
  let showCursor = false;
  const pts = () => (Array.isArray(api.get(q.id)) ? api.get(q.id).filter((p) => Array.isArray(p) && p.length === 2) : []);
  const status = h('p', { class: 'q-hint q-graph__status', 'aria-live': 'polite', dataset: { testid: 'graph-status' } });
  const frame = h('div', {
    class: 'q-graph__frame q-graph__frame--plot', tabindex: '0', dataset: { testid: 'graph-plot' },
    'aria-label': `Plot area for ${q.chart.yLabel || 'y'} against ${q.chart.xLabel || 'x'}. Arrow keys move the crosshair, Enter adds or removes a point.`,
  });
  const redraw = () => { frame.innerHTML = chartSvg(q.chart, { series: false, points: pts(), cursor: showCursor ? cursor : null, label: 'Plot area' }); };
  const set = (list) => api.set(q.id, list.length ? list : undefined);
  const near = (list, x, y, tolPx) => {
    const [px, py] = toPx(r, x, y);
    return list.findIndex((p) => { const [qx, qy] = toPx(r, p[0], p[1]); return Math.hypot(qx - px, qy - py) <= tolPx; });
  };
  const toggleAt = (x, y, tolPx) => {
    const list = pts();
    const i = near(list, x, y, tolPx);
    if (i >= 0) { const gone = list.splice(i, 1)[0]; set(list); status.textContent = `Removed point (${gone[0]}, ${gone[1]}).`; return; }
    if (x < r.xMin || x > r.xMax || y < r.yMin || y > r.yMax) return;
    list.push([snap(x, r.xMin, r.xMax), snap(y, r.yMin, r.yMax)]);
    set(list);
    status.textContent = `Added point (${list[list.length - 1][0]}, ${list[list.length - 1][1]}). ${list.length} placed.`;
  };

  frame.addEventListener('click', (e) => {
    const svg = frame.querySelector('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const [x, y] = fromPx(r, ((e.clientX - rect.left) / rect.width) * W, ((e.clientY - rect.top) / rect.height) * H);
    showCursor = false;
    // 9 SVG units of slack so a click on an existing dot removes it
    toggleAt(x, y, 9);
  });
  frame.addEventListener('blur', () => { if (showCursor) { showCursor = false; redraw(); } });
  frame.addEventListener('keydown', (e) => {
    const stepX = (r.xMax - r.xMin) / 50;
    const stepY = (r.yMax - r.yMin) / 50;
    const k = e.shiftKey ? 5 : 1;
    const move = { ArrowLeft: [-stepX, 0], ArrowRight: [stepX, 0], ArrowUp: [0, stepY], ArrowDown: [0, -stepY] }[e.key];
    if (move) {
      e.preventDefault();
      cursor = [Math.min(r.xMax, Math.max(r.xMin, cursor[0] + move[0] * k)), Math.min(r.yMax, Math.max(r.yMin, cursor[1] + move[1] * k))];
      showCursor = true;
      redraw();
      status.textContent = `Crosshair at x = ${snap(cursor[0], r.xMin, r.xMax)}, y = ${snap(cursor[1], r.yMin, r.yMax)}.`;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showCursor = true;
      toggleAt(cursor[0], cursor[1], 6);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const list = pts();
      if (list.length) { list.pop(); set(list); status.textContent = 'Removed the last point.'; }
    }
  });

  const clear = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: 'graph-clear' }, on: { click: () => { set([]); status.textContent = 'All points removed.'; } } }, 'Remove all points');
  const count = h('span', { class: 'q-hint', dataset: { testid: 'graph-count' } });
  redraw();
  return {
    el: h('div', { class: 'q-graph q-graph--plot' },
      h('p', { class: 'q-hint' }, `Click the grid to add a point; click a point to remove it.${targets ? ` Plot ${targets} point${targets === 1 ? '' : 's'}.` : ''}`),
      frame, h('div', { class: 'row row--wrap' }, clear, count), status),
    refresh(answer) {
      const n = Array.isArray(answer) ? answer.length : 0;
      count.textContent = n ? `${n} placed: ${pointsText(answer)}` : 'No points placed';
      clear.disabled = !n;
      redraw();
    },
    focus: () => frame.focus(),
  };
};

export function graphWidget(q, api) {
  return q.mode === 'plot' ? plotWidget(q, api) : readWidget(q, api);
}
