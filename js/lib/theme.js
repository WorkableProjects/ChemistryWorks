// Appearance: light / dark / system theme and an accent colour per role (student vs teacher/admin).
// Choices are saved on this device. js/app.js calls applyRole() on every view change; the inline script in
// index.html applies the saved theme before first paint so there is no flash.
//
//   <html data-theme="light|dark" data-accent="blue|violet|teal|rose|orange|green" data-role="student|admin">

import { load, save } from './storage.js';

export const THEMES = ['system', 'light', 'dark'];
export const ACCENTS = {
  blue: '#2563EB',
  violet: '#7C3AED',
  teal: '#0D9488',
  green: '#16A34A',
  orange: '#EA580C',
  rose: '#E11D48',
};
export const DEFAULT_ACCENT = { student: 'blue', admin: 'violet' };

const root = () => (typeof document !== 'undefined' ? document.documentElement : null);
const media = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null);
let role = 'student';
const listeners = new Set();

export function getThemePref() {
  const t = load('theme', 'system');
  return THEMES.includes(t) ? t : 'system';
}

export function resolvedTheme(pref = getThemePref()) {
  if (pref === 'light' || pref === 'dark') return pref;
  return media()?.matches ? 'dark' : 'light';
}

export function getAccent(r = role) {
  const a = load(`accent:${r}`, DEFAULT_ACCENT[r] || 'blue');
  return Object.prototype.hasOwnProperty.call(ACCENTS, a) ? a : DEFAULT_ACCENT[r] || 'blue';
}

export function getRole() { return role; }

export function applyTheme() {
  const el = root();
  if (!el) return;
  el.dataset.theme = resolvedTheme();
  el.dataset.accent = getAccent(role);
  el.dataset.role = role;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', el.dataset.theme === 'dark' ? '#0B1120' : '#F8FAFC');
  listeners.forEach((fn) => fn());
}

export function setThemePref(pref) {
  save('theme', THEMES.includes(pref) ? pref : 'system');
  applyTheme();
}

export function setAccent(accent, r = role) {
  if (!Object.prototype.hasOwnProperty.call(ACCENTS, accent)) return;
  save(`accent:${r}`, accent);
  applyTheme();
}

/** 'student' for landing / runner / results, 'admin' for the admin panel (and admin previews). */
export function applyRole(r) {
  role = r === 'admin' ? 'admin' : 'student';
  applyTheme();
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

media()?.addEventListener?.('change', () => { if (getThemePref() === 'system') applyTheme(); });
