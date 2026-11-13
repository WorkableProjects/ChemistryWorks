// Energy orbital diagrams: interactive student widget + static diagram.
//
// Layout: one row per sublevel, highest energy at the top, boxes side by side. Each box shows ↑ and/or ↓
// (spin is conveyed by arrow direction, never by colour).
// Student controls: click / Enter / Space cycles empty → ↑ → ↑↓ → ↓ → empty (Shift-click or right-click goes
// back). ArrowUp adds a spin-up electron, ArrowDown adds a spin-down one, Backspace / Delete / 0 empties,
// ArrowLeft / ArrowRight move between the boxes of a row.

import { h } from '../ui.js';
import {
  sublevelsFor, boxCount, normalizeOrbitalAnswer, isOrbitalAnswered, orbitalElectronCount, describeOrbital, boxLabel, BOX_STATES,
} from '../lib/orbital.js';

const GLYPH = { '': '', u: '↑', d: '↓', ud: '↑↓' };
const stateName = (b) => b || 'empty';
const rowsTopDown = (q) => [...sublevelsFor(q)].reverse();

const axis = () => h('span', { class: 'orb-axis', 'aria-hidden': 'true' }, 'Energy ↑');

/** Static diagram for results / grading / export. answer = { [sublevel]: Box[] }. */
export function orbitalDiagram(q, answer, { label = 'Orbital diagram', size = 'md' } = {}) {
  const n = normalizeOrbitalAnswer(q, answer);
  const rows = rowsTopDown(q).map((sub) => h('div', { class: 'orb-row' },
    h('span', { class: 'orb-sub' }, sub),
    h('span', { class: 'orb-boxes' }, n[sub].map((b) => h('span', { class: 'orb-box orb-box--static', dataset: { state: stateName(b) } }, GLYPH[b])))));
  return h('span', { class: `orb orb--${size}`, role: 'img', 'aria-label': `${label}: ${describeOrbital(q, answer)}` },
    axis(), h('span', { class: 'orb-rows', 'aria-hidden': 'true' }, rows));
}

/** Student widget. Runner widget contract { el, refresh(answer), focus() }. */
export function orbitalWidget(q, api) {
  const current = () => normalizeOrbitalAnswer(q, api.get(q.id));
  const store = (next) => api.set(q.id, isOrbitalAnswered(q, next) ? next : undefined);
  const set = (sub, i, state) => {
    const next = current();
    if (next[sub][i] === state) return;
    next[sub][i] = state;
    store(next);
  };
  const cycle = (sub, i, dir) => {
    const cur = current()[sub][i];
    const k = BOX_STATES.indexOf(cur);
    set(sub, i, BOX_STATES[(k + dir + BOX_STATES.length) % BOX_STATES.length]);
  };

  const boxes = {}; // `${sub}-${i}` -> button
  const focusBox = (sub, i) => boxes[`${sub}-${i}`]?.focus();

  const onKey = (sub, i) => (e) => {
    const cur = current()[sub][i];
    const k = e.key;
    if (k === 'Enter' || k === ' ') { e.preventDefault(); cycle(sub, i, e.shiftKey ? -1 : 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); set(sub, i, cur === 'd' || cur === 'ud' ? 'ud' : 'u'); }
    else if (k === 'ArrowDown') { e.preventDefault(); set(sub, i, cur === 'u' || cur === 'ud' ? 'ud' : 'd'); }
    else if (k === 'Backspace' || k === 'Delete' || k === '0') { e.preventDefault(); set(sub, i, ''); }
    else if (k === 'ArrowLeft' && i > 0) { e.preventDefault(); focusBox(sub, i - 1); }
    else if (k === 'ArrowRight' && i < boxCount(sub) - 1) { e.preventDefault(); focusBox(sub, i + 1); }
  };

  const rows = rowsTopDown(q).map((sub) => h('div', { class: 'orb-row' },
    h('span', { class: 'orb-sub' }, sub),
    h('span', { class: 'orb-boxes' }, Array.from({ length: boxCount(sub) }, (_, i) => {
      const b = h('button', {
        type: 'button', class: 'orb-box', dataset: { testid: `orbital-box-${sub}-${i}`, state: 'empty' },
        on: {
          click: (e) => cycle(sub, i, e.shiftKey ? -1 : 1),
          contextmenu: (e) => { e.preventDefault(); cycle(sub, i, -1); },
          keydown: onKey(sub, i),
        },
      });
      boxes[`${sub}-${i}`] = b;
      return b;
    }))));

  const count = h('p', { class: 'q-hint orb-count', 'aria-live': 'polite', dataset: { testid: 'orbital-count' } });

  function refresh(answer) {
    const n = normalizeOrbitalAnswer(q, answer);
    for (const sub of Object.keys(n)) {
      n[sub].forEach((st, i) => {
        const b = boxes[`${sub}-${i}`];
        if (!b) return;
        b.dataset.state = stateName(st);
        b.textContent = GLYPH[st];
        b.setAttribute('aria-label', boxLabel(sub, i, st));
        b.classList.toggle('is-set', st !== '');
      });
    }
    const e = orbitalElectronCount(q, answer);
    count.textContent = `${e} ${e === 1 ? 'electron' : 'electrons'} placed`;
  }
  refresh(api.get(q.id));

  const help = h('p', { class: 'q-hint' },
    'Click a box to cycle empty → ↑ → ↑↓ → ↓. Shift-click or right-click to go back. Keyboard: ↑ adds a spin-up electron, ',
    '↓ adds a spin-down electron, Backspace empties the box, ← and → move between boxes.');
  const board = h('div', { class: 'orb orb--lg orb--edit' }, axis(), h('div', { class: 'orb-rows', role: 'group', 'aria-labelledby': `qt-${q.id}` }, rows));
  return {
    el: h('div', { class: 'q-orbital' }, board, count, help),
    refresh,
    focus: () => { const subs = rowsTopDown(q); if (subs.length) focusBox(subs[subs.length - 1], 0); },
  };
}
