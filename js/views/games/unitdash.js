// Unit Dash board: generated unit conversions and sig-fig rounding against a 60-second clock (or 10 questions, no clock,
// in relaxed mode). Needs no test questions. Type the number and press Enter.

import { h } from '../../ui.js';
import { generateDash, dashLevel, checkDash, dashAnswerText, dashPoints, DASH_SECONDS, UNTIMED_QUESTIONS, POINTS_PER_CORRECT } from '../../lib/games/unitdash.js';
import { secondsLeft } from '../../lib/games/lightning.js';

export function play(shell) {
  const total = shell.opts.totalSeconds || DASH_SECONDS;
  let g = null;

  function intro() {
    shell.intro({
      rules: () => [
        shell.untimed() ? `${UNTIMED_QUESTIONS} questions, no clock.` : `${total} seconds on the clock. Answer as many as you can.`,
        'Unit conversions and significant-figure rounding. Type just the number (1.2e3 or 1.2x10^3 also work).',
        `${POINTS_PER_CORRECT} points a right answer; streaks add a bonus. A wrong answer scores nothing and resets your streak.`,
        'Questions get harder every three right answers. Press Enter to submit.',
      ],
      notes: [h('p', { class: 'game-note', dataset: { testid: 'dash-no-questions' } }, 'This game makes its own questions, so it works on any test.')],
      onStart: begin,
    });
  }

  function begin() {
    const untimed = shell.untimed();
    g = { score: 0, streak: 0, bestStreak: 0, answered: 0, correct: 0, startedAt: performance.now(), over: false, untimed, log: [] };
    const hud = shell.hud({ label: untimed ? `Question 1 of ${UNTIMED_QUESTIONS}` : 'Unit Dash', ring: !untimed });
    hud.setScore(0); hud.setStreak(0);
    const slot = h('div', { class: 'dash-slot' });
    const msg = h('p', { class: 'game-lightning__msg', 'aria-live': 'polite', dataset: { testid: 'dash-msg' } });
    shell.setStage(h('section', { class: 'game-play', 'aria-label': 'Unit Dash' }, hud.el, slot, msg));

    const paint = () => {
      if (g.untimed) return Infinity;
      const s = secondsLeft(performance.now() - g.startedAt, 0, total);
      hud.setTime(s / total, String(Math.ceil(s)), s <= 10);
      return s;
    };
    if (!g.untimed) { paint(); shell.setTimer(() => { if (!g.over && paint() <= 0) finishRound(); }, shell.reduced() ? 500 : 100); }

    let q = null;
    function nextQuestion() {
      if (g.over) return;
      if (g.untimed && g.answered >= UNTIMED_QUESTIONS) { finishRound(); return; }
      q = generateDash(dashLevel(g.correct));
      if (g.untimed) hud.setLabel(`Question ${g.answered + 1} of ${UNTIMED_QUESTIONS}`);
      const input = h('input', { class: 'input game-input', type: 'text', autocomplete: 'off', spellcheck: 'false', inputmode: 'decimal', 'aria-label': `Your answer${q.unit ? ` (${q.unit})` : ''}`, dataset: { testid: 'dash-input' } });
      const form = h('form', { class: 'game-form', on: { submit: (e) => { e.preventDefault(); if (input.value.trim()) submit(input.value); else input.focus(); } } },
        input, q.unit ? h('span', { class: 'game-unit' }, q.unit) : null,
        h('button', { class: 'btn btn--primary btn--lg', type: 'submit', dataset: { testid: 'dash-submit' } }, 'Submit'));
      slot.replaceChildren(
        h('div', { class: 'game-q', dataset: { testid: 'dash-question', kind: q.kind, level: String(q.level) } }, h('p', { class: 'game-q__text' }, q.prompt)),
        form);
      shell.later(() => input.focus());
      shell.announce(q.prompt);
    }

    function submit(value) {
      if (g.over || !q) return;
      const ok = checkDash(q, value);
      g.answered++;
      if (ok) {
        const pts = dashPoints(g.streak);
        g.score += pts; g.streak++; g.correct++; g.bestStreak = Math.max(g.bestStreak, g.streak);
        hud.pop(`+${pts}`);
        msg.textContent = '';
      } else {
        g.streak = 0;
        msg.textContent = `Not quite. Answer: ${dashAnswerText(q)}`;
      }
      g.log.push({ prompt: q.prompt, correct: ok });
      hud.setScore(g.score); hud.setStreak(g.streak);
      shell.flash(ok); shell.sound(ok ? 'correct' : 'wrong');
      shell.announce(ok ? `Correct. Score ${g.score}.` : msg.textContent);
      q = null;
      slot.querySelector('input')?.setAttribute('disabled', '');
      shell.later(nextQuestion, shell.reduced() ? 200 : ok ? 350 : 1100);
    }

    function finishRound() {
      if (g.over) return;
      g.over = true;
      shell.end({
        title: g.untimed ? 'Round complete!' : "Time's up!",
        score: g.score,
        stats: [
          { label: 'Answered', value: String(g.answered), testid: 'game-answered' },
          { label: 'Correct', value: `${g.correct} / ${g.answered}`, testid: 'game-correct' },
          { label: 'Best streak', value: String(g.bestStreak), testid: 'game-best-streak' },
        ],
        onAgain: begin,
        announce: `Round over. Score ${g.score}. ${g.correct} correct.`,
      });
    }
    nextQuestion();
  }
  intro();
}
