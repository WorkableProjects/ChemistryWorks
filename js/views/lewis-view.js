// DOM helpers for Lewis dot diagrams: a static diagram (results, builder preview) and the
// interactive student widget (runner).

import { h } from '../ui.js';
import { SIDES, isDotArray, dotTotal } from '../lib/lewis.js';

const dotsEl = (n) => Array.from({ length: n }, () => h('i', { class: 'lewis__dot' }));

/** Static diagram. dots = [top, right, bottom, left]. */
export function lewisDiagram(symbol, dots, { size = 'md', label } = {}) {
  const d = isDotArray(dots) ? dots : [0, 0, 0, 0];
  return h('span', {
    class: ['lewis', `lewis--${size}`], role: 'img',
    'aria-label': label || `${symbol} with ${dotTotal(d)} dots: ${SIDES.map((s, i) => `${s} ${d[i]}`).join(', ')}`,
  },
    h('span', { class: 'lewis__sym', 'aria-hidden': 'true' }, symbol || '?'),
    SIDES.map((s, i) => h('span', { class: `lewis__side lewis__side--${s}`, 'aria-hidden': 'true' }, dotsEl(d[i]))));
}

/**
 * Student widget. Each side of the symbol is a button that cycles 0 → 1 → 2 → 0 dots.
 * Returns the runner widget contract { el, refresh(answer), focus() }.
 */
export function lewisWidget(q, api) {
  const symbol = q.element || '?';
  const current = () => (isDotArray(api.get(q.id)) ? [...api.get(q.id)] : [0, 0, 0, 0]);
  const count = h('p', { class: 'q-hint q-lewis__count', 'aria-live': 'polite', dataset: { testid: 'lewis-count' } });

  const buttons = SIDES.map((side, i) => {
    const btn = h('button', {
      type: 'button', class: `lewis__side lewis__side--${side} lewis__btn`, dataset: { testid: `lewis-${side}` },
      on: { click: () => {
        const next = current();
        next[i] = (next[i] + 1) % 3;
        if (dotTotal(next) === 0) api.set(q.id, undefined);
        else api.set(q.id, next);
      } },
    });
    return btn;
  });

  const board = h('div', { class: 'lewis lewis--lg lewis--edit', role: 'group', 'aria-labelledby': `qt-${q.id}` },
    h('span', { class: 'lewis__sym', 'aria-hidden': 'true' }, symbol), buttons);

  function refresh(answer) {
    const d = isDotArray(answer) ? answer : [0, 0, 0, 0];
    buttons.forEach((btn, i) => {
      btn.replaceChildren(...dotsEl(d[i]));
      btn.classList.toggle('has-dots', d[i] > 0);
      btn.setAttribute('aria-label', `${SIDES[i]} of ${symbol}: ${d[i]} ${d[i] === 1 ? 'dot' : 'dots'}. Press to change.`);
    });
    const n = dotTotal(d);
    count.textContent = `${n} ${n === 1 ? 'dot' : 'dots'} placed · Click a side of the symbol to add a dot (click again for a pair, a third time to clear)`;
  }
  refresh(api.get(q.id));

  return {
    el: h('div', { class: 'q-lewis' }, board, count),
    refresh,
    focus: () => buttons[0].focus(),
  };
}
