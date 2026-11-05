// Boss Battle board: Survival scoring, plus a boss with a health bar. Right answers attack (harder = more damage),
// wrong answers let the boss hit back and cost a life. Original art: a simple SVG "Captain Corrode".

import { h, seededShuffle } from '../../ui.js';
import { gradeQuestion, formatAnswer } from '../../lib/grading.js';
import { BOSS_TYPES, BOSS_NAME, bossMaxHealth, bossOrder, applyBossAnswer } from '../../lib/games/boss.js';
import { STREAK_FOR_LIFE } from '../../lib/games/survival.js';
import { makeRng, questionsOfTypes, shuffle } from '../../lib/games/common.js';
import { limitCount } from '../../lib/games/options.js';
import { questionBoard, numberKeys, shuffleOptions } from './question-ui.js';
import { feedbackCard, reviewList } from './feedback-card.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el.append(...kids); return el; };

/** A rusty-flask monster: round body, two eyes, jagged mouth. Pure shapes, no external art. */
function bossArt(state) {
  return svg('svg', { viewBox: '0 0 120 120', width: '96', height: '96', 'aria-hidden': 'true', class: `boss__art ${state}` },
    svg('path', { d: 'M48 10h24v28l30 52a14 14 0 0 1-12 22H30a14 14 0 0 1-12-22l30-52z', class: 'boss__body' }),
    svg('circle', { cx: '47', cy: '72', r: '8', class: 'boss__eye' }), svg('circle', { cx: '73', cy: '72', r: '8', class: 'boss__eye' }),
    svg('circle', { cx: '47', cy: '73', r: '3', class: 'boss__pupil' }), svg('circle', { cx: '73', cy: '73', r: '3', class: 'boss__pupil' }),
    svg('path', { d: 'M42 92l6-6 6 6 6-6 6 6 6-6 6 6', class: 'boss__mouth', fill: 'none', 'stroke-width': '4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}

export function bossPanel(state) {
  const pct = Math.round((state.health / state.maxHealth) * 100);
  return h('div', { class: 'boss', dataset: { testid: 'boss-panel', health: String(state.health), max: String(state.maxHealth) } },
    bossArt(state.health === 0 ? 'is-beaten' : state.hit ? 'is-hit' : state.struck ? 'is-striking' : ''),
    h('div', { class: 'boss__info' },
      h('strong', { class: 'boss__name' }, BOSS_NAME),
      h('div', { class: 'boss__bar', role: 'progressbar', 'aria-label': `${BOSS_NAME} health`, 'aria-valuemin': '0', 'aria-valuemax': String(state.maxHealth), 'aria-valuenow': String(state.health), dataset: { testid: 'boss-health' } },
        h('div', { class: 'boss__fill', style: `transform:scaleX(${pct / 100})` })),
      h('span', { class: 'boss__hp' }, `${state.health} / ${state.maxHealth} HP`)));
}

export function play(shell) {
  const { user, opts } = shell;
  const playable = questionsOfTypes(shell.gtest, BOSS_TYPES);
  const MAX_LIVES = opts.lives;
  let round = 0;
  let g = null;

  function intro() {
    shell.intro({
      rules: [
        `${BOSS_NAME} has a health bar. Every right answer attacks it; harder questions hit harder.`,
        `A wrong answer lets the boss hit back and costs a life. You have ${MAX_LIVES} ${MAX_LIVES === 1 ? 'life' : 'lives'}.`,
        `Every ${STREAK_FOR_LIFE} right in a row wins a life back. Beat the boss for a bonus. No clock.`,
        'Keyboard: press 1–4 to pick an answer. Other question types have their own Submit button.',
      ],
      onStart: begin,
    });
  }

  function begin() {
    round++;
    const seed = `${user.email}${shell.test.code}${Date.now()}${round}`;
    const pool = limitCount(shuffle(playable, makeRng(`${seed}pick`)), opts.questions || playable.length);
    const qs = bossOrder(pool, makeRng(seed)).map((q) => shuffleOptions(q, seededShuffle, seed));
    const maxHealth = bossMaxHealth(qs);
    g = { qs, i: 0, s: { health: maxHealth, maxHealth, lives: MAX_LIVES, maxLives: MAX_LIVES, streak: 0, score: 0 }, results: [] };
    question();
  }

  function question() {
    const q = g.qs[g.i];
    const hud = shell.hud({ label: `Attack ${g.i + 1} of ${g.qs.length}`, lives: MAX_LIVES });
    hud.setScore(g.s.score); hud.setStreak(g.s.streak); hud.setLives(g.s.lives);
    let locked = false;
    const board = questionBoard(q, { onAnswer: (a) => finish(a) });
    const feedbackSlot = h('div', { class: 'game-feedback-slot' });
    const bossSlot = h('div', { class: 'boss-slot' }, bossPanel(g.s));

    function finish(answer) {
      if (locked) return;
      locked = true;
      const ok = !!gradeQuestion(q, answer).isCorrect;
      const r = applyBossAnswer(g.s, q, ok);
      g.s = r;
      g.results.push({ q, answer, correct: ok, points: r.points });
      hud.setScore(r.score); hud.setStreak(r.streak); hud.setLives(r.lives);
      board.lock(answer);
      bossSlot.replaceChildren(bossPanel({ ...r, hit: ok && !r.defeated, struck: !ok }));
      shell.flash(ok);
      shell.sound(ok ? (r.lifeGained ? 'life' : 'correct') : 'wrong');
      if (ok) hud.pop(`+${r.points}`);
      const exhausted = g.i === g.qs.length - 1;
      const over = r.over || exhausted;
      const lines = ok
        ? [`+${r.points} points. ${r.defeated ? `${BOSS_NAME} is defeated!` : `${r.damage} damage.`}${r.lifeGained ? ' Life regained!' : ''}`]
        : [`0 points. ${BOSS_NAME} hits back: ${r.lives} ${r.lives === 1 ? 'life' : 'lives'} left.`];
      feedbackSlot.replaceChildren(feedbackCard(shell, {
        ok, q, title: ok ? 'Direct hit!' : 'The boss hits back', lines, nextLabel: over ? 'See results' : 'Next attack',
        onNext: () => { if (over) end(); else { g.i++; question(); } },
      }));
    }

    shell.setKeys(numberKeys(board, () => locked));
    shell.setStage(h('section', { class: 'game-play', 'aria-label': `Attack ${g.i + 1}` }, hud.el, bossSlot, board.heading, board.answerArea, board.submitRow, feedbackSlot));
    shell.later(() => (board.startsWithTiles ? board.heading.focus({ preventScroll: true }) : board.focusFirst()));
  }

  function end() {
    const won = g.s.health === 0;
    const correct = g.results.filter((r) => r.correct).length;
    shell.end({
      title: won ? `${BOSS_NAME} defeated!` : g.s.lives === 0 ? 'The boss wins' : `${BOSS_NAME} got away`,
      score: g.s.score,
      results: g.results,
      stats: [
        { label: 'Boss', value: won ? 'Defeated' : `${g.s.health} HP left`, testid: 'boss-result' },
        { label: 'Correct', value: `${correct} / ${g.results.length}`, testid: 'game-correct' },
        { label: 'Lives left', value: String(g.s.lives), testid: 'game-lives-left' },
      ],
      review: reviewList(g.results, formatAnswer),
      onAgain: begin,
      announce: `${won ? 'Boss defeated' : 'Battle over'}. Score ${g.s.score}.`,
    });
  }

  if (!playable.length) { shell.back(); return; }
  intro();
}
