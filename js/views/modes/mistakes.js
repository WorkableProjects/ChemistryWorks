// Mistake Review view: answer again the questions that were wrong, plus any marked wrong in released feedback.
import { mount, h } from '../../ui.js';
import { playSeq, emptyCard } from './play.js';
import { mistakes, mistakeIds, FIX_POINTS } from '../../lib/modes/mistakes.js';
import { checkSubmissionState } from '../../lib/student-status.js';
import { tagFilter, idsWithTag } from './tag-filter.js';

export function render(host, attempt, ctx) {
  let inner = null;
  let dead = false;
  const toStudy = () => ctx.onEnd({ modeId: 'mistakes', score: 0, answered: attempt.answeredCount, correct: 0, total: attempt.total, durationMs: 0 });

  // With tagged questions, first offer "Practise only <tag>".
  let picked = false;
  function show(ids) {
    if (dead) return;
    if (!picked && ids.length) {
      const byId = new Map(attempt.questions.map((q) => [q.id, q]));
      let tag = '';
      const filter = tagFilter(attempt.questions.filter((q) => ids.includes(q.id)), attempt.test, (v) => { tag = v; });
      if (filter) {
        const go = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'mode-start' }, on: { click: () => { picked = true; show(idsWithTag(ids, byId, tag)); } } }, 'Start');
        mount(host, h('section', { class: 'mode-card', dataset: { testid: 'mode-intro' } },
          h('h1', { class: 'mode-card__title', tabindex: '-1' }, 'Mistake review'), filter, h('div', { class: 'mode-actions' }, go)));
        return;
      }
    }
    picked = true;
    inner?.destroy();
    if (!ids.length) {
      inner = null;
      emptyCard(host, {
        title: 'Nothing to review',
        text: attempt.answeredCount ? 'No wrong answers so far' : 'Answer some questions first, then come back to review the ones you missed',
        label: 'Finish', onClick: toStudy,
      });
      return;
    }
    inner = playSeq(host, attempt, ctx, {
      mode: mistakes, ids,
      lead: 'Answer again the questions you got wrong',
      notes: [`A right answer replaces the old one and scores ${FIX_POINTS} points`],
      step: (q, outcome) => ({ points: outcome === 'correct' ? FIX_POINTS : 0, lines: outcome === 'correct' ? [`+${FIX_POINTS} points`] : [], over: false }),
    });
  }

  // Start with what this device knows, then add anything the teacher marked wrong in released feedback.
  mount(host, h('p', { class: 'mode-card__note' }, 'Finding your mistakes'));
  const local = mistakeIds(attempt);
  checkSubmissionState({ user: attempt.user, config: ctx.config }, attempt.test)
    .then((s) => show(mistakeIds(attempt, s?.feedback || null)))
    .catch(() => show(local));

  return { destroy() { dead = true; inner?.destroy(); ctx.hudSlot.replaceChildren(); } };
}
