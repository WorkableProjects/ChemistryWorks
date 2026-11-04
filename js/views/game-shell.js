// Shared game chrome: HUD (score, streak flame, countdown ring, lives, sound toggle), intro and end screens,
// aria-live announcements and per-game cleanup. Each board (js/views/games/<id>.js) only renders its own play area.
// Nothing here talks to the network.

import { h, mount, icon, renderMath, appHeader, userBadge, prefersReducedMotion } from '../ui.js';
import { loadBest, saveBest } from '../lib/games/index.js';
import { isSoundOn, setSoundOn, playTone } from '../lib/games/sound.js';
import { normalizeGameOptions, gameTest, isUntimed } from '../lib/games/options.js';
import { recordRound } from '../lib/games/mistakes.js';
import { load, save } from '../lib/storage.js';

const RELAXED_KEY = 'gameRelaxed';

const RING_R = 18;
const RING_C = 2 * Math.PI * RING_R;

const svgEl = (tag, attrs = {}, ...kids) => h(tag, { xmlns: 'http://www.w3.org/2000/svg', ...attrs }, ...kids);

const flame = () => svgEl('svg', { viewBox: '0 0 24 24', width: '18', height: '18', 'aria-hidden': 'true', class: 'game-flame__svg' },
  svgEl('path', { d: 'M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z', fill: 'currentColor' }));
const heart = () => svgEl('svg', { viewBox: '0 0 24 24', width: '22', height: '22', 'aria-hidden': 'true' },
  svgEl('path', { d: 'M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z', fill: 'currentColor' }));

/** True when the student (OS setting or the app's motion switch) wants no animation. */
export function motionReduced() {
  try { if (document.documentElement.dataset.motion === 'reduce') return true; } catch { /* no DOM */ }
  return prefersReducedMotion();
}

/**
 * createShell(root, ctx, { test, source, game, studyBlocked }) -> shell
 *   shell.stage / setStage(...nodes) / announce(text) / later(fn, ms)
 *   shell.setTimer(fn, ms) / clearTimer() / setKeys(fn) / clearKeys()   (one slot each; cleared on cleanup)
 *   shell.hud({ label, lives, ring, scored }) -> hud controller
 *   shell.opts (normalized gameOptions) / shell.gtest (test limited to allowed types) / shell.untimed() / shell.sound(name)
 *   shell.flash(ok) / shell.intro({...}) / shell.end({...}) / shell.back() / shell.cleanup()
 */
export function createShell(root, ctx, { test, source, game, studyBlocked = false, cleared = false }) {
  const user = ctx.user;
  const opts = normalizeGameOptions(test);
  const gtest = gameTest(test, opts); // the test as games see it: only the allowed question types
  let timer = null;
  let keyFn = null;
  let focusTimer = null;
  let flashTimer = null;
  let dead = false;

  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite', dataset: { testid: 'game-live' } });
  const stage = h('main', { class: 'game-stage', dataset: { game: game.id } });
  const header = appHeader({ subtitle: `${test.title} · ${game.title}`, onHome: () => ctx.navigate('landing'), right: [userBadge(user)] });
  mount(root, h('div', { class: 'game', dataset: { testid: 'game', game: game.id } }, header, stage, live));

  const shell = {
    user, test, source, game, ctx, stage, live, opts, gtest,
    reduced: motionReduced,
    /** True when the clock is off for this player (teacher forced it, or the student chose relaxed mode and it is allowed). */
    untimed: () => game.timed === true && isUntimed(opts, load(RELAXED_KEY, false) === true),

    setStage(...nodes) { mount(stage, ...nodes); renderMath(stage); },
    announce(text) { live.textContent = ''; live.textContent = text; },
    later(fn, ms = 40) { clearTimeout(focusTimer); focusTimer = setTimeout(() => { if (!dead) fn(); }, ms); },

    setTimer(fn, ms) { shell.clearTimer(); timer = setInterval(fn, ms); },
    clearTimer() { clearInterval(timer); timer = null; },
    setKeys(fn) {
      shell.clearKeys();
      keyFn = (e) => { if (e.ctrlKey || e.metaKey || e.altKey) return; fn(e); };
      document.addEventListener('keydown', keyFn);
    },
    clearKeys() { if (keyFn) document.removeEventListener('keydown', keyFn); keyFn = null; },

    cleanup() { dead = true; shell.clearTimer(); shell.clearKeys(); clearTimeout(focusTimer); clearTimeout(flashTimer); },

    back() { ctx.navigate('mode-select', { test, source, picker: true, studyBlocked, cleared }); },
    toStudy() { ctx.navigate('runner', { test, source, cleared: cleared && !studyBlocked }); },
    best: () => loadBest(user.email, test.code, game.id),
    sound: (name) => { if (opts.sound) playTone(name); },

    /** Correct / wrong flash over the stage (opacity only). */
    flash(ok) {
      if (shell.reduced()) return;
      clearTimeout(flashTimer);
      stage.classList.remove('flash-ok', 'flash-bad');
      void stage.offsetWidth; // restart the animation
      stage.classList.add(ok ? 'flash-ok' : 'flash-bad');
      flashTimer = setTimeout(() => stage.classList.remove('flash-ok', 'flash-bad'), 500);
    },

    /** Intro card. { title, rules[], notes[], startLabel, onStart, canStart } */
    intro(args) {
      const { title = 'Ready?', notes = [], startLabel = 'Start game', onStart } = args;
      const rules = typeof args.rules === 'function' ? args.rules() : (args.rules || []);
      shell.clearTimer(); shell.clearKeys();
      const relaxedRow = game.timed !== true ? null
        : opts.untimed ? h('p', { class: 'game-note', dataset: { testid: 'game-relaxed-note' } }, icon('clock', { size: 16 }), ' Relaxed mode is on for this test: no clock and no speed points.')
          : opts.allowUntimed ? h('label', { class: 'game-relaxed' },
            h('input', { type: 'checkbox', checked: load(RELAXED_KEY, false) === true, dataset: { testid: 'game-relaxed-toggle' },
              on: { change: (e) => { save(RELAXED_KEY, e.target.checked); shell.intro(args); shell.later(() => stage.querySelector('[data-testid="game-relaxed-toggle"]')?.focus()); } } }),
            h('span', {}, 'Relaxed mode: no clock, no speed points')) : null;
      const start = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'game-start' }, on: { click: () => onStart() } }, startLabel);
      shell.setStage(h('section', { class: 'game-card game-card--intro', dataset: { testid: 'game-intro' } },
        h('h1', { class: 'game-card__title', tabindex: '-1' }, title),
        h('ul', { class: 'game-rules' }, rules.map((r) => h('li', {}, r))),
        relaxedRow,
        notes.filter(Boolean).map((n) => (typeof n === 'string' ? h('p', { class: 'game-note' }, n) : n)),
        h('p', { class: 'game-note' }, icon('info', { size: 16 }), game.scored === false ? ' This is for studying: nothing is scored or submitted.' : ' Game mode is practice — your score is not submitted.'),
        h('div', { class: 'game-actions' },
          start,
          h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'game-back-intro' }, on: { click: () => shell.back() } }, 'Back to games'),
          studyBlocked ? null : h('button', { class: 'btn btn--ghost', type: 'button', on: { click: () => shell.toStudy() } }, 'Study mode instead'))));
      shell.later(() => start.focus());
    },

    /**
     * HUD controller. opts: { label, lives (number of heart slots, 0/undefined = none), ring (bool), scored (default true) }
     * Controller: el, setLabel, setScore(n, gained), setStreak(n), setLives(n), setTime(frac 0-1, text, low), pop(text, ok)
     */
    hud({ label = '', lives = 0, ring = false, scored = true, streak = true } = {}) {
      const q = h('span', { class: 'game-hud__q', dataset: { testid: 'game-progress' } }, label);
      const streakText = document.createTextNode(' Streak 0');
      const flameEl = h('span', { class: 'game-flame', dataset: { level: '0' } }, flame());
      const streakEl = streak ? h('span', { class: 'game-hud__streak', dataset: { testid: 'game-streak' } }, flameEl, streakText) : null;
      const scoreEl = h('strong', { dataset: { testid: 'game-score' } }, '0');
      const popLayer = h('span', { class: 'game-pop-layer', 'aria-hidden': 'true' });
      const scoreWrap = scored ? h('span', { class: 'game-hud__score' }, 'Score ', scoreEl, popLayer) : null;
      const hearts = lives ? Array.from({ length: lives }, () => h('span', { class: 'game-heart' }, heart())) : [];
      const heartsEl = lives ? h('span', { class: 'game-hearts', role: 'img', 'aria-label': `${lives} lives`, dataset: { testid: 'game-lives' } }, hearts) : null;

      const arc = ring ? svgEl('circle', { class: 'game-ring__arc', cx: '22', cy: '22', r: String(RING_R), fill: 'none', 'stroke-width': '4', 'stroke-linecap': 'round', 'stroke-dasharray': RING_C.toFixed(2), 'stroke-dashoffset': '0', transform: 'rotate(-90 22 22)' }) : null;
      const timeText = h('span', { class: 'game-ring__text', 'aria-hidden': 'true', dataset: { testid: 'game-time' } });
      const ringEl = ring ? h('span', { class: 'game-ring', role: 'img', 'aria-label': 'Countdown' },
        svgEl('svg', { viewBox: '0 0 44 44', width: '44', height: '44', 'aria-hidden': 'true' },
          svgEl('circle', { cx: '22', cy: '22', r: String(RING_R), fill: 'none', 'stroke-width': '4', class: 'game-ring__track' }), arc), timeText) : null;

      const sound = h('button', { class: 'icon-btn game-sound', type: 'button', dataset: { testid: 'game-sound' } });
      const paintSound = () => {
        const on = isSoundOn();
        sound.setAttribute('aria-pressed', String(on));
        sound.setAttribute('aria-label', on ? 'Sound on. Press to mute.' : 'Sound off. Press to turn on.');
        sound.title = on ? 'Sound on' : 'Sound off';
        sound.textContent = on ? '♪' : '♪̸';
        sound.classList.toggle('is-off', !on);
      };
      sound.addEventListener('click', () => { setSoundOn(!isSoundOn()); paintSound(); if (isSoundOn()) playTone('correct'); });
      paintSound();

      const el = h('div', { class: 'game-hud' }, q, streakEl, scoreWrap, heartsEl, ringEl, opts.sound ? sound : null);
      let prevLives = lives;
      const ctl = {
        el,
        setLabel(t) { q.textContent = t; },
        setScore(n) { scoreEl.textContent = Number(n).toLocaleString(); },
        setStreak(n) {
          streakText.textContent = ` Streak ${n}`;
          flameEl.dataset.level = String(n >= 10 ? 3 : n >= 5 ? 2 : n >= 3 ? 1 : 0);
        },
        setLives(n) {
          hearts.forEach((hEl, i) => {
            const alive = i < n;
            const was = i < prevLives;
            hEl.classList.toggle('is-lost', !alive);
            hEl.classList.remove('just-lost', 'just-gained');
            if (was && !alive) { void hEl.offsetWidth; hEl.classList.add('just-lost'); }
            if (!was && alive) { void hEl.offsetWidth; hEl.classList.add('just-gained'); }
          });
          prevLives = n;
          if (heartsEl) heartsEl.setAttribute('aria-label', `${n} ${n === 1 ? 'life' : 'lives'} left`);
        },
        setTime(frac, text, low = false) {
          if (!ringEl) return;
          const f = Math.min(1, Math.max(0, frac));
          arc.setAttribute('stroke-dashoffset', (RING_C * (1 - f)).toFixed(2));
          timeText.textContent = text;
          ringEl.classList.toggle('is-low', !!low);
        },
        /** Floating "+850" next to the score. */
        pop(text, ok = true) {
          if (shell.reduced() || !scoreWrap) return;
          const p = h('span', { class: ['game-pop', ok ? 'is-ok' : 'is-bad'] }, text);
          popLayer.append(p);
          setTimeout(() => p.remove(), 900);
        },
      };
      if (lives) ctl.setLives(lives);
      return ctl;
    },

    /**
     * End screen. { title, score (null when unscored), stats [{label, value, testid}], review (node), onAgain, note,
     *   results ([{ q, correct, skipped }] — wrong ones are remembered for Mistake Review) }
     * Saves the best score when `score` is a number.
     */
    end({ title = 'Game over', score = null, stats = [], review = null, onAgain, note = '', announce = '', results = null }) {
      shell.clearTimer(); shell.clearKeys();
      if (results) recordRound(user.email, test.code, results); // wrong answers feed Mistake Review (device-local only)
      let best = null;
      if (score !== null) best = saveBest(user.email, test.code, game.id, score);
      const stat = (s) => h('div', { class: 'game-stat' }, h('span', { class: 'game-stat__v', dataset: { testid: s.testid } }, s.value), h('span', { class: 'game-stat__l' }, s.label));
      const again = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'game-again' }, on: { click: () => onAgain() } }, game.againLabel || (game.scored === false ? 'Study again' : 'Play again'));
      shell.setStage(h('section', { class: 'game-card game-card--end', dataset: { testid: 'game-end' } },
        h('h1', { class: 'game-card__title', tabindex: '-1' }, title),
        score === null ? null : h('p', { class: 'game-score-big', dataset: { testid: 'game-final-score' } }, score.toLocaleString()),
        score === null ? null : (best.isBest && score > 0
          ? h('p', { class: 'game-best is-new', dataset: { testid: 'game-new-best' } }, 'New personal best!')
          : h('p', { class: 'game-best', dataset: { testid: 'game-best' } }, `Personal best: ${best.best.toLocaleString()}`)),
        stats.length ? h('div', { class: 'game-stats' }, stats.map(stat)) : null,
        note ? h('p', { class: 'game-note' }, note) : null,
        h('p', { class: 'game-note' }, game.scored === false ? 'Nothing here is scored or submitted.' : 'Game mode is practice — this score was not submitted.'),
        h('div', { class: 'game-actions' },
          again,
          h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'game-back' }, on: { click: () => shell.back() } }, 'Back to games'),
          studyBlocked ? null : h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'game-to-study' }, on: { click: () => shell.toStudy() } }, 'Switch to Study mode'),
          h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'game-home' }, on: { click: () => ctx.navigate('landing') } }, 'Home')),
        review ? [h('h2', { class: 'game-review__title' }, 'Review'), review] : null));
      shell.announce(announce || (score === null ? `${title}.` : `${title}. Score ${score}.`));
      if (score !== null && score > 0) shell.sound('win');
      shell.later(() => stage.querySelector('.game-card__title')?.focus({ preventScroll: true }));
    },
  };
  return shell;
}
