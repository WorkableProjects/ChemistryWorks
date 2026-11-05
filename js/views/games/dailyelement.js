// Daily Element board: one element a day (the same for everyone), revealed clue by clue; guess by name or symbol.
// Fewer clues = more points. Keeps a daily streak on this device.

import { h } from '../../ui.js';
import { load, save } from '../../lib/storage.js';
import { dateKey, dailyElement, dailyClues, matchGuess, dailyPoints, normalizeDaily, playedToday, advanceDaily, currentStreak, dailyKey, CLUE_COUNT } from '../../lib/games/dailyelement.js';

export function play(shell) {
  const key = dateKey();
  const email = shell.user.email;
  function intro() {
    const state = normalizeDaily(load(dailyKey(email), null));
    shell.intro({
      rules: () => [
        'One mystery element a day, the same for everyone.',
        `Up to ${CLUE_COUNT} clues, from vague to specific. Guess by name or symbol.`,
        'The fewer clues you need, the more points you score.',
        `Your streak: ${currentStreak(state, key)} day${currentStreak(state, key) === 1 ? '' : 's'}.`,
      ],
      notes: playedToday(state, key) ? [h('p', { class: 'game-note', dataset: { testid: 'daily-done' } }, 'You already played today. You can play again for fun; only the first result counts for your streak.')] : [],
      onStart: begin,
    });
  }
  function begin() {
    const el = dailyElement(key);
    const clues = dailyClues(el);
    let shown = 1;
    let over = false;
    const hud = shell.hud({ label: `Daily Element · ${key}`, ring: false });
    hud.setScore(dailyPoints(shown)); hud.setStreak(0);
    const list = h('ol', { class: 'daily-clues', dataset: { testid: 'daily-clues' } });
    const msg = h('p', { class: 'game-lightning__msg', 'aria-live': 'polite', dataset: { testid: 'daily-msg' } });
    const input = h('input', { class: 'input game-input', type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Your guess (name or symbol)', dataset: { testid: 'daily-input' } });
    const more = h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'daily-more' }, on: { click: () => reveal() } }, 'Next clue');
    const form = h('form', { class: 'game-form', on: { submit: (e) => { e.preventDefault(); guess(input.value); } } }, input,
      h('button', { class: 'btn btn--primary btn--lg', type: 'submit', dataset: { testid: 'daily-submit' } }, 'Guess'), more);
    const paint = () => {
      list.replaceChildren(...clues.slice(0, shown).map((c) => h('li', {}, h('strong', {}, `${c.label}: `), c.text)));
      hud.setScore(dailyPoints(shown));
      more.disabled = shown >= CLUE_COUNT;
    };
    function reveal() { if (shown < CLUE_COUNT) { shown++; paint(); shell.announce(clues[shown - 1].text); input.focus(); } }
    function guess(text) {
      if (over || !text.trim()) return;
      if (matchGuess(el, text)) return done(true);
      shell.flash(false); shell.sound('wrong');
      if (shown >= CLUE_COUNT) return done(false);
      msg.textContent = `Not ${text.trim()}. Here is another clue.`;
      input.value = '';
      reveal();
    }
    function done(solved) {
      over = true;
      const score = dailyPoints(shown, solved);
      const state = normalizeDaily(load(dailyKey(email), null));
      if (!playedToday(state, key)) save(dailyKey(email), advanceDaily(state, key, { solved, score, clues: shown }));
      const streak = currentStreak(normalizeDaily(load(dailyKey(email), null)), key);
      shell.end({
        title: solved ? `It's ${el.name}!` : `It was ${el.name}.`, score,
        stats: [
          { label: 'Clues used', value: `${shown} / ${CLUE_COUNT}`, testid: 'daily-clues-used' },
          { label: 'Streak', value: `${streak} day${streak === 1 ? '' : 's'}`, testid: 'daily-streak' },
        ],
        note: `${el.name} (${el.symbol}), atomic number ${el.number}. Come back tomorrow for a new element.`,
        onAgain: begin, announce: solved ? `Solved: ${el.name}.` : `The answer was ${el.name}.`,
      });
    }
    shell.setStage(h('section', { class: 'game-play', 'aria-label': 'Daily Element' }, hud.el, list, form, msg));
    paint();
    shell.later(() => input.focus());
  }
  intro();
}
