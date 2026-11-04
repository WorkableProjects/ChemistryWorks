// Shared per-question feedback card for the V4 games (Tower, Boss Battle, Mistake Review).
// feedbackCard(shell, { ok, title, lines[], q, nextLabel, onNext }) -> Node (testids game-feedback / game-points / game-next)

import { h, icon, richText, renderMath } from '../../ui.js';
import { correctAnswerText } from '../../lib/grading.js';

export function feedbackCard(shell, { ok, title, lines = [], q, nextLabel, onNext }) {
  const next = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'game-next' }, on: { click: onNext } }, nextLabel);
  const card = h('div', { class: ['game-feedback', ok ? 'is-correct' : 'is-wrong', shell.reduced() ? '' : 'pop'], dataset: { testid: 'game-feedback', correct: String(ok) } },
    h('h2', { class: 'game-feedback__title' }, icon(ok ? 'check' : 'x', { size: 22 }), ' ', title),
    lines.map((t, i) => h('p', { class: 'game-feedback__points', dataset: i === 0 ? { testid: 'game-points' } : {} }, t)),
    ok || !q ? null : h('p', { class: 'game-feedback__answer' }, 'Correct answer: ', richText(correctAnswerText(q), 'strong')),
    q && q.explanation ? richText(q.explanation, 'p', 'game-feedback__why') : null,
    next);
  renderMath(card);
  shell.announce(`${title} ${lines.join(' ')} ${ok || !q ? '' : `Correct answer: ${correctAnswerText(q)}.`}`);
  shell.later(() => next.focus());
  return card;
}

/** Review list for the end screen: [{ q, correct, answer }]. */
export function reviewList(results, formatAnswer) {
  return h('ol', { class: 'game-review', dataset: { testid: 'game-review' } }, results.filter((r) => r.q).map((r) => h('li', { class: ['game-review__item', r.correct ? 'is-correct' : 'is-wrong'], dataset: { correct: String(r.correct) } },
    h('span', { class: 'game-review__mark', 'aria-label': r.correct ? 'Correct' : r.skipped ? 'Skipped' : 'Incorrect' }, icon(r.correct ? 'check' : 'x', { size: 16 })),
    h('div', { class: 'game-review__body' },
      richText(r.q.text, 'p', 'game-review__q'),
      h('p', { class: 'game-review__a' }, 'Your answer: ', r.answer == null ? '—' : formatAnswer(r.q, r.answer), r.correct ? null : [' · Correct: ', formatAnswer(r.q, r.q.correctAnswer)])))));
}
