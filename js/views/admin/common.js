// Small DOM helpers shared by the admin sub-views.
import { h, icon } from '../../ui.js';

export function field(label, control, hint, { className = '' } = {}) {
  return h('label', { class: `field ${className}`.trim() },
    h('span', { class: 'field__label' }, label),
    control,
    hint ? h('span', { class: 'field__hint' }, hint) : null,
  );
}

/** Toggle switch. Returns the <label>; the checkbox carries the testid. */
export function switchEl({ label, hint, checked, onChange, testid }) {
  const input = h('input', { type: 'checkbox', class: 'adm-switch__input', checked: !!checked, dataset: { testid }, on: { change: () => onChange(input.checked) } });
  return h('label', { class: 'adm-switch' },
    input,
    h('span', { class: 'adm-switch__track', 'aria-hidden': 'true' }, h('span', { class: 'adm-switch__thumb' })),
    h('span', { class: 'adm-switch__text' }, h('span', { class: 'adm-switch__label' }, label), hint ? h('span', { class: 'field__hint' }, hint) : null),
  );
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = h('textarea', { style: 'position:fixed;opacity:0;left:-9999px', 'aria-hidden': 'true' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function downloadFile(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: 'display:none' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function debounce(fn, ms) {
  let t = null;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
  d.flush = (...args) => { if (t) { clearTimeout(t); t = null; fn(...args); } };
  d.cancel = () => { clearTimeout(t); t = null; };
  return d;
}

export function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function skeleton(rows = 3) {
  return h('div', { class: 'adm-skeleton', 'aria-busy': 'true', 'aria-label': 'Loading' },
    Array.from({ length: rows }, () => h('div', { class: 'adm-skeleton__row' })));
}

export function emptyState(iconName, title, text, testid) {
  return h('div', { class: 'adm-empty', dataset: { testid } },
    h('span', { class: 'adm-empty__icon' }, icon(iconName, { size: 28 })),
    h('h3', {}, title),
    text ? h('p', { class: 'muted' }, text) : null,
  );
}

export function iconButton(iconName, label, onClick, { testid, disabled = false, className = '' } = {}) {
  return h('button', { class: `icon-btn ${className}`.trim(), type: 'button', title: label, 'aria-label': label, disabled, on: { click: onClick }, dataset: { testid } }, icon(iconName));
}
