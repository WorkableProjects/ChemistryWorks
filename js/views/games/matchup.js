// Match-Up board: face-down cards, turn two at a time, find the pairs. Pairs come from the test's matching
// questions and element symbol <-> name. Buttons with aria-pressed; a flip animation uses transform only.

import { h, renderMath, richText } from '../../ui.js';
import { choosePairs, buildDeck, isMatch, matchScore, PAIR_COUNT } from '../../lib/games/matchup.js';

const MISMATCH_MS = 900;

export function play(shell) {
  let g = null;
  const pairCount = shell.opts.questions ? Math.max(2, Math.min(12, shell.opts.questions)) : PAIR_COUNT;

  function intro() {
    const { fromTest, fromElements } = choosePairs(shell.gtest, pairCount);
    shell.intro({
      rules: [
        `Find ${pairCount} matching pairs. Turn two cards at a time; matches stay face-up.`,
        'Each failed attempt costs 15 points, so remember where things are.',
        fromTest ? `Pairs come from this test${fromElements ? ' and element symbols and names' : ''}.` : 'Pairs are element symbols and their names.',
        'Keyboard: Tab to a card and press Enter or Space to turn it.',
      ],
      onStart: begin,
    });
  }

  function begin() {
    const { pairs } = choosePairs(shell.gtest, pairCount);
    g = { pairs, deck: buildDeck(pairs), open: [], matched: new Set(), misses: 0, turns: 0, busy: false };
    board();
  }

  function board() {
    const hud = shell.hud({ label: `Pairs 0 of ${g.pairs.length}`, scored: true, streak: false });
    const score = () => matchScore({ pairs: g.matched.size, misses: g.misses });
    hud.setScore(0);
    const grid = h('div', { class: 'match-grid', role: 'group', 'aria-label': 'Cards', dataset: { testid: 'match-grid' } });
    const els = new Map();
    g.deck.forEach((card, i) => {
      const front = h('span', { class: 'match-card__face match-card__front', 'aria-hidden': 'true' }, '?');
      const back = h('span', { class: 'match-card__face match-card__back' }, richText(card.text, 'span', 'match-card__text'));
      const b = h('button', {
        type: 'button', class: 'match-card', 'aria-pressed': 'false', 'aria-label': `Card ${i + 1}, face down`,
        dataset: { testid: `match-card-${i}`, pair: card.pairId, side: card.side },
        on: { click: () => flip(card, b, i) },
      }, h('span', { class: 'match-card__inner' }, front, back));
      els.set(card.id, b);
      grid.append(b);
    });

    function setFace(card, b, i, up) {
      b.classList.toggle('is-up', up);
      b.setAttribute('aria-pressed', String(up));
      b.setAttribute('aria-label', up ? `Card ${i + 1}: ${card.text}` : `Card ${i + 1}, face down`);
    }

    function flip(card, b, i) {
      if (g.busy || g.matched.has(card.pairId) || g.open.some((o) => o.card.id === card.id)) return;
      setFace(card, b, i, true);
      shell.sound('flip');
      g.open.push({ card, b, i });
      if (g.open.length < 2) { shell.announce(card.text); return; }
      g.turns++;
      const [a, c] = g.open;
      if (isMatch(a.card, c.card)) {
        g.matched.add(a.card.pairId);
        [a, c].forEach((x) => x.b.classList.add('is-matched'));
        g.open = [];
        hud.setScore(score());
        hud.setLabel(`Pairs ${g.matched.size} of ${g.pairs.length}`);
        hud.pop('+100');
        shell.flash(true); shell.sound('correct');
        shell.announce(`Match: ${a.card.text} and ${c.card.text}. ${g.matched.size} of ${g.pairs.length} pairs found.`);
        if (g.matched.size === g.pairs.length) shell.later(end, shell.reduced() ? 300 : 700);
      } else {
        g.misses++;
        g.busy = true;
        hud.setScore(score());
        shell.sound('wrong');
        shell.announce(`${a.card.text} and ${c.card.text} do not match.`);
        const back = () => { setFace(a.card, a.b, a.i, false); setFace(c.card, c.b, c.i, false); g.open = []; g.busy = false; };
        shell.later(back, shell.reduced() ? 1200 : MISMATCH_MS);
      }
    }

    shell.setKeys(() => {});
    shell.setStage(h('section', { class: 'game-play', 'aria-label': 'Match-Up' }, hud.el, grid));
    shell.later(() => grid.querySelector('button')?.focus());
    renderMath(grid);
  }

  function end() {
    const s = matchScore({ pairs: g.matched.size, misses: g.misses });
    shell.end({
      title: 'All pairs found!',
      score: s,
      stats: [
        { label: 'Pairs', value: `${g.matched.size} / ${g.pairs.length}`, testid: 'game-correct' },
        { label: 'Failed attempts', value: String(g.misses), testid: 'game-misses' },
        { label: 'Turns', value: String(g.turns), testid: 'game-turns' },
      ],
      onAgain: begin,
    });
  }

  intro();
}
