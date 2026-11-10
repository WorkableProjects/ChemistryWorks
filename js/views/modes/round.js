// Shared round loop for the question-by-question modes (Classic, Lightning Round, Survival).
// The rules are pure (js/lib/modes/<id>.js `rules()`); this file only draws them. Every answer goes through
// `attempt.set` (via ctx.widgetFor), so it shows as answered in Study. A round holds exactly the attempt's questions.
// playRound(host, attempt, ctx, mode) -> { destroy() }

import { h, mount } from '../../ui.js';
import { normalizeGameOptions } from '../../lib/games/options.js';
import { outcomeOf, isManual, isSlow } from '../../lib/modes/common.js';

const TICK_MS = 200;
const fmtTime = (ms) => `${Math.max(0, Math.ceil(ms / 1000))}s`;

export function playRound(host, attempt, ctx, mode) {
  const test = attempt.test;
  const opts = normalizeGameOptions(test);
  const rules = mode.rules(test, opts);
  const byId = new Map(attempt.questions.map((q) => [q.id, q]));
  const queue = rules.order(attempt.questions);
  const skips = new Map();
  const events = [];
  const startedAt = Date.now();
  let state = rules.init();
  let totalLeft = rules.clock === 'total' ? rules.totalSeconds * 1000 : null;
  let current = null;
  let qLeft = null;
  let qElapsed = 0;
  let limitMs = null;
  let ended = false;
  let busy = false;
  let timer = null;
  let last = 0;
  let checkBtn = null;
  const score = () => events.reduce((n, e) => n + (e.points || 0), 0);

  /* ---- HUD */
  const hudProgress = h('span', { class: 'mode-hud__item', dataset: { testid: 'mode-progress' } });
  const hudScore = h('span', { class: 'mode-hud__item mode-hud__fig', dataset: { testid: 'mode-score' } });
  const hudStreak = h('span', { class: 'mode-hud__item', dataset: { testid: 'mode-streak' } });
  const hudLives = h('span', { class: 'mode-hud__item', dataset: { testid: 'mode-lives' } });
  const hudTime = h('span', { class: 'mode-hud__item mode-hud__fig', dataset: { testid: 'mode-time' } });
  const hud = h('div', { class: 'mode-hud' }, hudProgress, hudScore, rules.lives ? hudLives : null, hudStreak, rules.clock !== 'none' ? hudTime : null);
  ctx.hudSlot.replaceChildren(hud);
  const drawHud = () => {
    hudProgress.textContent = `${events.length} of ${attempt.total} done`;
    hudScore.textContent = `Score ${score()}`;
    hudStreak.textContent = state.streak ? `Streak ${state.streak}` : '';
    hudLives.textContent = rules.lives ? `Lives ${state.lives}` : '';
    if (rules.clock === 'total') hudTime.textContent = fmtTime(totalLeft);
    else if (rules.clock === 'question') hudTime.textContent = qLeft == null ? (current ? 'No limit' : '') : fmtTime(qLeft);
  };

  /* ---- clock */
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function startTimer() {
    stopTimer();
    if (rules.clock === 'none') return;
    last = performance.now();
    timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(now - last, 500);
      last = now;
      if (!current || busy || ended) return;
      qElapsed += dt;
      if (rules.clock === 'question' && qLeft != null) {
        qLeft = Math.max(0, qLeft - dt);
        drawHud();
        if (qLeft <= 0) resolve('timeout');
      } else if (rules.clock === 'total') {
        totalLeft = Math.max(0, totalLeft - dt * (rules.drainRate ? rules.drainRate(current) : 1));
        drawHud();
        if (totalLeft <= 0) { if (attempt.isAnswered(current.id)) resolve('check'); finish(); }
      }
    }, TICK_MS);
  }

  /* ---- flow */
  function intro() {
    const note = rules.clock === 'none' ? null : 'Long questions get extra time, and teacher-graded questions are not timed.';
    const start = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'mode-start' }, on: { click: () => next() } }, 'Start');
    mount(host, h('section', { class: 'mode-card', dataset: { testid: 'mode-intro' } },
      h('h1', { class: 'mode-card__title', tabindex: '-1' }, mode.title),
      h('p', { class: 'mode-card__lead' }, mode.blurb),
      note ? h('p', { class: 'mode-card__note' }, note) : null,
      h('p', { class: 'mode-card__note' }, `${attempt.total} ${attempt.total === 1 ? 'question' : 'questions'}. Your answers are saved to this practice.`),
      h('div', { class: 'mode-actions' }, start)));
    drawHud();
    start.focus();
  }

  function next() {
    busy = false;
    if (ended) return;
    if (!queue.length || (rules.lives && state.lives <= 0)) { finish(); return; }
    current = byId.get(queue[0]);
    const secs = rules.secondsFor(current);
    limitMs = secs ? secs * 1000 : null;
    qLeft = limitMs;
    qElapsed = 0;
    const q = current;
    const widgetEl = ctx.widgetFor(q, { onChange: () => { if (checkBtn) checkBtn.disabled = !attempt.isAnswered(q.id); } });
    checkBtn = h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: !attempt.isAnswered(q.id), dataset: { testid: 'mode-check' }, on: { click: () => resolve('check') } },
      isManual(q) || !attempt.showsCorrectness() ? 'Save answer' : 'Check answer');
    const canSkip = (skips.get(q.id) || 0) < rules.maxSkips || rules.maxSkips === Infinity;
    const skipBtn = h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'mode-skip' }, on: { click: () => skip() } },
      rules.skipCost ? `Skip (-${rules.skipCost}s)` : canSkip ? 'Skip for now' : 'Skip');
    const slowNote = rules.clock !== 'none' && isSlow(q) ? h('p', { class: 'mode-card__note' }, isManual(q) ? 'Not timed: your teacher grades this' : 'Extra time for this question') : null;
    mount(host, h('section', { class: 'mode-card mode-q', dataset: { testid: 'mode-question', questionId: q.id } },
      h('p', { class: 'mode-q__num' }, `Question ${Math.min(events.length + 1, attempt.total)} of ${attempt.total}`),
      slowNote, widgetEl,
      h('div', { class: 'mode-actions' }, checkBtn, skipBtn)));
    drawHud();
    startTimer();
  }

  function skip() {
    if (busy || !current) return;
    const id = current.id;
    const n = skips.get(id) || 0;
    if (n >= rules.maxSkips) { resolve('skip'); return; }
    skips.set(id, n + 1);
    queue.push(queue.shift());
    if (totalLeft != null) totalLeft = Math.max(0, totalLeft - rules.skipCost * 1000);
    if (totalLeft === 0) { finish(); return; }
    next();
  }

  function resolve(kind) {
    if (busy || !current || ended) return;
    busy = true;
    const q = current;
    const outcome = kind === 'skip' ? 'skipped' : kind === 'timeout' && !attempt.isAnswered(q.id) ? 'blank' : outcomeOf(attempt, q);
    const res = rules.apply(state, { q, outcome, elapsedMs: qElapsed, limitMs });
    state = res.state;
    events.push({ id: q.id, outcome, points: res.points || 0 });
    queue.shift();
    current = null;
    stopTimer();
    drawHud();
    ctx.sound?.play?.(outcome === 'correct' ? 'correct' : outcome === 'wrong' || outcome === 'blank' ? 'wrong' : 'tap');
    const over = res.over || !queue.length;
    // The total-clock round moves straight on: a short status line, no card.
    if (rules.clock === 'total' && !over) {
      ctx.announce(outcome === 'correct' ? `Correct, ${res.points} points` : outcome === 'wrong' ? 'Not quite' : 'Saved');
      next();
      return;
    }
    if (outcome === 'skipped') { if (over) finish(); else next(); return; }
    const lines = [];
    if (res.points) lines.push(`+${res.points} points`);
    if (res.lifeGained) lines.push('You earned a life back');
    if (res.lifeLost) lines.push(`${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left`);
    if (kind === 'timeout' && outcome === 'blank') lines.push('Time is up');
    mount(host, ctx.feedback(q, outcome, { lines, nextLabel: over ? 'See results' : 'Next question', onNext: () => (over ? finish() : next()) }));
  }

  function finish() {
    if (ended) return;
    ended = true;
    stopTimer();
    const { score: total } = mode.scoring(attempt, events);
    ctx.onEnd({
      modeId: mode.id, score: total, answered: attempt.answeredCount,
      correct: events.filter((e) => e.outcome === 'correct').length, total: attempt.total, durationMs: Date.now() - startedAt,
    });
  }

  intro();
  return { destroy() { ended = true; stopTimer(); ctx.hudSlot.replaceChildren(); } };
}
