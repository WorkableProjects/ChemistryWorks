// Appearance: light / dark / system theme and an accent colour per role (student vs teacher/admin).
// Choices are saved on this device. js/app.js calls applyRole() on every view change; the inline script in
// index.html applies the saved theme before first paint so there is no flash.
//
//   <html data-theme="light|dark" data-accent="navy|blue|violet|teal|rose|orange|green" data-role="student|admin">

import { load, save } from './storage.js';

export const THEMES = ['system', 'light', 'dark'];
/** Browser UI colour (<meta name="theme-color">): the header bar colour per theme. */
export const THEME_COLOR = { light: '#00224F', dark: '#08101D' };
export const ACCENTS = {
  navy: '#00224F',
  blue: '#2348A4',
  violet: '#6D28D9',
  teal: '#00797D',
  green: '#166534',
  orange: '#B03A0A',
  rose: '#BE123C',
};
// V4-00: navy/teal for everyone (dark mode turns navy into teal). Older saved choices still apply.
export const DEFAULT_ACCENT = { student: 'navy', admin: 'navy' };

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
  const a = load(`accent:${r}`, DEFAULT_ACCENT[r] || 'navy');
  return Object.prototype.hasOwnProperty.call(ACCENTS, a) ? a : DEFAULT_ACCENT[r] || 'navy';
}

export function getRole() { return role; }

/** Manual "Reduce motion" switch (saved on this device). */
export function getReduceMotionPref() { return load('reduceMotion', '0') === '1'; }

/** True if the OS asks for reduced motion or the app switch is on. Use for JS-driven animations. */
export function prefersReducedMotion() {
  if (getReduceMotionPref()) return true;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function setReduceMotion(on) {
  save('reduceMotion', on ? '1' : '0');
  applyMotion();
  listeners.forEach((fn) => fn());
}

export function applyMotion() {
  const el = root();
  if (!el) return;
  if (getReduceMotionPref()) el.dataset.motion = 'reduce';
  else delete el.dataset.motion;
}

export function applyTheme() {
  const el = root();
  if (!el) return;
  applyMotion();
  el.dataset.theme = resolvedTheme();
  el.dataset.accent = getAccent(role);
  el.dataset.role = role;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', el.dataset.theme === 'dark' ? THEME_COLOR.dark : THEME_COLOR.light);
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
