// Builder question list: the editor card for each question, move, duplicate, delete and add, and the section labels.

import { h, mount, icon, richText, renderMath, prefersReducedMotion, toast } from '../../../ui.js';
import { TYPE_LABELS, blankQuestion, nextQuestionId } from '../../../lib/schema.js';
import { groupQuestions, orderQuestions } from '../../../lib/sections.js';
import { withQuestionImage } from '../../question-image.js';
import { typeEditor } from '../editors/core.js';
import { field, switchEl, debounce, iconButton } from '../common.js';
import { S, clone, previewText, confirmDialog, extrasPanel, sectionSummary, sectionTitleOf, sectionKey } from './state.js';
import { resolve, usedTagIds } from '../../../lib/tags.js';
import { MAX_TAGS_PER_QUESTION } from '../../../lib/schema.js';
import { tagPicker, tagBar, applyTagDialog } from './tag-picker.js';

// Tag filter ('' = all, 'none', or a tag id) and the questions ticked for "Apply tag". They survive list redraws.
const tagUi = { filter: '', selected: new Set() };

const matchesFilter = (q) => !tagUi.filter || (tagUi.filter === 'none' ? !(q.tags && q.tags.length) : !!(q.tags && q.tags.includes(tagUi.filter)));

/** Hides the editors the tag filter excludes and redraws the filter bar. Cheap; keeps focus and open state. */
export function applyTagFilter(bc) {
  if (!bc.listEl) return;
  const qs = S.test.questions;
  if (tagUi.filter && tagUi.filter !== 'none' && !usedTagIds(S.test).includes(tagUi.filter)) tagUi.filter = '';
  editors(bc).forEach((el) => { const q = qs[Number(el.dataset.index)]; el.hidden = !!q && !matchesFilter(q); });
  const host = bc.listEl.querySelector(':scope > .tagbar-host');
  if (!host) return;
  const shown = qs.filter(matchesFilter);
  mount(host, tagBar({
    used: resolve(usedTagIds(S.test)), filter: tagUi.filter, selected: [...tagUi.selected].filter((q) => qs.includes(q)).length, shown: shown.length,
    onFilter: (v) => { tagUi.filter = v; applyTagFilter(bc); },
    onSelectShown: (on) => { shown.forEach((q) => (on ? tagUi.selected.add(q) : tagUi.selected.delete(q))); syncSelectBoxes(bc); applyTagFilter(bc); },
    onClear: () => { tagUi.selected.clear(); syncSelectBoxes(bc); applyTagFilter(bc); },
    onApply: () => applyTagDialog({ count: tagUi.selected.size, onApply: (id) => applyTagToSelected(bc, id) }),
  }));
}

function syncSelectBoxes(bc) {
  editors(bc).forEach((el) => { const q = S.test.questions[Number(el.dataset.index)]; const box = el.querySelector('[data-testid="q-select"]'); if (box && q) box.checked = tagUi.selected.has(q); });
}

function applyTagToSelected(bc, id) {
  let added = 0; let full = 0;
  for (const q of S.test.questions.filter((x) => tagUi.selected.has(x))) {
    const cur = Array.isArray(q.tags) ? q.tags : [];
    if (cur.includes(id)) continue;
    if (cur.length >= MAX_TAGS_PER_QUESTION) { full++; continue; }
    q.tags = [...cur, id];
    added++;
  }
  tagUi.selected.clear();
  renderList(bc);
  bc.changed();
  toast(`Tag added to ${added} question${added === 1 ? '' : 's'}${full ? `. ${full} already had ${MAX_TAGS_PER_QUESTION} tags.` : ''}`, { type: full ? 'info' : 'success' });
}

export const editors = (bc) => (bc.listEl ? [...bc.listEl.querySelectorAll(':scope > .adm-q')] : []);

function renumber(bc) {
  const total = S.test.questions.length;
  editors(bc).forEach((el, k) => el._setIndex(k, total));
  bc.emptyHint.hidden = total > 0;
}

export function focusQuestion(bc, i) {
  const el = editors(bc)[i];
  if (!el) return;
  S.open.add(S.test.questions[i]);
  el._sync();
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  setTimeout(() => { if (!el.contains(document.activeElement)) el.querySelector('[data-testid="q-text"]')?.focus({ preventScroll: true }); }, 120);
}

/** Cheap in-place refresh of everything that shows a section title or total (no re-render, keeps focus). */
export function updateSectionLabels(bc) {
  const secs = S.test.sections || [];
  secs.forEach((s, i) => {
    const pts = bc.root.querySelector(`[data-testid="section-points-${i}"]`);
    if (pts) pts.textContent = sectionSummary(s.id);
  });
  if (!bc.listEl) return;
  bc.listEl.querySelectorAll('.adm-qgroup').forEach((g) => {
    const id = g.dataset.section;
    const i = secs.findIndex((s) => s.id === id);
    if (i < 0) return;
    g.querySelector('.adm-qgroup__title').textContent = sectionTitleOf(secs[i], i);
    g.querySelector('.adm-qgroup__pts').textContent = sectionSummary(id);
  });
  bc.listEl.querySelectorAll('[data-testid="q-section"]').forEach((sel) => fillSectionSelect(sel, sel.value));
}
export function fillSectionSelect(sel, value) {
  const secs = S.test.sections || [];
  mount(sel, h('option', { value: '' }, 'No section'), secs.map((s, i) => h('option', { value: s.id }, sectionTitleOf(s, i))));
  sel.value = secs.some((s) => s.id === value) ? value : '';
}

export function renderList(bc) {
  S.test.questions = orderQuestions(S.test);
  const secs = S.test.sections || [];
  const nodes = [];
  for (const q of [...tagUi.selected]) if (!S.test.questions.includes(q)) tagUi.selected.delete(q);
  if (S.test.questions.length) nodes.push(h('div', { class: 'tagbar-host' }));
  if (secs.length) {
    for (const g of groupQuestions(S.test)) {
      const id = g.section ? g.section.id : '';
      const i = g.section ? secs.findIndex((s) => s.id === id) : -1;
      const head = h('div', { class: 'adm-qgroup', dataset: { testid: `builder-section-${id || 'none'}`, section: id } },
        h('strong', { class: 'adm-qgroup__title' }, g.section ? sectionTitleOf(g.section, i) : 'No section'),
        g.section ? h('span', { class: 'adm-qgroup__pts muted' }, sectionSummary(id)) : null);
      nodes.push(head);
      g.questions.forEach((q) => nodes.push(buildEditor(bc, q, S.test.questions.indexOf(q))));
    }
  } else {
    S.test.questions.forEach((q, i) => nodes.push(buildEditor(bc, q, i)));
  }
  mount(bc.listEl, nodes);
  bc.onTagsChanged = () => applyTagFilter(bc);
  renumber(bc);
  applyTagFilter(bc);
  renderMath(bc.listEl);
}

export function moveQuestion(bc, i, dir) {
  const j = i + dir;
  const qs = S.test.questions;
  if (j < 0 || j >= qs.length || sectionKey(qs[i]) !== sectionKey(qs[j])) return;
  const els = editors(bc);
  const a = els[i], b = els[j];
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  [qs[i], qs[j]] = [qs[j], qs[i]];
  if (j > i) bc.listEl.insertBefore(b, a); else bc.listEl.insertBefore(a, b);
  renumber(bc);
  a.querySelector(dir < 0 ? '[data-testid="q-up"]' : '[data-testid="q-down"]')?.focus({ preventScroll: true });
  if (!prefersReducedMotion()) {
    const na = a.getBoundingClientRect(), nb = b.getBoundingClientRect();
    for (const [el, from, to] of [[a, ra, na], [b, rb, nb]]) {
      el.style.transition = 'none';
      el.style.transform = `translateY(${from.top - to.top}px)`;
      void el.offsetWidth;
      el.style.transition = 'transform 260ms var(--ease)';
      el.style.transform = '';
      setTimeout(() => { el.style.transition = ''; }, 300);
    }
  }
  bc.changed();
}

function deleteQuestion(bc, i) {
  const q = S.test.questions[i];
  confirmDialog({
    title: `Delete question ${i + 1}?`, body: `“${previewText(q)}” will be removed from this test.`, testid: 'confirm-delete-question',
    onConfirm: () => { S.test.questions.splice(i, 1); renderList(bc); bc.changed(); },
  });
}

function duplicateQuestion(bc, i) {
  const copy = clone(S.test.questions[i]);
  copy.id = nextQuestionId(S.test.questions);
  S.test.questions.splice(i + 1, 0, copy);
  S.open.add(copy);
  renderList(bc);
  bc.changed();
  focusQuestion(bc, i + 1);
}

export function addQuestion(bc, type) {
  const q = blankQuestion(type, nextQuestionId(S.test.questions));
  const last = S.test.questions[S.test.questions.length - 1];
  if (last && sectionKey(last)) q.section = last.section;
  S.test.questions.push(q);
  S.test.questions = orderQuestions(S.test);
  S.open.add(q);
  renderList(bc);
  const el = editors(bc)[S.test.questions.indexOf(q)];
  bc.changed();
  el.classList.add('is-new');
  setTimeout(() => el.classList.remove('is-new'), 600);
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  setTimeout(() => { if (!el.contains(document.activeElement)) el.querySelector('[data-testid="q-text"]')?.focus({ preventScroll: true }); }, 80);
}

function buildEditor(bc, q, index) {
  const { changed } = bc;
  const uid = ++S.uid;
  const num = h('span', { class: 'adm-q__num' });
  const pointsChip = h('span', { class: 'pill' });
  const prev = h('span', { class: 'adm-q__preview' });
  const upBtn = iconButton('up', 'Move up', () => moveQuestion(bc, Number(el.dataset.index), -1), { testid: 'q-up' });
  const downBtn = iconButton('down', 'Move down', () => moveQuestion(bc, Number(el.dataset.index), 1), { testid: 'q-down' });
  const toggle = h('button', { class: 'adm-q__toggle', type: 'button', 'aria-expanded': 'false', on: { click: () => {
    if (S.open.has(q)) S.open.delete(q); else S.open.add(q);
    sync();
  } } }, num, h('span', { class: 'pill pill--primary' }, TYPE_LABELS[q.type] || q.type), pointsChip, prev, icon('down', { size: 16, className: 'adm-q__chev' }));
  const selBox = h('input', { type: 'checkbox', class: 'adm-q__select', checked: tagUi.selected.has(q), dataset: { testid: 'q-select' }, on: { change: () => {
    if (selBox.checked) tagUi.selected.add(q); else tagUi.selected.delete(q);
    applyTagFilter(bc);
  } } });
  const head = h('div', { class: 'adm-q__head' }, selBox, toggle,
    h('div', { class: 'adm-q__actions' }, upBtn, downBtn,
      iconButton('copy', 'Duplicate question', () => duplicateQuestion(bc, Number(el.dataset.index)), { testid: 'q-duplicate' }),
      iconButton('trash', 'Delete question', () => deleteQuestion(bc, Number(el.dataset.index)), { testid: 'q-delete', className: 'icon-btn--danger' })));

  const updateHead = () => {
    prev.textContent = previewText(q);
    const p = Number(q.points);
    pointsChip.textContent = Number.isFinite(p) ? `${p} pt${p === 1 ? '' : 's'}` : '— pts';
  };

  // common fields
  const idInput = h('input', { class: 'input', value: q.id || '', spellcheck: 'false', dataset: { testid: 'q-id' }, on: { input: () => { q.id = idInput.value.trim(); bc.changed(); } } });
  const pts = h('input', { class: 'input', type: 'number', min: '0', step: 'any', value: q.points ?? 1, dataset: { testid: 'q-points' },
    on: { input: () => { q.points = pts.value.trim() === '' ? '' : Number(pts.value); updateHead(); bc.changed(); } } });
  const secSel = h('select', { class: 'select', dataset: { testid: 'q-section' }, on: { change: () => {
    if (secSel.value) q.section = secSel.value; else delete q.section;
    S.test.questions = orderQuestions(S.test);
    S.open.add(q);
    renderList(bc);
    bc.changed();
    editors(bc)[S.test.questions.indexOf(q)]?.querySelector('[data-testid="q-section"]')?.focus({ preventScroll: true });
  } } });
  fillSectionSelect(secSel, q.section || '');
  const text = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Question text. Use $…$ for math, e.g. $\\ce{H2SO4}$', dataset: { testid: 'q-text' } });
  text.value = q.text || '';
  const richPrev = h('div', { class: 'adm-richprev', 'aria-label': 'Question preview' });
  const drawPreview = () => {
    richPrev.classList.toggle('is-empty', !q.text);
    mount(richPrev, withQuestionImage(q, q.text ? richText(q.text, 'div') : h('span', { class: 'faint' }, 'Preview appears here')));
    renderMath(richPrev);
  };
  const drawPreviewSoon = debounce(drawPreview, 200);
  bc.cleanups.push(() => drawPreviewSoon.cancel());
  text.addEventListener('input', () => { q.text = text.value; updateHead(); drawPreviewSoon(); bc.changed(); });
  const expl = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Shown to students in the review (optional)', dataset: { testid: 'q-explanation' } });
  expl.value = q.explanation || '';
  expl.addEventListener('input', () => { q.explanation = expl.value; bc.changed(); });

  // Optional image shown alongside the question text.
  const imgUrl = h('input', { class: 'input', value: q.image?.url || '', placeholder: 'https://… or images/diagram.png', autocomplete: 'off', spellcheck: 'false', dataset: { testid: 'q-image-url' } });
  const imgAlt = h('input', { class: 'input', type: 'text', value: q.image?.alt || '', placeholder: 'Describe the image for screen readers', dataset: { testid: 'q-image-alt' } });
  const imgPos = h('select', { class: 'select', dataset: { testid: 'q-image-position' } },
    h('option', { value: 'right' }, 'Right of the text'), h('option', { value: 'left' }, 'Left of the text'), h('option', { value: 'below' }, 'Below the text'));
  imgPos.value = q.image?.position || 'right';
  const syncImage = () => {
    const url = imgUrl.value.trim();
    if (url) q.image = { url, alt: imgAlt.value, position: imgPos.value };
    else delete q.image;
    drawPreviewSoon();
    bc.changed();
  };
  for (const el of [imgUrl, imgAlt]) el.addEventListener('input', syncImage);
  imgPos.addEventListener('change', syncImage);

  const typeSection = h('div', { class: 'adm-typesec' });
  // "Label the diagram" manages its own picture (link, upload, paste, drop) inside its editor, so the generic
  // image row is hidden for it; when switching back to another type the row is refreshed from q.image.
  const drawType = () => {
    const hot = q.type === 'hotspot';
    if (imgRow) {
      imgRow.hidden = hot;
      if (!hot) { imgUrl.value = q.image?.url || ''; imgAlt.value = q.image?.alt || ''; imgPos.value = q.image?.position || 'right'; }
    }
    mount(typeSection, typeEditor(q, drawType, changed, uid));
    renderMath(typeSection);
  };
  let imgRow = null;

  const inner = h('div', { class: 'adm-q__inner' },
    h('div', { class: 'adm-grid adm-grid--idsec' }, field('ID', idInput), field('Points', pts), field('Section', secSel)),
    field('Question text', text),
    tagPicker(bc, q),
    (imgRow = h('div', { class: 'adm-grid adm-grid--idsec', hidden: q.type === 'hotspot' }, field('Image (optional)', imgUrl), field('Image description', imgAlt), field('Image position', imgPos))),
    richPrev,
    typeSection,
    field('Explanation', expl),
    extrasPanel(q, changed),
    switchEl({ label: 'Required', hint: 'The student must answer this question before submitting (all questions are required when “All questions required” is on).',
      checked: !!q.required, testid: 'q-required',
      onChange: (v) => { if (v) q.required = true; else delete q.required; updateHead(); bc.changed(); } }));
  const collapse = h('div', { class: 'adm-q__collapse' }, inner);

  const el = h('article', { class: 'adm-q', dataset: { testid: 'question-editor', index } }, head, collapse);
  function sync() {
    const open = S.open.has(q);
    el.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    collapse.inert = !open;
  }
  el._sync = sync;
  el._setIndex = (k, total) => {
    el.dataset.index = String(k);
    num.textContent = `Q${k + 1}`;
    selBox.setAttribute('aria-label', `Select question ${k + 1}`);
    const qs = S.test.questions;
    upBtn.disabled = k === 0 || sectionKey(qs[k - 1]) !== sectionKey(q);
    downBtn.disabled = k === total - 1 || sectionKey(qs[k + 1]) !== sectionKey(q);
  };
  updateHead();
  drawPreview();
  drawType();
  sync();
  el._setIndex(index, S.test.questions.length);
  return el;
}
