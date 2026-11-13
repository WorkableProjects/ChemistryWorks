// Flashcards view: flip a card, then mark it known or review it again. Not scored.
// Back of the card: the key when the test shows correct answers (not for teacher-graded types); otherwise the answer widget.
import { h, mount, richText, renderMath } from '../../ui.js';
import { correctAnswerText } from '../../lib/grading.js';
import { isManual } from '../../lib/modes/common.js';
import { flashcards, advanceCards } from '../../lib/modes/flashcards.js';
import { tagFilter, idsWithTag } from './tag-filter.js';

export function render(host, attempt, ctx) {
  const byId = new Map(attempt.questions.map((q) => [q.id, q]));
  const allIds = attempt.questions.map((q) => q.id);
  let queue = allIds;
  let total = queue.length;
  const startedAt = Date.now();
  let knew = 0;
  let ended = false;

  const drawHud = () => ctx.hudSlot.replaceChildren(h('div', { class: 'mode-hud' },
    h('span', { class: 'mode-hud__item', dataset: { testid: 'mode-progress' } }, `${knew} of ${total} known`),
    h('span', { class: 'mode-hud__item' }, `${queue.length} to go`)));

  function intro() {
    const start = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'mode-start' }, on: { click: card } }, 'Start');
    const note = h('p', { class: 'mode-card__note' });
    const drawNote = () => { note.textContent = `${total} ${total === 1 ? 'card' : 'cards'}. Cards you review again come back later`; };
    drawNote();
    const filter = tagFilter(attempt.questions, attempt.test, (tag) => { queue = idsWithTag(allIds, byId, tag); total = queue.length; drawNote(); drawHud(); start.disabled = !total; });
    mount(host, h('section', { class: 'mode-card', dataset: { testid: 'mode-intro' } },
      h('h1', { class: 'mode-card__title', tabindex: '-1' }, flashcards.title),
      h('p', { class: 'mode-card__lead' }, flashcards.blurb),
      filter,
      note,
      h('div', { class: 'mode-actions' }, start)));
    drawHud();
    start.focus();
  }

  function card() {
    if (ended) return;
    if (!queue.length) { finish(); return; }
    const q = byId.get(queue[0]);
    const showKey = attempt.showsCorrectness() && !isManual(q);
    let flipped = false;
    const front = h('div', { class: 'flash__face', dataset: { testid: 'flash-front' } }, richText(q.text, 'div', 'q-text'));
    const back = h('div', { class: 'flash__face', hidden: true, dataset: { testid: 'flash-back' } });
    const flip = h('button', { class: 'btn btn--primary', type: 'button', dataset: { testid: 'flash-flip' }, on: { click: doFlip } }, showKey ? 'Flip card' : 'Flip to answer');
    const knewBtn = h('button', { class: 'btn btn--primary btn--lg', type: 'button', hidden: true, dataset: { testid: 'flash-knew' }, on: { click: () => mark(true) } }, 'Knew it');
    const againBtn = h('button', { class: 'btn btn--lg', type: 'button', hidden: true, dataset: { testid: 'flash-again' }, on: { click: () => mark(false) } }, 'Review again');
    function doFlip() {
      if (flipped) return;
      flipped = true;
      if (showKey) {
        back.append(h('p', { class: 'mode-card__note' }, 'Answer'), richText(correctAnswerText(q), 'strong'), q.explanation ? richText(q.explanation, 'p', 'mode-feedback__why') : null);
        renderMath(back);
      } else {
        back.append(ctx.widgetFor(q));
      }
      back.hidden = false;
      front.hidden = true;
      flip.hidden = true; knewBtn.hidden = false; againBtn.hidden = false;
      ctx.announce(showKey ? `Answer: ${correctAnswerText(q)}` : 'Answer side');
    }
    function mark(k) {
      if (k) knew++;
      queue = advanceCards(queue, k);
      card();
    }
    mount(host, h('section', { class: 'mode-card mode-q', dataset: { testid: 'mode-question', questionId: q.id } },
      h('p', { class: 'mode-q__num' }, `Card ${Math.min(knew + 1, total)} of ${total}`),
      front, back,
      h('div', { class: 'mode-actions' }, flip, knewBtn, againBtn)));
    renderMath(host);
    drawHud();
  }

  function finish() {
    if (ended) return;
    ended = true;
    ctx.onEnd({ modeId: flashcards.id, score: 0, answered: attempt.answeredCount, correct: knew, total: attempt.total, durationMs: Date.now() - startedAt });
  }

  intro();
  return { destroy() { ended = true; ctx.hudSlot.replaceChildren(); } };
}
