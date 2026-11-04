// Lightning Round board: 60 seconds in total, answer as many as you can. Skipping costs 2 seconds.

import { h, renderMath, seededShuffle } from '../../ui.js';
import { gradeQuestion, correctAnswerText } from '../../lib/grading.js';
import { TOTAL_SECONDS, SKIP_PENALTY_SECONDS, LIGHTNING_TYPES, lightningPoints, secondsLeft } from '../../lib/games/lightning.js';
import { makeRng, questionsOfTypes, shuffle } from '../../lib/games/common.js';
import { questionBoard, numberKeys, shuffleOptions } from './question-ui.js';

const ADVANCE_MS = 450;

export function play(shell) {
  const { test, user } = shell;
  const pool = questionsOfTypes(test, LIGHTNING_TYPES);
  let round = 0;

  function intro() {
    shell.intro({
      rules: [
        `${TOTAL_SECONDS} seconds in total. Answer as many questions as you can.`,
        `Skipping is allowed but costs ${SKIP_PENALTY_SECONDS} seconds.`,
        'A wrong answer scores nothing and resets your streak. Streaks add a bonus.',
        'Keyboard: press 1–4 to pick an answer; Enter submits a typed answer; Tab to Skip.',
      ],
      onStart: begin,
    });
  }

  function begin() {
    round++;
    const seed = `${user.email}${test.code}${Date.now()}${round}`;
    const g = { score: 0, streak: 0, skips: 0, answered: 0, correct: 0, bestStreak: 0, queue: [], startedAt: performance.now(), over: false, n: 0 };
    const hud = shell.hud({ label: 'Lightning Round', ring: true });
    hud.setScore(0); hud.setStreak(0);
    const slot = h('div', { class: 'game-lightning__slot' });
    const skipBtn = h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'game-skip' } }, `Skip (−${SKIP_PENALTY_SECONDS}s)`);
    const flashMsg = h('p', { class: 'game-lightning__msg', 'aria-hidden': 'true' });
    shell.setStage(h('section', { class: 'game-play', 'aria-label': 'Lightning Round' }, hud.el, slot, h('div', { class: 'game-powers' }, skipBtn, flashMsg)));

    const left = () => secondsLeft(performance.now() - g.startedAt, g.skips);
    const paint = () => {
      const s = left();
      hud.setTime(s / TOTAL_SECONDS, String(Math.ceil(s)), s <= 10);
      return s;
    };
    paint();
    shell.setTimer(() => { if (!g.over && paint() <= 0) finishRound(); }, shell.reduced() ? 500 : 100);

    let current = null;
    let locked = false;
    function nextQuestion() {
      if (g.over) return;
      if (!g.queue.length) g.queue = shuffle(pool, makeRng(seed + g.n)).map((q) => shuffleOptions(q, seededShuffle, seed + g.n));
      g.n++;
      current = g.queue.shift();
      locked = false;
      const q = current;
      const board = questionBoard(q, { onAnswer: (a) => answer(q, a, board) });
      slot.replaceChildren(board.heading, board.answerArea, board.submitRow);
      renderMath(slot);
      shell.setKeys((e) => {
        if (e.target instanceof HTMLInputElement) return;
        numberKeys(board, () => locked)(e);
      });
      shell.later(() => (board.startsWithTiles ? board.heading.focus({ preventScroll: true }) : board.focusFirst()));
    }

    function answer(q, a, board) {
      if (locked || g.over) return;
      locked = true;
      const ok = !!gradeQuestion(q, a).isCorrect;
      g.answered++;
      if (ok) {
        const pts = lightningPoints(g.streak);
        g.score += pts; g.streak++; g.correct++; g.bestStreak = Math.max(g.bestStreak, g.streak);
        hud.pop(`+${pts}`);
      } else g.streak = 0;
      hud.setScore(g.score); hud.setStreak(g.streak);
      board.lock(a);
      shell.flash(ok);
      shell.sound(ok ? 'correct' : 'wrong');
      const msg = ok ? 'Correct' : `Not quite. Answer: ${correctAnswerText(q)}`;
      flashMsg.textContent = ok ? '' : msg;
      shell.announce(`${msg}. Score ${g.score}.`);
      shell.later(nextQuestion, shell.reduced() ? 250 : (ok ? ADVANCE_MS : ADVANCE_MS * 2));
    }

    skipBtn.addEventListener('click', () => {
      if (g.over || locked) return;
      g.skips++; g.streak = 0;
      hud.setStreak(0);
      paint();
      shell.announce(`Skipped. ${SKIP_PENALTY_SECONDS} seconds lost.`);
      if (left() <= 0) finishRound(); else nextQuestion();
    });

    function finishRound() {
      if (g.over) return;
      g.over = true;
      shell.end({
        title: "Time's up!",
        score: g.score,
        stats: [
          { label: 'Answered', value: String(g.answered), testid: 'game-answered' },
          { label: 'Correct', value: `${g.correct} / ${g.answered}`, testid: 'game-correct' },
          { label: 'Skipped', value: String(g.skips), testid: 'game-skipped-count' },
          { label: 'Best streak', value: String(g.bestStreak), testid: 'game-best-streak' },
        ],
        onAgain: begin,
        announce: `Time's up. Score ${g.score}. ${g.correct} correct.`,
      });
    }
    nextQuestion();
  }

  if (!pool.length) { shell.back(); return; }
  intro();
}
