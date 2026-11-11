// Quiz show view: a board of point tiles in columns; pick a tile to answer it (js/lib/modes/quizshow.js).
import { h } from '../../ui.js';
import { boardPlay } from './board.js';
import { quizshow, boardGroups } from '../../lib/modes/quizshow.js';

export function render(host, attempt, ctx) {
  const groups = boardGroups(attempt.questions, attempt.test.sections);
  const outcomes = new Map();
  const board = (pick, resolved) => h('section', { class: 'mode-card board', dataset: { testid: 'quizshow-board' } },
    h('div', { class: 'board__cols', style: `--cols:${groups.length}` }, groups.map((g) => h('div', { class: 'board__col' },
      h('h2', { class: 'board__head', title: g.title }, g.title),
      g.tiles.map((t) => {
        const done = resolved.has(t.id);
        return h('button', {
          class: ['board__tile', done && 'is-done', outcomes.get(t.id) === 'correct' && 'is-correct'], type: 'button', disabled: done,
          dataset: { testid: 'quizshow-tile', questionId: t.id }, 'aria-label': `${g.title}, ${t.points} points${done ? ', done' : ''}`,
          on: { click: () => pick(t.id) },
        }, done ? '' : String(t.points));
      })))));
  return boardPlay(host, attempt, ctx, {
    mode: quizshow,
    ids: groups.flatMap((g) => g.tiles.map((t) => t.id)),
    lead: 'Pick a tile from the board. Harder tiles are worth more',
    notes: ['A wrong answer scores nothing. Finish any time'],
    board,
    step(q, outcome) {
      outcomes.set(q.id, outcome);
      const pts = groups.flatMap((g) => g.tiles).find((t) => t.id === q.id)?.points || 0;
      return outcome === 'correct' ? { points: pts, lines: [`+${pts} points`] } : { points: 0, lines: [] };
    },
  });
}
