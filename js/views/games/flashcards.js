// Flashcards board (study, not scored): flip, then "Knew it" or "Review again". Review cards return later.

import { h, richText, renderMath } from '../../ui.js';
import { splitGameQuestions } from '../../lib/game.js';
import { buildCards, advanceQueue } from '../../lib/games/flashcards.js';

export function play(shell) {
  const { playable } = splitGameQuestions(shell.test);
  let g = null;

  function intro() {
    shell.intro({
      rules: [
        `${playable.length} card${playable.length === 1 ? '' : 's'}: the question on the front, the answer on the back.`,
        'Flip a card, then mark "Knew it" or "Review again". Cards you want to review come back later.',
        'Keyboard: Space or Enter flips; K = knew it; R = review again.',
      ],
      startLabel: 'Start studying',
      onStart: begin,
    });
  }

  function begin() {
    g = { queue: buildCards(playable), total: playable.length, knew: 0, reviewed: 0, seen: 0 };
    card();
  }

  function card() {
    const c = g.queue[0];
    if (!c) { end(); return; }
    let flipped = false;
    const hud = shell.hud({ label: `${g.knew} of ${g.total} learned · ${g.queue.length} to go`, scored: false, streak: false });
    const front = h('div', { class: 'flash-face flash-front' }, h('span', { class: 'flash-tag' }, 'Question'), richText(c.front, 'div', 'flash-text'));
    const back = h('div', { class: 'flash-face flash-back' }, h('span', { class: 'flash-tag' }, 'Answer'), richText(c.back, 'div', 'flash-text'),
      c.explanation ? richText(c.explanation, 'div', 'flash-why') : null);
    const cardBtn = h('button', { type: 'button', class: 'flash-card', 'aria-pressed': 'false', dataset: { testid: 'flash-card' }, 'aria-label': 'Flip card' },
      h('span', { class: 'flash-inner' }, front, back));
    const knew = h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: true, dataset: { testid: 'flash-knew' }, on: { click: () => mark(true) } }, 'Knew it');
    const again = h('button', { class: 'btn btn--ghost btn--lg', type: 'button', disabled: true, dataset: { testid: 'flash-again' }, on: { click: () => mark(false) } }, 'Review again');
    const flip = () => {
      flipped = !flipped;
      cardBtn.classList.toggle('is-flipped', flipped);
      cardBtn.setAttribute('aria-pressed', String(flipped));
      knew.disabled = !flipped; again.disabled = !flipped;
      shell.sound('flip');
      shell.announce(flipped ? `Answer: ${c.back}` : 'Question side');
    };
    cardBtn.addEventListener('click', flip);
    function mark(k) {
      if (!flipped) return;
      if (k) g.knew++; else g.reviewed++;
      g.seen++;
      g.queue = advanceQueue(g.queue, k);
      card();
    }
    shell.setKeys((e) => {
      if (e.target instanceof HTMLInputElement) return;
      const key = e.key.toLowerCase();
      if (key === 'k' && flipped) { e.preventDefault(); mark(true); }
      else if (key === 'r' && flipped) { e.preventDefault(); mark(false); }
    });
    shell.setStage(h('section', { class: 'game-play', 'aria-label': 'Flashcards' }, hud.el, cardBtn,
      h('div', { class: 'game-actions flash-actions' }, again, knew)));
    renderMath(cardBtn);
    shell.later(() => cardBtn.focus());
  }

  function end() {
    shell.end({
      title: 'Deck complete',
      score: null,
      stats: [
        { label: 'Cards', value: String(g.total), testid: 'game-correct' },
        { label: 'Marked for review', value: String(g.reviewed), testid: 'game-reviewed' },
        { label: 'Cards seen', value: String(g.seen), testid: 'game-seen' },
      ],
      onAgain: begin,
      announce: `Deck complete. ${g.total} cards.`,
    });
  }

  if (!playable.length) { shell.back(); return; }
  intro();
}
