// Shared question-by-question loop for Mistake Review, Tower and Boss Battle: an intro card, then each question
// (the runner widget, so every answer goes through `attempt.set`), a feedback card, and the end summary via ctx.onEnd.
// playSeq(host, attempt, ctx, { mode, ids, lead, notes, visual?, hud?, step }) -> { destroy() }
//   ids:    question ids to play, in order (must come from the attempt)
//   visual: () => Node | null, drawn above the question and the feedback card
//   hud:    () => [{ testid, text, fig? }]
//   step:   (q, outcome) => { points, lines, over }   called once per answered question

import { h, mount } from '../../ui.js';
import { outcomeOf, isManual } from '../../lib/modes/common.js';

export function playSeq(host, attempt, ctx, { mode, ids, lead, notes = [], visual = null, hud = null, step }) {
  const byId = new Map(attempt.questions.map((q) => [q.id, q]));
  const queue = ids.filter((id) => byId.has(id));
  const total = queue.length;
  const events = [];
  const startedAt = Date.now();
  let ended = false;
  let busy = false;
  let score = 0;

  const drawHud = () => {
    const items = [{ testid: 'mode-progress', text: `${events.length} of ${total} done` }, { testid: 'mode-score', text: `Score ${score}`, fig: true }, ...(hud ? hud() : [])];
    ctx.hudSlot.replaceChildren(h('div', { class: 'mode-hud' },
      items.filter((i) => i.text).map((i) => h('span', { class: ['mode-hud__item', i.fig && 'mode-hud__fig'], dataset: { testid: i.testid } }, i.text))));
  };
  const stage = (...nodes) => h('div', { class: 'mode-stack' }, visual ? visual() : null, ...nodes);

  function intro() {
    const start = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'mode-start' }, on: { click: () => next() } }, 'Start');
    mount(host, stage(h('section', { class: 'mode-card', dataset: { testid: 'mode-intro' } },
      h('h1', { class: 'mode-card__title', tabindex: '-1' }, mode.title),
      h('p', { class: 'mode-card__lead' }, lead),
      notes.map((n) => h('p', { class: 'mode-card__note' }, n)),
      h('p', { class: 'mode-card__note' }, `${total} ${total === 1 ? 'question' : 'questions'}. Your answers are saved to this practice.`),
      h('div', { class: 'mode-actions' }, start))));
    drawHud();
    start.focus();
  }

  function next() {
    busy = false;
    if (ended) return;
    if (!queue.length) { finish(); return; }
    const q = byId.get(queue[0]);
    let checkBtn = null;
    const widgetEl = ctx.widgetFor(q, { onChange: () => { if (checkBtn) checkBtn.disabled = !attempt.isAnswered(q.id); } });
    checkBtn = h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: !attempt.isAnswered(q.id), dataset: { testid: 'mode-check' }, on: { click: () => resolve(q) } },
      isManual(q) ? 'Save answer' : 'Check answer');
    mount(host, stage(h('section', { class: 'mode-card mode-q', dataset: { testid: 'mode-question', questionId: q.id } },
      h('p', { class: 'mode-q__num' }, `Question ${Math.min(events.length + 1, total)} of ${total}`),
      widgetEl,
      h('div', { class: 'mode-actions' }, checkBtn))));
    drawHud();
  }

  function resolve(q) {
    if (busy || ended) return;
    busy = true;
    const outcome = outcomeOf(attempt, q);
    const res = step(q, outcome) || {};
    score += res.points || 0;
    events.push({ id: q.id, outcome, points: res.points || 0 });
    queue.shift();
    drawHud();
    ctx.sound?.play?.(outcome === 'correct' ? 'correct' : outcome === 'wrong' || outcome === 'blank' ? 'wrong' : 'tap');
    const over = res.over || !queue.length;
    mount(host, stage(ctx.feedback(q, outcome, { lines: res.lines || [], nextLabel: over ? 'See results' : 'Next question', onNext: () => (over ? finish() : next()) })));
  }

  function finish() {
    if (ended) return;
    ended = true;
    const { score: points } = mode.scoring(attempt, events);
    ctx.onEnd({
      modeId: mode.id, score: points, answered: attempt.answeredCount,
      correct: events.filter((e) => e.outcome === 'correct').length, total: attempt.total, durationMs: Date.now() - startedAt,
    });
  }

  intro();
  return { destroy() { ended = true; ctx.hudSlot.replaceChildren(); } };
}

/** A message card with one action, for modes that have nothing to play. */
export function emptyCard(host, { title, text, label, onClick, testid = 'mode-empty' }) {
  mount(host, h('section', { class: 'mode-card', dataset: { testid } },
    h('h1', { class: 'mode-card__title', tabindex: '-1' }, title),
    h('p', { class: 'mode-card__lead' }, text),
    h('div', { class: 'mode-actions' }, h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: `${testid}-action` }, on: { click: onClick } }, label))));
}
