// `imagechoice` question type — student widget (picture cards as a radio group / checkbox group), builder
// editor (URL + required alt text per option) and review (the chosen / correct pictures).
// Answer = option id (single) or array of option ids (multiple).
import { h, icon } from '../../ui.js';
import { registerTypeUI } from './registry.js';
import { field, switchEl } from '../admin/common.js';
import { safeImageUrl } from '../../lib/sections.js';
import { optionName } from '../../lib/qtypes/imagechoice.js';

const letter = (i) => String.fromCharCode(65 + (i % 26));

function pic(o, cls = '') {
  const url = o && o.image && safeImageUrl(o.image.url);
  if (!url) return h('span', { class: 'q-imgc__missing' }, 'No picture');
  return h('img', { class: ['opt-img', 'q-imgc__img', cls].filter(Boolean).join(' '), src: url, alt: String(o.image.alt || ''), loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
}

function widget(q, api) {
  const multi = !!q.multiple;
  const opts = q.options || [];
  const n = opts.length;
  const btns = opts.map((o, idx) => h('button', {
    type: 'button', class: 'opt q-imgc__opt', role: multi ? 'checkbox' : 'radio', 'aria-checked': 'false', tabindex: multi || idx === 0 ? '0' : '-1',
    dataset: { testid: `imagechoice-option-${o.id}`, optionId: o.id },
    on: {
      click: () => choose(o.id),
      keydown: (e) => {
        if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        e.preventDefault();
        const j = (idx + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + n) % n;
        btns[j].focus();
        if (!multi) api.set(q.id, opts[j].id);
      },
    },
  },
  h('span', { class: 'opt__badge', 'aria-hidden': 'true' }, letter(idx)),
  pic(o),
  o.text && String(o.text).trim() ? h('span', { class: 'q-imgc__cap' }, o.text) : null,
  h('span', { class: 'opt__check' }, icon('check', { size: 15 }))));
  function choose(id) {
    if (!multi) return api.set(q.id, id);
    const cur = new Set(Array.isArray(api.get(q.id)) ? api.get(q.id) : []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    api.set(q.id, opts.map((o) => o.id).filter((x) => cur.has(x)));
  }
  return {
    el: h('div', { class: 'q-imgc' },
      h('p', { class: 'q-hint' }, multi ? 'Select all the pictures that apply.' : 'Choose one picture.'),
      h('div', { class: 'q-imgc__grid', role: multi ? 'group' : 'radiogroup', 'aria-labelledby': `qt-${q.id}` }, btns)),
    refresh(answer) {
      const sel = multi ? new Set(Array.isArray(answer) ? answer : []) : new Set(answer == null ? [] : [answer]);
      const firstSel = opts.findIndex((o) => sel.has(o.id));
      btns.forEach((b, i) => {
        const on = sel.has(opts[i].id);
        b.classList.toggle('is-selected', on);
        b.setAttribute('aria-checked', String(on));
        if (!multi) b.tabIndex = i === (firstSel >= 0 ? firstSel : 0) ? 0 : -1;
      });
    },
    shortcut(key) {
      const idx = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
      if (idx < 0 || idx >= n) return false;
      btns[idx].focus({ preventScroll: true });
      choose(opts[idx].id);
      return true;
    },
    focus: () => (btns.find((b) => b.tabIndex === 0) || btns[0]).focus(),
  };
}

function editor(q, redraw, changed) {
  q.options = Array.isArray(q.options) ? q.options : [];
  const isKey = (id) => (q.multiple ? Array.isArray(q.correctAnswer) && q.correctAnswer.includes(id) : q.correctAnswer === id);
  const nextId = () => { const used = new Set(q.options.map((o) => o.id)); for (const c of 'abcdefghijklmnopqrstuvwxyz') if (!used.has(c)) return c; return `o${used.size + 1}`; };
  const rows = q.options.map((o, i) => {
    const mark = h('input', { type: q.multiple ? 'checkbox' : 'radio', name: `imgc-${q.id}`, checked: isKey(o.id), 'aria-label': `Picture ${i + 1} is correct`, dataset: { testid: `imagechoice-correct-${i}` },
      on: { change: () => {
        if (q.multiple) { const s = new Set(Array.isArray(q.correctAnswer) ? q.correctAnswer : []); if (mark.checked) s.add(o.id); else s.delete(o.id); q.correctAnswer = q.options.map((x) => x.id).filter((x) => s.has(x)); } else q.correctAnswer = o.id;
        changed();
      } } });
    const prev = h('div', { class: 'q-imgc-ed__prev' });
    const showPrev = () => { const u = o.image && safeImageUrl(o.image.url); prev.replaceChildren(u ? h('img', { src: u, alt: o.image.alt || '', class: 'q-imgc-ed__img', referrerpolicy: 'no-referrer' }) : h('span', { class: 'muted' }, 'No picture yet')); };
    const url = h('input', { class: 'input', value: o.image?.url || '', placeholder: 'https://… or images/pic.png', autocomplete: 'off', spellcheck: 'false', 'aria-label': `Picture ${i + 1} URL`, dataset: { testid: `imagechoice-url-${i}` },
      on: { input: () => { o.image = { url: url.value.trim(), alt: o.image?.alt || '' }; showPrev(); changed(); } } });
    const alt = h('input', { class: 'input', value: o.image?.alt || '', placeholder: 'Describe the picture for screen readers (required)', autocomplete: 'off', 'aria-label': `Picture ${i + 1} description`, dataset: { testid: `imagechoice-alt-${i}` },
      on: { input: () => { o.image = { url: o.image?.url || '', alt: alt.value }; showPrev(); changed(); } } });
    const cap = h('input', { class: 'input', value: o.text || '', placeholder: 'Caption (optional)', autocomplete: 'off', 'aria-label': `Picture ${i + 1} caption`, dataset: { testid: `imagechoice-caption-${i}` },
      on: { input: () => { o.text = cap.value; changed(); } } });
    const rm = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'aria-label': `Remove picture ${i + 1}`, dataset: { testid: `imagechoice-remove-${i}` },
      on: { click: () => { const [gone] = q.options.splice(i, 1); if (q.multiple && Array.isArray(q.correctAnswer)) q.correctAnswer = q.correctAnswer.filter((x) => x !== gone.id); else if (q.correctAnswer === gone.id) q.correctAnswer = ''; redraw(); changed(); } } }, 'Remove');
    showPrev();
    return h('fieldset', { class: 'q-imgc-ed__opt' }, h('legend', {}, `Picture ${letter(i)}`),
      h('div', { class: 'q-imgc-ed__top' }, h('label', { class: 'q-imgc-ed__correct' }, mark, ' Correct'), rm), url, alt, cap, prev);
  });
  const add = h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'imagechoice-add' },
    on: { click: () => { q.options.push({ id: nextId(), image: { url: '', alt: '' } }); redraw(); changed(); } } }, 'Add picture');
  return h('div', { class: 'stack' },
    switchEl({ label: 'Allow several answers', hint: 'Students may select more than one picture', checked: !!q.multiple, testid: 'imagechoice-multiple',
      onChange: (v) => { q.multiple = v; q.correctAnswer = v ? (q.correctAnswer ? [q.correctAnswer].flat() : []) : (Array.isArray(q.correctAnswer) ? q.correctAnswer[0] || '' : q.correctAnswer); if (!v) q.partialCredit = false; redraw(); changed(); } }),
    q.multiple ? switchEl({ label: 'Partial credit', hint: 'Right picks minus wrong picks', checked: !!q.partialCredit, testid: 'imagechoice-partial', onChange: (v) => { q.partialCredit = v; changed(); } }) : null,
    h('p', { class: 'field__hint' }, 'Every picture needs a link and a description (alt text).'),
    rows, add);
}

function review(q, answer, { key, size } = {}) {
  const ids = key ? (Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]) : (Array.isArray(answer) ? answer : answer == null ? [] : [answer]);
  const picked = ids.map((id) => (q.options || []).find((o) => o && String(o.id) === String(id))).filter(Boolean);
  if (!picked.length) return null;
  return h('span', { class: 'q-imgc-review', dataset: { testid: 'imagechoice-review' } },
    picked.map((o) => h('span', { class: 'q-imgc-review__item' }, pic(o, size === 'sm' ? 'opt-img--sm' : 'opt-img--sm'), h('span', { class: 'q-imgc-review__name' }, optionName(o)))));
}

registerTypeUI({ type: 'imagechoice', widget, editor, review });
export default null;
