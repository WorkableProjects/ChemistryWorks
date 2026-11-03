// WCAG AA contrast checks for the Lab-notebook neutrals and the default (blue) accent. See docs/DESIGN.md.
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
const modes = {
  light: { t: light, primary: tokens(':root[data-accent="blue"]')['--primary'] },
  dark: { t: { ...light, ...dark }, primary: tokens(':root[data-theme="dark"][data-accent="blue"]')['--primary'] },
};

for (const [mode, { t, primary }] of Object.entries(modes)) {
  for (const fg of ['--text', '--text-muted', '--text-faint']) {
    for (const bg of ['--bg', '--bg-elev', '--bg-sunken']) {
      test(`${mode}: ${fg} on ${bg} >= 4.5:1`, () => {
        const r = contrast(t[fg], t[bg]);
        assert.ok(r >= 4.5, `${t[fg]} on ${t[bg]} = ${r.toFixed(2)}`);
      });
    }
  }
  test(`${mode}: blue --primary on --bg-elev >= 4.5:1`, () => {
    const r = contrast(primary, t['--bg-elev']);
    assert.ok(r >= 4.5, `${primary} on ${t['--bg-elev']} = ${r.toFixed(2)}`);
  });
  test(`${mode}: --on-primary on blue --primary >= 4.5:1`, () => {
    const r = contrast(t['--on-primary'], primary);
    assert.ok(r >= 4.5, `${t['--on-primary']} on ${primary} = ${r.toFixed(2)}`);
  });
  test(`${mode}: --border-control on --bg-elev >= 3:1 (non-text UI)`, () => {
    const r = contrast(t['--border-control'], t['--bg-elev']);
    assert.ok(r >= 3, `${t['--border-control']} on ${t['--bg-elev']} = ${r.toFixed(2)}`);
  });
}
