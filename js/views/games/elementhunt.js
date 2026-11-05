// Element Hunt board: "Click the element that ..." on a read-only periodic table (layout follows
// reference-pane.js periodicTable()). Prompts are generated from js/lib/elements.js.

import { h, icon } from '../../ui.js';
import { ELEMENTS, GROUP_LABELS } from '../../lib/elements.js';
import { buildPrompts, scoreHunt, ROUNDS, HUNT_SECONDS } from '../../lib/games/elementhunt.js';
import { summarizeGame } from '../../lib/game.js';

/** Grid position of an element: main table rows 0-6, f-block rows 8 (Ce-Lu) and 9 (Th-Lr). */
function position(e) {
  if (e.group) return { row: e.period - 1, col: e.group - 1 };
  if (e.number >= 58 && e.number <= 71) return { row: 8, col: 3 + (e.number - 58) };
  return { row: 9, col: 3 + (e.number - 90) };
}

export function buildTable(onPick) {
  const byPos = new Map();
  const buttons = new Map();
  const cellFor = (e) => {
    const pos = position(e);
    const b = h('button', {
      type: 'button', class: 'hunt-el', tabindex: '-1', title: '',
      'aria-label': `${e.number} ${e.symbol}`, dataset: { testid: `hunt-${e.symbol}`, symbol: e.symbol, row: String(pos.row), col: String(pos.col) },
      on: { click: () => onPick(e) },
    }, h('span', { class: 'hunt-el__n', 'aria-hidden': 'true' }, String(e.number)), h('span', { class: 'hunt-el__s', 'aria-hidden': 'true' }, e.symbol));
    byPos.set(`${pos.row},${pos.col}`, b);
    buttons.set(e.symbol, b);
    return b;
  };
  const cells = ELEMENTS.map((e) => ({ e, b: cellFor(e) }));
  const find = (row, col) => byPos.get(`${row},${col}`);

  const rows = [];
  const head = h('tr', {}, h('td'), GROUP_LABELS.map((label, i) => h('th', { scope: 'col', class: 'hunt-head', 'aria-label': `Group ${i + 1}` }, String(i + 1))));
  for (let r = 0; r < 10; r++) {
    if (r === 7) { rows.push(h('tr', { class: 'hunt-spacer', 'aria-hidden': 'true' }, h('td', { colspan: '19' }))); continue; }
    const tds = [h('th', { scope: 'row', class: 'hunt-head hunt-head--row' }, r < 7 ? String(r + 1) : h('span', { class: 'sr-only' }, r === 8 ? 'Lanthanides' : 'Actinides'))];
    for (let c = 0; c < 18; c++) { const b = find(r, c); tds.push(h('td', { class: b ? 'hunt-cell' : 'hunt-gap' }, b || null)); }
    rows.push(h('tr', {}, tds));
  }
  const table = h('table', { class: 'hunt-table', dataset: { testid: 'hunt-table' } },
    h('caption', { class: 'sr-only' }, 'Periodic table. Use the arrow keys to move between elements and Enter to choose one.'),
    h('thead', {}, head), h('tbody', {}, rows));

  // Roving tabindex: one tab stop, arrow keys move.
  let active = find(0, 0);
  const focusBtn = (b) => { if (!b) return; active.tabIndex = -1; active = b; b.tabIndex = 0; b.focus({ preventScroll: false }); };
  active.tabIndex = 0;
  table.addEventListener('focusin', (e) => { const b = e.target.closest?.('.hunt-el'); if (b && b !== active) { active.tabIndex = -1; active = b; b.tabIndex = 0; } });
  table.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (!d || !active) return;
    e.preventDefault();
    let row = Number(active.dataset.row); let col = Number(active.dataset.col);
    for (let guard = 0; guard < 30; guard++) {
      row += d[0]; col += d[1];
      if (row < 0 || row > 9 || col < 0 || col > 17) return;
      const direct = find(row, col);
      if (direct) { focusBtn(direct); return; }
      if (d[0]) { // vertical move into a row without a cell in this column: nearest cell in that row
        for (let off = 1; off < 18; off++) {
          const hit = find(row, col - off) || find(row, col + off);
          if (hit) { focusBtn(hit); return; }
        }
      }
    }
  });
  return { table, buttons, cells, focusFirst: () => focusBtn(find(0, 0)) };
}

export function play(shell) {
  const { user, test } = shell;
  let round = 0;
  let g = null;
  const limitMs = HUNT_SECONDS * 1000;

  function intro() {
    shell.intro({
      rules: () => [
        `${ROUNDS} prompts like "Click the element in group 17, period 3". ${shell.untimed() ? 'No clock.' : `${HUNT_SECONDS} seconds each.`}`,
        shell.untimed() ? 'One click per prompt. No speed points; streaks add a bonus.' : 'One click per prompt. Faster correct clicks score more (up to 1000); streaks add a bonus.',
        'Keyboard: Tab to the table, arrow keys move between elements, Enter or Space chooses.',
      ],
      onStart: begin,
    });
  }

  function begin() {
    round++;
    g = { prompts: buildPrompts(ROUNDS), i: 0, streak: 0, score: 0, results: [], untimed: shell.untimed() };
    prompt();
  }

  function prompt() {
    shell.clearTimer();
    const p = g.prompts[g.i];
    const st = { locked: false, startedAt: performance.now() };
    const hud = shell.hud({ label: `Prompt ${g.i + 1} of ${g.prompts.length}`, ring: !g.untimed });
    hud.setScore(g.score); hud.setStreak(g.streak);
    const ask = h('div', { class: 'game-q hunt-ask', tabindex: '-1', dataset: { testid: 'game-question' } }, h('p', { class: 'game-q__text' }, p.text));
    const feedbackSlot = h('div', { class: 'game-feedback-slot' });
    const tbl = buildTable((e) => finish(e, false));

    const paint = () => {
      const rem = Math.max(0, limitMs - (performance.now() - st.startedAt));
      hud.setTime(rem / limitMs, String(Math.ceil(rem / 1000)), rem <= 5000);
      return rem;
    };
    if (!g.untimed) {
      paint();
      shell.setTimer(() => { if (!st.locked && paint() <= 0) finish(null, true); }, shell.reduced() ? 500 : 100);
    }

    function finish(el, timedOut) {
      if (st.locked) return;
      st.locked = true;
      shell.clearTimer();
      const ok = !!el && p.accepts(el);
      const elapsedMs = Math.min(performance.now() - st.startedAt, limitMs);
      const s = scoreHunt({ correct: ok, elapsedMs, streak: g.streak, untimed: g.untimed });
      g.streak = s.streak; g.score += s.points;
      g.results.push({ correct: ok, points: s.points, prompt: p.text, picked: el ? el.name : null });
      hud.setScore(g.score); hud.setStreak(g.streak);
      tbl.cells.forEach(({ e, b }) => {
        b.disabled = true;
        if (p.accepts(e) && (ok ? e === el : true)) b.classList.add('is-correct');
      });
      if (el && !ok) tbl.buttons.get(el.symbol)?.classList.add('is-wrong');
      shell.flash(ok); shell.sound(ok ? 'correct' : 'wrong');
      if (ok) hud.pop(`+${s.points.toLocaleString()}`);
      const last = g.i === g.prompts.length - 1;
      const next = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'game-next' }, on: { click: () => { if (last) end(); else { g.i++; prompt(); } } } }, last ? 'See results' : 'Next prompt');
      const title = ok ? 'Correct!' : timedOut ? "Time's up" : 'Not quite';
      const answerText = p.kind === 'group' || p.kind === 'period' || p.kind === 'family' ? 'Highlighted elements all fit.' : `Answer: ${p.target.name} (${p.target.symbol}).`;
      feedbackSlot.replaceChildren(h('div', { class: ['game-feedback', ok ? 'is-correct' : 'is-wrong', shell.reduced() ? '' : 'pop'], dataset: { testid: 'game-feedback', correct: String(ok) } },
        h('h2', { class: 'game-feedback__title' }, icon(ok ? 'check' : 'x', { size: 22 }), ' ', title),
        h('p', { class: 'game-feedback__points', dataset: { testid: 'game-points' } }, ok ? `+${s.points.toLocaleString()} points` : '0 points'),
        ok ? null : h('p', { class: 'game-feedback__answer' }, answerText),
        next));
      shell.announce(`${title} ${ok ? `+${s.points} points.` : answerText}`);
      shell.later(() => next.focus());
    }

    shell.clearKeys();
    shell.setStage(h('section', { class: 'game-play', 'aria-label': `Prompt ${g.i + 1}` }, hud.el, ask,
      h('div', { class: 'hunt-scroll' }, tbl.table), feedbackSlot));
    shell.announce(p.text);
    shell.later(() => tbl.focusFirst());
  }

  function end() {
    const sum = summarizeGame(g.results);
    const review = h('ol', { class: 'game-review', dataset: { testid: 'game-review' } }, g.results.map((r) => h('li', { class: ['game-review__item', r.correct ? 'is-correct' : 'is-wrong'], dataset: { correct: String(r.correct) } },
      h('span', { class: 'game-review__mark', 'aria-label': r.correct ? 'Correct' : 'Incorrect' }, icon(r.correct ? 'check' : 'x', { size: 16 })),
      h('div', { class: 'game-review__body' }, h('p', { class: 'game-review__q' }, r.prompt), h('p', { class: 'game-review__a' }, r.picked ? `You chose ${r.picked}` : 'No answer')),
      h('span', { class: 'game-review__pts' }, `${r.points.toLocaleString()} pts`))));
    shell.end({
      score: sum.score,
      stats: [
        { label: 'Accuracy', value: `${sum.accuracy}%`, testid: 'game-accuracy' },
        { label: 'Correct', value: `${sum.correct} / ${sum.total}`, testid: 'game-correct' },
        { label: 'Best streak', value: String(sum.bestStreak), testid: 'game-best-streak' },
      ],
      review, onAgain: begin,
      announce: `Round over. Score ${sum.score}. ${sum.correct} of ${sum.total} correct.`,
    });
  }
  void user; void test;
  intro();
}
