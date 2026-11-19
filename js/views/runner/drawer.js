// Question navigator: a docked left rail at 1024px and wider (open or closed choice remembered per device in
// `cw:navRail`), a bottom sheet with a backdrop below that.

import { h, icon } from '../../ui.js';
import { save } from '../../lib/storage.js';

function buildTileGrid(rt, makeTile) {
  const { groups, ordered } = rt;
  if (!groups.some((g) => g.section)) return h('div', { class: 'nav-grid' }, ordered.map(makeTile));
  // Tiles are grouped under section titles when the test has sections (numbers stay global).
  const wrap = h('div', { class: 'nav-groups' });
  let offset = 0;
  for (const g of groups) {
    const n = g.questions.length;
    if (!n) continue;
    const items = ordered.slice(offset, offset + n).map((q, k) => makeTile(q, offset + k));
    offset += n;
    wrap.appendChild(h('section', { class: 'nav-group', dataset: { sectionId: g.section ? g.section.id : '' }, 'aria-label': g.section ? g.section.title : 'General questions' },
      h('h3', { class: 'nav-group__title' }, g.section ? g.section.title : 'General'),
      h('div', { class: 'nav-grid' }, items)));
  }
  return wrap;
}

/**
 * Builds the drawer, its backdrop and the tiles.
 * Returns { drawer, overlay, tiles, counts, isRail, isOpen, openDrawer, closeDrawer }.
 */
export function createDrawer(rt) {
  const { ordered, state } = rt;
  const railMq = typeof matchMedia === 'function' ? matchMedia('(min-width: 1024px)') : null;
  const isRail = () => !!railMq?.matches;
  let drawerOpen = false;
  const tiles = new Map();
  const counts = { answered: h('b', {}), flagged: h('b', {}), unanswered: h('b', {}) };

  const makeTile = (q, i) => {
    const t = h('button', {
      type: 'button', class: 'nav-tile', dataset: { testid: `nav-item-${q.id}` },
      on: { click: () => {
        rt.goTo(i, { focus: true });
        if (!isRail()) closeDrawer(); // bottom sheet closes on pick; the desktop rail stays docked
      } },
    }, String(i + 1));
    tiles.set(q.id, t);
    return t;
  };
  const tileGrid = buildTileGrid(rt, makeTile);
  const drawerClose = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close navigator', on: { click: () => closeDrawer({ remember: true }) } }, icon('x'));
  const drawer = h('aside', { class: 'nav-drawer', id: 'runner-navigator', 'aria-label': 'Question navigator', dataset: { testid: 'navigator' } },
    h('div', { class: 'nav-drawer__grip', 'aria-hidden': 'true' }),
    h('div', { class: 'nav-drawer__head' }, h('h2', {}, 'Questions'), drawerClose),
    h('div', { class: 'nav-drawer__body' },
      h('div', { class: 'nav-counts' },
        h('span', { class: 'nav-count nav-count--answered' }, counts.answered, ' answered'),
        h('span', { class: 'nav-count nav-count--flagged' }, counts.flagged, ' flagged'),
        h('span', { class: 'nav-count' }, counts.unanswered, ' unanswered')),
      tileGrid,
      h('ul', { class: 'nav-legend' },
        h('li', {}, h('i', { class: 'nav-key nav-key--answered' }), 'Answered'),
        h('li', {}, h('i', { class: 'nav-key nav-key--flagged' }), 'Flagged'),
        h('li', {}, h('i', { class: 'nav-key nav-key--current' }), 'Current'))),
    h('div', { class: 'nav-drawer__foot' },
      h('button', { type: 'button', class: 'btn btn--primary btn--block', dataset: { testid: 'navigator-submit' }, on: { click: () => rt.openSubmit() } }, 'Submit test')));
  drawer.inert = true;
  const overlay = h('div', { class: 'nav-overlay', on: { click: () => closeDrawer({ remember: true }) } });

  // `remember: true` marks a deliberate open/close by the student (stored for the desktop rail); programmatic
  // closes (submit, cleanup) never change the stored preference.
  function openDrawer({ remember = false, restore = false } = {}) {
    if (drawerOpen) return;
    if (remember && isRail()) save('navRail', { open: true });
    drawerOpen = true;
    drawer.inert = false;
    drawer.classList.add('is-open');
    rt.runnerEl.classList.add('is-drawer-open');
    overlay.classList.add('is-open');
    rt.navToggle.setAttribute('aria-expanded', 'true');
    if (!restore) setTimeout(() => tiles.get(ordered[state.index].id)?.focus({ preventScroll: true }), 60);
  }
  function closeDrawer({ remember = false } = {}) {
    if (!drawerOpen) return;
    if (remember && isRail()) save('navRail', { open: false });
    drawerOpen = false;
    const hadFocus = drawer.contains(document.activeElement);
    drawer.classList.remove('is-open');
    rt.runnerEl.classList.remove('is-drawer-open');
    overlay.classList.remove('is-open');
    drawer.inert = true;
    rt.navToggle.setAttribute('aria-expanded', 'false');
    if (hadFocus) rt.navToggle.focus({ preventScroll: true });
  }
  return { drawer, overlay, tiles, counts, isRail, isOpen: () => drawerOpen, openDrawer, closeDrawer };
}
