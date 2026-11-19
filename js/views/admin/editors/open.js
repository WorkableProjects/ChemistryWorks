// `open` editor: rubric criteria, word limits and the sample answer.
import { h, icon } from '../../../ui.js';
import { field, switchEl, iconButton } from '../common.js';

function openEditor(q, redraw, changed) {
  q.rubric = Array.isArray(q.rubric) ? q.rubric : [];
  const sumEl = h('p', { class: 'field__hint', dataset: { testid: 'rubric-total' } });
  const fixBtn = h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: 'rubric-set-points' }, on: { click: (e) => {
    const sum = rubricSum();
    q.points = sum;
    const pts = e.currentTarget.closest('.adm-q')?.querySelector('[data-testid="q-points"]');
    if (pts) { pts.value = String(sum); pts.dispatchEvent(new Event('input', { bubbles: true })); }
    showSum(); changed();
  } } }, 'Set question points to rubric total');
  const rubricSum = () => Math.round(q.rubric.reduce((s, r) => s + (Number(r.points) || 0), 0) * 100) / 100;
  const showSum = () => {
    const sum = rubricSum();
    const ok = !q.rubric.length || sum === Number(q.points);
    sumEl.textContent = q.rubric.length ? `Rubric total: ${sum} pt${sum === 1 ? '' : 's'}${ok ? ' ✓' : ` (question is worth ${q.points})`}` : 'No rubric: you will type points freely while grading.';
    sumEl.classList.toggle('field-error', !ok);
    fixBtn.hidden = ok;
  };
  const rows = q.rubric.map((r, i) => {
    const txt = h('input', { class: 'input', value: r.text || '', placeholder: `Criterion ${i + 1}`, 'aria-label': `Rubric criterion ${i + 1}`, dataset: { testid: `rubric-text-${i}` },
      on: { input: () => { r.text = txt.value; changed(); } } });
    const pts = h('input', { class: 'input adm-points', type: 'number', min: '0', step: 'any', value: r.points ?? 1, 'aria-label': `Rubric criterion ${i + 1} points`, dataset: { testid: `rubric-points-${i}` },
      on: { input: () => { r.points = pts.value.trim() === '' ? '' : Number(pts.value); showSum(); changed(); } } });
    return h('div', { class: 'adm-opt adm-opt--plain' }, txt, pts, iconButton('x', 'Remove criterion', () => { q.rubric.splice(i, 1); redraw(); changed(); }, { testid: `rubric-remove-${i}` }));
  });
  const words = (k, label) => {
    const inp = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: q[k] ?? '', placeholder: 'None', dataset: { testid: `open-${k}` },
      on: { input: () => { q[k] = inp.value.trim() === '' ? null : Number(inp.value); changed(); } } });
    return field(label, inp);
  };
  const ta = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Model answer (optional)', dataset: { testid: 'open-sample' }, on: { input: () => { q.sampleAnswer = ta.value; changed(); } } });
  ta.value = q.sampleAnswer || '';
  requestAnimationFrame(() => sumEl.closest('.adm-q')?.querySelector('[data-testid="q-points"]')?.addEventListener('input', showSum));
  showSum();
  return h('div', { class: 'stack' },
    h('p', { class: 'notice notice--info' }, icon('info'), h('span', {}, 'Not auto-graded. In the Grading tab you tick rubric criteria (or type points) for each student.')),
    h('div', { class: 'field__label' }, 'Rubric criteria'),
    h('div', { class: 'adm-opts' }, rows),
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-rubric' }, on: { click: () => { q.rubric.push({ text: '', points: 1 }); redraw(); changed(); } } }, icon('plus', { size: 16 }), 'Add criterion'),
      fixBtn),
    sumEl,
    switchEl({ label: 'Show rubric to students', hint: 'Students see the criteria above the answer box', checked: q.showRubric !== false, testid: 'open-show-rubric', onChange: (v) => { q.showRubric = v; changed(); } }),
    h('div', { class: 'adm-grid adm-grid--4' }, words('minWords', 'Minimum words'), words('maxWords', 'Maximum words')),
    field('Sample answer', ta, 'Shown to you while grading, and to students in the review if “Show correct answers” is on.'));
}

export default { type: 'open', edit: ({ q, redraw, changed }) => openEditor(q, redraw, changed) };
