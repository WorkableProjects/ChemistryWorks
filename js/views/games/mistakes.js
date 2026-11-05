// Mistake Review board: replays missed questions until each is right twice. Not scored; nothing is sent.

import { h, seededShuffle } from '../../ui.js';
import { gradeQuestion } from '../../lib/grading.js';
import { getLocalResults } from '../../lib/submit.js';
import { loadMistakeIds, mistakeQuestions, mistakesFromResults, startReview, answerReview, clearMistakes, RIGHT_TWICE } from '../../lib/games/mistakes.js';
import { questionBoard, numberKeys, shuffleOptions } from './question-ui.js';
import { feedbackCard } from './feedback-card.js';

export function play(shell) {
  const { user } = shell;
  const test = shell.gtest;
  const ids = () => [...loadMistakeIds(user.email, shell.test.code), ...mistakesFromResults(getLocalResults(), test)];
  let round = 0;
  let g = null;

  function intro() {
    const n = mistakeQuestions(test, ids()).length;
    shell.intro({
      title: 'Mistake Review',
      rules: [
        `${n} question${n === 1 ? '' : 's'} you missed before.`,
        `Answer each one correctly ${RIGHT_TWICE} times to clear it. Missed ones come back soon.`,
        'Not scored, and nothing is sent anywhere.',
        'Keyboard: press 1–4 to pick an answer. Other question types have their own Submit button.',
      ],
      startLabel: 'Start review',
      onStart: begin,
    });
  }

  function begin() {
    round++;
    const qs = mistakeQuestions(test, ids());
    const seed = `${user.email}${shell.test.code}${Date.now()}${round}`;
    const byId = new Map(qs.map((q) => [String(q.id), q]));
    g = { byId, seed, state: startReview(qs), total: qs.length, solved: [], results: [], n: 0 };
    question();
  }

  function question() {
    const id = g.state.queue[0];
    const q = shuffleOptions(g.byId.get(id), seededShuffle, `${g.seed}${g.n++}`);
    const cleared = g.total - new Set(g.state.queue).size;
    const hud = shell.hud({ label: `${cleared} of ${g.total} cleared · ${g.state.right[id] || 0} of ${RIGHT_TWICE} right`, scored: false, streak: false });
    let locked = false;
    const board = questionBoard(q, { onAnswer: (a) => finish(a) });
    const feedbackSlot = h('div', { class: 'game-feedback-slot' });

    function finish(answer) {
      if (locked) return;
      locked = true;
      const ok = !!gradeQuestion(q, answer).isCorrect;
      g.state = answerReview(g.state, ok);
      g.results.push({ q, answer, correct: ok });
      if (g.state.solved) g.solved.push(id);
      board.lock(answer);
      shell.flash(ok);
      shell.sound(ok ? 'correct' : 'wrong');
      const lines = ok ? [g.state.solved ? 'Cleared! You will not see this one again.' : `Right once. One more time to clear it.`] : ['It will come back in a moment.'];
      feedbackSlot.replaceChildren(feedbackCard(shell, {
        ok, q, title: ok ? 'Correct!' : 'Not quite', lines, nextLabel: g.state.done ? 'See results' : 'Next question',
        onNext: () => { if (g.state.done) end(); else question(); },
      }));
    }

    shell.setKeys(numberKeys(board, () => locked));
    shell.setStage(h('section', { class: 'game-play', 'aria-label': 'Mistake review' }, hud.el, board.heading, board.answerArea, board.submitRow, feedbackSlot));
    shell.later(() => (board.startsWithTiles ? board.heading.focus({ preventScroll: true }) : board.focusFirst()));
  }

  function end() {
    clearMistakes(user.email, shell.test.code, g.solved);
    shell.end({
      title: 'Review complete',
      score: null,
      stats: [
        { label: 'Cleared', value: `${g.solved.length} / ${g.total}`, testid: 'mistakes-cleared' },
        { label: 'Answers', value: String(g.state.answered), testid: 'mistakes-answers' },
        { label: 'Misses', value: String(g.state.wrong), testid: 'mistakes-misses' },
      ],
      onAgain: () => { if (mistakeQuestions(test, ids()).length) begin(); else shell.back(); },
      announce: `Review complete. ${g.solved.length} of ${g.total} cleared.`,
    });
  }

  if (!mistakeQuestions(test, ids()).length) { shell.back(); return; }
  intro();
}
