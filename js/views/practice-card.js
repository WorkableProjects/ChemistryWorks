// Assigned practice: "Play Survival on CHEM101 and reach 2,000", from test.practice = [{ game, target, due? }].
// practiceCard({ ctx, user }) -> Node | null. Looks at the tests this student has opened on this device (progress and
// submitted results), loads at most 6 of them, and lists their practice items with the student's best score.
// Completion is local (best scores live on this device) unless the test's leaderboard is on.

import { h, icon } from '../ui.js';
import { keys, load } from '../lib/storage.js';
import { getLocalResults } from '../lib/submit.js';
import { loadTest } from '../lib/tests.js';
import { practiceItems } from '../lib/xp.js';
import { modeById as getGame } from '../lib/modes/index.js';
import { loadModeBest as loadBest } from '../lib/modes/common.js';

function knownCodes(user) {
  const email = String(user.email || '').toLowerCase();
  const prefix = `progress:${user.email}:`;
  const fromProgress = keys(prefix).map((k) => k.slice(prefix.length));
  const fromResults = getLocalResults().filter((r) => String(r.student_email || '').toLowerCase() === email).map((r) => r.test_code);
  return [...new Set([...fromProgress, ...fromResults].filter(Boolean))].slice(0, 6);
}

export function practiceCard({ ctx, user }) {
  if (!user) return null;
  const codes = knownCodes(user);
  if (!codes.length) return null;
  const card = h('section', { class: 'card practice-card', hidden: true, 'aria-label': 'Assigned practice', dataset: { testid: 'practice-card' } });
  Promise.all(codes.map((c) => loadTest(c, { config: ctx.config }).then((r) => r.test).catch(() => null))).then((tests) => {
    const items = practiceItems(tests.filter(Boolean), (code, gameId) => loadBest(user.email, code, gameId));
    if (!items.length) return;
    card.hidden = false;
    card.replaceChildren(
      h('h3', { class: 'tests-block__title' }, icon('gamepad', { size: 18 }), ' Assigned practice'),
      h('ul', { class: 'practice-list' }, items.map((it) => {
        const game = getGame(it.game);
        const goal = it.target > 0 ? `reach ${it.target.toLocaleString()}` : 'play a round';
        return h('li', { class: 'practice-item', dataset: { testid: `practice-${it.code}-${it.game}` } },
          h('div', { class: 'practice-item__main' },
            h('strong', {}, `${game ? game.title : it.game} on ${it.title}`),
            h('span', { class: 'muted' }, ` — ${goal}${it.due ? ` by ${new Date(it.due).toLocaleDateString(undefined, { dateStyle: 'medium' })}` : ''}`)),
          h('span', { class: ['pill', it.done ? 'pill--success' : it.overdue ? 'pill--danger' : 'pill--primary'], dataset: { testid: 'practice-status' } },
            it.done ? 'Done' : it.overdue ? 'Overdue' : it.best ? `Best ${it.best.toLocaleString()}` : 'To do'),
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `practice-play-${it.code}-${it.game}` },
            on: { click: () => ctx.navigate('game', { test: it.test, source: 'practice', gameId: it.game, cleared: true }) } }, 'Play'));
      })));
  });
  return card;
}
