// Reference pane for the student runner (V2-02): a resizable, collapsible panel beside the questions with the
// test's reference materials (periodic table, text / constants, image). It is a sibling of the question stage,
// built once, and never touches answers, timing or navigation.
//
//   referencePane(test, { storageKey }) -> { el, toggle(), destroy() } | null   (null when the test has no references)
//
// The runner wraps `main.runner-main` and `el` in `div.runner-split`; this module drives the `--ref-w`
// custom property (pane width, %) and `data-ref-collapsed` on that wrapper (see css/references.css).

import { h, icon, richText, renderMath } from '../ui.js';
import { load, save } from '../lib/storage.js';
import { referenceTitle, safeImageUrl } from '../lib/sections.js';
import { ELEMENTS, CATEGORIES, formatMass } from '../lib/elements.js';

const MIN_W = 20;
const MAX_W = 60;
const DEFAULT_W = 40;
const STEP = 5;
const WIDE_QUERY = '(min-width: 1000px)';

const clampW = (n) => Math.min(MAX_W, Math.max(MIN_W, Math.round(Number(n) || DEFAULT_W)));
const categoryLabel = (id) => (CATEGORIES.find(([c]) => c === id) || [id, id])[1];

/* ------------------------------------------------------------------ periodic table */

/** Accessible periodic table: a real <table> (caption, group/period headers) with one button per element. */
export function periodicTable() {
  const detail = h('p', { class: 'pt-detail', 'aria-live': 'polite', dataset: { testid: 'pt-detail' } }, 'Select an element to see its details.');
  const buttons = new Map();
  let selected = null;

  function select(e) {
    if (selected) buttons.get(selected)?.setAttribute('aria-pressed', 'false');
    selected = e.symbol;
    buttons.get(e.symbol)?.setAttribute('aria-pressed', 'true');
    detail.textContent = `${e.name} (${e.symbol}) · atomic number ${e.number} · atomic mass ${formatMass(e.mass)}`
      + ` · ${e.group ? `group ${e.group}` : 'f-block (no group)'} · period ${e.period} · ${categoryLabel(e.category)}`;
  }

  const cell = (e) => {
    const b = h('button', {
      type: 'button', class: 'pt-el', 'aria-pressed': 'false', title: `${e.name} — ${categoryLabel(e.category)}`,
      'aria-label': `${e.number} ${e.symbol}, ${e.name}, ${formatMass(e.mass)}`,
      dataset: { testid: `pt-${e.symbol}`, category: e.category },
      on: { click: () => select(e) },
    },
      h('span', { class: 'pt-el__n', 'aria-hidden': 'true' }, String(e.number)),
      h('span', { class: 'pt-el__s', 'aria-hidden': 'true' }, e.symbol),
      h('span', { class: 'pt-el__m', 'aria-hidden': 'true' }, formatMass(e.mass)));
    buttons.set(e.symbol, b);
    return h('td', { class: 'pt-cell' }, b);
  };
  const gap = () => h('td', { class: 'pt-gap', 'aria-hidden': 'true' });
  const marker = (text, cat) => h('td', { class: 'pt-cell' }, h('span', { class: 'pt-marker', dataset: { category: cat }, title: `${text}: see the row below the table` }, text));

  const head = h('tr', {}, h('td', { class: 'pt-corner' }),
    Array.from({ length: 18 }, (_, i) => h('th', { scope: 'col', class: 'pt-head' }, String(i + 1))));

  const rows = [];
  for (let period = 1; period <= 7; period++) {
    const tds = [h('th', { scope: 'row', class: 'pt-head' }, String(period))];
    for (let g = 1; g <= 18; g++) {
      const e = ELEMENTS.find((x) => x.period === period && x.group === g);
      if (e) tds.push(cell(e));
      else if (g === 3 && period === 6) tds.push(marker('57–71', 'lanthanide'));
      else if (g === 3 && period === 7) tds.push(marker('89–103', 'actinide'));
      else tds.push(gap());
    }
    rows.push(h('tr', {}, tds));
  }
  const fRow = (label, cat) => {
    const list = ELEMENTS.filter((e) => e.category === cat);
    return h('tr', { class: cat === 'lanthanide' ? 'pt-frow pt-frow--first' : 'pt-frow' },
      h('th', { scope: 'row', class: 'pt-head pt-head--f' }, label),
      gap(), gap(), list.map(cell), gap());
  };
  rows.push(fRow('Ln', 'lanthanide'), fRow('An', 'actinide'));

  const legend = h('ul', { class: 'pt-legend', 'aria-label': 'Element categories' },
    CATEGORIES.map(([id, label]) => h('li', {}, h('i', { class: 'pt-key', dataset: { category: id }, 'aria-hidden': 'true' }), label)));

  return h('div', { class: 'pt' },
    h('div', { class: 'pt-scroll', tabindex: '-1' },
      h('table', { class: 'pt-table' },
        h('caption', { class: 'sr-only' }, 'Periodic table of the elements'),
        h('thead', {}, head), h('tbody', {}, rows))),
    detail, legend);
}

/* ------------------------------------------------------------------ panels */

function panelContent(ref) {
  if (ref.type === 'periodic-table') return periodicTable();
  if (ref.type === 'text') return richText(ref.content, 'div', 'ref-text');
  if (ref.type === 'image') {
    const src = safeImageUrl(ref.url);
    if (!src) return h('p', { class: 'muted' }, 'This image is not available.');
    return h('figure', { class: 'ref-image' },
      h('img', { src, alt: ref.alt || referenceTitle(ref), loading: 'lazy' }),
      h('a', { class: 'ref-image__link', href: src, target: '_blank', rel: 'noopener noreferrer' }, 'Open full size'));
  }
  return h('p', { class: 'muted' }, 'Unsupported reference type.');
}

/* ------------------------------------------------------------------ pane */

export function referencePane(test, { storageKey } = {}) {
  const refs = (Array.isArray(test?.references) ? test.references : []).filter((r) => r && r.id);
  if (!refs.length) return null;

  const wide = typeof matchMedia === 'function' ? matchMedia(WIDE_QUERY) : null;
  const isWide = () => (wide ? wide.matches : true);

  const saved = (storageKey && load(storageKey, null)) || {};
  const state = {
    collapsed: typeof saved.collapsed === 'boolean' ? saved.collapsed : !isWide(),
    explicit: typeof saved.collapsed === 'boolean', // true once the student (or a stored choice) decided
    width: clampW(saved.width),
    tab: refs.some((r) => r.id === saved.tab) ? saved.tab : refs[0].id,
  };
  const persist = () => { if (storageKey) save(storageKey, { collapsed: state.collapsed, width: state.width, tab: state.tab }); };

  /* ---- structure */
  const bodyId = `ref-body-${refs[0].id}`;
  const toggleBtn = h('button', {
    type: 'button', class: 'ref-pane__toggle icon-btn', 'aria-controls': bodyId, dataset: { testid: 'ref-toggle' },
    on: { click: () => setCollapsed(!state.collapsed, true) },
  });
  const head = h('div', { class: 'ref-pane__head' }, h('h2', { class: 'ref-pane__title' }, 'Reference'), toggleBtn);

  const tabs = new Map();
  const panels = new Map();
  const multi = refs.length > 1;
  const tablist = multi
    ? h('div', { class: 'ref-tabs', role: 'tablist', 'aria-label': 'Reference materials',
      on: { keydown: onTabKey } },
    refs.map((r) => {
      const t = h('button', {
        type: 'button', class: 'ref-tab', role: 'tab', id: `ref-tab-el-${r.id}`, 'aria-controls': `ref-panel-${r.id}`,
        'aria-selected': 'false', tabindex: '-1', dataset: { testid: `ref-tab-${r.id}` },
        on: { click: () => selectTab(r.id) },
      }, referenceTitle(r));
      tabs.set(r.id, t);
      return t;
    }))
    : null;
  for (const r of refs) {
    panels.set(r.id, h('div', {
      class: 'ref-panel', role: multi ? 'tabpanel' : 'region', id: `ref-panel-${r.id}`,
      'aria-label': referenceTitle(r), dataset: { testid: `ref-panel-${r.id}` },
    }, multi ? null : h('h3', { class: 'ref-panel__title' }, referenceTitle(r)), panelContent(r)));
    if (multi) panels.get(r.id).setAttribute('aria-labelledby', `ref-tab-el-${r.id}`);
    if (multi) panels.get(r.id).removeAttribute('aria-label');
  }
  const body = h('div', { class: 'ref-pane__body', id: bodyId }, tablist, h('div', { class: 'ref-panels' }, [...panels.values()]));

  const resizer = h('div', {
    class: 'ref-resizer', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Resize reference pane',
    'aria-valuemin': String(MIN_W), 'aria-valuemax': String(MAX_W), 'aria-valuenow': String(state.width), tabindex: '0',
    dataset: { testid: 'ref-resizer' },
    on: { keydown: onResizerKey, pointerdown: onPointerDown },
  });

  const el = h('aside', { class: 'ref-pane', 'aria-label': 'Reference materials', dataset: { testid: 'reference-pane', collapsed: 'false' } },
    resizer, head, body);

  /* ---- host (div.runner-split) */
  const host = () => (el.parentElement?.classList.contains('runner-split') ? el.parentElement : null);
  function applyHost() {
    const hostEl = host();
    if (!hostEl) return;
    hostEl.style.setProperty('--ref-w', `${state.width}%`);
    hostEl.dataset.refCollapsed = String(state.collapsed);
  }

  function applyState() {
    el.dataset.collapsed = String(state.collapsed);
    body.hidden = state.collapsed;
    resizer.setAttribute('aria-valuenow', String(state.width));
    const side = isWide();
    toggleBtn.setAttribute('aria-expanded', String(!state.collapsed));
    toggleBtn.setAttribute('aria-label', state.collapsed ? 'Show reference pane' : 'Hide reference pane');
    toggleBtn.title = `${state.collapsed ? 'Show' : 'Hide'} reference (R)`;
    toggleBtn.replaceChildren(icon(side ? (state.collapsed ? 'left' : 'right') : (state.collapsed ? 'down' : 'up'), { size: 16 }));
    applyHost();
  }

  function setCollapsed(value, explicit = false) {
    state.collapsed = !!value;
    if (explicit) state.explicit = true;
    applyState();
    persist();
    if (!state.collapsed) renderMath(el);
  }

  function setWidth(w, { commit = true } = {}) {
    state.width = clampW(w);
    resizer.setAttribute('aria-valuenow', String(state.width));
    applyHost();
    if (commit) persist();
  }

  function selectTab(id, { focus = false } = {}) {
    if (!panels.has(id)) return;
    state.tab = id;
    for (const [rid, panel] of panels) panel.hidden = rid !== id;
    for (const [rid, t] of tabs) {
      const on = rid === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      t.classList.toggle('is-selected', on);
    }
    if (focus) tabs.get(id)?.focus();
    renderMath(panels.get(id));
    persist();
  }

  function onTabKey(e) {
    const ids = refs.map((r) => r.id);
    const i = ids.indexOf(state.tab);
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % ids.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = ids.length - 1;
    if (j < 0) return;
    e.preventDefault(); // keep the runner's own arrow-key navigation out of it
    selectTab(ids[j], { focus: true });
  }

  function onResizerKey(e) {
    let w = null;
    // The handle sits on the pane's left edge: moving it left makes the pane wider.
    if (e.key === 'ArrowLeft') w = state.width + STEP;
    else if (e.key === 'ArrowRight') w = state.width - STEP;
    else if (e.key === 'Home') w = MIN_W;
    else if (e.key === 'End') w = MAX_W;
    if (w == null) return;
    e.preventDefault();
    setWidth(w);
  }

  function onPointerDown(e) {
    const hostEl = host();
    if (!hostEl || (e.button != null && e.button !== 0)) return;
    e.preventDefault();
    resizer.setPointerCapture?.(e.pointerId);
    hostEl.classList.add('is-resizing');
    const move = (ev) => {
      const r = hostEl.getBoundingClientRect();
      if (r.width > 0) setWidth(((r.right - ev.clientX) / r.width) * 100, { commit: false });
    };
    const up = () => {
      hostEl.classList.remove('is-resizing');
      resizer.removeEventListener('pointermove', move);
      resizer.removeEventListener('pointerup', up);
      resizer.removeEventListener('pointercancel', up);
      persist();
    };
    resizer.addEventListener('pointermove', move);
    resizer.addEventListener('pointerup', up);
    resizer.addEventListener('pointercancel', up);
  }

  // Crossing the 1000px breakpoint: follow the default for the new layout unless the student chose.
  const onMedia = () => {
    if (!state.explicit) state.collapsed = !isWide();
    applyState();
  };
  wide?.addEventListener?.('change', onMedia);

  selectTab(state.tab);
  applyState();
  queueMicrotask(applyHost); // the runner appends `el` to .runner-split right after this call returns
  renderMath(el);

  return {
    el,
    toggle: () => setCollapsed(!state.collapsed, true),
    destroy() { wide?.removeEventListener?.('change', onMedia); },
  };
}
