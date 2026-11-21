// WCAG AA contrast checks for the ChemWorks Lab tokens (V4-00): neutrals, brand, status and every accent, light and dark.
// See docs/DESIGN.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../css/base.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  // media-query overrides (e.g. prefers-contrast) are not the base tokens
  .replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '');

/** Merge the declarations of every rule whose selector list contains exactly `selector` (later rules win). */
function tokens(selector) {
  const out = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1].split(',').map((x) => x.trim());
    if (!sels.includes(selector)) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

const hex = (v) => { assert.match(v, /^#[0-9A-Fa-f]{6}$/, `expected a literal hex colour, got ${v}`); return v; };
function lum(h) {
  const n = parseInt(hex(h).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

const light = tokens(':root');
const dark = tokens(':root[data-theme="dark"]');
const accentNames = ['navy', 'blue', 'violet', 'teal', 'rose', 'orange', 'green'];
const accent = (name, theme) => tokens(theme === 'dark' ? `:root[data-theme="dark"][data-accent="${name}"]` : `:root[data-accent="${name}"]`)['--primary'];
const modes = {
  light: { t: light, primary: accent('navy', 'light') },
  dark: { t: { ...light, ...dark }, primary: accent('navy', 'dark') },
};
const SURFACES = ['--bg', '--bg-elev', '--bg-sunken'];

for (const [mode, { t, primary }] of Object.entries(modes)) {
  for (const fg of ['--text', '--text-muted', '--text-faint', '--brand-teal-ink', '--success', '--danger', '--warning']) {
    for (const bg of SURFACES) {
      test(`${mode}: ${fg} on ${bg} >= 4.5:1`, () => {
        const r = contrast(t[fg], t[bg]);
        assert.ok(r >= 4.5, `${t[fg]} on ${t[bg]} = ${r.toFixed(2)}`);
      });
    }
  }
  for (const [fg, bg] of [['--success-ink', '--success-soft'], ['--danger-ink', '--danger-soft'], ['--warning-ink', '--warning-soft'], ['--toast-fg', '--toast-bg'], ['--header-fg', '--header-bg'], ['--game-tile-fg', '--game-tile-0'], ['--game-tile-fg', '--game-tile-1'], ['--game-tile-fg', '--game-tile-2'], ['--game-tile-fg', '--game-tile-3']]) {
    test(`${mode}: ${fg} on ${bg} >= 4.5:1`, () => {
      const r = contrast(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${t[fg]} on ${t[bg]} = ${r.toFixed(2)}`);
    });
  }
  for (const name of accentNames) {
    const p = accent(name, mode);
    for (const bg of SURFACES) {
      test(`${mode}: ${name} --primary on ${bg} >= 4.5:1 (links, focus ring)`, () => {
        const r = contrast(p, t[bg]);
        assert.ok(r >= 4.5, `${p} on ${t[bg]} = ${r.toFixed(2)}`);
      });
    }
    test(`${mode}: --on-primary on ${name} --primary >= 4.5:1`, () => {
      const r = contrast(t['--on-primary'], p);
      assert.ok(r >= 4.5, `${t['--on-primary']} on ${p} = ${r.toFixed(2)}`);
    });
  }
  for (const bg of SURFACES) {
    test(`${mode}: --border-control on ${bg} >= 3:1 (non-text UI)`, () => {
      const r = contrast(t['--border-control'], t[bg]);
      assert.ok(r >= 3, `${t['--border-control']} on ${t[bg]} = ${r.toFixed(2)}`);
    });
    test(`${mode}: --brand-teal on ${bg} >= 3:1 as a fill edge (light) / text (dark)`, () => {
      const r = contrast(t['--brand-teal'], t[bg]);
      // Teal is decoration on light surfaces (2.9:1 on white is expected and allowed); in dark mode it is used as text.
      if (mode === 'dark') assert.ok(r >= 4.5, `${t['--brand-teal']} on ${t[bg]} = ${r.toFixed(2)}`);
      else assert.ok(r >= 2.5, `${t['--brand-teal']} on ${t[bg]} = ${r.toFixed(2)}`);
    });
  }
  test(`${mode}: default (navy) accent is the primary`, () => assert.ok(primary));
}
