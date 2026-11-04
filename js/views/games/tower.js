// Tower board: a right answer stacks a block, a wrong answer makes the tower wobble, the third wobble topples it.

import { h, seededShuffle } from '../../ui.js';
import { gradeQuestion, formatAnswer } from '../../lib/grading.js';
import { MAX_WOBBLES, TOWER_TYPES, newTower, applyTowerAnswer, towerScore, POINTS_PER_BLOCK } from '../../lib/games/tower.js';
import { makeRng, questionsOfTypes, shuffle } from '../../lib/games/common.js';
import { summarizeGame } from '../../lib/game.js';
import { questionBoard, numberKeys, shuffleOptions } from './question-ui.js';
import { feedbackCard, reviewList } from './feedback-card.js';

/** The tower drawing: blocks shrink as it grows so the whole tower always fits its panel. */
export function towerEl(state, { wobble = false, fell = false, reduced = false } = {}) {
  const size = Math.max(6, Math.min(22, Math.floor(150 / Math.max(1, state.blocks))));
  const blocks = Array.from({ length: state.blocks }, (_, i) => h('span', { class: `tower__block tower__block--${i % 4}`, style: `--block-h:${size}px` }));
  const cls = ['tower__stack', wobble && !reduced ? 'is-wobbling' : '', fell && !reduced ? 'is-fallen' : '', fell ? 'is-down' : ''];
  return h('div', {
    class: 'tower', role: 'img', dataset: { testid: 'tower-stack', height: String(state.blocks), wobbles: String(state.wobbles), fell: String(state.fell) },
    'aria-label': `Tower: ${state.blocks} block${state.blocks === 1 ? '' : 's'} high, ${state.wobbles} of ${MAX_WOBBLES} wobbles${state.fell ? ', fallen' : ''}`,
  }, h('div', { class: cls }, blocks), h('div', { class: 'tower__base' }));
}

export function play(shell) {
  const { user } = shell;
  const playable = questionsOfTypes(shell.gtest, TOWER_TYPES);
  let round = 0;
  let g = null;

  function intro() {
    shell.intro({
      rules: [
        'Every right answer adds a block to your tower.',
        `A wrong answer makes the tower wobble. ${MAX_WOBBLES} wobbles and it falls.`,
        `Height is your score (${POINTS_PER_BLOCK} points per block). There is no clock.`,
        'Keyboard: press 1–4 to pick an answer. Other question types have their own Submit button.',
      ],
      onStart: begin,
    });
  }

  function begin() {
    round++;
    const seed = `${user.email}${shell.test.code}${Date.now()}${round}`;
    const qs = shuffle(playable, makeRng(seed)).map((q) => shuffleOptions(q, seededShuffle, seed));
    g = { qs, i: 0, tower: newTower(), results: [], streak: 0 };
    question(null);
  }

  function question(last) {
    const q = g.qs[g.i];
    const hud = shell.hud({ label: `Question ${g.i + 1} of ${g.qs.length}`, lives: MAX_WOBBLES, streak: false });
    hud.setScore(towerScore(g.tower));
    hud.setLives(MAX_WOBBLES - g.tower.wobbles);
    let locked = false;
    const board = questionBoard(q, { onAnswer: (a) => finish(a) });
    const feedbackSlot = h('div', { class: 'game-feedback-slot' });
    const towerSlot = h('div', { class: 'tower-slot' }, towerEl(g.tower, { wobble: last === 'wobble', reduced: shell.reduced() }));

    function finish(answer) {
      if (locked) return;
      locked = true;
      const ok = !!gradeQuestion(q, answer).isCorrect;
      g.results.push({ q, answer, correct: ok, points: ok ? POINTS_PER_BLOCK : 0 });
      g.tower = applyTowerAnswer(g.tower, { correct: ok });
      g.streak = ok ? g.streak + 1 : 0;
      hud.setScore(towerScore(g.tower));
      hud.setLives(MAX_WOBBLES - g.tower.wobbles);
      board.lock(answer);
      towerSlot.replaceChildren(towerEl(g.tower, { wobble: g.tower.wobbled && !g.tower.fell, fell: g.tower.fell, reduced: shell.reduced() }));
      shell.flash(ok);
      shell.sound(ok ? 'correct' : 'wrong');
      if (ok) hud.pop(`+${POINTS_PER_BLOCK}`);
      const toppled = g.tower.fell;
      const exhausted = g.i === g.qs.length - 1;
      const over = toppled || exhausted;
      const lines = [ok ? `+1 block (height ${g.tower.blocks})` : toppled ? `The tower fell at ${g.tower.blocks} block${g.tower.blocks === 1 ? '' : 's'}.` : `Wobble ${g.tower.wobbles} of ${MAX_WOBBLES}.`];
      feedbackSlot.replaceChildren(feedbackCard(shell, {
        ok, q, title: ok ? 'Block added!' : toppled ? 'It fell!' : 'Wobble!', lines,
        nextLabel: over ? 'See results' : 'Next question',
        onNext: () => { if (over) end(toppled); else { g.i++; question(g.tower.wobbled ? 'wobble' : null); } },
      }));
    }

    shell.setKeys(numberKeys(board, () => locked));
    shell.setStage(h('section', { class: 'game-play', 'aria-label': `Question ${g.i + 1}` }, hud.el, towerSlot, board.heading, board.answerArea, board.submitRow, feedbackSlot));
    shell.later(() => (board.startsWithTiles ? board.heading.focus({ preventScroll: true }) : board.focusFirst()));
  }

  function end(toppled) {
    const sum = summarizeGame(g.results);
    shell.end({
      title: toppled ? 'The tower fell' : 'Tower complete!',
      score: towerScore(g.tower),
      results: g.results,
      stats: [
        { label: 'Height', value: String(g.tower.blocks), testid: 'tower-height' },
        { label: 'Correct', value: `${sum.correct} / ${sum.total}`, testid: 'game-correct' },
        { label: 'Wobbles', value: `${g.tower.wobbles} / ${MAX_WOBBLES}`, testid: 'tower-wobbles' },
        { label: 'Best streak', value: String(sum.bestStreak), testid: 'game-best-streak' },
      ],
      review: reviewList(g.results, formatAnswer),
      onAgain: begin,
      announce: `${toppled ? 'The tower fell' : 'Tower complete'}. Height ${g.tower.blocks}.`,
    });
  }

  if (!playable.length) { shell.back(); return; }
  intro();
}
