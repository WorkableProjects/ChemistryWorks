// Runner navigation: chrome refresh, answer and flag updates, moving between questions, and focus/scroll modes.

import { icon, renderMath, prefersReducedMotion } from '../../ui.js';
import { isAnswered } from '../../lib/grading.js';

/** Updates the progress bar, counts, navigator tiles and the prev/next buttons. */
function makeUpdateChrome(rt) {
  const { state, ordered, total } = rt;
  const tileState = new Map();
  return function updateChrome() {
    const done = rt.answeredCount();
    rt.progressBar.setAttribute('aria-valuenow', String(done));
    rt.progressFill.style.transform = `scaleX(${total ? done / total : 0})`;
    rt.progressText.textContent = `${done} of ${total} answered`;
    rt.counts.answered.textContent = String(done);
    rt.counts.flagged.textContent = String(state.flagged.size);
    rt.counts.unanswered.textContent = String(total - done);
    ordered.forEach((q, i) => {
      const t = rt.tiles.get(q.id);
      const a = isAnswered(q, state.answers[q.id]);
      const f = state.flagged.has(q.id);
      const was = tileState.get(q.id);
      if (was && ((a && !was.a) || (f && !was.f)) && !prefersReducedMotion()) {
        t.classList.remove('is-pop');
        void t.offsetWidth;
        t.classList.add('is-pop');
      }
      tileState.set(q.id, { a, f });
      t.classList.toggle('is-answered', a);
      t.classList.toggle('is-flagged', f);
      t.classList.toggle('is-current', i === state.index);
      if (i === state.index) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current');
      t.setAttribute('aria-label', `Question ${i + 1}: ${a ? 'answered' : 'unanswered'}${f ? ', flagged' : ''}`);
    });
    rt.prevBtn.disabled = state.index <= 0;
    const last = state.index >= total - 1;
    rt.nextLabel.textContent = last ? 'Review & submit' : 'Next';
    rt.nextIcon.replaceChildren(icon(last ? 'check' : 'right'));
    rt.nextBtn.classList.toggle('btn--success', last);
    rt.nextBtn.classList.toggle('btn--primary', !last);
  };
}

/** Answer, flag and refresh actions shared by the cards, the shortcuts and the navigator. */
function makeAnswerActions(rt) {
  const { state, byId } = rt;
  function refreshQuestion(qid, debounce = false) {
    rt.cardById.get(qid)?.refresh();
    rt.updateChrome();
    rt.persist(debounce);
  }
  function setAnswer(qid, val, { debounce = false } = {}) {
    const q = byId.get(qid);
    if (!q || state.done || state.submitting) return;
    rt.attempt.set(qid, val, { debounce });
    rt.cardById.get(qid)?.refresh();
    rt.updateChrome();
  }
  // The note box gets focus only when the flag is clicked; the G shortcut leaves focus alone so G toggles again.
  function toggleFlag(qid, { focusNote = false } = {}) {
    if (state.flagged.has(qid)) { state.flagged.delete(qid); delete state.flagNotes[qid]; } else state.flagged.add(qid);
    refreshQuestion(qid);
    if (focusNote && state.flagged.has(qid)) rt.cardById.get(qid)?.el.querySelector('[data-testid="flag-note"]')?.focus({ preventScroll: true });
  }
  return { refreshQuestion, setAnswer, toggleFlag };
}

function resetCardClasses(el) {
  clearTimeout(el._leaveT);
  el.classList.remove('is-leaving', 'is-leaving-next', 'is-leaving-prev', 'is-entering-next', 'is-entering-prev');
  el.inert = false;
}

/** Moving between questions and switching between focus and scroll view. */
function makeMover(rt) {
  const { state, total, cards, stage } = rt;
  let currentEl = null;
  let io = null;
  let ioMuteUntil = 0;

  function mountFocus(i, dir) {
    const el = cards[i].el;
    const old = currentEl && currentEl !== el && currentEl.parentNode === stage ? currentEl : null;
    [...stage.children].forEach((c) => { if (c !== el && c !== old) { clearTimeout(c._leaveT); c.remove(); } });
    resetCardClasses(el);
    const animate = !!(dir && old && !prefersReducedMotion());
    if (animate) el.classList.add(`is-entering-${dir}`);
    el.classList.add('is-active');
    if (el.parentNode !== stage) stage.appendChild(el);
    if (old) {
      old.classList.remove('is-active');
      if (animate) {
        old.inert = true;
        old.classList.add('is-leaving', `is-leaving-${dir}`);
        old._leaveT = setTimeout(() => old.remove(), 320);
      } else old.remove();
    }
    if (animate) {
      void el.offsetWidth; // commit the start position before releasing it
      requestAnimationFrame(() => el.classList.remove(`is-entering-${dir}`));
    }
    currentEl = el;
    renderMath(el);
  }

  function goTo(target, opts = {}) {
    const i = Math.min(Math.max(target, 0), total - 1);
    const changed = i !== state.index;
    const dir = i >= state.index ? 'next' : 'prev';
    state.index = i;
    cards.forEach((c, k) => c.el.classList.toggle('is-active', k === i));
    if (state.mode === 'focus') mountFocus(i, changed ? dir : null);
    else if (!opts.fromScroll) {
      ioMuteUntil = Date.now() + 700;
      cards[i].el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
    rt.updateChrome();
    if (changed) {
      rt.persist();
      rt.announcer.textContent = `Question ${i + 1} of ${total}`;
    }
    if (opts.focus) {
      const c = cards[i];
      if (opts.focusInput && c.widget.focus) c.widget.focus(); else c.el.focus({ preventScroll: true });
    }
  }

  function observeScroll() {
    if (typeof IntersectionObserver === 'undefined') return;
    io = new IntersectionObserver((entries) => {
      if (Date.now() < ioMuteUntil) return;
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!hit) return;
      const i = cards.findIndex((c) => c.el === hit.target);
      if (i >= 0 && i !== state.index) goTo(i, { fromScroll: true });
    }, { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.01] });
    cards.forEach((c) => io.observe(c.el));
  }

  function applyMode() {
    rt.runnerEl.classList.toggle('runner--focus', state.mode === 'focus');
    rt.runnerEl.classList.toggle('runner--scroll', state.mode === 'scroll');
    io?.disconnect();
    io = null;
    stage.replaceChildren();
    currentEl = null;
    rt.actions.hidden = state.mode !== 'focus';
    cards.forEach((c) => { resetCardClasses(c.el); c.el.classList.remove('is-active'); });
    if (state.mode === 'focus') {
      mountFocus(state.index, null);
    } else {
      cards.forEach((c) => stage.appendChild(c.el));
      cards[state.index].el.classList.add('is-active');
      renderMath(stage);
      requestAnimationFrame(() => {
        if (state.index > 0) cards[state.index].el.scrollIntoView({ block: 'start' });
        ioMuteUntil = Date.now() + 300;
        observeScroll();
      });
    }
    rt.modeIcon.replaceChildren(icon(state.mode === 'focus' ? 'list' : 'grid', { size: 16 }));
    rt.modeLabel.textContent = state.mode === 'focus' ? 'Scroll view' : 'Focus view';
    rt.modeBtn?.setAttribute('aria-label', state.mode === 'focus' ? 'Switch to scroll view' : 'Switch to focus view');
    rt.updateChrome();
  }

  function setMode(m) {
    if (m === state.mode) return;
    state.mode = m;
    applyMode();
    rt.persist();
  }
  /** Stops the scroll observer and clears pending card animations. */
  function stopMoving() {
    io?.disconnect();
    io = null;
    cards.forEach((c) => clearTimeout(c.el._leaveT));
  }
  return { goTo, applyMode, setMode, stopMoving };
}

/** Wires the navigation functions onto rt. Needs the cards, stage, drawer and chrome to exist already. */
export function createNav(rt) {
  rt.updateChrome = makeUpdateChrome(rt);
  Object.assign(rt, makeAnswerActions(rt));
  Object.assign(rt, makeMover(rt));
}
