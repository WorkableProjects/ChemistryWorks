// Classic board: timed, one question at a time, speed + streak points, 50/50 and Freeze power-ups.

import { h, icon, richText, renderMath, seededShuffle } from '../../ui.js';
import { gradeQuestion, formatAnswer } from '../../lib/grading.js';
import {
  splitGameQuestions, scoreAnswer, summarizeGame, QUESTION_SECONDS, FREEZE_SECONDS, UNTIMED_POINTS,
} from '../../lib/game.js';
import { limitCount } from '../../lib/games/options.js';
import { questionBoard, numberKeys, shuffleOptions } from './question-ui.js';
import { powerBar } from './powerups.js';

export function play(shell) {
  const { user, opts } = shell;
  const test = shell.gtest;
  const { playable, skipped } = splitGameQuestions(test);
  const count = Math.min(playable.length, opts.questions || playable.length);
  const seconds = opts.timePerQuestion || QUESTION_SECONDS;
  const limitMs = seconds * 1000;
  const pu = opts.powerUps;
  let round = 0;
  let g = null;

  function intro() {
    shell.intro({
      rules: () => {
        const untimed = shell.untimed();
        const names = [pu.fifty && '50/50 (multiple choice)', pu.freeze && !untimed && `Freeze (+${FREEZE_SECONDS} seconds)`, pu.skip && 'Skip', pu.hint && 'Hint'].filter(Boolean);
        return [
          `${count} question${count === 1 ? '' : 's'}${untimed ? ', no clock.' : `, ${seconds} seconds each.`}`,
          untimed ? `No speed points: every correct answer scores ${UNTIMED_POINTS}.` : 'Faster correct answers score more (up to 1000). Wrong or late answers score 0.',
          'Three right in a row starts a streak bonus.',
          names.length ? `Power-ups, once per game: ${names.join(', ')}.` : 'Power-ups are off for this test.',
          'Keyboard: press 1–4 to pick an answer.',
        ];
      },
      notes: [skipped.length ? h('p', { class: 'game-note', dataset: { testid: 'game-skipped' } }, `${skipped.length} question${skipped.length === 1 ? '' : 's'} skipped in game mode.`) : null],
      onStart: begin,
    });
  }

  function begin() {
    round++;
    const seed = `${user.email}${test.code}${Date.now()}${round}`;
    const qs = limitCount(seededShuffle(playable, seed), count).map((q) => shuffleOptions(q, seededShuffle, seed));
    g = { qs, i: 0, streak: 0, results: [], fifty: true, freeze: true, skip: true, hint: true, score: 0, untimed: shell.untimed() };
    question();
  }

  function question() {
    shell.clearTimer();
    const q = g.qs[g.i];
    const total = g.qs.length;
    const st = { locked: false, startedAt: performance.now(), extraMs: 0 };

    const hud = shell.hud({ label: `Question ${g.i + 1} of ${total}`, ring: !g.untimed });
    hud.setScore(g.score);
    hud.setStreak(g.streak);
    const board = questionBoard(q, { onAnswer: (a) => finish(a) });
    const feedbackSlot = h('div', { class: 'game-feedback-slot' });
    const remaining = () => limitMs + st.extraMs - (performance.now() - st.startedAt);
    const paint = () => {
      const rem = Math.max(0, remaining());
      hud.setTime(Math.min(1, rem / (limitMs + st.extraMs || limitMs)), `${Math.ceil(rem / 1000)}`, rem <= 5000);
      return rem;
    };
    if (!g.untimed) {
      paint();
      shell.setTimer(() => { if (!st.locked && paint() <= 0) finish(null, true); }, shell.reduced() ? 500 : 100);
    }

    function finish(answer, timedOut = false) {
      if (st.locked) return;
      st.locked = true;
      shell.clearTimer();
      const elapsedMs = Math.min(performance.now() - st.startedAt - st.extraMs, limitMs);
      const grade = timedOut || answer === null ? { isCorrect: false } : gradeQuestion(q, answer);
      const s = scoreAnswer({ correct: !!grade.isCorrect, elapsedMs, limitMs, streak: g.streak, untimed: g.untimed });
      g.streak = s.streak;
      g.score += s.points;
      g.results.push({ q, answer: timedOut ? null : answer, correct: !!grade.isCorrect, points: s.points, timedOut });
      hud.setScore(g.score);
      hud.setStreak(g.streak);
      if (!g.untimed) paint();
      board.lock(answer);
      powers.draw();
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

    const powers = powerBar({
      shell, q, board, state: g, seedKey: st.startedAt, locked: () => st.locked,
      allow: { fifty: pu.fifty, freeze: pu.freeze && !g.untimed, skip: pu.skip, hint: pu.hint },
      onFreeze: () => { st.extraMs += FREEZE_SECONDS * 1000; paint(); },
      onSkip: () => {
        if (st.locked) return;
        st.locked = true; shell.clearTimer();
        g.results.push({ q, answer: null, correct: false, points: 0, skipped: true });
        shell.announce('Question skipped.');
        if (g.i === total - 1) end(); else { g.i++; question(); }
      },
    });
    shell.setKeys(numberKeys(board, () => st.locked));

    shell.setStage(h('section', { class: 'game-play', 'aria-label': `Question ${g.i + 1}` }, hud.el, board.heading, board.answerArea, board.submitRow, powers.el, feedbackSlot));
    shell.later(() => (board.startsWithTiles ? board.heading.focus({ preventScroll: true }) : board.focusFirst()));
  }

  function end() {
    const sum = summarizeGame(g.results);
    const review = h('ol', { class: 'game-review', dataset: { testid: 'game-review' } }, g.results.map((r) => h('li', { class: ['game-review__item', r.correct ? 'is-correct' : 'is-wrong'], dataset: { correct: String(r.correct) } },
      h('span', { class: 'game-review__mark', 'aria-label': r.correct ? 'Correct' : r.skipped ? 'Skipped' : r.timedOut ? 'Timed out' : 'Incorrect' }, icon(r.correct ? 'check' : 'x', { size: 16 })),
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
      results: g.results,
      onAgain: begin,
      announce: `Game over. Score ${sum.score}. Accuracy ${sum.accuracy} percent.`,
    });
  }

  if (!playable.length) { shell.setStage(h('section', { class: 'game-card' }, h('h1', { class: 'game-card__title', tabindex: '-1' }, 'No playable questions'),
    h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => shell.back() } }, 'Back to games'))); return; }
  intro();
}
