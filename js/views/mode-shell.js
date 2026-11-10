// V5-01 mode shell: shared chrome for every game mode. Header with the mode switcher, a HUD slot, the question host
// (the runner's own widgets, bound to the attempt), a feedback card and the end summary.
// renderModeShell(root, ctx, { test, source, gameId }) -> cleanup()
// Contract: docs/ARCHITECTURE.md -> V5 contracts -> Game mode definition (ctx = { widgetFor, feedback, onEnd, sound, reducedMotion, hudSlot, announce }).

import { h, mount, icon, richText, renderMath, appHeader, userBadge, prefersReducedMotion } from '../ui.js';
import { openAttempt } from '../lib/attempt.js';
import { correctAnswerText } from '../lib/grading.js';
import { modeById } from '../lib/modes/index.js';
import { isManual, loadModeBest, saveModeBest } from '../lib/modes/common.js';
import { leaderboardOn, submitGameScore } from '../lib/leaderboard.js';
import { getIdToken } from '../lib/auth.js';
import { isSoundOn, playTone } from '../lib/games/sound.js';
import { buildWidget } from './runner/widgets.js';
import { modeSwitcher } from './runner/mode-switcher.js';
import { withQuestionImage } from './question-image.js';
import { RENDERERS } from './modes/index.js';

const fmtDuration = (ms) => {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
};

export function renderModeShell(root, ctx, params = {}) {
  const { test, source } = params;
  const user = ctx.user;
  if (!user) { ctx.navigate('landing', { code: test?.code }); return undefined; }
  const mode = modeById(params.gameId);
  const render = mode && RENDERERS[mode.id];
  if (!render) { ctx.navigate('runner', { test, source, cleared: true }); return undefined; }

  const attempt = openAttempt(test, { user, email: user.email });
  attempt.setMode(mode.id);
  let running = null;
  let destroyed = false;
  const reducedMotion = prefersReducedMotion();

  const hudSlot = h('div', { class: 'mode-hudslot' });
  const host = h('div', { class: 'mode-host', dataset: { testid: 'mode-host' } });
  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const announce = (t) => { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 30); };

  const goStudy = ({ review = false } = {}) => {
    attempt.save(true);
    ctx.navigate('runner', { test, source, cleared: true, ...(review ? { review: true } : {}) });
  };

  /* ---- chrome */
  const header = appHeader({ subtitle: test.title, onHome: () => { attempt.save(true); ctx.navigate('landing'); }, right: [userBadge(user)] });
  const bar = h('div', { class: 'mode-bar' },
    h('div', { class: 'mode-bar__inner' },
      h('span', { class: 'mode-bar__title', title: test.title }, test.title),
      modeSwitcher({
        test, attempt, current: mode.id,
        onPick: (id) => {
          if (id === 'study') { attempt.setMode('study'); goStudy(); return; }
          attempt.setMode(id);
          attempt.save(true);
          ctx.navigate('game', { test, source, gameId: id, cleared: true });
        },
      })));

  /* ---- ctx for the mode */
  function widgetFor(q, { onChange } = {}) {
    let widget = null;
    const api = {
      get: (id) => attempt.get(id),
      set: (id, val, opts) => { attempt.set(id, val, opts); widget?.refresh(attempt.get(id)); onChange?.(); },
    };
    widget = buildWidget(q, api);
    const el = h('div', { class: 'mode-widget', dataset: { testid: 'mode-widget', type: q.type } },
      withQuestionImage(q.type === 'hotspot' ? { ...q, image: undefined } : q, widget.textEl || richText(q.text, 'div', 'q-text')),
      widget.el);
    queueMicrotask(() => { widget.refresh(attempt.get(q.id)); renderMath(el); });
    return el;
  }

  function feedback(q, outcome, { lines = [], nextLabel = 'Next question', onNext } = {}) {
    const ok = outcome === 'correct';
    const bad = outcome === 'wrong' || outcome === 'blank';
    const title = ok ? 'Correct' : outcome === 'wrong' ? 'Not quite' : outcome === 'blank' ? 'No answer' : outcome === 'manual' ? 'Saved — your teacher grades this' : outcome === 'skipped' ? 'Skipped' : 'Saved';
    const next = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'mode-next' }, on: { click: () => onNext?.() } }, nextLabel);
    const card = h('section', { class: ['mode-card', 'mode-feedback', ok && 'is-correct', bad && 'is-wrong'], dataset: { testid: 'mode-feedback', outcome } },
      h('h2', { class: 'mode-feedback__title' }, ok || bad ? icon(ok ? 'check' : 'x', { size: 18 }) : null, h('span', {}, title)),
      lines.map((t, i) => h('p', { class: 'mode-feedback__line', dataset: i === 0 ? { testid: 'mode-points' } : {} }, t)),
      bad && !isManual(q) ? h('p', { class: 'mode-feedback__answer' }, 'Correct answer: ', richText(correctAnswerText(q), 'strong')) : null,
      q.explanation && outcome !== 'manual' ? richText(q.explanation, 'p', 'mode-feedback__why') : null,
      h('div', { class: 'mode-actions' }, next));
    renderMath(card);
    announce(`${title}. ${lines.join('. ')}`);
    setTimeout(() => next.focus(), 0);
    return card;
  }

  function onEnd(summary) {
    if (destroyed) return;
    attempt.save(true);
    const { best, isBest } = saveModeBest(user.email, test.code, mode.id, summary.score);
    const hidden = !attempt.showsCorrectness();
    const manualDone = attempt.questions.filter((q) => isManual(q) && attempt.isAnswered(q.id)).length;
    const rank = h('p', { class: 'mode-card__note', hidden: true, dataset: { testid: 'mode-rank' } });
    const stat = (value, label, strong = false) => h('div', { class: ['mode-stat', strong && 'mode-stat--main'] }, h('span', { class: 'mode-stat__v' }, String(value)), h('span', { class: 'mode-stat__l' }, label));
    const keep = h('button', { class: 'btn btn--ghost btn--lg', type: 'button', dataset: { testid: 'mode-keep-playing' }, on: { click: () => start() } }, 'Keep playing');
    const review = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'mode-review-submit' }, on: { click: () => goStudy({ review: true }) } }, 'Review & submit');
    hudSlot.replaceChildren();
    mount(host, h('section', { class: 'mode-card mode-end', dataset: { testid: 'mode-end' } },
      h('h1', { class: 'mode-card__title', tabindex: '-1' }, `${mode.title} finished`),
      h('div', { class: 'mode-stats' },
        stat(summary.score, 'score', true),
        stat(`${summary.answered} of ${summary.total}`, 'answered'),
        hidden ? null : stat(summary.correct, 'correct'),
        stat(fmtDuration(summary.durationMs), 'time')),
      h('p', { class: 'mode-card__note', dataset: { testid: 'mode-best' } }, isBest ? 'New best score for this practice' : `Best score ${best}`),
      hidden ? h('p', { class: 'mode-card__note' }, 'Saved. Scores here count completion and speed, not right answers') : null,
      manualDone ? h('p', { class: 'mode-card__note' }, `${manualDone} ${manualDone === 1 ? 'answer is' : 'answers are'} graded by your teacher`) : null,
      rank,
      h('div', { class: 'mode-actions' }, review, keep)));
    host.querySelector('h1')?.focus();
    if (leaderboardOn(test) && summary.score > 0) {
      submitGameScore({
        gasUrl: ctx.config?.GAS_WEB_APP_URL, idToken: user.provider === 'google' ? getIdToken() : null, test, user, gameId: mode.id, score: summary.score,
        info: { questions: summary.total, totalSeconds: 60, lives: 3 },
      }).then((r) => { if (r && r.ok && r.rank && !destroyed) { rank.textContent = `Class rank ${r.rank}`; rank.hidden = false; } }).catch(() => {});
    }
  }

  const modeCtx = { widgetFor, feedback, onEnd, sound: { on: isSoundOn, play: playTone }, reducedMotion, hudSlot, announce, config: ctx.config };

  function start() {
    running?.destroy?.();
    running = render(host, attempt, modeCtx);
  }

  const el = h('div', { class: 'mode-shell', dataset: { testid: 'mode-shell', mode: mode.id } },
    h('div', { class: 'mode-top' }, header, bar),
    h('main', { class: 'mode-main' }, hudSlot, host, live));
  mount(root, el);
  start();

  return () => {
    destroyed = true;
    running?.destroy?.();
    attempt.destroy();
  };
}
