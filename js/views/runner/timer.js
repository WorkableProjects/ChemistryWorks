// Runner header timer: elapsed or countdown display, minute announcements for screen readers, and the 5 and 1
// minute warnings. Calls rt.finish({ auto: true }) when a timed test runs out.

import { h, icon, toast, formatDuration } from '../../ui.js';

/** Builds the timer elements and controls. Returns { timerEl, timerText, timerAnnouncer, tick, startTimer, stopTimer }. */
export function createTimer(rt) {
  const { state, limitSec } = rt;
  const timerText = h('span', { class: 'runner-timer__text' }, '0:00');
  const timerEl = h('div', { class: 'runner-timer', role: 'timer', 'aria-live': 'off', dataset: { testid: 'timer' } }, icon('clock', { size: 16 }), timerText);
  // Screen readers hear the time once per minute (not every second).
  const timerAnnouncer = h('span', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true', dataset: { testid: 'timer-announcer' } });

  let timerId = null;
  let warned5 = false;
  let warned1 = false;
  let lastAnnouncedMin = null;

  function tick(initial = false) {
    const elapsed = (Date.now() - state.startedAt) / 1000;
    if (!limitSec) { timerText.textContent = formatDuration(elapsed); return; }
    const rem = Math.ceil(limitSec - elapsed);
    timerText.textContent = formatDuration(Math.max(0, rem));
    const remMin = Math.ceil(Math.max(0, rem) / 60);
    if (remMin !== lastAnnouncedMin) {
      lastAnnouncedMin = remMin;
      if (!initial && rem > 0) timerAnnouncer.textContent = `${remMin} ${remMin === 1 ? 'minute' : 'minutes'} remaining`;
    }
    timerEl.classList.toggle('is-warning', rem <= 300 && rem > 60);
    timerEl.classList.toggle('is-danger', rem <= 60);
    if (rem <= 300 && !warned5) { warned5 = true; if (rem > 60) toast('5 minutes left', { type: 'warning' }); }
    if (rem <= 60 && !warned1) { warned1 = true; if (rem > 0) toast('1 minute left', { type: 'warning' }); }
    if (rem <= 0 && !initial && !state.submitting && !state.done) rt.finish({ auto: true });
  }
  function startTimer() {
    clearInterval(timerId);
    timerId = setInterval(tick, 1000);
  }
  function stopTimer() { clearInterval(timerId); timerId = null; }

  if (limitSec) {
    const rem0 = Math.ceil(limitSec - (Date.now() - state.startedAt) / 1000);
    warned5 = rem0 <= 300; // do not announce thresholds that were already passed before this render
    warned1 = rem0 <= 60;
  }
  return { timerEl, timerText, timerAnnouncer, tick, startTimer, stopTimer };
}
