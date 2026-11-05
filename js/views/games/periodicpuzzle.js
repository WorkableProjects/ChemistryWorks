// Periodic Puzzle board: place element tiles into an empty periodic table (elements 1–54) from period/group clues.
// Keyboard: pick a tile, then a cell (every cell is a button); wrong placements cost points. Timed or relaxed.

import { h } from '../../ui.js';
import { makePuzzle, checkPlacement, puzzleScore, clueFor, TABLE_ELEMENTS, PUZZLE_SECONDS, TILE_COUNT, WRONG_PENALTY } from '../../lib/games/periodicpuzzle.js';
import { secondsLeft } from '../../lib/games/lightning.js';

export function play(shell) {
  const total = shell.opts.totalSeconds || PUZZLE_SECONDS;
  let g = null;

  function intro() {
    shell.intro({
      rules: () => [
        shell.untimed() ? 'No clock: take your time.' : `${total} seconds on the clock; time left is a bonus.`,
        `Place ${TILE_COUNT} element tiles in their spots. Each tile shows a clue (period and group).`,
        'Choose a tile, then choose its empty cell in the table.',
        `A wrong cell costs ${WRONG_PENALTY} points.`,
      ],
      onStart: begin,
    });
  }

  function begin() {
    const untimed = shell.untimed();
    const puzzle = makePuzzle(TILE_COUNT);
    g = { placed: 0, wrong: 0, selected: null, startedAt: performance.now(), over: false, untimed, secondsLeft: total };
    const hud = shell.hud({ label: 'Periodic Puzzle', ring: !untimed });
    hud.setScore(0); hud.setStreak(0);
    const msg = h('p', { class: 'game-lightning__msg', 'aria-live': 'polite', dataset: { testid: 'pp-msg' } });
    const tileBtns = new Map();
    const tiles = h('div', { class: 'pp-tiles', role: 'group', 'aria-label': 'Element tiles' }, puzzle.tiles.map((el) => {
      const b = h('button', { class: 'pp-tile', type: 'button', 'aria-pressed': 'false', dataset: { testid: `pp-tile-${el.symbol}` },
        on: { click: () => select(el) } }, h('strong', {}, el.symbol), h('span', { class: 'pp-tile__clue' }, clueFor(el)));
      tileBtns.set(el.number, b);
      return b;
    }));
    const missing = new Set(puzzle.tiles.map((t) => t.number));
    const cells = TABLE_ELEMENTS.map((el) => {
      const pos = `grid-row:${el.period};grid-column:${el.group}`;
      if (!missing.has(el.number)) return h('span', { class: 'pp-cell pp-cell--given', style: pos, 'aria-hidden': 'true' }, el.symbol);
      return h('button', { class: 'pp-cell pp-cell--empty', type: 'button', style: pos, 'aria-label': `Empty cell, period ${el.period}, group ${el.group}`,
        dataset: { testid: `pp-cell-${el.number}` }, on: { click: (e) => place(el, e.currentTarget) } });
    });
    const table = h('div', { class: 'pp-table', dataset: { testid: 'pp-table' } }, cells);
    shell.setStage(h('section', { class: 'game-play', 'aria-label': 'Periodic Puzzle' }, hud.el, tiles, h('div', { class: 'pp-table-wrap' }, table), msg));
    const paint = () => {
      if (g.untimed) return Infinity;
      const s = secondsLeft(performance.now() - g.startedAt, 0, total);
      g.secondsLeft = s;
      hud.setTime(s / total, String(Math.ceil(s)), s <= 10);
      return s;
    };
    if (!g.untimed) { paint(); shell.setTimer(() => { if (!g.over && paint() <= 0) finish(); }, shell.reduced() ? 500 : 100); }
    const score = () => puzzleScore({ placed: g.placed, wrong: g.wrong, secondsLeft: g.over ? g.secondsLeft : 0, untimed: g.untimed });

    function select(el) {
      g.selected = el;
      for (const [n, b] of tileBtns) b.setAttribute('aria-pressed', String(n === el.number));
      msg.textContent = `${el.name} (${el.symbol}) selected. ${clueFor(el)}. Now choose its cell.`;
      shell.announce(msg.textContent);
    }
    function place(spot, btn) {
      if (g.over) return;
      if (!g.selected) { msg.textContent = 'Choose a tile first.'; return; }
      const el = g.selected;
      if (checkPlacement(el.number, spot.number)) {
        g.placed++;
        btn.replaceWith(h('span', { class: 'pp-cell pp-cell--placed', style: btn.getAttribute('style'), dataset: { testid: `pp-placed-${el.symbol}` } }, el.symbol));
        tileBtns.get(el.number)?.remove(); tileBtns.delete(el.number); g.selected = null;
        shell.flash(true); shell.sound('correct'); msg.textContent = `${el.name} placed.`;
        if (!tileBtns.size) { finish(); return; }
        shell.later(() => tiles.querySelector('button')?.focus());
      } else {
        g.wrong++; shell.flash(false); shell.sound('wrong');
        msg.textContent = `Not there. ${el.symbol} is in ${clueFor(el)}.`;
      }
      hud.setScore(score());
      shell.announce(msg.textContent);
    }
    function finish() {
      if (g.over) return;
      if (!g.untimed) paint();
      g.over = true;
      const final = score();
      shell.end({
        title: tileBtns.size ? "Time's up!" : 'Table complete!', score: final,
        stats: [
          { label: 'Placed', value: `${g.placed} / ${puzzle.count}`, testid: 'game-correct' },
          { label: 'Wrong cells', value: String(g.wrong), testid: 'game-wrong' },
        ],
        onAgain: begin, announce: `Puzzle over. Score ${final}.`,
      });
    }
    shell.later(() => tiles.querySelector('button')?.focus());
  }
  intro();
}
