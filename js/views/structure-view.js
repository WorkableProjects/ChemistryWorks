// SVG rendering for full Lewis structures ("structure" questions): a static diagram (results, builder preview)
// and the interactive student widget (runner).
//
// Student controls: click a bond to cycle none → single → double → triple; click an atom to add a lone pair
// (0-4). Shift-click or right-click goes backwards. Keyboard: Tab to a bond/atom, Enter/Space/↑/+ adds,
// ↓/−/Backspace removes.

import { h } from '../ui.js';
import {
  layoutAtoms, bondEnds, normalizeStructureAnswer, electronsDrawn, valenceTotal, isStructureAnswered,
  MAX_BOND_ORDER, MAX_LONE_PAIRS, MAX_CHARGE, chargeLabel,
} from '../lib/structure.js';

const NS = 'http://www.w3.org/2000/svg';
const UNIT = 86;      // px per grid unit
const PAD = 44;       // px around the drawing
const ATOM_R = 17;    // bond lines stop this far from an atom centre
const PAIR_R = 25;    // distance of a lone pair from the atom centre
const BOND_GAP = 6;   // px between parallel lines of a double/triple bond
const BOND_NAMES = ['no bond', 'single bond', 'double bond', 'triple bond'];

function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c) el.appendChild(c);
  return el;
}

/** Pixel geometry shared by the static and interactive renderers. */
function geometry(q) {
  const grid = layoutAtoms(q);
  const pts = Object.values(grid);
  const minX = Math.min(...pts.map((p) => p.x), 0);
  const minY = Math.min(...pts.map((p) => p.y), 0);
  const maxX = Math.max(...pts.map((p) => p.x), 0);
  const maxY = Math.max(...pts.map((p) => p.y), 0);
  const px = {};
  for (const [id, p] of Object.entries(grid)) px[id] = { x: PAD + (p.x - minX) * UNIT, y: PAD + (p.y - minY) * UNIT };
  const bracket = q.studentCharges || Number(q.charge) ? 26 : 0; // student-drawn brackets always get room
  for (const p of Object.values(px)) { p.x += bracket; }
  return {
    px,
    width: PAD * 2 + (maxX - minX) * UNIT + bracket * 2 + (bracket ? 18 : 0),
    height: PAD * 2 + (maxY - minY) * UNIT,
    bracket,
  };
}

const ANGLES = [0, 90, 180, 270, 45, 135, 225, 315].map((d) => (d * Math.PI) / 180);
const angDist = (a, b) => { const d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };

/** Choose `n` directions around an atom that stay clear of its bonds. */
function pairSlots(atomId, q, px, n) {
  const p = px[atomId];
  const taken = [];
  for (const b of q.bonds || []) {
    const e = bondEnds(b);
    if (!e) continue;
    const other = e[0] === atomId ? e[1] : e[1] === atomId ? e[0] : null;
    if (other && px[other]) taken.push(Math.atan2(px[other].y - p.y, px[other].x - p.x));
  }
  // One bond (terminal atom) or none: spread the pairs evenly around the free side, like a textbook drawing.
  if (taken.length <= 1) {
    const start = taken.length ? taken[0] : -Math.PI / 2;
    const parts = taken.length ? n + 1 : n;
    return Array.from({ length: n }, (_, k) => start + ((k + (taken.length ? 1 : 0)) * 2 * Math.PI) / parts);
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    let best = null, bestScore = -1;
    for (const a of ANGLES) {
      if (out.includes(a)) continue;
      const all = [...taken, ...out];
      const score = all.length ? Math.min(...all.map((t) => angDist(a, t))) : Math.PI;
      if (score > bestScore + 1e-6) { best = a; bestScore = score; }
    }
    out.push(best ?? ANGLES[k % ANGLES.length]);
  }
  return out;
}

function bondLines(a, b, order, { placeholder = false } = {}) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const x1 = a.x + ux * ATOM_R, y1 = a.y + uy * ATOM_R, x2 = b.x - ux * ATOM_R, y2 = b.y - uy * ATOM_R;
  if (!order) {
    return placeholder ? [s('line', { x1, y1, x2, y2, class: 'st-bond__ghost' })] : [];
  }
  const out = [];
  for (let i = 0; i < order; i++) {
    const off = (i - (order - 1) / 2) * BOND_GAP;
    out.push(s('line', { x1: x1 + nx * off, y1: y1 + ny * off, x2: x2 + nx * off, y2: y2 + ny * off, class: 'st-bond__line' }));
  }
  return out;
}

function pairDots(p, angles) {
  const out = [];
  for (const a of angles) {
    const cx = p.x + Math.cos(a) * PAIR_R, cy = p.y + Math.sin(a) * PAIR_R;
    const nx = -Math.sin(a) * 4.6, ny = Math.cos(a) * 4.6;
    out.push(s('circle', { cx: cx + nx, cy: cy + ny, r: 2.9, class: 'st-dot' }), s('circle', { cx: cx - nx, cy: cy - ny, r: 2.9, class: 'st-dot' }));
  }
  return out;
}

const bracketPaths = (geo, charge) => {
  const { width, height } = geo;
  const l = 10, r = width - 28, t = 12, b = height - 12;
  return {
    paths: [
      s('path', { d: `M${l + 8} ${t} H${l} V${b} H${l + 8}`, class: 'st-bracket' }),
      s('path', { d: `M${r - 8} ${t} H${r} V${b} H${r - 8}`, class: 'st-bracket' }),
    ],
    text: charge ? s('text', { x: r + 5, y: t + 12, class: 'st-charge', 'data-testid': 'structure-charge-mark', text: charge }) : null,
  };
};

function chargeMarks(q, geo, marks) {
  if (q.studentCharges) {
    // The student draws the brackets; the skeleton charge is not pre-drawn. Charge without brackets sits beside the drawing.
    if (!marks) return [];
    const { paths, text } = bracketPaths(geo, chargeLabel(marks.charge));
    return [...(marks.bracket ? paths : []), text].filter(Boolean);
  }
  const c = Number(q.charge);
  if (!c) return [];
  const sign = c > 0 ? '+' : '−';
  const mag = Math.abs(c) === 1 ? '' : String(Math.abs(c));
  const { paths, text } = bracketPaths(geo, `${mag}${sign}`);
  return [...paths, text];
}

/** Formal charge badges: a small circled text label at the upper right of each atom symbol. */
function formalChargeMarks(q, geo, marks) {
  if (!q.studentCharges || !marks) return [];
  return (q.atoms || []).filter((a) => marks.formalCharges[a.id] && geo.px[a.id]).map((a) => {
    const p = geo.px[a.id];
    const cx = p.x + 17, cy = p.y - 16;
    return s('g', { class: 'st-fc', 'data-testid': `structure-fcmark-${a.id}` },
      s('circle', { cx, cy, r: 9, class: 'st-fc__ring' }),
      s('text', { x: cx, y: cy, class: 'st-fc__text', 'dominant-baseline': 'central', 'text-anchor': 'middle', text: chargeLabel(marks.formalCharges[a.id]) || '' }));
  });
}

const atomLabel = (q, a) => {
  const same = (q.atoms || []).filter((x) => x.symbol === a.symbol);
  return same.length > 1 ? `${a.symbol} ${same.indexOf(a) + 1}` : a.symbol;
};

/** Static diagram. `answer` = { bonds, lonePairs } (missing parts are 0); with q.studentCharges also { bracket, charge, formalCharges }. */
export function structureDiagram(q, answer, { size = 'md', label } = {}) {
  const geo = geometry(q);
  const n = normalizeStructureAnswer(q, answer);
  const svg = s('svg', {
    class: `st st--${size}`, viewBox: `0 0 ${geo.width} ${geo.height}`, width: geo.width, height: geo.height,
    role: 'img', 'aria-label': label || 'Lewis structure',
  },
  (q.bonds || []).map((b, i) => {
    const e = bondEnds(b);
    return e && geo.px[e[0]] && geo.px[e[1]] ? s('g', { class: 'st-bond' }, bondLines(geo.px[e[0]], geo.px[e[1]], n.bonds[i])) : null;
  }),
  (q.atoms || []).map((a) => {
    const p = geo.px[a.id];
    return s('g', { class: 'st-atom' },
      pairDots(p, pairSlots(a.id, q, geo.px, n.lonePairs[a.id])),
      s('text', { x: p.x, y: p.y, class: 'st-sym', 'dominant-baseline': 'central', 'text-anchor': 'middle', text: a.symbol }));
  }),
  chargeMarks(q, geo, n), formalChargeMarks(q, geo, n));
  return h('span', { class: 'st-wrap' }, svg);
}

/** Student widget. Returns the runner widget contract { el, refresh(answer), focus() }. */
export function structureWidget(q, api) {
  const geo = geometry(q);
  const current = () => normalizeStructureAnswer(q, api.get(q.id));
  const store = (next) => api.set(q.id, isStructureAnswered(next) ? next : undefined);

  const bump = (kind, idx, dir) => {
    const next = current();
    if (kind === 'bond') next.bonds[idx] = (next.bonds[idx] + dir + MAX_BOND_ORDER + 1) % (MAX_BOND_ORDER + 1);
    else next.lonePairs[idx] = (next.lonePairs[idx] + dir + MAX_LONE_PAIRS + 1) % (MAX_LONE_PAIRS + 1);
    store(next);
  };
  const keyHandler = (kind, idx) => (e) => {
    if (['Enter', ' ', 'ArrowUp', 'ArrowRight', '+', '='].includes(e.key)) { e.preventDefault(); bump(kind, idx, 1); }
    else if (['ArrowDown', 'ArrowLeft', '-', 'Backspace', 'Delete'].includes(e.key)) { e.preventDefault(); bump(kind, idx, -1); }
  };
  const clickHandler = (kind, idx) => ({
    click: (e) => bump(kind, idx, e.shiftKey ? -1 : 1),
    contextmenu: (e) => { e.preventDefault(); bump(kind, idx, -1); },
    keydown: keyHandler(kind, idx),
  });

  const bondEls = (q.bonds || []).map((b, i) => {
    const e = bondEnds(b);
    if (!e || !geo.px[e[0]] || !geo.px[e[1]]) return null;
    const a = geo.px[e[0]], c = geo.px[e[1]];
    const lines = s('g', { class: 'st-bond__lines' });
    // A rotated rectangle around the bond (a plain line has a zero-height box, which is hard to click).
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    const nx = (-(c.y - a.y) / len) * 13, ny = ((c.x - a.x) / len) * 13;
    const ux = ((c.x - a.x) / len) * ATOM_R, uy = ((c.y - a.y) / len) * ATOM_R;
    const pts = [[a.x + ux + nx, a.y + uy + ny], [c.x - ux + nx, c.y - uy + ny], [c.x - ux - nx, c.y - uy - ny], [a.x + ux - nx, a.y + uy - ny]];
    const hit = s('polygon', { points: pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '), class: 'st-bond__hit' });
    const g = s('g', {
      class: 'st-bond st-bond--edit', tabindex: '0', role: 'button', 'data-testid': `structure-bond-${i}`,
      on: clickHandler('bond', i),
    }, hit, lines);
    return { g, lines, a, c, e };
  });

  const atomEls = (q.atoms || []).map((atom) => {
    const p = geo.px[atom.id];
    const pairs = s('g', { class: 'st-pairs' });
    const g = s('g', {
      class: 'st-atom st-atom--edit', tabindex: '0', role: 'button', 'data-testid': `structure-atom-${atom.id}`,
      on: clickHandler('atom', atom.id),
    },
    s('circle', { cx: p.x, cy: p.y, r: 21, class: 'st-atom__ring' }),
    pairs,
    s('text', { x: p.x, y: p.y, class: 'st-sym', 'dominant-baseline': 'central', 'text-anchor': 'middle', text: atom.symbol }));
    return { g, pairs, atom, p };
  });

  const marksG = s('g', { class: 'st-marks' });
  const svg = s('svg', {
    class: 'st st--lg st--edit', viewBox: `0 0 ${geo.width} ${geo.height}`, width: geo.width, height: geo.height,
    role: 'group', 'aria-labelledby': `qt-${q.id}`,
  },
  bondEls.map((b) => b && b.g), atomEls.map((a) => a.g), q.studentCharges ? marksG : chargeMarks(q, geo));

  const total = valenceTotal(q);
  const count = h('p', { class: 'q-hint q-structure__count', 'aria-live': 'polite', dataset: { testid: 'structure-count' } });

  /* ---- V2-06 controls (only when q.studentCharges) */
  let syncControls = () => {};
  let controls = null;
  if (q.studentCharges) {
    const signed = (n) => chargeLabel(n, { explicit: true }) || '0';
    const stepBtn = (testid, text, label, onClick) => h('button', {
      type: 'button', class: 'btn btn--ghost btn--sm st-step', 'aria-label': label, dataset: { testid }, on: { click: onClick },
    }, text);
    const setMarks = (fn) => { const next = current(); fn(next); store(next); };

    const bracketBtn = h('button', {
      type: 'button', class: 'btn btn--ghost btn--sm st-toggle', 'aria-pressed': 'false', dataset: { testid: 'structure-bracket' },
      on: { click: () => setMarks((n) => { n.bracket = !n.bracket; }) },
    }, 'Brackets');
    const chargeVal = h('span', { class: 'st-step__value', 'aria-live': 'polite', dataset: { testid: 'structure-charge-value' } }, '0');
    const chargeDown = stepBtn('structure-charge-down', '−', 'Decrease overall charge', () => setMarks((n) => { n.charge = Math.max(-MAX_CHARGE, n.charge - 1); }));
    const chargeUp = stepBtn('structure-charge-up', '+', 'Increase overall charge', () => setMarks((n) => { n.charge = Math.min(MAX_CHARGE, n.charge + 1); }));
    const toolbar = h('div', { class: 'st-toolbar', role: 'group', 'aria-label': 'Brackets and overall charge' },
      bracketBtn, h('span', { class: 'st-step__group' }, h('span', { class: 'st-step__label' }, 'Overall charge'), chargeDown, chargeVal, chargeUp));

    const fcRows = (q.atoms || []).map((atom) => {
      const val = h('span', { class: 'st-step__value', dataset: { testid: `structure-fc-${atom.id}` } }, '0');
      const down = stepBtn(`structure-fc-${atom.id}-down`, '−', '', () => setMarks((n) => { n.formalCharges[atom.id] = Math.max(-MAX_CHARGE, n.formalCharges[atom.id] - 1); }));
      const up = stepBtn(`structure-fc-${atom.id}-up`, '+', '', () => setMarks((n) => { n.formalCharges[atom.id] = Math.min(MAX_CHARGE, n.formalCharges[atom.id] + 1); }));
      const row = h('li', { class: 'st-fc-row' }, h('span', { class: 'st-fc-row__name' }, atomLabel(q, atom)), down, val, up);
      return { atom, val, down, up, row };
    });
    const fcList = h('div', { class: 'st-fc-list' },
      h('h4', { class: 'st-fc-list__title' }, 'Formal charges'),
      h('ul', { class: 'st-fc-list__rows' }, fcRows.map((r) => r.row)));

    syncControls = (n) => {
      bracketBtn.setAttribute('aria-pressed', String(n.bracket));
      bracketBtn.classList.toggle('is-on', n.bracket);
      chargeVal.textContent = signed(n.charge);
      chargeVal.setAttribute('aria-label', `Overall charge: ${signed(n.charge)}`);
      chargeDown.disabled = n.charge <= -MAX_CHARGE;
      chargeUp.disabled = n.charge >= MAX_CHARGE;
      for (const r of fcRows) {
        const v = n.formalCharges[r.atom.id];
        const name = atomLabel(q, r.atom);
        r.val.textContent = signed(v);
        r.val.setAttribute('aria-label', `Formal charge on ${name}: ${signed(v)}`);
        r.down.setAttribute('aria-label', `Decrease formal charge on ${name}`);
        r.up.setAttribute('aria-label', `Increase formal charge on ${name}`);
        r.down.disabled = v <= -MAX_CHARGE;
        r.up.disabled = v >= MAX_CHARGE;
      }
    };
    controls = [toolbar, fcList];
  }

  function refresh(answer) {
    const n = normalizeStructureAnswer(q, answer);
    bondEls.forEach((b, i) => {
      if (!b) return;
      b.lines.replaceChildren(...bondLines(b.a, b.c, n.bonds[i], { placeholder: true }));
      b.g.classList.toggle('is-set', n.bonds[i] > 0);
      const la = atomLabel(q, q.atoms.find((x) => x.id === b.e[0]) || { symbol: b.e[0] });
      const lb = atomLabel(q, q.atoms.find((x) => x.id === b.e[1]) || { symbol: b.e[1] });
      b.g.setAttribute('aria-label', `Bond ${la} to ${lb}: ${BOND_NAMES[n.bonds[i]]}. Press to change.`);
    });
    atomEls.forEach(({ g, pairs, atom, p }) => {
      const k = n.lonePairs[atom.id];
      pairs.replaceChildren(...pairDots(p, pairSlots(atom.id, q, geo.px, k)));
      g.classList.toggle('is-set', k > 0);
      g.setAttribute('aria-label', `${atomLabel(q, atom)}: ${k} lone ${k === 1 ? 'pair' : 'pairs'}. Press to add a lone pair.`);
    });
    if (q.studentCharges) {
      marksG.replaceChildren(...[chargeMarks(q, geo, n), formalChargeMarks(q, geo, n)].flat(2).filter(Boolean));
      syncControls(n);
    }
    const drawn = electronsDrawn(q, n);
    count.textContent = q.showElectronCount && total !== null
      ? `${drawn} of ${total} valence electrons drawn`
      : `${drawn} ${drawn === 1 ? 'electron' : 'electrons'} drawn`;
    count.classList.toggle('is-match', q.showElectronCount && total !== null && drawn === total);
  }
  refresh(api.get(q.id));

  const help = h('p', { class: 'q-hint' },
    'Click a bond line to cycle single → double → triple → none. Click an atom to add a lone pair (up to 4). ',
    'Shift-click or right-click to go back. Keyboard: Tab to a bond or atom, then Enter / ↑ to add and ↓ to remove.');
  return {
    el: h('div', { class: 'q-structure' }, h('div', { class: 'q-structure__board' }, svg), controls, count, help),
    refresh,
    focus: () => (bondEls.find(Boolean)?.g || atomEls[0]?.g)?.focus?.(),
  };
}
