// Builder state and small helpers shared by the builder modules. The working test (S.test) is the single source of
// truth: inputs mutate it directly and only refresh the pieces that depend on the changed value.

import { h, openModal } from '../../../ui.js';
import { load, save } from '../../../lib/storage.js';
import { normalizeTest, validateTest, blankTest } from '../../../lib/schema.js';
import { sectionPoints } from '../../../lib/sections.js';
import { debounce, switchEl, field } from '../common.js';

// Module-level state: survives tab switches within the session.
export const S = { test: null, mode: 'visual', open: new WeakSet(), uid: 0 };
export const clone = (x) => JSON.parse(JSON.stringify(x));

export function ensure() {
  if (S.test) return;
  const saved = load('builderWorking', null);
  S.test = saved && typeof saved === 'object' && Array.isArray(saved.questions) ? { ...blankTest(), ...saved } : blankTest();
  openDefaults();
}
export function openDefaults() {
  S.open = new WeakSet();
  const qs = S.test.questions;
  (qs.length <= 5 ? qs : qs.slice(0, 1)).forEach((q) => S.open.add(q));
}
export function persistNow() { save('builderWorking', S.test); }
export const persistSoon = debounce(persistNow, 400);

export function getBuilderTest() { ensure(); return S.test; }
/** Replace the working test (library edit/duplicate/import). */
export function setBuilderTest(test) {
  S.test = { ...blankTest(), ...clone(test) };
  delete S.test.updatedAt;
  openDefaults();
  persistNow();
}
export function newBuilderTest() { S.test = blankTest(); openDefaults(); persistNow(); }
/** True when the working test has anything worth confirming before discarding. */
export function builderIsDirty() {
  ensure();
  return !!(S.test.title || S.test.code || S.test.description || S.test.questions.length);
}

export function safeValidate(test) {
  try {
    return validateTest(normalizeTest(test));
  } catch (e) {
    return { valid: false, errors: [`Could not validate: ${e.message}`] };
  }
}
export const normalizedOrNull = () => { try { return normalizeTest(S.test); } catch { return null; } };
export function totalPoints(test) {
  return Math.round(test.questions.reduce((s, q) => s + (Number(q.points) || 0), 0) * 100) / 100;
}

// Section labels, shared by the settings, question list and outline.
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const sectionSummary = (id) => {
  const n = S.test.questions.filter((q) => q.section === id).length;
  return `${plural(sectionPoints(S.test, id), 'pt', 'pts')} · ${plural(n, 'question', 'questions')}`;
};
export const sectionTitleOf = (s, i) => (String(s.title || '').trim() || `Section ${i + 1}`);
export const sectionKey = (q) => (q && q.section && (S.test.sections || []).some((s) => s.id === q.section) ? q.section : '');

export function previewText(q) {
  const t = String(q.text || '').replace(/\s+/g, ' ').trim();
  return t ? (t.length > 90 ? `${t.slice(0, 90)}…` : t) : '(no text yet)';
}
export function confirmDialog({ title, body, confirmLabel = 'Delete', testid = 'confirm-dialog', onConfirm }) {
  openModal({
    title, body, testid,
    actions: [
      { label: 'Cancel', variant: 'ghost', autofocus: true },
      { label: confirmLabel, variant: 'danger', testid: 'confirm-action', onClick: (close) => { close(); onConfirm(); } },
    ],
  });
}

/** "Extras" disclosure in the common question settings (V4-03): confidence switch and a point-costing hint. */
export function extrasPanel(q, changed) {
  const text = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Hint shown when the student asks for it (leave empty for no hint)', dataset: { testid: 'q-hint-text' } });
  text.value = q.hint?.text || '';
  const cost = h('input', { class: 'input', type: 'number', min: '0', step: 'any', value: q.hint?.cost ?? 0, dataset: { testid: 'q-hint-cost' } });
  const syncHint = () => {
    if (text.value.trim() === '') delete q.hint;
    else q.hint = { text: text.value, cost: cost.value.trim() === '' ? 0 : Number(cost.value) };
    changed();
  };
  text.addEventListener('input', syncHint);
  cost.addEventListener('input', syncHint);
  const open = !!(q.confidence || q.hint);
  const d = h('details', { class: 'adm-extras', open, dataset: { testid: 'q-extras' } },
    h('summary', {}, 'Extras'),
    h('div', { class: 'stack adm-extras__body' },
      switchEl({ label: 'Ask “How sure are you?”', hint: 'After answering, students rate Guessing / Fairly sure / Certain. Shown in results.',
        checked: !!q.confidence, testid: 'q-confidence', onChange: (v) => { if (v) q.confidence = true; else delete q.confidence; changed(); } }),
      field('Hint', text, 'Students can reveal it; revealing it costs points.'),
      field('Hint cost (points)', cost, 'Deducted from the points earned (never below 0); at most the question\'s points.')));
  return d;
}
