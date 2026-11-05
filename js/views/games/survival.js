// Survival board: no timer, 3 lives, questions get harder.

import { h, icon, richText, renderMath, seededShuffle } from '../../ui.js';
import { gradeQuestion, correctAnswerText } from '../../lib/grading.js';
import { STREAK_FOR_LIFE, SURVIVAL_TYPES, applySurvivalAnswer, sortSurvival } from '../../lib/games/survival.js';
import { makeRng, questionsOfTypes, shuffle } from '../../lib/games/common.js';
import { limitCount } from '../../lib/games/options.js';
import { questionBoard, numberKeys, shuffleOptions } from './question-ui.js';
import { powerBar } from './powerups.js';

export function play(shell) {
  const { user, opts } = shell;
  const test = shell.gtest;
  const START_LIVES = opts.lives;
  const pu = opts.powerUps;
  const playable = questionsOfTypes(test, SURVIVAL_TYPES);
  let round = 0;
  let g = null;

  function intro() {
    shell.intro({
      rules: [
        `No clock. You have ${START_LIVES} ${START_LIVES === 1 ? 'life' : 'lives'}; a wrong answer costs one.`,
        opts.questions ? `${Math.min(opts.questions, playable.length)} questions.` : null,
        pu.fifty || pu.skip || pu.hint ? `Power-ups, once per game: ${[pu.fifty && '50/50 (multiple choice)', pu.skip && 'Skip', pu.hint && 'Hint'].filter(Boolean).join(', ')}.` : null,
        `Every ${STREAK_FOR_LIFE} correct answers in a row earns a life back (never more than ${START_LIVES}).`,
        'Questions get harder as you go. How far can you get?',
        'Keyboard: press 1–4 to pick an answer. Other question types have their own Submit button.',
      ].filter(Boolean),
      onStart: begin,
    });
  }

  function begin() {
    round++;
    const seed = `${user.email}${test.code}${Date.now()}${round}`;
    const pool = limitCount(shuffle(playable, makeRng(`${seed}pick`)), opts.questions || playable.length);
    const qs = sortSurvival(pool, makeRng(seed)).map((q) => shuffleOptions(q, seededShuffle, seed));
    g = { qs, i: 0, lives: START_LIVES, streak: 0, score: 0, results: [], fifty: true, skip: true, hint: true };
    question();
  }

  function question() {
    const q = g.qs[g.i];
    const hud = shell.hud({ label: `Question ${g.i + 1} of ${g.qs.length}`, lives: START_LIVES });
    hud.setScore(g.score); hud.setStreak(g.streak); hud.setLives(g.lives);
    let locked = false;
    const board = questionBoard(q, { onAnswer: (a) => finish(a) });
    const feedbackSlot = h('div', { class: 'game-feedback-slot' });

    function finish(answer) {
      if (locked) return;
      locked = true;
      const grade = gradeQuestion(q, answer);
      const r = applySurvivalAnswer({ lives: g.lives, streak: g.streak, maxLives: START_LIVES }, { correct: !!grade.isCorrect, points: q.points });
      g.lives = r.lives; g.streak = r.streak; g.score += r.points;
      g.results.push({ q, answer, correct: !!grade.isCorrect, points: r.points });
      hud.setScore(g.score); hud.setStreak(g.streak); hud.setLives(g.lives);
      board.lock(answer);
      powers.draw();
      shell.flash(!!grade.isCorrect);
      shell.sound(grade.isCorrect ? (r.lifeGained ? 'life' : 'correct') : 'wrong');
      if (grade.isCorrect) hud.pop(`+${r.points}`);
      const cleared = g.i === g.qs.length - 1;
      const over = r.over || cleared;
      const ok = !!grade.isCorrect;
      const title = ok ? 'Correct!' : 'Not quite';
      const extra = r.lifeGained ? ' Life regained!' : r.lifeLost ? ` ${g.lives} ${g.lives === 1 ? 'life' : 'lives'} left.` : '';
      const next = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'game-next' }, on: { click: () => { if (over) end(cleared && !r.over); else { g.i++; question(); } } } },
        over ? 'See results' : 'Next question');
      const card = h('div', { class: ['game-feedback', ok ? 'is-correct' : 'is-wrong', shell.reduced() ? '' : 'pop'], dataset: { testid: 'game-feedback', correct: String(ok) } },
        h('h2', { class: 'game-feedback__title' }, icon(ok ? 'check' : 'x', { size: 22 }), ' ', title),
        h('p', { class: 'game-feedback__points', dataset: { testid: 'game-points' } }, ok ? `+${r.points} points${extra}` : `0 points.${extra}`),
        ok ? null : h('p', { class: 'game-feedback__answer' }, 'Correct answer: ', richText(correctAnswerText(q), 'strong')),
        q.explanation ? richText(q.explanation, 'p', 'game-feedback__why') : null,
        next);
      feedbackSlot.replaceChildren(card);
      renderMath(card);
      shell.announce(`${title}${extra} ${ok ? '' : `Correct answer: ${correctAnswerText(q)}.`}`);
      shell.later(() => next.focus());
    }

    const powers = powerBar({
      shell, q, board, state: g, seedKey: g.i, locked: () => locked,
      allow: { fifty: pu.fifty, freeze: false, skip: pu.skip, hint: pu.hint },
      onFreeze: () => {},
      onSkip: () => {
        if (locked) return;
        locked = true;
        g.results.push({ q, answer: null, correct: false, points: 0, skipped: true });
        shell.announce('Question skipped.');
        if (g.i === g.qs.length - 1) end(true); else { g.i++; question(); }
      },
    });
    shell.setKeys(numberKeys(board, () => locked));
    shell.setStage(h('section', { class: 'game-play', 'aria-label': `Question ${g.i + 1}` }, hud.el, board.heading, board.answerArea, board.submitRow, powers.el, feedbackSlot));
    shell.later(() => (board.startsWithTiles ? board.heading.focus({ preventScroll: true }) : board.focusFirst()));
  }

  function end(clearedAll) {
    const correct = g.results.filter((r) => r.correct).length;
    let run = 0; let best = 0;
    for (const r of g.results) { if (r.correct) { run++; best = Math.max(best, run); } else run = 0; }
    shell.end({
      title: clearedAll ? 'You survived!' : 'Out of lives',
      score: g.score,
      results: g.results,
      stats: [
        { label: 'Answered', value: String(g.results.length), testid: 'game-answered' },
        { label: 'Correct', value: `${correct} / ${g.results.length}`, testid: 'game-correct' },
        { label: 'Best streak', value: String(best), testid: 'game-best-streak' },
        { label: 'Lives left', value: String(g.lives), testid: 'game-lives-left' },
      ],
      onAgain: begin,
    });
  }

  if (!playable.length) { shell.back(); return; }
  intro();
}
