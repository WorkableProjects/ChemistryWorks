// Energy orbital diagrams (V2-05): interactive student widget + static diagram. STUB — implemented in task T03.
import { h } from '../ui.js';
import { describeOrbital } from '../lib/orbital.js';

/** Static diagram for results / grading / export. answer = { [sublevel]: Box[] }. */
export function orbitalDiagram(q, answer, { label = 'Orbital diagram' } = {}) {
  return h('span', { class: 'orb-wrap', role: 'img', 'aria-label': label }, describeOrbital(q, answer));
}

/** Student widget. Runner widget contract { el, refresh(answer), focus() }. */
export function orbitalWidget(q, api) {
  const el = h('div', { class: 'q-orbital' });
  return { el, refresh() {}, focus() {} };
}
