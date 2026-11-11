// Shared loop for board modes (Quiz show, Bingo): an intro card, a board where the student picks a tile, the question
// (the runner widget, so every answer goes through `attempt.set`), a feedback card, then back to the board.
// boardPlay(host, attempt, ctx, { mode, ids, lead, notes, board, hud?, step }) -> { destroy() }
//   board: (pick, resolved:Set) => Node       draws the board; call pick(questionId) from a tile
//   hud:   () => [{ testid, text, fig? }]
//   step:  (q, outcome) => { points, lines, over }   called once per answered tile

import { h, mount } from '../../ui.js';
import { outcomeOf, isManual } from '../../lib/modes/common.js';

export function boardPlay(host, attempt, ctx, { mode, ids, lead, notes = [], board, hud = null, step }) {
  const byId = new Map(attempt.questions.map((q) => [q.id, q]));
  const all = ids.filter((id) => byId.has(id));
  const total = all.length;
  const resolved = new Set();
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

  function intro() {
    const start = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'mode-start' }, on: { click: showBoard } }, 'Start');
    mount(host, h('section', { class: 'mode-card', dataset: { testid: 'mode-intro' } },
      h('h1', { class: 'mode-card__title', tabindex: '-1' }, mode.title),
      h('p', { class: 'mode-card__lead' }, lead),
      notes.map((n) => h('p', { class: 'mode-card__note' }, n)),
      h('p', { class: 'mode-card__note' }, `${total} ${total === 1 ? 'question' : 'questions'}. Your answers are saved to this practice.`),
      h('div', { class: 'mode-actions' }, start)));
    drawHud();
    start.focus();
  }

  function showBoard() {
    busy = false;
    if (ended) return;
    if (resolved.size >= total) { finish(); return; }
    const done = h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'mode-finish' }, on: { click: finish } }, 'Finish');
    mount(host, h('div', { class: 'mode-stack' }, board(pick, resolved), h('div', { class: 'mode-actions' }, done)));
    drawHud();
  }

  function pick(id) {
    const q = byId.get(id);
    if (!q || resolved.has(id) || ended) return;
    busy = false;
    let checkBtn = null;
    const widgetEl = ctx.widgetFor(q, { onChange: () => { if (checkBtn) checkBtn.disabled = !attempt.isAnswered(q.id); } });
    checkBtn = h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: !attempt.isAnswered(q.id), dataset: { testid: 'mode-check' }, on: { click: () => resolve(q) } },
      isManual(q) ? 'Save answer' : 'Check answer');
    const back = h('button', { class: 'btn btn--ghost btn--lg', type: 'button', dataset: { testid: 'mode-back' }, on: { click: showBoard } }, 'Back to board');
    mount(host, h('div', { class: 'mode-stack' }, h('section', { class: 'mode-card mode-q', dataset: { testid: 'mode-question', questionId: q.id } },
      h('p', { class: 'mode-q__num' }, `Tile ${all.indexOf(id) + 1} of ${total}`),
      widgetEl,
      h('div', { class: 'mode-actions' }, checkBtn, back))));
    drawHud();
  }

  function resolve(q) {
    if (busy || ended) return;
    busy = true;
    const outcome = outcomeOf(attempt, q);
    const res = step(q, outcome) || {};
    score += res.points || 0;
    resolved.add(q.id);
    events.push({ id: q.id, outcome, points: res.points || 0 });
    drawHud();
    ctx.sound?.play?.(outcome === 'correct' ? 'correct' : outcome === 'wrong' || outcome === 'blank' ? 'wrong' : 'tap');
    const over = res.over || resolved.size >= total;
    mount(host, h('div', { class: 'mode-stack' },
      ctx.feedback(q, outcome, { lines: res.lines || [], nextLabel: over ? 'See results' : 'Back to board', onNext: () => (over ? finish() : showBoard()) })));
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
