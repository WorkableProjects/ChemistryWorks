// Colour contrast helpers for the custom accent (WCAG 2.x relative luminance).
// fixAccent() moves a colour's lightness until text on it and the colour on the page both pass.

export const LIGHT_PAGE = ['#F5F8FB', '#FFFFFF'];
export const DARK_PAGE = ['#0B1424', '#14213A'];
export const ON_LIGHT_ACCENT = '#FFFFFF';
export const ON_DARK_ACCENT = '#04121F';
export const MIN_TEXT = 4.5;
export const MIN_UI = 3;

export function parseHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}

export const toHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

export function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours (1 to 21). */
export function contrastRatio(a, b) {
  const la = luminance(parseHex(a)); const lb = luminance(parseHex(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue;
  if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return [hue * 60, s * 100, l * 100];
}

export function hslToRgb([hue, s, l]) {
  s /= 100; l /= 100;
  const k = (n) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const passes = (hex, on, pages) => contrastRatio(hex, on) >= MIN_TEXT && pages.every((p) => contrastRatio(hex, p) >= MIN_UI);

function walk(hex, on, pages, dir) {
  const [hue, s, l0] = rgbToHsl(parseHex(hex));
  let l = l0;
  let out = toHex(hslToRgb([hue, s, l]));
  while (!passes(out, on, pages) && l > 0 && l < 100) {
    l += dir;
    out = toHex(hslToRgb([hue, s, l]));
  }
  if (!passes(out, on, pages)) out = dir < 0 ? '#000000' : '#FFFFFF';
  return out;
}

/**
 * Adjust a colour for both themes. Light: darken until white text on it is >= 4.5:1 and it is >= 3:1 on the page.
 * Dark: lighten until dark text on it is >= 4.5:1 and it is >= 3:1 on the page.
 * Returns { base, light, dark, onLight, onDark, changed } or null for an invalid colour.
 */
export function fixAccent(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const base = toHex(rgb);
  const light = walk(base, ON_LIGHT_ACCENT, LIGHT_PAGE, -1);
  const dark = walk(base, ON_DARK_ACCENT, DARK_PAGE, 1);
  return { base, light, dark, onLight: ON_LIGHT_ACCENT, onDark: ON_DARK_ACCENT, changed: light !== base || dark !== base };
}
