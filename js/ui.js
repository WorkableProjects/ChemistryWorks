// Shared DOM helpers used by every view. No framework: views build DOM with `h()` and
// return a cleanup function from their render function.

/**
 * Create an element.
 *   h('button', { class: 'btn', on: { click: fn }, dataset: { testid: 'x' }, disabled: true }, 'Label')
 * attrs:
 *   class | className  string (falsy parts ignored if array)
 *   on                 { eventName: handler }
 *   dataset            { key: value }  -> data-key="value"
 *   style              string or object
 *   html               raw innerHTML (only for trusted, static markup — never user/test content)
 *   any other key      set as attribute; `true` -> empty attribute, false/null/undefined -> omitted
 *   value/checked/selected/indeterminate are set as properties
 * children: strings, numbers, Nodes, arrays (flattened), null/false (skipped)
 */
export function h(tag, attrs = {}, ...children) {
  const el = tag === 'svg' || attrs?.xmlns ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') {
      const cls = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      if (cls) el.setAttribute('class', cls);
    } else if (k === 'on') {
      for (const [ev, fn] of Object.entries(v)) if (fn) el.addEventListener(ev, fn);
    } else if (k === 'dataset') {
      for (const [dk, dv] of Object.entries(v)) if (dv != null) el.dataset[dk] = dv;
    } else if (k === 'style') {
      if (typeof v === 'string') el.setAttribute('style', v);
      else Object.assign(el.style, v);
    } else if (k === 'html') {
      el.innerHTML = v;
    } else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'indeterminate') {
      el[k] = v;
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Replace all children of `root` with `nodes`. */
export function mount(root, ...nodes) {
  root.replaceChildren();
  append(root, nodes);
  return root;
}

/** Inline SVG icon from a small built-in set. */
const ICONS = {
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 14h9"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H4"/>',
  sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 9v12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
};
export function icon(name, { size = 18, className = '' } = {}) {
  const span = document.createElement('span');
  span.className = `icon ${className}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

/**
 * Render a piece of test content (question text, option text, explanation).
 * Content is plain text with optional KaTeX delimiters: $...$, $$...$$, \(...\), \[...\].
 * mhchem is available inside math: $\ce{H2SO4}$. Text is never parsed as HTML.
 * Returns a <span class="rich"> (or `tag`) node; call renderMath(container) after mounting.
 */
export function richText(text, tag = 'span', className = '') {
  const el = document.createElement(tag);
  el.className = `rich ${className}`.trim();
  el.textContent = text == null ? '' : String(text);
  return el;
}

const MATH_DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '$', right: '$', display: false },
  { left: '\\(', right: '\\)', display: false },
];

let mathQueue = [];
function katexReady() {
  return typeof window !== 'undefined' && typeof window.renderMathInElement === 'function' && window.katex;
}
function flushMath() {
  const q = mathQueue;
  mathQueue = [];
  q.forEach((root) => renderMath(root));
}
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => setTimeout(flushMath, 0));
}

/**
 * Typeset KaTeX in every `.rich` element under `root` that has not been typeset yet, then add
 * `.math-ready` to trigger the fade-in transition. Safe to call repeatedly and before KaTeX loads
 * (the call is queued and replayed once it does).
 */
export function renderMath(root) {
  if (!root) return;
  const targets = root.matches?.('.rich') ? [root] : Array.from(root.querySelectorAll('.rich:not(.math-ready)'));
  if (!katexReady()) {
    mathQueue.push(root);
    // Still show text immediately if KaTeX never arrives (offline): reveal after a grace period.
    setTimeout(() => targets.forEach((t) => t.classList.add('math-ready')), 1200);
    return;
  }
  for (const t of targets) {
    if (t.dataset.typeset === '1') {
      t.classList.add('math-ready');
      continue;
    }
    try {
      window.renderMathInElement(t, { delimiters: MATH_DELIMITERS, throwOnError: false, strict: 'ignore' });
    } catch {
      /* leave raw text */
    }
    t.dataset.typeset = '1';
    requestAnimationFrame(() => t.classList.add('math-ready'));
  }
}

/** Toast notification. type: 'info' | 'success' | 'error' | 'warning' */
export function toast(message, { type = 'info', timeout = 3200 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const iconName = { success: 'check', error: 'alert', warning: 'alert', info: 'info' }[type] || 'info';
  const el = h('div', { class: `toast toast--${type}`, dataset: { testid: 'toast' } }, icon(iconName), h('span', {}, message));
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 300);
  }, timeout);
}

/**
 * Modal dialog. Returns { close, el }.
 *   openModal({ title, body: Node|string, actions: [{ label, variant: 'primary'|'ghost'|'danger', onClick(close), testid, autofocus }],
 *               dismissible: true, testid: 'submit-modal', onClose })
 * Focus is trapped inside while open; Escape closes when dismissible.
 */
export function openModal({ title, body, actions = [], dismissible = true, testid = 'modal', onClose, wide = false } = {}) {
  const root = document.getElementById('modal-root');
  const previouslyFocused = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.classList.remove('is-open');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => overlay.remove(), 220);
    previouslyFocused?.focus?.();
    onClose?.();
  };
  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
  const buttons = actions.map((a) =>
    h('button', {
      class: `btn btn--${a.variant || 'ghost'}`,
      type: 'button',
      dataset: { testid: a.testid },
      on: { click: () => a.onClick ? a.onClick(close) : close() },
    }, a.label),
  );
  const dialog = h('div', { class: ['modal', wide && 'modal--wide'], role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, dataset: { testid } },
    h('h2', { class: 'modal__title', id: titleId }, title || ''),
    h('div', { class: 'modal__body' }, typeof body === 'string' ? h('p', {}, body) : body),
    buttons.length ? h('div', { class: 'modal__actions' }, buttons) : null,
  );
  const overlay = h('div', { class: 'modal-overlay', on: { mousedown: (e) => { if (dismissible && e.target === overlay) close(); } } }, dialog);
  function onKey(e) {
    if (e.key === 'Escape' && dismissible) { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const f = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  root.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    const auto = actions.findIndex((a) => a.autofocus);
    (buttons[auto >= 0 ? auto : buttons.length - 1] || dialog).focus?.();
  });
  renderMath(dialog);
  return { close, el: dialog };
}

/** 75 -> "1:15", 3725 -> "1:02:05" */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}

/** Human-friendly duration: 75 -> "1m 15s" */
export function formatDurationLong(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60), r = s % 60;
  if (!m) return `${r}s`;
  const hr = Math.floor(m / 60);
  return hr ? `${hr}h ${m % 60}m` : `${m}m ${r}s`;
}

/** Respect the user's reduced-motion setting in JS-driven animations. */
export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Standard app header used by runner/admin. `right` is a Node or array of Nodes. */
export function appHeader({ title = 'ChemistryWorks', subtitle = '', right = null, onHome = null } = {}) {
  return h('header', { class: 'app-header' },
    h('button', { class: 'brand', type: 'button', 'aria-label': 'ChemistryWorks home', on: { click: onHome }, dataset: { testid: 'brand' } },
      h('span', { class: 'brand__mark' }, icon('flask', { size: 18 })),
      h('span', { class: 'brand__text' },
        h('span', { class: 'brand__name' }, title),
        subtitle ? h('span', { class: 'brand__sub' }, subtitle) : null,
      ),
    ),
    h('div', { class: 'app-header__right' }, right),
  );
}

/** Student badge: avatar + name/email. */
export function userBadge(user, { onSignOut } = {}) {
  if (!user) return null;
  const initials = (user.name || user.email || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return h('div', { class: 'user-badge', dataset: { testid: 'user-badge' } },
    user.picture
      ? h('img', { class: 'user-badge__avatar', src: user.picture, alt: '', referrerpolicy: 'no-referrer' })
      : h('span', { class: 'user-badge__avatar user-badge__avatar--initials', 'aria-hidden': 'true' }, initials),
    h('span', { class: 'user-badge__text' },
      h('span', { class: 'user-badge__name' }, user.name || user.email),
      h('span', { class: 'user-badge__email' }, user.email),
    ),
    onSignOut ? h('button', { class: 'icon-btn', type: 'button', title: 'Sign out', 'aria-label': 'Sign out', on: { click: onSignOut }, dataset: { testid: 'sign-out' } }, icon('logout')) : null,
  );
}

/** Deterministic shuffle (seeded) so a student's order is stable across reloads. */
export function seededShuffle(array, seedString) {
  let seed = 2166136261;
  for (const ch of String(seedString)) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    return ((seed ^= seed >>> 16) >>> 0) / 4294967296;
  };
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
