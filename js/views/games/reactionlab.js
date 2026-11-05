// Reaction Lab board: balance equations with coefficient steppers (keyboard: Tab between boxes, ↑/↓ or type), and at the
// top level predict the product. 90-second clock, or 8 reactions with no clock in relaxed mode.

import { h } from '../../ui.js';
import { formulaToHTML } from '../../lib/formula.js';
import { generateLab, labLevel, checkLab, labPoints, equationText, LAB_SECONDS, UNTIMED_REACTIONS } from '../../lib/games/reactionlab.js';
import { secondsLeft } from '../../lib/games/lightning.js';

const formula = (f) => h('span', { class: 'formula', html: formulaToHTML(f) });

export function play(shell) {
  const total = shell.opts.totalSeconds || LAB_SECONDS;
  let g = null;

  function intro() {
    shell.intro({
      rules: () => [
        shell.untimed() ? `${UNTIMED_REACTIONS} reactions, no clock.` : `${total} seconds on the clock.`,
        'Set the coefficients so both sides have the same atoms (lowest whole numbers), then press Check.',
        'Every three right answers unlock harder reactions; at the top level you also predict products.',
        'Streaks add a bonus. A wrong answer resets your streak.',
      ],
      notes: [h('p', { class: 'game-note' }, 'Built-in reactions, so it works on any test.')],
      onStart: begin,
    });
  }

  function begin() {
    const untimed = shell.untimed();
    g = { score: 0, streak: 0, bestStreak: 0, answered: 0, correct: 0, used: [], startedAt: performance.now(), over: false, untimed };
    const hud = shell.hud({ label: untimed ? `Reaction 1 of ${UNTIMED_REACTIONS}` : 'Reaction Lab', ring: !untimed });
    hud.setScore(0); hud.setStreak(0);
    const slot = h('div', { class: 'lab-slot' });
    const msg = h('p', { class: 'game-lightning__msg', 'aria-live': 'polite', dataset: { testid: 'lab-msg' } });
    shell.setStage(h('section', { class: 'game-play', 'aria-label': 'Reaction Lab' }, hud.el, slot, msg));
    const paint = () => {
      if (g.untimed) return Infinity;
      const s = secondsLeft(performance.now() - g.startedAt, 0, total);
      hud.setTime(s / total, String(Math.ceil(s)), s <= 10);
      return s;
    };
    if (!g.untimed) { paint(); shell.setTimer(() => { if (!g.over && paint() <= 0) finish(); }, shell.reduced() ? 500 : 100); }

    let q = null;
    function next() {
      if (g.over) return;
      if (g.untimed && g.answered >= UNTIMED_REACTIONS) { finish(); return; }
      q = generateLab(labLevel(g.correct), Math.random, g.used);
      g.used.push(q.id);
      if (g.untimed) hud.setLabel(`Reaction ${g.answered + 1} of ${UNTIMED_REACTIONS}`);
      if (q.kind === 'predict') {
        slot.replaceChildren(h('div', { class: 'game-q', dataset: { testid: 'lab-question', kind: 'predict' } },
          h('p', { class: 'game-q__text' }, 'Predict the missing product: ', q.reactants.map((f, i) => [i ? ' + ' : '', formula(f)]), ' → ', q.shown.map((f) => [formula(f), ' + ']), '?'),
          h('div', { class: 'game-options', role: 'group', 'aria-label': 'Products' }, q.options.map((o, i) => h('button', {
            class: `game-tile game-tile--${i % 4}`, type: 'button', dataset: { testid: `lab-option-${i}` }, on: { click: () => submit(o) } }, formula(o))))));
        shell.later(() => slot.querySelector('button')?.focus());
      } else {
        const n = q.reactants.length + q.products.length;
        const boxes = Array.from({ length: n }, (_, i) => h('input', {
          class: 'input lab-coef', type: 'number', min: 1, max: 12, value: 1, inputmode: 'numeric',
          'aria-label': `Coefficient for ${i < q.reactants.length ? q.reactants[i] : q.products[i - q.reactants.length]}`, dataset: { testid: `lab-coef-${i}` },
        }));
        const term = (f, i) => h('span', { class: 'lab-term' }, boxes[i], formula(f));
        const form = h('form', { class: 'lab-bench', on: { submit: (e) => { e.preventDefault(); submit(boxes.map((b) => Math.round(Number(b.value) || 0))); } } },
          h('p', { class: 'lab-eq', dataset: { testid: 'lab-question', kind: 'balance' } },
            q.reactants.map((f, i) => [i ? h('span', { class: 'lab-plus' }, '+') : null, term(f, i)]),
            h('span', { class: 'lab-arrow', 'aria-label': 'yields' }, '→'),
            q.products.map((f, j) => [j ? h('span', { class: 'lab-plus' }, '+') : null, term(f, q.reactants.length + j)])),
          h('button', { class: 'btn btn--primary btn--lg', type: 'submit', dataset: { testid: 'lab-check' } }, 'Check'));
        slot.replaceChildren(form);
        shell.later(() => boxes[0].focus());
      }
      shell.announce(q.kind === 'predict' ? 'Predict the product.' : `Balance: ${equationText(q)}`);
    }

    function submit(answer) {
      if (g.over || !q) return;
      const ok = checkLab(q, answer);
      g.answered++;
      if (ok) {
        const pts = labPoints(q.level, g.streak);
        g.score += pts; g.streak++; g.correct++; g.bestStreak = Math.max(g.bestStreak, g.streak);
        hud.pop(`+${pts}`); msg.textContent = '';
      } else {
        g.streak = 0;
        msg.textContent = q.kind === 'predict' ? `Not quite: ${q.answer}. ${q.note || ''}` : `Not quite: ${equationText(q, q.coeffs)}`;
      }
      hud.setScore(g.score); hud.setStreak(g.streak);
      shell.flash(ok); shell.sound(ok ? 'correct' : 'wrong');
      shell.announce(ok ? `Balanced. Score ${g.score}.` : msg.textContent);
      q = null;
      slot.querySelectorAll('input, button').forEach((el) => el.setAttribute('disabled', ''));
      shell.later(next, shell.reduced() ? 200 : ok ? 400 : 1400);
    }

    function finish() {
      if (g.over) return;
      g.over = true;
      shell.end({
        title: g.untimed ? 'Lab closed!' : "Time's up!", score: g.score,
        stats: [
          { label: 'Reactions', value: String(g.answered), testid: 'game-answered' },
          { label: 'Correct', value: `${g.correct} / ${g.answered}`, testid: 'game-correct' },
          { label: 'Best streak', value: String(g.bestStreak), testid: 'game-best-streak' },
        ],
        onAgain: begin, announce: `Round over. Score ${g.score}.`,
      });
    }
    next();
  }
  intro();
}
