// Classic board: timed, one question at a time, speed + streak points, 50/50 and Freeze power-ups.

import { h, icon, richText, renderMath, seededShuffle } from '../../ui.js';
import { gradeQuestion, formatAnswer } from '../../lib/grading.js';
import {
  splitGameQuestions, scoreAnswer, summarizeGame, fiftyFiftyRemovals, QUESTION_SECONDS, FREEZE_SECONDS,
} from '../../lib/game.js';
import { questionBoard, numberKeys, shuffleOptions } from './question-ui.js';

export function play(shell) {
  const { test, user } = shell;
  const { playable, skipped } = splitGameQuestions(test);
  const limitMs = QUESTION_SECONDS * 1000;
  let round = 0;
  let g = null;

  function intro() {
    shell.intro({
      rules: [
        `${playable.length} question${playable.length === 1 ? '' : 's'}, ${QUESTION_SECONDS} seconds each.`,
        'Faster correct answers score more (up to 1000). Wrong or late answers score 0.',
        'Three right in a row starts a streak bonus.',
        `Power-ups, once per game: 50/50 (multiple choice) and Freeze (+${FREEZE_SECONDS} seconds).`,
        'Keyboard: press 1–4 to pick an answer.',
      ],
      notes: [skipped.length ? h('p', { class: 'game-note', dataset: { testid: 'game-skipped' } }, `${skipped.length} question${skipped.length === 1 ? '' : 's'} skipped in game mode.`) : null],
      onStart: begin,
    });
  }

  function begin() {
    round++;
    const seed = `${user.email}${test.code}${Date.now()}${round}`;
    const qs = seededShuffle(playable, seed).map((q) => shuffleOptions(q, seededShuffle, seed));
    g = { qs, i: 0, streak: 0, results: [], fifty: true, freeze: true, score: 0 };
    question();
  }

  function question() {
    shell.clearTimer();
    const q = g.qs[g.i];
    const total = g.qs.length;
    const st = { locked: false, startedAt: performance.now(), extraMs: 0 };

    const hud = shell.hud({ label: `Question ${g.i + 1} of ${total}`, ring: true });
    hud.setScore(g.score);
    hud.setStreak(g.streak);
    const board = questionBoard(q, { onAnswer: (a) => finish(a) });
    const feedbackSlot = h('div', { class: 'game-feedback-slot' });
    const powerBar = h('div', { class: 'game-powers' });

    const remaining = () => limitMs + st.extraMs - (performance.now() - st.startedAt);
    const paint = () => {
      const rem = Math.max(0, remaining());
      hud.setTime(Math.min(1, rem / (limitMs + st.extraMs || limitMs)), `${Math.ceil(rem / 1000)}`, rem <= 5000);
      return rem;
    };
    paint();
    shell.setTimer(() => { if (!st.locked && paint() <= 0) finish(null, true); }, shell.reduced() ? 500 : 100);

    function finish(answer, timedOut = false) {
      if (st.locked) return;
      st.locked = true;
      shell.clearTimer();
      const elapsedMs = Math.min(performance.now() - st.startedAt - st.extraMs, limitMs);
      const grade = timedOut || answer === null ? { isCorrect: false } : gradeQuestion(q, answer);
      const s = scoreAnswer({ correct: !!grade.isCorrect, elapsedMs, limitMs, streak: g.streak });
      g.streak = s.streak;
      g.score += s.points;
      g.results.push({ q, answer: timedOut ? null : answer, correct: !!grade.isCorrect, points: s.points, timedOut });
      hud.setScore(g.score);
      hud.setStreak(g.streak);
      paint();
      board.lock(answer);
      powerBar.replaceChildren();
      shell.flash(!!grade.isCorrect);
      shell.sound(grade.isCorrect ? 'correct' : 'wrong');
      if (grade.isCorrect) hud.pop(`+${s.points.toLocaleString()}`);
      showFeedback(!!grade.isCorrect, timedOut, s);
    }

    function showFeedback(ok, timedOut, s) {
      const last = g.i === total - 1;
      const next = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'game-next' }, on: { click: () => { if (last) end(); else { g.i++; question(); } } } },
        last ? 'See results' : 'Next question');
      const title = ok ? 'Correct!' : timedOut ? "Time's up" : 'Not quite';
      const gained = ok ? `+${s.points.toLocaleString()} points${s.multiplier > 1 ? ` (streak bonus ×${s.multiplier})` : ''}` : '0 points';
      const card = h('div', { class: ['game-feedback', ok ? 'is-correct' : 'is-wrong', shell.reduced() ? '' : 'pop'], dataset: { testid: 'game-feedback', correct: String(ok) } },
        h('h2', { class: 'game-feedback__title' }, icon(ok ? 'check' : 'x', { size: 22 }), ' ', title),
        h('p', { class: 'game-feedback__points', dataset: { testid: 'game-points' } }, gained),
        h('p', { class: 'game-feedback__streak' }, g.streak >= 3 ? `Streak: ${g.streak} in a row` : g.streak ? `Streak: ${g.streak}` : 'Streak reset'),
        ok ? null : h('p', { class: 'game-feedback__answer' }, 'Correct answer: ', richText(formatAnswer(q, q.correctAnswer), 'strong')),
        q.explanation ? richText(q.explanation, 'p', 'game-feedback__why') : null,
        next);
      feedbackSlot.replaceChildren(card);
      renderMath(card);
      shell.announce(`${title} ${gained}. ${ok ? '' : `Correct answer: ${formatAnswer(q, q.correctAnswer)}.`}`);
      shell.later(() => next.focus());
    }

    const drawPowers = () => {
      powerBar.replaceChildren();
      if (st.locked) return;
      if (g.fifty && q.type === 'mcq' && fiftyFiftyRemovals(q).length > 0) {
        powerBar.append(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'game-fifty' }, on: { click: () => {
          g.fifty = false;
          const order = seededShuffle(q.options.map((o) => o.id), `${q.id}${st.startedAt}`);
          for (const id of fiftyFiftyRemovals(q, order)) board.hide(id);
          shell.announce('Two wrong answers removed.');
          drawPowers();
        } } }, '50/50'));
      }
      if (g.freeze) {
        powerBar.append(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'game-freeze' }, on: { click: () => {
          g.freeze = false; st.extraMs += FREEZE_SECONDS * 1000; paint();
          shell.announce(`Time frozen: ${FREEZE_SECONDS} seconds added.`);
          drawPowers();
        } } }, `Freeze +${FREEZE_SECONDS}s`));
      }
    };
    drawPowers();
    shell.setKeys(numberKeys(board, () => st.locked));

    shell.setStage(h('section', { class: 'game-play', 'aria-label': `Question ${g.i + 1}` }, hud.el, board.heading, board.answerArea, board.submitRow, powerBar, feedbackSlot));
    shell.later(() => (board.startsWithTiles ? board.heading.focus({ preventScroll: true }) : board.focusFirst()));
  }

  function end() {
    const sum = summarizeGame(g.results);
    const review = h('ol', { class: 'game-review', dataset: { testid: 'game-review' } }, g.results.map((r) => h('li', { class: ['game-review__item', r.correct ? 'is-correct' : 'is-wrong'], dataset: { correct: String(r.correct) } },
      h('span', { class: 'game-review__mark', 'aria-label': r.correct ? 'Correct' : r.timedOut ? 'Timed out' : 'Incorrect' }, icon(r.correct ? 'check' : 'x', { size: 16 })),
      h('div', { class: 'game-review__body' },
        richText(r.q.text, 'p', 'game-review__q'),
        h('p', { class: 'game-review__a' }, 'Your answer: ', r.answer === null ? '—' : formatAnswer(r.q, r.answer),
          r.correct ? null : [' · Correct: ', formatAnswer(r.q, r.q.correctAnswer)])),
      h('span', { class: 'game-review__pts' }, `${r.points.toLocaleString()} pts`))));
    shell.end({
      score: sum.score,
      stats: [
        { label: 'Accuracy', value: `${sum.accuracy}%`, testid: 'game-accuracy' },
        { label: 'Correct', value: `${sum.correct} / ${sum.total}`, testid: 'game-correct' },
        { label: 'Best streak', value: String(sum.bestStreak), testid: 'game-best-streak' },
      ],
      note: skipped.length ? `${skipped.length} question${skipped.length === 1 ? '' : 's'} skipped in game mode.` : '',
      review,
      onAgain: begin,
      announce: `Game over. Score ${sum.score}. Accuracy ${sum.accuracy} percent.`,
    });
  }

  if (!playable.length) { shell.setStage(h('section', { class: 'game-card' }, h('h1', { class: 'game-card__title', tabindex: '-1' }, 'No playable questions'),
    h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => shell.back() } }, 'Back to games'))); return; }
  intro();
}
