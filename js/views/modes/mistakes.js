// Mistake Review view: answer again the questions that were wrong, plus any marked wrong in released feedback.
import { mount, h } from '../../ui.js';
import { playSeq, emptyCard } from './play.js';
import { mistakes, mistakeIds, FIX_POINTS } from '../../lib/modes/mistakes.js';
import { checkSubmissionState } from '../../lib/student-status.js';
import { topicOptions, filterByTag, recalledTagIndex } from '../../lib/tag-stats.js';
import { topicFilter } from '../tag-summary.js';

export function render(host, attempt, ctx) {
  let inner = null;
  let dead = false;
  const toStudy = () => ctx.onEnd({ modeId: 'mistakes', score: 0, answered: attempt.answeredCount, correct: 0, total: attempt.total, durationMs: 0 });

  // A test with tagged questions lets the student pick a topic first. Without tags the review starts straight away.
  function pickTopic(ids) {
    const options = topicOptions(attempt.questions.filter((q) => ids.includes(q.id)), recalledTagIndex(attempt.test?.code));
    let topic = '';
    const note = h('p', { class: 'mode-card__note', dataset: { testid: 'mistakes-count' } });
    const start = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'mistakes-start' }, on: { click: () => play(filterByTag(ids, attempt.questions, topic)) } }, 'Start');
    const count = () => filterByTag(ids, attempt.questions, topic).length;
    const refresh = () => { const n = count(); note.textContent = `${n} ${n === 1 ? 'question' : 'questions'} to review`; start.disabled = !n; };
    mount(host, h('section', { class: 'mode-card', dataset: { testid: 'mode-intro' } },
      h('h1', { class: 'mode-card__title', tabindex: '-1' }, mistakes.title),
      h('p', { class: 'mode-card__lead' }, 'Choose a topic, or review everything you missed'),
      topicFilter(options, { value: topic, onChange: (id) => { topic = id; refresh(); }, testid: 'mistakes-topic' }),
      note, h('div', { class: 'mode-actions' }, start)));
    refresh();
    start.focus();
  }

  function show(ids) {
    if (dead) return;
    inner?.();
    if (ids.length && topicOptions(attempt.questions.filter((q) => ids.includes(q.id))).length) { inner = null; pickTopic(ids); return; }
    play(ids);
  }

  function play(ids) {
    if (dead) return;
    inner?.();
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

  return () => { dead = true; inner?.(); ctx.hudSlot.replaceChildren(); };
}
