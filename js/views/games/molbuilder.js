// Molecule Builder board: add atoms from a palette (buttons, keyboard friendly) to match the target, then pick its shape.
// Faster builds score more. 90-second clock, or 8 molecules with no clock in relaxed mode.

import { h } from '../../ui.js';
import { formulaToHTML } from '../../lib/formula.js';
import { generateMolecule, moleculeLevel, checkBuild, checkShape, builtText, buildPoints, BUILD_SECONDS, UNTIMED_MOLECULES, SHAPE_POINTS } from '../../lib/games/molbuilder.js';
import { secondsLeft } from '../../lib/games/lightning.js';

export function play(shell) {
  const total = shell.opts.totalSeconds || BUILD_SECONDS;
  let g = null;

  function intro() {
    shell.intro({
      rules: () => [
        shell.untimed() ? `${UNTIMED_MOLECULES} molecules, no clock.` : `${total} seconds on the clock.`,
        'Add atoms with the + buttons (− removes one), then press Build.',
        `A right build scores points (faster is better), then name its shape for ${SHAPE_POINTS} more.`,
        'Molecules get harder as you go.',
      ],
      notes: [h('p', { class: 'game-note' }, 'Built-in molecules, so it works on any test.')],
      onStart: begin,
    });
  }

  function begin() {
    const untimed = shell.untimed();
    g = { score: 0, streak: 0, built: 0, shapes: 0, tries: 0, used: [], startedAt: performance.now(), over: false, untimed };
    const hud = shell.hud({ label: untimed ? `Molecule 1 of ${UNTIMED_MOLECULES}` : 'Molecule Builder', ring: !untimed });
    hud.setScore(0); hud.setStreak(0);
    const slot = h('div', { class: 'mol-slot' });
    const msg = h('p', { class: 'game-lightning__msg', 'aria-live': 'polite', dataset: { testid: 'mol-msg' } });
    shell.setStage(h('section', { class: 'game-play', 'aria-label': 'Molecule Builder' }, hud.el, slot, msg));
    const paint = () => {
      if (g.untimed) return Infinity;
      const s = secondsLeft(performance.now() - g.startedAt, 0, total);
      hud.setTime(s / total, String(Math.ceil(s)), s <= 10);
      return s;
    };
    if (!g.untimed) { paint(); shell.setTimer(() => { if (!g.over && paint() <= 0) finish(); }, shell.reduced() ? 500 : 100); }

    function next() {
      if (g.over) return;
      if (g.untimed && g.tries >= UNTIMED_MOLECULES) { finish(); return; }
      const m = generateMolecule(moleculeLevel(g.built), Math.random, g.used);
      g.used.push(m.target.formula);
      if (g.untimed) hud.setLabel(`Molecule ${g.tries + 1} of ${UNTIMED_MOLECULES}`);
      const started = performance.now();
      const counts = Object.fromEntries(m.palette.map((s) => [s, 0]));
      const built = h('p', { class: 'mol-built', 'aria-live': 'polite', dataset: { testid: 'mol-built' } });
      const paintBuilt = () => { const t = builtText(counts, m.palette); built.replaceChildren('Your molecule: ', t ? h('span', { class: 'formula', html: formulaToHTML(t) }) : '—'); };
      const row = (s) => {
        const n = h('span', { class: 'mol-count', dataset: { testid: `mol-count-${s}` } }, '0');
        const set = (d) => { counts[s] = Math.max(0, Math.min(8, counts[s] + d)); n.textContent = String(counts[s]); paintBuilt(); };
        return h('div', { class: 'mol-atom' }, h('span', { class: 'mol-symbol' }, s),
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-label': `Remove ${s}`, dataset: { testid: `mol-minus-${s}` }, on: { click: () => set(-1) } }, '−'), n,
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-label': `Add ${s}`, dataset: { testid: `mol-plus-${s}` }, on: { click: () => set(1) } }, '+'));
      };
      const build = h('button', { class: 'btn btn--primary btn--lg', type: 'button', dataset: { testid: 'mol-build' }, on: { click: () => {
        g.tries++;
        if (!checkBuild(m.target, counts)) {
          g.streak = 0; hud.setStreak(0); shell.flash(false); shell.sound('wrong');
          msg.textContent = `Not quite: ${m.target.name} is ${m.target.formula}.`; shell.announce(msg.textContent);
          slot.querySelectorAll('button').forEach((b) => b.setAttribute('disabled', ''));
          shell.later(next, shell.reduced() ? 200 : 1400); return;
        }
        const pts = buildPoints({ seconds: (performance.now() - started) / 1000, untimed: g.untimed, streak: g.streak });
        g.score += pts; g.built++; g.streak++; hud.setScore(g.score); hud.setStreak(g.streak); hud.pop(`+${pts}`);
        shell.flash(true); shell.sound('correct'); msg.textContent = 'Built! Now pick its shape.';
        slot.replaceChildren(h('div', { class: 'game-q', dataset: { testid: 'mol-shape-step' } },
          h('p', { class: 'game-q__text' }, 'What shape is ', h('span', { class: 'formula', html: formulaToHTML(m.target.formula) }), '?'),
          h('div', { class: 'game-options', role: 'group', 'aria-label': 'Shapes' }, m.shapeOptions.map((s, i) => h('button', {
            class: `game-tile game-tile--${i % 4}`, type: 'button', dataset: { testid: `mol-shape-${i}` }, on: { click: () => {
              const ok = checkShape(m.target, s);
              if (ok) { g.score += SHAPE_POINTS; g.shapes++; hud.setScore(g.score); hud.pop(`+${SHAPE_POINTS}`); msg.textContent = ''; }
              else msg.textContent = `It is ${m.target.shape}.`;
              shell.flash(ok); shell.sound(ok ? 'correct' : 'wrong'); shell.announce(ok ? 'Right shape.' : msg.textContent);
              slot.querySelectorAll('button').forEach((b) => b.setAttribute('disabled', ''));
              shell.later(next, shell.reduced() ? 200 : ok ? 400 : 1200);
            } } }, s)))));
        shell.later(() => slot.querySelector('button')?.focus());
      } } }, 'Build');
      slot.replaceChildren(h('div', { class: 'game-q', dataset: { testid: 'mol-question' } },
        h('p', { class: 'game-q__text' }, m.prompt), h('div', { class: 'mol-palette' }, m.palette.map(row)), built, build));
      paintBuilt();
      shell.later(() => slot.querySelector('[data-testid^="mol-plus-"]')?.focus());
      shell.announce(m.prompt);
    }

    function finish() {
      if (g.over) return;
      g.over = true;
      shell.end({
        title: g.untimed ? 'All built!' : "Time's up!", score: g.score,
        stats: [
          { label: 'Built', value: `${g.built} / ${g.tries}`, testid: 'game-correct' },
          { label: 'Shapes right', value: String(g.shapes), testid: 'game-shapes' },
        ],
        onAgain: begin, announce: `Round over. Score ${g.score}.`,
      });
    }
    next();
  }
  intro();
}
