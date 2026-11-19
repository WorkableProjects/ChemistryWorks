// Builder "Preview as student": the real runner widgets, not wired to any submission.

import { h, mount, richText, renderMath } from '../../../ui.js';
import { load, save } from '../../../lib/storage.js';
import { TYPE_LABELS } from '../../../lib/schema.js';
import { groupQuestions } from '../../../lib/sections.js';
import { preloadQuestionTypes } from '../../../lib/qtypes/registry.js';
import { withQuestionImage } from '../../question-image.js';
import { debounce } from '../common.js';
import { normalizedOrNull } from './state.js';

/** The student-view preview: the real runner widgets on a per-student instance of the test. Nothing is submitted. */
export async function renderPreview(bc) {
  const email = h('input', { class: 'input', type: 'email', value: load('builderPreviewEmail', 'student@example.org'), autocomplete: 'off', 'aria-label': 'Fake student email for the preview', dataset: { testid: 'preview-email' } });
  const seedNote = h('span', { class: 'faint', dataset: { testid: 'preview-seed' } });
  const cards = h('div', { class: 'bld2-preview', dataset: { testid: 'builder-preview' } });
  const draw = async () => {
    save('builderPreviewEmail', email.value);
    const t = normalizedOrNull();
    if (!t || !t.questions.length) { mount(cards, h('p', { class: 'muted' }, 'Add at least one valid question to preview the test.')); seedNote.textContent = ''; return; }
    let inst = t;
    try { inst = (await import('../../../lib/instantiate.js')).instantiateTest(t, { email: email.value }); } catch (err) { console.error(err); }
    const { buildWidget } = await import('../../runner/widgets.js');
    await preloadQuestionTypes(inst.questions);
    const answers = {};
    const api = { get: (id) => answers[id], set: (id, val) => { answers[id] = val; } };
    seedNote.textContent = inst.instance && inst.instance.seed ? `Seed: ${inst.instance.seed}` : '';
    const nodes = [];
    let n = 0;
    for (const g of groupQuestions(inst)) {
      if (g.section) nodes.push(h('h4', { class: 'adm-grade__sectionhead' }, g.section.title || 'Section'));
      for (const q of g.questions) {
        let w;
        try { w = buildWidget(q, api); } catch (err) { w = { el: h('p', { class: 'muted' }, 'Could not draw this question.'), refresh() {} }; }
        nodes.push(h('section', { class: 'bld2-preview__card', inert: true, dataset: { testid: 'preview-card', question: q.id } },
          h('div', { class: 'bld2-preview__head' }, h('strong', {}, `Question ${++n}`), h('span', { class: 'pill pill--primary' }, TYPE_LABELS[q.type] || q.type), h('span', { class: 'pill' }, `${q.points ?? 1} pt${Number(q.points ?? 1) === 1 ? '' : 's'}`)),
          withQuestionImage(q.type === 'hotspot' ? { ...q, image: undefined } : q, w.textEl || richText(q.text, 'div', 'q-text')), w.el));
        try { w.refresh(undefined); } catch { /* ignore */ }
      }
    }
    mount(cards, nodes);
    renderMath(cards);
  };
  const drawSoon = debounce(draw, 250);
  bc.cleanups.push(() => drawSoon.cancel());
  email.addEventListener('input', drawSoon);
  const wrap = h('div', { class: 'stack' },
    h('div', { class: 'bld2-preview__email' }, h('label', { class: 'field__label', for: 'preview-email-input' }, 'Preview as'), email, seedNote,
      h('span', { class: 'field__hint' }, 'Enter any email to see that student’s random numbers and drawn questions. Nothing is submitted.')),
    cards);
  email.id = 'preview-email-input';
  draw();
  return wrap;
}
