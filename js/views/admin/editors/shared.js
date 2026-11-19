// Pieces shared by the question editors: ids, scientific-notation parsing, the variables panel, option pictures and
// the typing-help switch.
import { h, mount, icon } from '../../../ui.js';
import { safeImageUrl } from '../../../lib/sections.js';
import { formatHelpFor } from '../../../lib/hints.js';
import { variablesEditor } from '../variables-editor.js';
import { field } from '../common.js';

export function uniqueId(prefix, items) {
  const used = new Set(items.map((i) => i.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
export function letterId(options) {
  const used = new Set(options.map((o) => o.id));
  for (const c of 'abcdefghijklmnopqrstuvwxyz') if (!used.has(c)) return c;
  return uniqueId('o', options);
}
/** Parse "6.022e23", "6.02x10^23", "6.02 × 10^23", "-3". NaN when unparseable. */
export function parseSci(raw) {
  const s = String(raw).trim().replace(/−/g, '-').replace(/,/g, '');
  if (!s) return NaN;
  const m = s.match(/^(-?\d*\.?\d+)\s*[x×*]\s*10\s*\^?\s*([+-]?\d+)$/i);
  if (m) return Number(`${m[1]}e${m[2]}`);
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? Number(s) : NaN;
}

/** Numeric / sigfigs editors get the "Randomize with variables" panel underneath. */
export function withVariables(q, editor, redraw, changed) {
  const panel = variablesEditor(q, redraw, changed);
  return panel ? h('div', { class: 'stack' }, editor, panel) : editor;
}

/**
 * Optional picture for one choice / item: a small "Add image" toggle revealing URL + alt text inputs.
 * Writes o.image = { url, alt } (removed again when the URL is cleared). `tag` names the test ids, e.g. "option-0".
 */
export function optionImageControl(o, changed, tag) {
  const url = h('input', { class: 'input', value: o.image?.url || '', placeholder: 'https://… or images/pic.png', 'aria-label': `${tag} image URL`, autocomplete: 'off', spellcheck: 'false', dataset: { testid: `${tag}-image-url` } });
  const alt = h('input', { class: 'input', value: o.image?.alt || '', placeholder: 'Describe the image for screen readers', 'aria-label': `${tag} image description`, dataset: { testid: `${tag}-image-alt` } });
  const prev = h('div', { class: 'adm-optimg__prev' });
  const sync = () => {
    const u = url.value.trim();
    if (u) o.image = { url: u, alt: alt.value }; else delete o.image;
    const safe = safeImageUrl(u);
    mount(prev, safe ? h('img', { src: safe, alt: alt.value, class: 'adm-optimg__img', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null);
    changed();
  };
  url.addEventListener('input', sync);
  alt.addEventListener('input', sync);
  const body = h('div', { class: 'adm-optimg__body' }, url, alt, prev);
  const toggle = h('button', { type: 'button', class: 'btn btn--ghost btn--sm adm-optimg__toggle', 'aria-expanded': 'false', dataset: { testid: `${tag}-image-toggle` } });
  const setOpen = (open) => {
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    mount(toggle, icon('plus', { size: 14 }), o.image?.url ? 'Image' : 'Add image');
  };
  toggle.addEventListener('click', () => setOpen(body.hidden));
  setOpen(!!o.image?.url);
  if (o.image?.url) { const safe = safeImageUrl(o.image.url); if (safe) mount(prev, h('img', { src: safe, alt: o.image.alt || '', class: 'adm-optimg__img', loading: 'lazy', referrerpolicy: 'no-referrer' })); }
  return h('div', { class: 'adm-optimg' }, toggle, body);
}

/**
 * "Typing help" setting for formula / numeric / fill-in questions plus a live note of what students will see.
 * Auto shows charge help when an answer has a charge (or the text mentions ions) and exponent help when the
 * answer needs scientific notation.
 */
export function formatHelpField(q, changed) {
  const note = h('p', { class: 'adm-helpnote', dataset: { testid: 'format-help-note' } });
  const update = () => {
    const help = formatHelpFor(q);
    const parts = [help.charges && 'how to type charges (^2-, ^+)', help.exponents && 'how to type powers of ten (6.02e23)'].filter(Boolean);
    note.hidden = !parts.length;
    mount(note, icon('info', { size: 14 }), h('span', {}, `Students will see a help box on ${parts.join(' and ')}, with insert buttons.`));
  };
  const sel = h('select', { class: 'select', dataset: { testid: 'format-help' }, on: { change: () => { q.formatHelp = sel.value; update(); changed(); } } },
    h('option', { value: 'auto' }, 'Auto (when the answer has a charge or exponent)'),
    h('option', { value: 'always' }, 'Always show'),
    h('option', { value: 'never' }, 'Never show'));
  sel.value = ['auto', 'always', 'never'].includes(q.formatHelp) ? q.formatHelp : 'auto';
  const wrap = h('div', { class: 'stack' }, field('Typing help for students', sel, 'Explains how to type charges / exponents'), note);
  update();
  // Re-check whenever anything in this question changes (answer, text, blank kinds).
  requestAnimationFrame(() => wrap.closest('.adm-q')?.addEventListener('input', update));
  requestAnimationFrame(() => wrap.closest('.adm-q')?.addEventListener('change', update));
  return wrap;
}
