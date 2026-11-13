// Appearance panel: theme, accent, custom colour, text size, density, reduce motion and a
// dyslexia-friendly font. One component for student Settings, the profile page and admin Settings. Choices are saved on
// this device at once and, for a signed-in student, through savePrefs() so they follow the student.

import { h, icon } from '../ui.js';
import { getUser } from '../lib/auth.js';
import { savePrefs, subscribeProfile } from '../lib/profile.js';
import { fixAccent, contrastRatio, ON_LIGHT_ACCENT, ON_DARK_ACCENT, LIGHT_PAGE, DARK_PAGE } from '../lib/contrast.js';
import {
  THEMES, ACCENTS, DARK_ACCENTS, getThemePref, setThemePref, getAccent, setAccent, getCustomAccent, setCustomAccent,
  getAppearance, setAppearance, getReduceMotionPref, setReduceMotion, onThemeChange, applyPrefs,
} from '../lib/theme.js';

const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' };
const SIZES = [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']];
const DENSITIES = [['comfortable', 'Comfortable'], ['compact', 'Compact']];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const ratio = (n) => `${n.toFixed(1)}:1`;

/** Segmented radio group. items: [[value, label], ...]. */
function segmented(label, items, current, onPick, testid, preview) {
  const btns = items.map(([value, text]) => h('button', {
    type: 'button', role: 'radio', class: 'ap-seg__btn', dataset: { testid: `${testid}-${value}`, value },
    on: { click: () => onPick(value) },
  }, preview ? h('span', { class: 'ap-seg__mini', dataset: { pv: value }, 'aria-hidden': 'true' }) : null, text));
  const el = h('div', { class: 'ap-seg', role: 'radiogroup', 'aria-label': label, dataset: { testid } }, btns);
  el.sync = () => { const c = current(); btns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === c))); };
  return el;
}

function previewCard(theme, accent, on) {
  return h('div', { class: 'ap-prev', dataset: { pv: theme, testid: `appearance-preview-${theme}` }, style: `--pv-accent:${accent};--pv-on:${on}` },
    h('p', { class: 'ap-prev__title' }, cap(theme)),
    h('div', { class: 'ap-prev__row' },
      h('span', { class: 'ap-prev__btn' }, 'Button'),
      h('span', { class: 'ap-prev__link' }, 'Link'),
      h('span', { class: 'ap-prev__pill' }, 'Pill')),
    h('div', { class: 'ap-prev__bar', 'aria-hidden': 'true' }, h('span', { class: 'ap-prev__fill' })));
}

export function appearancePanel({ user = getUser(), role = 'student' } = {}) {
  const save = () => {
    if (!user) return;
    const custom = getCustomAccent();
    savePrefs(user, { theme: getThemePref(), accent: custom || getAccent(), reduceMotion: getReduceMotionPref(), ...getAppearance() });
  };

  const theme = segmented('Theme', THEMES.map((t) => [t, THEME_LABEL[t]]), getThemePref, (v) => { setThemePref(v); save(); }, 'appearance-theme', true);

  const swatches = Object.entries(ACCENTS).map(([name, color]) => h('button', {
    type: 'button', role: 'radio', class: 'ap-swatch', style: `--sw:${color}`, dataset: { testid: `appearance-accent-${name}`, name },
    on: { click: () => { setAccent(name); save(); } },
  }, h('span', { class: 'ap-swatch__dot' }, icon('check', { size: 14 })), h('span', { class: 'ap-swatch__name' }, cap(name))));
  const accents = h('div', { class: 'ap-swatches', role: 'radiogroup', 'aria-label': 'Accent colour' }, swatches);

  // Custom colour: the picker's colour is moved in lightness until it passes in both themes.
  const picker = h('input', { type: 'color', class: 'ap-color', value: getCustomAccent() || ACCENTS.teal, 'aria-label': 'Custom accent colour', dataset: { testid: 'appearance-custom' } });
  const adjusted = h('p', { class: 'ap-note', role: 'status', dataset: { testid: 'appearance-custom-note' } });
  const reset = h('button', { type: 'button', class: 'btn btn--subtle btn--sm', dataset: { testid: 'appearance-custom-clear' }, on: { click: () => { setAccent(getAccent()); save(); } } }, 'Use a preset');
  picker.addEventListener('input', () => { setCustomAccent(picker.value); save(); });

  const previews = h('div', { class: 'ap-previews' });
  const textSize = segmented('Text size', SIZES, () => getAppearance().textSize, (v) => { setAppearance({ textSize: v }); save(); }, 'appearance-size');
  const density = segmented('Density', DENSITIES, () => getAppearance().density, (v) => { setAppearance({ density: v }); save(); }, 'appearance-density');
  const motion = h('input', { type: 'checkbox', dataset: { testid: 'appearance-motion' }, on: { change: () => { setReduceMotion(motion.checked); save(); } } });
  const dys = h('input', { type: 'checkbox', dataset: { testid: 'appearance-dyslexia' }, on: { change: () => { setAppearance({ dyslexia: dys.checked }); save(); } } });
  const toggle = (box, label, hint) => h('label', { class: 'ap-toggle' }, box, h('span', {}, h('span', { class: 'ap-toggle__label' }, label), h('span', { class: 'ap-toggle__hint' }, hint)));
  const row = (label, ...kids) => h('div', { class: 'ap-row' }, h('h3', { class: 'ap-row__label' }, label), ...kids);

  const el = h('div', { class: 'ap', dataset: { testid: 'appearance', role } },
    row('Theme', theme),
    row('Accent', accents,
      h('div', { class: 'ap-custom' }, h('label', { class: 'ap-custom__label' }, 'Custom colour', picker), reset), adjusted),
    previews,
    row('Text size', textSize),
    row('Density', density),
    h('div', { class: 'ap-row ap-toggles' },
      toggle(motion, 'Reduce motion', 'Turns off animations'),
      toggle(dys, 'Dyslexia-friendly font', 'Wider spacing and the system font')));

  function sync() {
    theme.sync(); textSize.sync(); density.sync();
    motion.checked = getReduceMotionPref();
    dys.checked = getAppearance().dyslexia;
    const custom = getCustomAccent();
    const acc = getAccent();
    swatches.forEach((b) => b.setAttribute('aria-checked', String(!custom && b.dataset.name === acc)));
    reset.hidden = !custom;
    let light = ACCENTS[acc]; let dark = DARK_ACCENTS[acc]; let onL = ON_LIGHT_ACCENT; let onD = ON_DARK_ACCENT;
    adjusted.textContent = '';
    if (custom) {
      const f = fixAccent(custom);
      light = f.light; dark = f.dark; onL = f.onLight; onD = f.onDark;
      adjusted.textContent = f.changed
        ? `Adjusted for contrast: ${f.light} in light, ${f.dark} in dark. Text on it is ${ratio(contrastRatio(f.light, onL))} and ${ratio(contrastRatio(f.dark, onD))}; on the page ${ratio(Math.min(...LIGHT_PAGE.map((p) => contrastRatio(f.light, p))))} and ${ratio(Math.min(...DARK_PAGE.map((p) => contrastRatio(f.dark, p))))}`
        : `${f.base} already passes in both themes`;
    }
    previews.replaceChildren(previewCard('light', light, onL), previewCard('dark', dark, onD));
  }
  sync();
  const offTheme = onThemeChange(() => { if (el.isConnected) sync(); });

  // Prefs saved on the profile follow the student: apply them once when they first arrive.
  let applied = false;
  const offProfile = user ? subscribeProfile(user, (p) => {
    if (applied || !el.isConnected) return;
    if (p && p.prefs && Object.keys(p.prefs).length) { applied = true; applyPrefs(p.prefs); sync(); }
  }) : null;
  el.destroy = () => { offTheme(); offProfile?.(); };
  return el;
}
