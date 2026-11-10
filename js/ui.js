// Shared DOM helpers used by every view. No framework: views build DOM with `h()` and
// return a cleanup function from their render function.

import { THEMES, ACCENTS, getThemePref, setThemePref, getAccent, setAccent, getRole, resolvedTheme, onThemeChange,
  prefersReducedMotion, getReduceMotionPref, setReduceMotion } from './lib/theme.js';
import { feature } from './config.js';
import { FONT_STEPS, FONT_LABELS, loadSettings, saveSettings, applySettings, applyStoredSettings } from './views/tools/settings.js';
import { hasUnseenChangelog } from './lib/changelog.js';
import { SITE_VERSION } from './version.js';

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
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
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
  pen: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  sort: '<path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  // V4-01 additions (Lucide-style 2px strokes on a 24px grid)
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  play: '<polygon points="7 4 20 12 7 20 7 4"/>',
  gamepad: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3M15 12h.01M18 13.5h.01"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  layers: '<path d="M12 2l10 5-10 5L2 7l10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M8.2 13.4L7 22l5-3 5 3-1.2-8.6"/>',
  hourglass: '<path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
  sidebar: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  minus: '<path d="M5 12h14"/>',
  external: '<path d="M14 4h6v6M20 4L10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
export const ICON_NAMES = Object.keys(ICONS);
/**
 * One icon set (V4-01): every icon is a <symbol> in a single hidden SVG sprite injected once into <body>; icon()
 * returns a small <svg><use href="#i-name"></svg>. Unknown names render empty.
 */
function ensureSprite() {
  if (typeof document === 'undefined' || document.getElementById('cw-icon-sprite')) return;
  const holder = document.createElement('div');
  holder.innerHTML = `<svg id="cw-icon-sprite" xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${
    Object.entries(ICONS).map(([n, d]) => `<symbol id="i-${n}" viewBox="0 0 24 24">${d}</symbol>`).join('')}</svg>`;
  (document.body || document.documentElement).prepend(holder.firstChild);
}
export function icon(name, { size = 18, className = '' } = {}) {
  ensureSprite();
  const span = document.createElement('span');
  span.className = `icon ${className}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = ICONS[name]
    ? `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#i-${name}"/></svg>`
    : `<svg width="${size}" height="${size}" viewBox="0 0 24 24"></svg>`;
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
  if (el.textContent && NEEDS_MATH.test(el.textContent)) loadKatex();
  return el;
}

// KaTeX (+ mhchem, auto-render) is loaded on demand, only once some content actually contains math delimiters.
const KATEX_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/';
const NEEDS_MATH = /\$|\\\(|\\\[/;
let katexPromise = null;
function addScript(src) {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}
/** Load KaTeX once (katex, then mhchem + auto-render). Resolves true when ready. Safe to call repeatedly. */
export function loadKatex() {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.katex && typeof window.renderMathInElement === 'function') return Promise.resolve(true);
  if (!katexPromise) {
    katexPromise = (async () => {
      if (!window.katex && !(await addScript(`${KATEX_BASE}katex.min.js`))) return false;
      await Promise.all([addScript(`${KATEX_BASE}contrib/mhchem.min.js`), addScript(`${KATEX_BASE}contrib/auto-render.min.js`)]);
      flushMath();
      return true;
    })().catch(() => false);
    katexPromise.then((ok) => { if (!ok) katexPromise = null; });
  }
  return katexPromise;
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
// KaTeX maps a typed "·" (U+00B7) to \cdotp, which only exists in math mode, so "\text{L·atm}" renders as a
// red error. Inside text-mode groups (\text{…}, \textbf{…}, \mbox{…}, …) replace it with {\char"B7}, which
// renders the same dot in text mode. Math mode and \ce{…} already handle "·" and are left untouched.
const TEXT_MODE_CMDS = /\\(?:text(?:rm|bf|it|sf|tt|normal|up|md|sl)?|mbox)\s*\{/g;
export function fixTextModeUnicode(math) {
  const src = String(math);
  if (!src.includes('·')) return src;
  let out = '';
  let last = 0;
  TEXT_MODE_CMDS.lastIndex = 0;
  let m;
  while ((m = TEXT_MODE_CMDS.exec(src))) {
    const open = m.index + m[0].length; // just after "{"
    let depth = 1;
    let i = open;
    for (; i < src.length && depth; i++) {
      if (src[i] === '\\') { i++; continue; }
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    out += src.slice(last, open) + src.slice(open, i).replace(/·/g, '{\\char"B7}');
    last = i;
    TEXT_MODE_CMDS.lastIndex = i;
  }
  return out + src.slice(last);
}

export function renderMath(root) {
  if (!root) return;
  const targets = root.matches?.('.rich') ? [root] : Array.from(root.querySelectorAll('.rich:not(.math-ready)'));
  if (!katexReady()) {
    const plain = targets.filter((t) => !NEEDS_MATH.test(t.textContent || ''));
    plain.forEach((t) => requestAnimationFrame(() => t.classList.add('math-ready')));
    if (plain.length === targets.length) return; // no math anywhere: nothing to load or replay
    loadKatex();
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
      window.renderMathInElement(t, { delimiters: MATH_DELIMITERS, throwOnError: false, strict: 'ignore', preProcess: fixTextModeUnicode });
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
  let gone = false;
  const dismiss = () => {
    if (gone) return;
    gone = true;
    el.classList.remove('is-visible');
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), prefersReducedMotion() ? 0 : 200);
  };
  setTimeout(dismiss, timeout);
  // Swipe sideways to dismiss.
  let x0 = null;
  el.addEventListener('pointerdown', (e) => { x0 = e.clientX; el.classList.add('is-dragging'); el.setPointerCapture?.(e.pointerId); });
  el.addEventListener('pointermove', (e) => { if (x0 !== null) el.style.setProperty('--swipe-x', `${e.clientX - x0}px`); });
  const end = (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    el.classList.remove('is-dragging');
    if (Math.abs(dx) > 60) dismiss(); else el.style.removeProperty('--swipe-x');
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
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
    setTimeout(() => overlay.remove(), prefersReducedMotion() ? 0 : 200);
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

/** Respect the user's reduced-motion setting (OS or app switch) in JS-driven animations. Defined in js/lib/theme.js. */
export { prefersReducedMotion };

/** Run a DOM update inside a View Transition when supported and motion is not reduced; otherwise just run it. */
export function viewTransition(fn) {
  if (typeof document !== 'undefined' && typeof document.startViewTransition === 'function' && !prefersReducedMotion()) {
    try { return document.startViewTransition(fn); } catch { /* fall through */ }
  }
  return fn();
}

/** Animate a number in el from 0 to `to` (instant under reduced motion). */
export function countUp(el, to, { duration = 600, decimals = 0, suffix = '' } = {}) {
  const target = Number(to);
  const fmt = (v) => `${v.toFixed(decimals)}${suffix}`;
  if (!el) return;
  if (!Number.isFinite(target) || prefersReducedMotion() || typeof requestAnimationFrame !== 'function' || duration <= 0) {
    el.textContent = fmt(Number.isFinite(target) ? target : 0);
    return;
  }
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - (1 - p) ** 3;
    el.textContent = fmt(target * eased);
    if (p < 1 && el.isConnected !== false) requestAnimationFrame(tick);
    else el.textContent = fmt(target);
  };
  requestAnimationFrame(tick);
}

/** Placeholder rows while a list loads (dashboard, library, grading). */
export function skeleton(rows = 3) {
  return h('div', { class: 'skeleton', 'aria-hidden': 'true', dataset: { testid: 'skeleton' } },
    Array.from({ length: rows }, () => h('div', { class: 'skeleton__row' })));
}

/** Stagger the entrance of `.stagger-item` children (CSS `rise` keyframe) by `step` ms each. */
export function stagger(listEl, { step = 40 } = {}) {  // step matches --stagger-step
  if (!listEl) return;
  const reduced = prefersReducedMotion();
  let i = 0;
  for (const child of listEl.children) {
    if (!child.classList?.contains('stagger-item')) continue;
    child.style.animationDelay = reduced ? '0ms' : `${Math.min(i, 12) * step}ms`;
    i += 1;
  }
}

/**
 * Appearance menu: Light / Dark / System and an accent colour for the current role (student or teacher).
 * Rendered in every app header; the landing page shows it floating in the corner.
 */
export function themeControl({ floating = false } = {}) {
  const btnIcon = h('span', { class: 'theme-ctl__icon' });
  const newDot = h('span', { class: 'theme-ctl__dot', 'aria-hidden': 'true', dataset: { testid: 'changelog-dot' } });
  const drawIcon = () => { btnIcon.replaceChildren(icon('settings', { size: 18 })); newDot.hidden = !hasUnseenChangelog(); };
  const LABELS = { system: ['monitor', 'System'], light: ['sun', 'Light'], dark: ['moon', 'Dark'] };
  const segBtns = THEMES.map((t) => h('button', { type: 'button', role: 'radio', class: 'theme-seg__btn', dataset: { testid: `theme-${t}` },
    on: { click: () => setThemePref(t) } }, icon(LABELS[t][0], { size: 16 }), LABELS[t][1]));
  const swatches = Object.entries(ACCENTS).map(([name, color]) => h('button', {
    type: 'button', role: 'radio', class: 'theme-swatch', style: `--sw:${color}`, title: name[0].toUpperCase() + name.slice(1),
    'aria-label': `${name} accent`, dataset: { testid: `accent-${name}` }, on: { click: () => setAccent(name) },
  }));
  const roleNote = h('p', { class: 'theme-ctl__note' });
  // V4-05 student tools: font size (3 steps) + dyslexia-friendly spacing, saved on this device.
  const toolsOn = feature('studentTools');
  const fontBtns = toolsOn ? FONT_STEPS.map((f) => h('button', { type: 'button', role: 'radio', class: 'theme-seg__btn', dataset: { testid: `font-${f}` },
    on: { click: () => { applySettings(saveSettings({ ...loadSettings(), font: f })); sync(); } } }, FONT_LABELS[f])) : [];
  const spacingBox = toolsOn ? h('input', { type: 'checkbox', dataset: { testid: 'dyslexia-spacing' }, 'aria-label': 'Dyslexia-friendly spacing',
    on: { change: () => { applySettings(saveSettings({ ...loadSettings(), spacing: spacingBox.checked })); } } }) : null;
  const motionBox = h('input', { type: 'checkbox', dataset: { testid: 'reduce-motion' }, 'aria-label': 'Reduce motion',
    on: { change: () => setReduceMotion(motionBox.checked) } });
  const sync = () => {
    drawIcon();
    motionBox.checked = getReduceMotionPref();
    const pref = getThemePref();
    segBtns.forEach((b, i) => b.setAttribute('aria-checked', String(THEMES[i] === pref)));
    if (toolsOn) {
      const st = loadSettings();
      fontBtns.forEach((b, i) => b.setAttribute('aria-checked', String(FONT_STEPS[i] === st.font)));
      spacingBox.checked = st.spacing;
    }
    const acc = getAccent();
    swatches.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.testid === `accent-${acc}`)));
    roleNote.textContent = getRole() === 'admin' ? 'Accent for the teacher panel. Students have their own.' : 'Accent for the student view. The teacher panel has its own.';
  };
  const pop = h('div', { class: 'theme-ctl__pop', role: 'dialog', 'aria-label': 'Settings', hidden: true, dataset: { testid: 'theme-menu' } },
    h('p', { class: 'theme-ctl__title' }, 'Settings'),
    h('span', { class: 'theme-ctl__label' }, 'Theme'),
    h('div', { class: 'theme-seg', role: 'radiogroup', 'aria-label': 'Theme' }, segBtns),
    h('label', { class: 'reduce-motion-row' }, h('span', {}, 'Reduce motion'), motionBox),
    toolsOn ? h('span', { class: 'theme-ctl__label' }, 'Text size') : null,
    toolsOn ? h('div', { class: 'theme-seg', role: 'radiogroup', 'aria-label': 'Text size' }, fontBtns) : null,
    toolsOn ? h('label', { class: 'reduce-motion-row' }, h('span', {}, 'Dyslexia-friendly spacing'), spacingBox) : null,
    h('span', { class: 'theme-ctl__label' }, 'Accent colour'),
    h('div', { class: 'theme-swatches', role: 'radiogroup', 'aria-label': 'Accent colour' }, swatches),
    roleNote,
    // Release notes for every version (changelog/*.md), one collapsible section each.
    h('button', { type: 'button', class: 'theme-ctl__news', dataset: { testid: 'open-changelog' },
      on: { click: () => { setOpen(false); import('./views/changelog.js').then((m) => m.openChangelog({ onSeen: drawIcon })); } } },
      icon('sparkle', { size: 16 }), h('span', {}, "What's new"), h('span', { class: 'theme-ctl__ver' }, `v${SITE_VERSION}`)));
  const btn = h('button', { type: 'button', class: 'theme-ctl__btn', 'aria-label': 'Settings: theme, motion and accent colour', 'aria-expanded': 'false', 'aria-haspopup': 'dialog', title: 'Settings',
    dataset: { testid: 'theme-toggle' }, on: { click: (e) => { e.stopPropagation(); setOpen(pop.hidden); } } }, btnIcon, newDot);
  const wrap = h('div', { class: ['theme-ctl', floating && 'theme-float'] }, btn, pop);
  function setOpen(open) {
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) { sync(); (pop.querySelector('[aria-checked="true"]') || segBtns[0]).focus(); }
  }
  const onDoc = (e) => { if (!pop.hidden && !wrap.contains(e.target)) setOpen(false); };
  const onKey = (e) => { if (!pop.hidden && e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.focus(); } };
  document.addEventListener('click', onDoc);
  document.addEventListener('keydown', onKey, true);
  const off = onThemeChange(sync);
  // Detach global listeners once the header is removed from the page.
  const mo = new MutationObserver(() => {
    if (!wrap.isConnected) { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey, true); off(); mo.disconnect(); }
  });
  requestAnimationFrame(() => { if (wrap.isConnected) mo.observe(document.body, { childList: true, subtree: true }); });
  sync();
  return wrap;
}

/** Standard app header used by runner/admin. `right` is a Node or array of Nodes. */
/* ---------- Brand: logo images + animated flask loader ---------- */

/**
 * Brand logo (V4-00): inline SVG built from assets/brand/source/chemworks-mark.svg, so it is sharp at any size and
 * recolours through CSS variables (--brand-navy, --brand-teal, --brand-mark-gap; dark mode and the navy header swap
 * them). kind: 'mark' (flask only) or 'wordmark' (flask + "ChemWorks"). mono: one colour (currentColor) for print and
 * high contrast. The PNGs in assets/brand stay for the favicon, touch icon and PDF.
 */
export const MARK_PATHS = `<path class="brand-mark__neck" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" d="M29 24 H51 M35 24 V54 M45 24 V50"/>
<path class="brand-mark__glass" d="M31 50 H48 L91 113 Q99 128 82 128 H40 C16 128 2 114 2 95 C2 76 14 61 31 52 Z"/>
<path class="brand-mark__liquid" stroke-width="4" d="M22 86 H67 L80 105 Q86 116 74 116 H42 C29 116 20 108 20 97 C20 92 20 89 22 86 Z"/>
<circle class="brand-mark__gap" cx="37" cy="73" r="4.2"/><circle class="brand-mark__gap" cx="47" cy="64" r="3.2"/><circle class="brand-mark__gap" cx="50" cy="77" r="2.6"/>
<path class="brand-mark__bond" fill="none" stroke-width="5" stroke-linecap="round" d="M54 12 L80 44"/>
<circle class="brand-mark__atom" cx="53" cy="11" r="8"/><circle class="brand-mark__atom" cx="81" cy="46" r="6.5"/>`;

export function brandMarkSvg() {
  return `<svg class="brand-mark" viewBox="0 0 100 132" aria-hidden="true" focusable="false">${MARK_PATHS}</svg>`;
}

export function brandLogo(kind = 'mark', { className = '', alt = '', mono = false } = {}) {
  const word = kind === 'wordmark';
  return h('span', {
    class: ['brand-logo', `brand-logo--${word ? 'wordmark' : 'mark'}`, mono && 'brand-logo--mono', className].filter(Boolean).join(' '),
    role: alt ? 'img' : null, 'aria-label': alt || null, 'aria-hidden': alt ? null : 'true',
  },
  h('span', { class: 'brand-logo__mark', html: brandMarkSvg() }),
  word ? h('span', { class: 'brand-logo__word' }, h('span', { class: 'brand-logo__chem' }, 'Chem'), h('span', { class: 'brand-logo__works' }, 'Works')) : null);
}

let loaderSeq = 0;
/**
 * The ChemistryWorks loader: a vector redraw of the logo flask with sloshing liquid, rising bubbles and a rocking
 * molecule. Static SVG markup only (no user content). The same markup is inlined in index.html for the boot screen.
 */
export function flaskSvg(size = 64) {
  const id = `cwl${++loaderSeq}`;
  return `<svg class="cw-flask" width="${size}" height="${size}" viewBox="-6 -22 112 130" aria-hidden="true" focusable="false">
<defs><clipPath id="${id}"><path d="M42.5 47 L19 91 Q15.5 99.5 25 99.5 H75 Q84.5 99.5 81 91 L57.5 47 Z"/></clipPath></defs>
<g clip-path="url(#${id})"><g class="cw-flask__liquid"><path class="cw-flask__wave cw-flask__wave--back" d="M-100 70 q12.5 -6 25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 V110 H-100 Z"/><path class="cw-flask__wave" d="M-100 74 q12.5 6 25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 V110 H-100 Z"/></g>
<circle class="cw-flask__bubble" cx="40" cy="96" r="4"/><circle class="cw-flask__bubble" cx="55" cy="96" r="3"/><circle class="cw-flask__bubble" cx="64" cy="96" r="2.5"/></g>
<path class="cw-flask__glass" d="M40 12 V45 L15 90 Q9 104 25 104 H75 Q91 104 85 90 L60 45 V12"/><path class="cw-flask__glass" d="M33 12 H67"/>
<g class="cw-flask__molecule"><path class="cw-flask__bond" d="M50 -10 L76 10"/><circle class="cw-flask__atom" cx="47" cy="-12" r="9"/><circle class="cw-flask__atom" cx="79" cy="12" r="6"/></g>
</svg>`;
}

/** Loader block: animated flask + optional status text. */
export function flaskLoader({ size = 64, label = '', className = '', testid } = {}) {
  return h('div', { class: ['cw-loader', className].filter(Boolean).join(' '), role: 'status', 'aria-live': 'polite', dataset: testid ? { testid } : {} },
    h('span', { class: 'cw-loader__art', html: flaskSvg(size) }),
    label ? h('span', { class: 'cw-loader__label' }, label) : h('span', { class: 'sr-only' }, 'Loading'));
}

/**
 * App shell header (V4-01): slim navy bar with the ChemWorks mark + short name, the current title, any `right`
 * nodes and one settings popover (theme, motion, accent). Under 480 px only the mark shows.
 *   appHeader({ title, subtitle, right, onHome })   title 'ChemistryWorks' (default) means "no page title".
 */
export function appHeader({ title = 'ChemistryWorks', subtitle = '', right = null, onHome = null } = {}) {
  const pageTitle = title !== 'ChemistryWorks' ? title : '';
  return h('header', { class: 'app-header' },
    h('button', { class: 'brand', type: 'button', 'aria-label': 'ChemistryWorks home', on: { click: onHome }, dataset: { testid: 'brand' } },
      h('span', { class: 'brand__logo' }, brandLogo('wordmark', { className: 'brand__wordmark' }), brandLogo('mark', { className: 'brand__mark' }))),
    pageTitle || subtitle ? h('div', { class: 'brand__text' },
      pageTitle ? h('span', { class: 'brand__name' }, pageTitle) : null,
      subtitle ? h('span', { class: 'brand__sub' }, subtitle) : null,
    ) : null,
    h('div', { class: 'app-header__right' }, right, themeControl()),
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

// V4-05: re-apply the saved text size / spacing as soon as any view loads (no-op unless the studentTools flag is on).
applyStoredSettings();
