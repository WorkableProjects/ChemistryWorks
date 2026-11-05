// Student display settings (V4-05): font size in 3 steps and dyslexia-friendly spacing, saved on this device.
// Pure helpers + a tiny DOM applier. Everything is a no-op without a document / storage.

import { load, save } from '../../lib/storage.js';
import { feature } from '../../config.js';

export const FONT_STEPS = ['normal', 'large', 'xlarge'];
export const FONT_LABELS = { normal: 'Normal', large: 'Large', xlarge: 'Extra large' };
const KEY = 'studentSettings';

export function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return { font: FONT_STEPS.includes(r.font) ? r.font : 'normal', spacing: r.spacing === true };
}

export function loadSettings() { return normalizeSettings(load(KEY, null)); }

export function saveSettings(s) {
  const clean = normalizeSettings(s);
  save(KEY, clean);
  return clean;
}

/** Attributes to put on <html> for the given settings (null = remove the attribute). */
export function settingsAttrs(s) {
  const n = normalizeSettings(s);
  return { 'data-cw-font': n.font === 'normal' ? null : n.font, 'data-cw-spacing': n.spacing ? 'wide' : null };
}

/** tools.css is not in index.html (it is loaded when something needs it). Safe to call repeatedly. */
export function ensureToolsCss() {
  if (typeof document === 'undefined' || document.querySelector('link[data-cw-tools-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/tools.css';
  link.dataset.cwToolsCss = '';
  document.head.appendChild(link);
}

export function applySettings(s, root = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!root) return;
  ensureToolsCss();
  for (const [k, v] of Object.entries(settingsAttrs(s))) {
    if (v == null) root.removeAttribute(k); else root.setAttribute(k, v);
  }
}

/** Called once at startup: re-applies the stored settings when the student tools flag is on. */
export function applyStoredSettings() {
  try {
    if (feature('studentTools')) applySettings(loadSettings());
  } catch { /* never block the page */ }
}
