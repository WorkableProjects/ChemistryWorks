// Student profile (?view=profile, behind feature('studentHome')): stats from released results only, badges, history,
// an `#profile-appearance` slot (S10 fills it) and sign out. Paints local data first, updates when the server answers.

import { h, mount, icon } from '../ui.js';
import { getUser } from '../lib/auth.js';
import { loadProfile, subscribeProfile } from '../lib/profile.js';
import { getSyncState, onSyncState } from '../lib/sync.js';
import { elementTile, symbolOf, levelRing, badgeShelf, syncChip, resultRow } from './home/parts.js';

/** Accuracy by topic: the server's `stats.topics` ({ topic: percent } or [{ topic, percent }]) when present, else by test. Released only. */
function accuracyRows(p) {
  const t = p.stats && p.stats.topics;
  const rows = [];
  if (Array.isArray(t)) for (const x of t) { if (x && x.topic != null && Number.isFinite(Number(x.percent))) rows.push([String(x.topic), Number(x.percent)]); }
  else if (t && typeof t === 'object') for (const [k, v] of Object.entries(t)) { const n = typeof v === 'object' && v ? Number(v.percent) : Number(v); if (Number.isFinite(n)) rows.push([k, n]); }
  if (rows.length) return { label: 'Accuracy by topic', rows };
  const byTest = new Map();
  for (const r of p.results) if (r.released && r.percentage != null && !byTest.has(r.code)) byTest.set(r.code, [r.title, r.percentage]);
  return { label: 'Accuracy by test', rows: [...byTest.values()] };
}

export function render(root, ctx) {
  const user = getUser();
  if (!user) { ctx.navigate('landing'); return undefined; }
  let alive = true;
  const chip = syncChip(getSyncState());
  const body = h('div', { class: 'profile-body' });
  const appearance = h('section', { class: 'home-section', 'aria-label': 'Appearance' },
    h('h2', { class: 'home-section__title' }, 'Appearance'), h('div', { id: 'profile-appearance', dataset: { testid: 'profile-appearance' } }));
  const main = h('main', { class: 'home home--profile', dataset: { testid: 'profile' } },
    h('div', { class: 'home-topbar' },
      h('button', { type: 'button', class: 'btn btn--subtle btn--sm', dataset: { testid: 'profile-back' }, on: { click: () => ctx.navigate('landing') } }, icon('left', { size: 16 }), 'Home'),
      chip),
    body);
  mount(root, main);

  function paint(p) {
    const released = p.results.filter((r) => r.released && r.percentage != null);
    const avg = released.length ? Math.round(released.reduce((s, r) => s + r.percentage, 0) / released.length) : null;
    const acc = accuracyRows(p);
    const stat = (label, value, testid) => h('div', { class: 'stat', dataset: { testid } }, h('dt', { class: 'stat__label' }, label), h('dd', { class: 'stat__value' }, value));
    body.replaceChildren(
      h('header', { class: 'home-header' },
        p.picture ? h('div', { class: 'home-avatar' }, h('img', { class: 'home-avatar__img', src: p.picture, alt: '', referrerpolicy: 'no-referrer' }))
          : h('div', { class: 'home-avatar' }, elementTile(symbolOf(p.name || p.email), null, { className: 'el-tile--lg' })),
        h('div', { class: 'home-header__text' },
          h('h1', { class: 'home-greeting' }, p.name || p.email),
          h('p', { class: 'home-meta' }, [p.email, p.streakDays > 0 ? `${p.streakDays}-day streak` : ''].filter(Boolean).join(' · '))),
        h('div', { class: 'home-ring' }, levelRing(p))),
      h('section', { class: 'home-section', 'aria-label': 'Stats', dataset: { testid: 'profile-stats' } },
        h('h2', { class: 'home-section__title' }, 'Stats'),
        h('dl', { class: 'stats' },
          stat('Tests done', String(p.results.length), 'stat-tests'),
          stat('Average', avg == null ? 'None yet' : `${avg}%`, 'stat-average'),
          stat('Badges', `${p.badges.length}`, 'stat-badges')),
        acc.rows.length ? h('div', { class: 'accuracy' }, h('h3', { class: 'home-sub' }, acc.label),
          h('ul', { class: 'accuracy__list' }, acc.rows.map(([name, pct]) => h('li', { class: 'accuracy__row' },
            h('span', { class: 'accuracy__name' }, name),
            h('span', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pct), 'aria-label': `${name} accuracy` },
              h('span', { class: 'bar__fill', style: { width: `${Math.max(0, Math.min(100, pct))}%` } })),
            h('span', { class: 'mono' }, `${Math.round(pct)}%`))))) : null,
        p.results.length > released.length ? h('p', { class: 'home-note' }, 'Stats use released results only') : null),
      h('section', { class: 'home-section', 'aria-label': 'Badges', dataset: { testid: 'profile-badges' } },
        h('h2', { class: 'home-section__title' }, 'Badges'), badgeShelf(p.badges, { testid: 'profile-badge-shelf' })),
      h('section', { class: 'home-section', 'aria-label': 'History', dataset: { testid: 'profile-history' } },
        h('h2', { class: 'home-section__title' }, 'History'),
        p.results.length ? h('ul', { class: 'rows' }, p.results.map((r, i) => resultRow(ctx, r, i)))
          : h('p', { class: 'empty' }, 'Your submitted tests will show here')),
      appearance,
      h('div', { class: 'profile-foot' },
        h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'sign-out' }, on: { click: () => ctx.signOut() } }, icon('logout', { size: 16 }), 'Sign out')));
  }

  const { profile, done } = loadProfile(user, { onUpdate: (p) => { if (alive) paint(p); } });
  paint(profile);
  done.then((p) => { if (alive && p) paint(p); });
  const offSync = onSyncState((s) => chip.update(s));
  const offProfile = subscribeProfile(user, (p) => { if (alive) paint(p); });
  return () => { alive = false; offSync(); offProfile(); };
}
