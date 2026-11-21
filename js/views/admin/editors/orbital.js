// `orbital` editor: highest sublevel, sublevel types, and a sample diagram for graders.
import { h, mount, icon } from '../../../ui.js';
import { AUFBAU, ORBITAL_TYPES, sublevelsFor, normalizeOrbitalAnswer, isOrbitalAnswered, resolveOrbitalSource, diagramFromCounts, configurationText, rangeForCounts } from '../../../lib/orbital.js';
import { ELEMENTS } from '../../../lib/elements.js';
import { orbitalWidget } from '../../orbital-view.js';
import { field, debounce } from '../common.js';

function orbitalEditor(q, redraw, changed) {
  q.orbitalTypes = Array.isArray(q.orbitalTypes) ? q.orbitalTypes : ['s', 'p'];
  const note = h('p', { class: 'field__hint', dataset: { testid: 'orbital-sublevels' } });
  const sampleBox = h('div', { class: 'adm-orbsample' });
  const drawSample = () => {
    // The widget never redraws itself (the runner calls refresh after each set), so refresh here too.
    let w = null;
    w = orbitalWidget(q, { get: () => q.sampleAnswer, set: (_, v) => { q.sampleAnswer = v ?? null; w?.refresh(q.sampleAnswer ?? undefined); changed(); } });
    mount(sampleBox, w.el);
    w.refresh(q.sampleAnswer ?? undefined);
  };
  const update = () => {
    const subs = sublevelsFor(q);
    note.textContent = subs.length ? `Sublevels shown: ${subs.join(' ')}` : 'No sublevels shown. Tick a type that appears at or below the highest sublevel.';
    note.classList.toggle('field-error', !subs.length);
  };
  // After the range changes keep only boxes that still exist; drop the sample when nothing is left.
  const renormalize = () => {
    if (q.sampleAnswer && typeof q.sampleAnswer === 'object') {
      const next = normalizeOrbitalAnswer(q, q.sampleAnswer);
      q.sampleAnswer = isOrbitalAnswered(q, next) ? next : null;
    }
    update();
    drawSample();
    changed();
  };
  const max = h('select', { class: 'select', dataset: { testid: 'orbital-max' }, on: { change: () => { q.maxSublevel = max.value; renormalize(); } } },
    AUFBAU.map((s) => h('option', { value: s }, `Up to ${s}`)));
  max.value = AUFBAU.includes(q.maxSublevel) ? q.maxSublevel : '2p';
  const typeBoxes = ORBITAL_TYPES.map((t) => {
    const cb = h('input', { type: 'checkbox', checked: q.orbitalTypes.includes(t), dataset: { testid: `orbital-type-${t}` },
      on: { change: () => { q.orbitalTypes = ORBITAL_TYPES.filter((x) => (x === t ? cb.checked : q.orbitalTypes.includes(x))); renormalize(); } } });
    return h('label', { class: 'adm-check' }, cb, h('span', {}, `${t} sublevels`));
  });
  const clear = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'orbital-sample-clear' }, on: { click: () => { q.sampleAnswer = null; drawSample(); changed(); } } }, 'Clear sample');
  // Element symbol or configuration -> range + reference diagram (like Lewis questions).
  const srcHint = h('p', { class: 'field__hint', dataset: { testid: 'orbital-source-hint' } });
  const applySource = () => {
    const text = src.value.trim();
    q.element = text;
    if (!text) { srcHint.textContent = 'Type a symbol (N) or a configuration (1s2 2s2 2p3, [Ne] 3s1) to draw the reference diagram.'; srcHint.classList.remove('field-error'); changed(); return; }
    const r = resolveOrbitalSource(text, ELEMENTS);
    if (r.error) { srcHint.textContent = r.error; srcHint.classList.add('field-error'); changed(); return; }
    srcHint.classList.remove('field-error');
    const need = rangeForCounts(r.counts);
    if (AUFBAU.indexOf(need.maxSublevel) > AUFBAU.indexOf(q.maxSublevel)) q.maxSublevel = need.maxSublevel;
    max.value = AUFBAU.includes(q.maxSublevel) ? q.maxSublevel : '2p';
    q.orbitalTypes = ORBITAL_TYPES.filter((t) => q.orbitalTypes.includes(t) || need.orbitalTypes.includes(t));
    typeBoxes.forEach((l, k) => { l.querySelector('input').checked = q.orbitalTypes.includes(ORBITAL_TYPES[k]); });
    const sample = normalizeOrbitalAnswer(q, diagramFromCounts(r.counts));
    q.sampleAnswer = isOrbitalAnswered(q, sample) ? sample : null;
    srcHint.textContent = `${r.label ? `${r.label}: ` : ''}${configurationText(r.counts)}. You can still click boxes below to adjust.`;
    update();
    drawSample();
    changed();
  };
  const src = h('input', { class: 'input', value: q.element || '', placeholder: 'e.g. N or 1s2 2s2 2p3', autocomplete: 'off', spellcheck: 'false', dataset: { testid: 'orbital-source' },
    on: { input: debounce(applySource, 250), change: applySource } });
  srcHint.textContent = q.element ? '' : 'Type a symbol (N) or a configuration (1s2 2s2 2p3, [Ne] 3s1) to draw the reference diagram.';

  update();
  drawSample();
  return h('div', { class: 'stack' },
    h('p', { class: 'notice notice--info' }, icon('info'), h('span', {}, 'Orbital diagrams are graded by the teacher.')),
    h('div', { class: 'field' }, h('label', { class: 'field__label' }, 'Element or electron configuration'), src, srcHint),
    h('div', { class: 'adm-grid adm-grid--4' }, field('Highest sublevel', max, 'In filling (Aufbau) order')),
    h('div', { class: 'field__label' }, 'Sublevel types included'),
    h('div', { class: 'row row--wrap' }, typeBoxes),
    note,
    h('div', { class: 'field__label' }, 'Sample answer (optional, for graders)'),
    sampleBox,
    h('div', { class: 'row' }, clear));
}

export default { type: 'orbital', edit: ({ q, redraw, changed }) => orbitalEditor(q, redraw, changed) };
