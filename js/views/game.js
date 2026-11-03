// Game mode: original single-player, timed, one-question-at-a-time practice. Nothing is submitted anywhere.
// render(root, ctx, { test, source }) -> cleanup()

import {
  h, mount, icon, richText, renderMath, appHeader, userBadge, seededShuffle, prefersReducedMotion,
} from '../ui.js';
import { gradeQuestion, formatAnswer } from '../lib/grading.js';
import { load, save } from '../lib/storage.js';
import {
  splitGameQuestions, scoreAnswer, summarizeGame, fiftyFiftyRemovals, bestKey, QUESTION_SECONDS, FREEZE_SECONDS,
} from '../lib/game.js';
import { withQuestionImage } from './question-image.js';

const SHAPES = ['▲', '◆', '●', '■'];

export function render(root, ctx, params = {}) {
  const { test, source } = params;
  const user = ctx.user;
  if (!user) { ctx.navigate('landing', { code: test?.code }); return undefined; }

  const { playable, skipped } = splitGameQuestions(test);
  const reduced = prefersReducedMotion();
  const limitMs = QUESTION_SECONDS * 1000;
  let round = 0;
  let timer = null;
  let keyHandler = null;
  let focusTimer = null;
  let g = null; // game state

  const stop = () => { clearInterval(timer); timer = null; keyHandler && document.removeEventListener('keydown', keyHandler); keyHandler = null; };
  const later = (fn, ms = 40) => { clearTimeout(focusTimer); focusTimer = setTimeout(fn, ms); };

  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite', dataset: { testid: 'game-live' } });
  const stage = h('main', { class: 'game-stage' });
  const header = appHeader({ subtitle: `${test.title} · Game mode`, onHome: () => ctx.navigate('landing'), right: [userBadge(user)] });
  mount(root, h('div', { class: 'game', dataset: { testid: 'game' } }, header, stage, live));

  const setStage = (...nodes) => { mount(stage, ...nodes); renderMath(stage); };

  /* ---------- intro ---------- */
  function intro() {
    stop();
    if (!playable.length) {
      setStage(h('section', { class: 'game-card' },
        h('h1', { class: 'game-card__title', tabindex: '-1' }, 'No playable questions'),
        h('p', { class: 'muted' }, 'This test has no questions that work in game mode.'),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => ctx.navigate('runner', { test, source }) } }, 'Switch to Study mode')));
      return;
    }
    const start = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'game-start' }, on: { click: () => begin() } }, 'Start game');
    setStage(h('section', { class: 'game-card game-card--intro', dataset: { testid: 'game-intro' } },
      h('h1', { class: 'game-card__title', tabindex: '-1' }, 'Ready?'),
      h('ul', { class: 'game-rules' },
        h('li', {}, `${playable.length} question${playable.length === 1 ? '' : 's'}, ${QUESTION_SECONDS} seconds each.`),
        h('li', {}, 'Faster correct answers score more (up to 1000). Wrong or late answers score 0.'),
        h('li', {}, 'Three right in a row starts a streak bonus.'),
        h('li', {}, `Power-ups, once per game: 50/50 (multiple choice) and Freeze (+${FREEZE_SECONDS} seconds).`),
        h('li', {}, 'Keyboard: press 1–4 to pick an answer.')),
      skipped.length ? h('p', { class: 'game-note', dataset: { testid: 'game-skipped' } }, `${skipped.length} question${skipped.length === 1 ? '' : 's'} skipped in game mode.`) : null,
      h('p', { class: 'game-note' }, icon('info', { size: 16 }), ' Game mode is practice — your score is not submitted.'),
      h('div', { class: 'game-actions' },
        start,
        h('button', { class: 'btn btn--ghost', type: 'button', on: { click: () => ctx.navigate('runner', { test, source }) } }, 'Study mode instead'))));
    later(() => start.focus());
  }

  /* ---------- play ---------- */
  function begin() {
    round++;
    const seed = `${user.email}${test.code}${Date.now()}${round}`;
    const qs = seededShuffle(playable, seed).map((q) => (q.type === 'mcq' || q.type === 'multi' ? { ...q, options: seededShuffle(q.options, seed + q.id) } : q));
    g = { qs, i: 0, streak: 0, results: [], fifty: true, freeze: true, score: 0 };
    question();
  }

  function question() {
    stop();
    const q = g.qs[g.i];
    const st = { locked: false, picked: new Set(), hidden: new Set(), startedAt: performance.now(), extraMs: 0 };
    const total = g.qs.length;

    const timeText = h('span', { class: 'game-time__text', 'aria-hidden': 'true', dataset: { testid: 'game-time' } });
    const fill = h('div', { class: 'game-time__fill' });
    const timeBar = h('div', { class: 'game-time', role: 'img', 'aria-label': `${QUESTION_SECONDS} seconds per question` }, fill);
    const scoreEl = h('strong', { dataset: { testid: 'game-score' } }, g.score.toLocaleString());
    const hud = h('div', { class: 'game-hud' },
      h('span', { class: 'game-hud__q', dataset: { testid: 'game-progress' } }, `Question ${g.i + 1} of ${total}`),
      h('span', { class: 'game-hud__streak', dataset: { testid: 'game-streak' } }, icon('flag', { size: 14 }), ` Streak ${g.streak}`),
      h('span', { class: 'game-hud__score' }, 'Score ', scoreEl),
      timeText, timeBar);

    const textEl = richText(q.text, 'p', 'game-q__text');
    const heading = h('div', { class: 'game-q', tabindex: '-1', dataset: { testid: 'game-question', questionId: q.id } }, withQuestionImage(q, textEl));
    const answerArea = h('div', { class: 'game-answers' });
    const feedbackSlot = h('div', { class: 'game-feedback-slot' });
    const powerBar = h('div', { class: 'game-powers' });
    const submitRow = h('div', { class: 'game-submit' });

    /* timer */
    const remaining = () => limitMs + st.extraMs - (performance.now() - st.startedAt);
    const paint = () => {
      const rem = Math.max(0, remaining());
      const secs = Math.ceil(rem / 1000);
      timeText.textContent = `${secs}s`;
      fill.style.width = `${Math.min(100, (rem / limitMs) * 100)}%`;
      timeBar.classList.toggle('is-low', rem <= 5000);
      return rem;
    };
    const tick = () => { if (st.locked) return; if (paint() <= 0) finish(null, true); };
    paint();
    timer = setInterval(tick, reduced ? 500 : 100);

    /* answering */
    function finish(answer, timedOut = false) {
      if (st.locked) return;
      st.locked = true;
      stop();
      const elapsedMs = Math.min(performance.now() - st.startedAt - st.extraMs, limitMs);
      const grade = timedOut || answer === null ? { isCorrect: false } : gradeQuestion(q, answer);
      const s = scoreAnswer({ correct: !!grade.isCorrect, elapsedMs, limitMs, streak: g.streak });
      g.streak = s.streak;
      g.score += s.points;
      g.results.push({ q, answer: timedOut ? null : answer, correct: !!grade.isCorrect, points: s.points, timedOut });
      scoreEl.textContent = g.score.toLocaleString();
      hud.querySelector('[data-testid="game-streak"]').lastChild.textContent = ` Streak ${g.streak}`;
      paint();
      lockAnswers(answer);
      showFeedback(grade.isCorrect, timedOut, s);
    }

    function lockAnswers(answer) {
      answerArea.querySelectorAll('button, input').forEach((el) => { el.disabled = true; });
      submitRow.replaceChildren();
      powerBar.replaceChildren();
      const picked = new Set(Array.isArray(answer) ? answer.map(String) : answer == null ? [] : [String(answer)]);
      const key = Array.isArray(q.correctAnswer) ? q.correctAnswer.map(String) : [String(q.correctAnswer)];
      answerArea.querySelectorAll('[data-opt]').forEach((el) => {
        const id = el.dataset.opt;
        if (q.type === 'numeric' || q.type === 'formula') return;
        if (key.includes(id)) el.classList.add('is-correct');
        else if (picked.has(id)) el.classList.add('is-wrong');
        else el.classList.add('is-dim');
      });
    }

    function showFeedback(ok, timedOut, s) {
      const last = g.i === total - 1;
      const next = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'game-next' }, on: { click: () => { if (last) end(); else { g.i++; question(); } } } },
        last ? 'See results' : 'Next question');
      const title = ok ? 'Correct!' : timedOut ? "Time's up" : 'Not quite';
      const gained = ok ? `+${s.points.toLocaleString()} points${s.multiplier > 1 ? ` (streak bonus ×${s.multiplier})` : ''}` : '0 points';
      const card = h('div', { class: ['game-feedback', ok ? 'is-correct' : 'is-wrong', reduced ? '' : 'pop'], dataset: { testid: 'game-feedback', correct: String(!!ok) } },
        h('h2', { class: 'game-feedback__title' }, icon(ok ? 'check' : 'x', { size: 22 }), ' ', title),
        h('p', { class: 'game-feedback__points', dataset: { testid: 'game-points' } }, gained),
        h('p', { class: 'game-feedback__streak' }, g.streak >= 3 ? `Streak: ${g.streak} in a row` : g.streak ? `Streak: ${g.streak}` : 'Streak reset'),
        ok ? null : h('p', { class: 'game-feedback__answer' }, 'Correct answer: ', richText(formatAnswer(q, q.correctAnswer), 'strong')),
        q.explanation ? richText(q.explanation, 'p', 'game-feedback__why') : null,
        next);
      feedbackSlot.replaceChildren(card);
      renderMath(card);
      live.textContent = `${title} ${gained}. ${ok ? '' : `Correct answer: ${formatAnswer(q, q.correctAnswer)}.`}`;
      later(() => next.focus());
    }

    /* inputs by type */
    const tile = (idx, id, label, extra = {}) => h('button', {
      type: 'button', class: `game-tile game-tile--${idx % 4}`, dataset: { testid: `game-option-${id}`, opt: String(id) }, 'aria-keyshortcuts': String(idx + 1), ...extra,
    }, h('span', { class: 'game-tile__shape', 'aria-hidden': 'true' }, SHAPES[idx % 4]), h('span', { class: 'game-tile__num', 'aria-hidden': 'true' }, String(idx + 1)),
    richText(label, 'span', 'game-tile__text'));

    let activate = () => {}; // keyboard 1-9 handler
    let focusFirst = () => {};
    if (q.type === 'mcq' || q.type === 'truefalse') {
      const opts = q.type === 'mcq' ? q.options.map((o) => ({ id: String(o.id), text: o.text })) : [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }];
      opts.forEach((o, i) => answerArea.append(tile(i, o.id, o.text, { on: { click: () => finish(q.type === 'truefalse' ? o.id === 'true' : o.id) } })));
      activate = (n) => { const o = opts[n]; if (o && !st.hidden.has(o.id)) finish(q.type === 'truefalse' ? o.id === 'true' : o.id); };
      answerArea.classList.add(q.type === 'truefalse' ? 'game-answers--two' : 'game-answers--grid');
      focusFirst = () => answerArea.querySelector('button')?.focus();
    } else if (q.type === 'multi') {
      const submit = h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: true, dataset: { testid: 'game-submit' }, on: { click: () => finish([...st.picked]) } }, 'Submit answer');
      submitRow.append(submit, h('span', { class: 'game-hint' }, 'Select all that apply'));
      const toggle = (id, el) => {
        if (st.picked.has(id)) st.picked.delete(id); else st.picked.add(id);
        el.setAttribute('aria-pressed', String(st.picked.has(id)));
        el.classList.toggle('is-picked', st.picked.has(id));
        submit.disabled = st.picked.size === 0;
      };
      q.options.forEach((o, i) => {
        const id = String(o.id);
        const el = tile(i, id, o.text, { 'aria-pressed': 'false' });
        el.addEventListener('click', () => toggle(id, el));
        answerArea.append(el);
      });
      answerArea.classList.add('game-answers--grid');
      activate = (n) => { const o = q.options[n]; if (o) answerArea.querySelector(`[data-opt="${CSS.escape(String(o.id))}"]`)?.click(); };
      focusFirst = () => answerArea.querySelector('button')?.focus();
    } else {
      const numeric = q.type === 'numeric';
      const input = h('input', {
        class: 'input game-input', type: 'text', autocomplete: 'off', spellcheck: 'false', inputmode: numeric ? 'decimal' : 'text',
        'aria-label': numeric ? `Your answer${q.unit ? ` (${q.unit})` : ''}` : 'Your answer (chemical formula)', dataset: { testid: numeric ? 'game-numeric-input' : 'game-formula-input' },
      });
      const go = (e) => { e.preventDefault(); if (input.value.trim()) finish(input.value); else input.focus(); };
      answerArea.append(h('form', { class: 'game-form', on: { submit: go } }, input, q.unit ? h('span', { class: 'game-unit' }, q.unit) : null,
        h('button', { class: 'btn btn--primary btn--lg', type: 'submit', dataset: { testid: 'game-submit' } }, 'Submit answer')));
      focusFirst = () => input.focus();
    }

    /* power-ups */
    const drawPowers = () => {
      powerBar.replaceChildren();
      if (st.locked) return;
      const canFifty = g.fifty && q.type === 'mcq' && fiftyFiftyRemovals(q).length > 0;
      if (canFifty) {
        powerBar.append(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'game-fifty' }, on: { click: () => {
          g.fifty = false;
          const order = seededShuffle(q.options.map((o) => o.id), `${q.id}${st.startedAt}`);
          for (const id of fiftyFiftyRemovals(q, order)) {
            st.hidden.add(String(id));
            const el = answerArea.querySelector(`[data-opt="${CSS.escape(String(id))}"]`);
            if (el) { el.disabled = true; el.classList.add('is-removed'); }
          }
          live.textContent = 'Two wrong answers removed.';
          drawPowers();
        } } }, '50/50'));
      }
      if (g.freeze) {
        powerBar.append(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'game-freeze' }, on: { click: () => {
          g.freeze = false; st.extraMs += FREEZE_SECONDS * 1000; paint();
          live.textContent = `Time frozen: ${FREEZE_SECONDS} seconds added.`;
          drawPowers();
        } } }, `Freeze +${FREEZE_SECONDS}s`));
      }
    };
    drawPowers();

    keyHandler = (e) => {
      if (st.locked || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement) return;
      if (/^[1-9]$/.test(e.key)) { activate(Number(e.key) - 1); e.preventDefault(); }
    };
    document.addEventListener('keydown', keyHandler);

    setStage(h('section', { class: 'game-play', 'aria-label': `Question ${g.i + 1}` }, hud, heading, answerArea, submitRow, powerBar, feedbackSlot));
    later(() => (q.type === 'mcq' || q.type === 'truefalse' || q.type === 'multi' ? heading.focus({ preventScroll: true }) : focusFirst()));
  }

  /* ---------- end ---------- */
  function end() {
    stop();
    const sum = summarizeGame(g.results);
    const key = bestKey(user.email, test.code);
    const prev = Number(load(key, 0)) || 0;
    const isBest = sum.score > prev;
    if (isBest) save(key, sum.score);
    const best = Math.max(prev, sum.score);

    const stat = (label, value, testid) => h('div', { class: 'game-stat' }, h('span', { class: 'game-stat__v', dataset: { testid } }, value), h('span', { class: 'game-stat__l' }, label));
    const again = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'game-again' }, on: { click: () => begin() } }, 'Play again');
    const review = h('ol', { class: 'game-review', dataset: { testid: 'game-review' } }, g.results.map((r, n) => h('li', { class: ['game-review__item', r.correct ? 'is-correct' : 'is-wrong'], dataset: { correct: String(r.correct) } },
      h('span', { class: 'game-review__mark', 'aria-label': r.correct ? 'Correct' : r.timedOut ? 'Timed out' : 'Incorrect' }, icon(r.correct ? 'check' : 'x', { size: 16 })),
      h('div', { class: 'game-review__body' },
        richText(r.q.text, 'p', 'game-review__q'),
        h('p', { class: 'game-review__a' }, 'Your answer: ', r.answer === null ? '—' : formatAnswer(r.q, r.answer),
          r.correct ? null : [' · Correct: ', formatAnswer(r.q, r.q.correctAnswer)])),
      h('span', { class: 'game-review__pts' }, `${r.points.toLocaleString()} pts`))));

    setStage(h('section', { class: 'game-card game-card--end', dataset: { testid: 'game-end' } },
      h('h1', { class: 'game-card__title', tabindex: '-1' }, 'Game over'),
      h('p', { class: 'game-score-big', dataset: { testid: 'game-final-score' } }, sum.score.toLocaleString()),
      isBest && sum.score > 0 ? h('p', { class: 'game-best is-new', dataset: { testid: 'game-new-best' } }, 'New personal best!') : h('p', { class: 'game-best' }, `Personal best: ${best.toLocaleString()}`),
      h('div', { class: 'game-stats' },
        stat('Accuracy', `${sum.accuracy}%`, 'game-accuracy'),
        stat('Correct', `${sum.correct} / ${sum.total}`, 'game-correct'),
        stat('Best streak', String(sum.bestStreak), 'game-best-streak')),
      skipped.length ? h('p', { class: 'game-note' }, `${skipped.length} question${skipped.length === 1 ? '' : 's'} skipped in game mode.`) : null,
      h('p', { class: 'game-note' }, 'Game mode is practice — this score was not submitted.'),
      h('div', { class: 'game-actions' },
        again,
        h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'game-to-study' }, on: { click: () => ctx.navigate('runner', { test, source }) } }, 'Switch to Study mode'),
        h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'game-home' }, on: { click: () => ctx.navigate('landing') } }, 'Home')),
      h('h2', { class: 'game-review__title' }, 'Review'),
      review));
    live.textContent = `Game over. Score ${sum.score}. Accuracy ${sum.accuracy} percent.`;
    later(() => stage.querySelector('.game-card__title')?.focus({ preventScroll: true }));
  }

  intro();
  return () => { stop(); clearTimeout(focusTimer); };
}
