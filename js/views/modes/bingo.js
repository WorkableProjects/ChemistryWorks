// Bingo view: a card of element-tile squares; a right answer marks its square (js/lib/modes/bingo.js).
import { h, icon } from '../../ui.js';
import { boardPlay } from './board.js';
import { bingo, buildCard, cardSize, applyBingo, completedLines, bingoLines } from '../../lib/modes/bingo.js';

export function render(host, attempt, ctx) {
  const qs = attempt.questions;
  const size = cardSize(qs.length);
  const card = buildCard(qs.map((q) => q.id), size);
  const cellOf = new Map(card.filter((c) => c.qid).map((c) => [c.qid, c.index]));
  const byId = new Map(qs.map((q) => [q.id, q]));
  let marked = new Set(card.filter((c) => c.free).map((c) => c.index));
  const missed = new Set();
  const lineCount = () => completedLines(size, marked).length;

  const board = (pick, resolved) => h('section', { class: 'mode-card board', dataset: { testid: 'bingo-card', size, lines: lineCount() } },
    h('div', { class: 'bingo', style: `--size:${size}` }, card.map((c) => {
      const isMarked = marked.has(c.index);
      const q = c.qid ? byId.get(c.qid) : null;
      const label = c.free ? 'Free square' : `Square ${c.index + 1}${resolved.has(c.qid) ? (isMarked ? ', marked' : ', missed') : ''}`;
      return h('button', {
        class: ['bingo__cell', isMarked && 'is-marked', missed.has(c.index) && 'is-missed', c.free && 'is-free'], type: 'button', disabled: c.free || resolved.has(c.qid),
        dataset: { testid: 'bingo-cell', index: c.index }, 'aria-label': label, on: { click: () => q && pick(q.id) },
      }, h('span', { class: 'bingo__num' }, c.free ? 'Fr' : String(c.index + 1)), isMarked ? icon('check', { size: 16 }) : null);
    })));

  return boardPlay(host, attempt, ctx, {
    mode: bingo,
    ids: card.filter((c) => c.qid).map((c) => c.qid),
    lead: 'Answer to mark squares. A full row, column or diagonal is a line',
    notes: [`${size} by ${size} card, ${bingoLines(size).length} possible lines. Play on to fill the card`],
    board,
    hud: () => [{ testid: 'bingo-lines', text: `Lines ${lineCount()}`, fig: true }],
    step(q, outcome) {
      const index = cellOf.get(q.id);
      const res = applyBingo({ size, marked, outcome, index });
      marked = res.marked;
      if (outcome !== 'correct') missed.add(index);
      const lines = [];
      if (res.points) lines.push(`+${res.points} points`);
      if (res.newLines) lines.push(res.newLines === 1 ? 'Line complete' : `${res.newLines} lines complete`);
      if (res.full) lines.push('Card full');
      return { points: res.points, lines };
    },
  });
}
