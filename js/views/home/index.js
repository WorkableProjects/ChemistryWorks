// Student home (V5-02, behind feature('studentHome')). Paints from local data at once, then updates when the server answers.
// Order: header band (avatar, greeting, level ring, code field) -> Up next -> In progress -> Results -> Practice (side column on wide screens).
// Contract testids: home, home-header, home-code-input, home-code-submit, up-next, continue-btn, in-progress, in-progress-<CODE>,
// remove-attempt-<CODE>, results-list, practice-shelf, sync-chip.

import { h, mount, icon, themeControl } from '../../ui.js';
import { getUser } from '../../lib/auth.js';
import { load, remove } from '../../lib/storage.js';
import { loadProfile, subscribeProfile } from '../../lib/profile.js';
import { getSyncState, onSyncState } from '../../lib/sync.js';
import { pickGreeting, firstNameOf } from '../../lib/greetings.js';
import { progressKey } from '../../lib/attempt.js';
import { getGame } from '../../lib/games/index.js';
import { paintHubUpNext, reminderBanner } from './upnext.js';
import { calendarStrip } from './calendar.js';
import { bell } from '../notifications.js';
import { feature } from '../../config.js';
import { elementTile, symbolOf, levelRing, trendLine, badgeShelf, syncChip, resultRow, modeLabel } from './parts.js';

const section = (title, testid, ...body) => h('section', { class: 'home-section', 'aria-label': title, dataset: { testid } },
  h('h2', { class: 'home-section__title' }, title), ...body);

function attemptRow(ctx, user, a, i, repaint) {
  const answered = a.answered || 0;
  const meta = [a.total > 0 ? `${answered} of ${a.total} answered` : `${answered} answered`, modeLabel(a.lastMode)].join(' · ');
  const open = () => ctx.openTest(a.code);
  return h('li', { class: 'row', dataset: { testid: `in-progress-${a.code}`, code: a.code } },
    elementTile(symbolOf(a.code), i + 1),
    h('div', { class: 'row__main' },
      h('span', { class: 'row__title' }, a.title || a.code),
      h('span', { class: 'row__meta' }, meta),
      a.newerOnServer ? h('span', { class: 'chip chip--info', dataset: { testid: `newer-${a.code}` } }, 'Newer work on another device') : null,
      h('span', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': a.percent || 0, 'aria-label': `${a.title || a.code} progress` },
        h('span', { class: 'bar__fill', style: { width: `${Math.max(0, Math.min(100, a.percent || 0))}%` } }))),
    h('div', { class: 'row__actions' },
      answered === 0 && !a.newerOnServer ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'aria-label': `Remove ${a.title || a.code}`, dataset: { testid: `remove-attempt-${a.code}` },
        on: { click: () => { remove(progressKey(user.email, a.code)); repaint(); } } }, 'Remove') : null,
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: `open-${a.code}` }, on: { click: open } }, answered > 0 || a.newerOnServer ? 'Continue' : 'Open')));
}

/** Tests with wrong answers saved on this device (feeds Mistake Review across tests). */
function mistakeRows(user, attempts) {
  return attempts.map((a) => ({ a, n: (load(progressKey(user.email, a.code), {}).wrong || []).length })).filter((x) => x.n > 0);
}

export function render(root, ctx, params = {}) {
  const user = getUser();
  if (!user) return undefined;
  const first = firstNameOf(user);
  const greeting = pickGreeting(new Date(), first); // picked once so repaints don't change it
  let profile = null;

  // ----- header (code field is created once so typing survives repaints) -----
  const input = h('input', { class: 'input home-code', name: 'code', placeholder: 'Test code', value: params.code || '', autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: 'false', 'aria-label': 'Test code', dataset: { testid: 'home-code-input' } });
  const err = h('p', { class: 'field-error home-code-error', role: 'alert', dataset: { testid: 'code-error' } }, params.error || '');
  const btn = h('button', { class: 'btn btn--primary', type: 'submit', dataset: { testid: 'home-code-submit' } }, 'Open');
  const form = h('form', { class: 'home-codeform', on: { submit: async (e) => {
    e.preventDefault();
    if (!input.value.trim()) { err.textContent = 'Enter the test code from your teacher'; input.focus(); return; }
    err.textContent = ''; btn.disabled = true;
    try { await ctx.openTest(input.value); } finally { btn.disabled = false; }
  } } }, input, btn);

  const chip = syncChip(getSyncState());
  const avatarSlot = h('div', { class: 'home-avatar' });
  const metaEl = h('p', { class: 'home-meta' });
  const ringSlot = h('div', { class: 'home-ring' });
  const header = h('header', { class: 'home-header', dataset: { testid: 'home-header' } },
    avatarSlot,
    h('div', { class: 'home-header__text' },
      h('h1', { class: 'home-greeting' }, greeting),
      h('div', { class: 'home-meta-row' }, metaEl, chip),
      h('div', { class: 'home-header__code' }, form, err)),
    ringSlot);

  const hubOn = feature('classHub');
  const bellEl = hubOn ? bell(ctx, () => (profile && profile.hub) || null) : null;
  const upnext = h('div', { id: 'home-upnext', class: 'home-upnext-slot' });
  const inprog = h('div', { class: 'home-slot' });
  const results = h('div', { class: 'home-slot' });
  const practice = h('div', { class: 'home-slot' });

  const topbar = h('div', { class: 'home-topbar' },
    h('a', { href: '?view=profile', class: 'btn btn--subtle btn--sm', dataset: { testid: 'profile-link' },
      on: { click: (e) => { e.preventDefault(); ctx.navigate('profile'); } } }, icon('user', { size: 16 }), 'Profile'),
    h('a', { href: '?admin=true', class: 'btn btn--subtle btn--sm', dataset: { testid: 'admin-link' } }, icon('home', { size: 16 }), 'Teacher'),
    hubOn ? bellEl : null, themeControl());

  const main = h('main', { class: 'home', dataset: { testid: 'home' } }, topbar, header,
    h('div', { class: 'home-grid' },
      h('div', { class: 'home-main' }, upnext, inprog, results),
      h('aside', { class: 'home-side' }, practice)));
  mount(root, main);

  // ----- painting -----
  function paintHeader(p) {
    avatarSlot.replaceChildren(p.picture
      ? h('img', { class: 'home-avatar__img', src: p.picture, alt: '', referrerpolicy: 'no-referrer' })
      : elementTile(symbolOf(p.name || p.email), null, { className: 'el-tile--lg' }));
    const names = p.classes.map((c) => c.name).join(', ');
    const streak = p.streakDays > 0 ? `${p.streakDays}-day streak` : '';
    if (hubOn && p.classes.length) {
      metaEl.replaceChildren(...p.classes.flatMap((c, i) => [i ? ', ' : '', h('a', { href: `?view=class&id=${encodeURIComponent(c.id)}`, dataset: { testid: `class-link-${c.id}` },
        on: { click: (e) => { e.preventDefault(); ctx.navigate('class', { id: c.id }); } } }, c.name)]), streak ? ` · ${streak}` : '');
    } else metaEl.textContent = [names, streak].filter(Boolean).join(' · ') || 'No classes yet';
    ringSlot.replaceChildren(levelRing(p));
  }

  function paintUpNext(p) {
    if (hubOn && p.hub && paintHubUpNext(upnext, ctx, p)) {
      const banner = reminderBanner(ctx, p); const cal = calendarStrip(p.hub);
      if (banner) upnext.prepend(banner);
      upnext.append(cal); return;
    }
    const a = p.inProgress.find((x) => x.answered > 0);
    if (!a) { upnext.replaceChildren(); upnext.removeAttribute('data-testid'); return; }
    upnext.dataset.testid = 'up-next';
    upnext.replaceChildren(h('h2', { class: 'home-section__title' }, 'Up next'),
      h('div', { class: 'row row--lead' },
        elementTile(symbolOf(a.code), null),
        h('div', { class: 'row__main' },
          h('span', { class: 'row__title' }, a.title || a.code),
          h('span', { class: 'row__meta' }, `${a.answered} of ${a.total || '?'} answered`)),
        h('button', { type: 'button', class: 'btn btn--primary btn--sm', dataset: { testid: 'continue-btn' }, on: { click: () => ctx.openTest(a.code) } }, 'Continue', icon('right', { size: 14 }))));
  }

  function paintInProgress(p) {
    if (!p.inProgress.length) { inprog.replaceChildren(); return; }
    inprog.replaceChildren(section('In progress', 'in-progress',
      h('ul', { class: 'rows' }, p.inProgress.map((a, i) => attemptRow(ctx, user, a, i, () => { paintAll(profile); })))));
  }

  function paintResults(p) {
    const shown = p.results.slice(0, 8);
    const released = p.results.filter((r) => r.released && r.percentage != null).slice(0, 10).reverse().map((r) => r.percentage);
    if (!shown.length) {
      results.replaceChildren(section('Results', 'results', h('p', { class: 'empty' }, 'Your results will show here after your first test')));
      return;
    }
    results.replaceChildren(section('Results', 'results', trendLine(released),
      h('ul', { class: 'rows', dataset: { testid: 'results-list' } }, shown.map((r, i) => resultRow(ctx, r, i))),
      p.results.length > shown.length ? h('a', { href: '?view=profile', class: 'home-more', on: { click: (e) => { e.preventDefault(); ctx.navigate('profile'); } } }, `All ${p.results.length} results`) : null));
  }

  function paintPractice(p) {
    const mistakes = mistakeRows(user, p.inProgress);
    const shelf = [];
    if (mistakes.length) {
      shelf.push(h('h3', { class: 'home-sub' }, 'Mistake review'),
        h('ul', { class: 'rows rows--tight' }, mistakes.map(({ a, n }) => h('li', { class: 'row row--small', dataset: { testid: `mistakes-${a.code}` } },
          h('div', { class: 'row__main' }, h('span', { class: 'row__title' }, a.title || a.code), h('span', { class: 'row__meta' }, `${n} to review`)),
          h('button', { type: 'button', class: 'btn btn--ghost btn--sm', on: { click: () => ctx.openTest(a.code) } }, 'Review')))));
    }
    if (p.bests.length) {
      shelf.push(h('h3', { class: 'home-sub' }, 'Game bests'),
        h('ul', { class: 'bests' }, p.bests.map((b) => h('li', { class: 'bests__row', dataset: { testid: `best-${b.code}-${b.game}` } },
          h('span', {}, `${(getGame(b.game) && getGame(b.game).title) || b.game || 'Game'} on ${b.code}`),
          h('span', { class: 'mono' }, b.score.toLocaleString())))));
    }
    shelf.push(h('h3', { class: 'home-sub' }, 'Badges'), badgeShelf(p.badges));
    practice.replaceChildren(section('Practice', 'practice-shelf', ...shelf));
  }

  function paintAll(p) {
    profile = p;
    if (bellEl) bellEl.update();
    paintHeader(p); paintUpNext(p); paintInProgress(p); paintResults(p); paintPractice(p);
  }

  const { profile: first0, done } = loadProfile(user, { onUpdate: (p) => { if (root.contains(main)) paintAll(p); } });
  paintAll(first0);
  done.then((p) => { if (p && root.contains(main)) paintAll(p); });
  const offSync = onSyncState((s) => chip.update(s));
  const offProfile = subscribeProfile(user, (p) => { if (root.contains(main)) paintAll(p); });

  if (params.error) err.textContent = params.error;
  setTimeout(() => {
    const idle = !document.activeElement || document.activeElement === document.body;
    if (idle && !document.querySelector('#modal-root .modal-overlay')) input.focus();
  }, 60);
  return () => { offSync(); offProfile(); };
}
