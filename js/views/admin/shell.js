// Admin shell (V4-01, behind true): Classroom-style top bar, left sidebar, in-test tabs, profile menu.
// js/views/admin.js owns the views and the routing; this module only builds the frame and reports clicks.
//
// Extending the navigation (S11 Bank/Classes, S13 Live/...): call registerNavItem({ id, label, icon, group, render })
// once at import time. `render(host, ctx, helpers) -> cleanup?` mounts the view; an item without `render` (and not built in)
// stays hidden, so entries for views that do not exist yet cost nothing.

import { h, icon, brandLogo, themeControl } from '../../ui.js';
import { load, save } from '../../lib/storage.js';
import { getUser } from '../../lib/auth.js';

import { THEMES, getThemePref, setThemePref, onThemeChange, prefersReducedMotion } from '../../lib/theme.js';

/* ------------------------------------------------------------------ nav model (pure) */

export const NAV_GROUPS = [
  { id: 'teaching', label: 'Teaching' },
  { id: 'tools', label: 'Tools' },
  { id: 'bottom', label: '' },
];

/** `builtin: true` = admin.js renders it. Others appear once a `render` function is registered. */
export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home', group: 'teaching', builtin: true },
  { id: 'library', label: 'Library', icon: 'list', group: 'teaching', builtin: true },
  { id: 'builder', label: 'Builder', icon: 'grid', group: 'teaching', builtin: true },
  { id: 'grading', label: 'Grading', icon: 'pen', group: 'teaching', builtin: true },
  { id: 'bank', label: 'Question bank', icon: 'layers', group: 'tools' },     // render registered in js/views/admin.js
  { id: 'classes', label: 'Classes', icon: 'user', group: 'tools' },
  { id: 'accommodations', label: 'Accommodations', icon: 'user', group: 'tools' },
  { id: 'live', label: 'Live monitor', icon: 'clock', group: 'tools' },
  { id: 'import', label: 'Import & templates', icon: 'upload', group: 'tools' },
  { id: 'settings', label: 'Settings', icon: 'key', group: 'bottom', builtin: true },
];

/** Add or replace a navigation entry (keeps the position of an existing id). */
export function registerNavItem(item, items = NAV_ITEMS) {
  if (!item || !item.id) return items;
  const i = items.findIndex((x) => x.id === item.id);
  if (i >= 0) items[i] = { ...items[i], ...item };
  else items.push({ group: 'tools', icon: 'grid', label: item.id, ...item });
  return items;
}

export const isAvailable = (item) => !!item && (item.builtin === true || typeof item.render === 'function');

/** Sidebar groups with only the entries that can open: [{ id, label, items }], empty groups dropped. */
export function navGroups(items = NAV_ITEMS) {
  return NAV_GROUPS.map((g) => ({ ...g, items: items.filter((x) => x.group === g.id && isAvailable(x) && !x.hidden) })).filter((g) => g.items.length);
}

/**
 * Sidebar layout for a viewport width. `pref` is the remembered collapsed flag (true / false / null = automatic).
 * -> { mode: 'full' | 'rail' | 'drawer', open }   full >= 1200, rail (icons only) 768-1199, drawer < 768.
 */
export function navLayout(width, pref = null, drawerOpen = false) {
  const w = Number(width) || 0;
  if (w < 768) return { mode: 'drawer', open: !!drawerOpen };
  const collapsed = typeof pref === 'boolean' ? pref : w < 1200;
  return { mode: collapsed ? 'rail' : 'full', open: true };
}

/** The in-test tabs and the sidebar section each one opens. */
export const TEST_TABS = [
  { id: 'overview', label: 'Overview', section: 'library' },
  { id: 'questions', label: 'Questions', section: 'builder' },
  { id: 'submissions', label: 'Submissions', section: 'grading' },
  { id: 'settings', label: 'Settings', section: 'builder', focus: 'settings' },
];
const TEST_SECTIONS = ['builder', 'grading'];

/** In-test tabs show while a test is in focus inside one of the test-related sections. */
export function showTestTabs(section, testCode) {
  return !!String(testCode || '').trim() && TEST_SECTIONS.includes(section);
}
/** Which in-test tab is active for a section (a clicked "Settings" tab stays active inside the builder). */
export function testTabFor(section, current = '') {
  if (current === 'settings' && section === 'builder') return 'settings';
  return (TEST_TABS.find((t) => t.section === section && !t.focus) || TEST_TABS[0]).id;
}

/** Breadcrumb parts: ChemWorks › Section › Test code. */
export function breadcrumbFor(items, section, testCode = '') {
  const it = items.find((x) => x.id === section);
  const parts = [{ label: 'ChemWorks', id: 'dashboard' }];
  if (it && section !== 'dashboard') parts.push({ label: it.label, id: section });
  else if (it) parts.push({ label: it.label, id: 'dashboard' });
  if (showTestTabs(section, testCode)) parts.push({ label: String(testCode).trim(), id: null });
  return parts;
}

export function initialsOf(name, email = '') {
  const src = String(name || '').trim() || String(email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  if (!src) return '?';
  const parts = src.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
}
/** Stable 0-3 colour index for the initials circle. */
export function avatarTone(seed) {
  let n = 0;
  for (const ch of String(seed || '?')) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return n % 4;
}

/* ------------------------------------------------------------------ stylesheet */

let cssPromise = null;
/** Load css/admin-shell.css once (index.html does not need to list it). Resolves when applied, or after a short timeout. */
export function ensureShellCss() {
  if (cssPromise) return cssPromise;
  cssPromise = new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve();
    const href = new URL('../../../css/admin-shell.css', import.meta.url).href;
    const existing = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.getAttribute('href') === 'css/admin-shell.css' || l.href === href);
    const link = existing || h('link', { rel: 'stylesheet', href });
    if (!existing) document.head.appendChild(link);
    else if (link.sheet) return resolve();
    const done = () => resolve();
    link.addEventListener('load', done, { once: true });
    link.addEventListener('error', done, { once: true });
    setTimeout(done, 1500);
  });
  return cssPromise;
}

/* ------------------------------------------------------------------ the shell */

/**
 * buildAdminShell({ items, current, onNavigate, onTestTab, onHome, onSignOut, onRecent, getTestCode, newBtn, sheetLink, lockBtn })
 *  -> { el, panel, setCurrent(section, { testTab }), setRecent(codes), refreshTabs(), closeDrawer(), destroy() }
 * `el` holds the whole page (top bar, sidebar, content). Mount it, then put views into `panel`.
 */
export function buildAdminShell({ items = NAV_ITEMS, current = 'dashboard', onNavigate, onTestTab, onHome, onSignOut, onRecent, getTestCode = () => '', newBtn = null, sheetLink = null, lockBtn = null } = {}) {
  const st = { section: current, testTab: '', pref: (() => { const v = load('adminNav', null); return typeof v === 'boolean' ? v : (v && typeof v.collapsed === 'boolean' ? v.collapsed : null); })(), drawer: false, recent: [] };
  if (st.pref && typeof st.pref === 'object') st.pref = typeof st.pref.collapsed === 'boolean' ? st.pref.collapsed : null;
  else if (typeof st.pref !== 'boolean') st.pref = null;
  const cleanups = [];
  const motion = true;
  const reduced = () => { try { return prefersReducedMotion(); } catch { return false; } };

  /* ---- top bar ---- */
  const toggle = h('button', { class: 'ash-icon-btn', type: 'button', 'aria-label': 'Toggle navigation menu', 'aria-controls': 'ash-sidebar', 'aria-expanded': 'true', dataset: { testid: 'admin-nav-toggle' },
    on: { click: () => toggleNav() } }, icon('menu', { size: 22 }));
  const brand = h('button', { class: 'brand ash-brand', type: 'button', 'aria-label': 'ChemWorks home', dataset: { testid: 'brand' }, on: { click: () => onHome?.() } },
    brandLogo('mark', { className: 'ash-brand__mark' }), h('span', { class: 'ash-brand__name' }, h('span', { class: 'brand-logo__chem' }, 'Chem'), h('span', { class: 'brand-logo__works' }, 'Works')));
  const crumbs = h('ol', { class: 'ash-crumbs' });
  const crumbNav = h('nav', { class: 'ash-crumbnav', 'aria-label': 'Breadcrumb', dataset: { testid: 'admin-breadcrumb' } }, crumbs);

  // profile
  const user = getUser();
  const displayName = (user && (user.name || user.email)) || 'Administrator';
  const avatarEl = () => (user && user.picture
    ? h('img', { class: 'ash-avatar ash-avatar--img', src: user.picture, alt: '', referrerpolicy: 'no-referrer' })
    : h('span', { class: `ash-avatar ash-avatar--${avatarTone(displayName)}`, 'aria-hidden': 'true' }, initialsOf(user && user.name, user && user.email)));
  const themeBtns = THEMES.map((t) => h('button', { class: 'ash-seg__btn', type: 'button', role: 'radio', dataset: { testid: `admin-theme-${t}` }, on: { click: () => setThemePref(t) } },
    icon(t === 'light' ? 'sun' : t === 'dark' ? 'moon' : 'monitor', { size: 16 }), t[0].toUpperCase() + t.slice(1)));
  const syncTheme = () => themeBtns.forEach((b, i) => b.setAttribute('aria-checked', String(THEMES[i] === getThemePref())));
  syncTheme();
  const offTheme = onThemeChange?.(syncTheme);
  if (typeof offTheme === 'function') cleanups.push(offTheme);
  const menu = h('div', { class: 'ash-menu', role: 'menu', hidden: true, 'aria-label': 'Account', dataset: { testid: 'admin-profile-menu' } },
    h('div', { class: 'ash-menu__who' }, avatarEl(),
      h('div', { class: 'ash-menu__text' }, h('strong', { dataset: { testid: 'admin-profile-name' } }, displayName), user && user.email ? h('span', { class: 'ash-menu__email' }, user.email) : null)),
    h('span', { class: 'ash-menu__label' }, 'Theme'),
    h('div', { class: 'ash-seg', role: 'radiogroup', 'aria-label': 'Theme' }, themeBtns),
    h('button', { class: 'ash-menu__item', type: 'button', role: 'menuitem', dataset: { testid: 'admin-signout' }, on: { click: () => { setMenu(false); onSignOut?.(); } } }, icon('logout', { size: 18 }), 'Sign out and lock'));
  const profileBtn = h('button', { class: 'ash-profile', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `Account: ${displayName}`, dataset: { testid: 'admin-profile' },
    on: { click: (e) => { e.stopPropagation(); setMenu(menu.hidden); } } }, avatarEl());
  function setMenu(open) {
    menu.hidden = !open;
    profileBtn.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('button')?.focus({ preventScroll: true });
  }
  const onDocClick = (e) => { if (!menu.hidden && !menu.contains(e.target) && !profileBtn.contains(e.target)) setMenu(false); };
  const onDocKey = (e) => {
    if (e.key !== 'Escape') return;
    if (!menu.hidden) { setMenu(false); profileBtn.focus(); } else if (st.drawer) { closeDrawer(); toggle.focus(); }
  };
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKey);
  cleanups.push(() => { document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onDocKey); });

  const topbar = h('header', { class: 'ash-top' }, toggle, brand, crumbNav, h('span', { class: 'ash-spacer' }),
    h('div', { class: 'ash-top__right' }, sheetLink, lockBtn, themeControl(), h('div', { class: 'ash-profilewrap' }, profileBtn, menu)));

  /* ---- sidebar ---- */
  const navBtns = {};
  const pill = h('span', { class: 'ash-pill', 'aria-hidden': 'true' });
  const navBody = h('div', { class: 'ash-nav__body' }, pill);
  const recentList = h('ul', { class: 'ash-recent', role: 'list' });
  const recentWrap = h('div', { class: 'ash-group ash-group--recent', hidden: true, dataset: { testid: 'admin-recent' } },
    h('p', { class: 'ash-group__label' }, 'Recent tests'), recentList);

  let itemIdx = 0;
  function itemBtn(it) {
    const b = h('button', { class: 'ash-item', type: 'button', title: it.label, dataset: { testid: `tab-${it.id}`, nav: it.id }, on: { click: () => { closeDrawer(); onNavigate?.(it.id); } } },
      icon(it.icon || 'grid', { size: 20 }), h('span', { class: 'ash-item__label' }, it.label));
    b.style.setProperty('--i', String(itemIdx++));
    navBtns[it.id] = b;
    return b;
  }
  function drawNav() {
    for (const k of Object.keys(navBtns)) delete navBtns[k];
    const groups = navGroups(items);
    const nodes = [];
    itemIdx = 0;
    for (const g of groups) {
      const list = g.items.map(itemBtn);
      nodes.push(h('div', { class: `ash-group ash-group--${g.id}` }, g.label ? h('p', { class: 'ash-group__label' }, g.label) : null, ...list));
      if (g.id === 'tools') nodes.push(recentWrap);
    }
    if (!groups.some((g) => g.id === 'tools')) nodes.push(recentWrap);
    navBody.replaceChildren(pill, ...nodes);
    markActive();
  }
  const sidebar = h('nav', { class: 'ash-side', id: 'ash-sidebar', 'aria-label': 'Admin sections', dataset: { testid: 'admin-sidebar' } },
    newBtn ? h('div', { class: 'ash-side__new' }, newBtn) : null, navBody);
  const scrim = h('div', { class: 'ash-scrim', hidden: true, 'aria-hidden': 'true', on: { click: () => { closeDrawer(); toggle.focus(); } } });

  function markActive() {
    for (const [id, b] of Object.entries(navBtns)) {
      const on = id === st.section;
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    placePill();
  }
  function placePill() {
    const b = navBtns[st.section];
    if (!b || !b.offsetWidth) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '1';
    pill.style.width = `${b.offsetWidth}px`;
    pill.style.height = `${b.offsetHeight}px`;
    pill.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
  }

  function setRecent(codes) {
    st.recent = (codes || []).filter(Boolean).slice(0, 4);
    recentWrap.hidden = !st.recent.length;
    recentList.replaceChildren(...st.recent.map((code) => h('li', {}, h('button', { class: 'ash-recent__item', type: 'button', title: code, dataset: { testid: `recent-${code}` },
      on: { click: () => { closeDrawer(); onRecent?.(code); } } }, icon('clock', { size: 16 }), h('span', {}, code)))));
    requestAnimationFrame(placePill);
  }

  /* ---- in-test tabs ---- */
  const tabIndicator = h('span', { class: 'ash-tabs__indicator', 'aria-hidden': 'true' });
  const tabBtns = {};
  const tablist = h('div', { class: 'ash-tabs', role: 'tablist', 'aria-label': 'Test sections', dataset: { testid: 'admin-test-tabs' } },
    TEST_TABS.map((t) => (tabBtns[t.id] = h('button', { class: 'ash-tab', type: 'button', role: 'tab', dataset: { testid: `testtab-${t.id}` },
      on: {
        click: () => { st.testTab = t.id; onTestTab?.(t); },
        keydown: (e) => {
          const i = TEST_TABS.findIndex((x) => x.id === t.id);
          const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TEST_TABS.length - 1 : null;
          if (n == null) return;
          e.preventDefault();
          const target = TEST_TABS[(n + TEST_TABS.length) % TEST_TABS.length];
          tabBtns[target.id].focus();
          st.testTab = target.id;
          onTestTab?.(target);
        },
      } }, t.label))),
    tabIndicator);
  const testbar = h('div', { class: 'ash-testbar', hidden: true }, tablist);
  function refreshTabs() {
    const code = getTestCode();
    const show = showTestTabs(st.section, code);
    testbar.hidden = !show;
    const active = testTabFor(st.section, st.testTab);
    for (const t of TEST_TABS) {
      tabBtns[t.id].setAttribute('aria-selected', String(t.id === active));
      tabBtns[t.id].tabIndex = t.id === active ? 0 : -1;
    }
    drawCrumbs(code);
    requestAnimationFrame(placeTabIndicator);
  }
  function placeTabIndicator() {
    const b = tabBtns[testTabFor(st.section, st.testTab)];
    if (!b || !b.offsetWidth) return;
    tabIndicator.style.width = `${b.offsetWidth}px`;
    tabIndicator.style.transform = `translateX(${b.offsetLeft}px)`;
  }
  function drawCrumbs(code = getTestCode()) {
    const parts = breadcrumbFor(items, st.section, code);
    crumbs.replaceChildren(...parts.map((p, i) => {
      const last = i === parts.length - 1;
      const inner = last || !p.id
        ? h('span', { class: 'ash-crumb ash-crumb--current', 'aria-current': last ? 'page' : null }, p.label)
        : h('button', { class: 'ash-crumb ash-crumb--link', type: 'button', on: { click: () => onNavigate?.(p.id) } }, p.label);
      return h('li', { class: 'ash-crumbs__li' }, i ? icon('right', { size: 14, className: 'ash-crumbs__sep' }) : null, inner);
    }));
  }

  /* ---- content ---- */
  const panel = h('div', { class: 'adm-panel ash-panel', role: 'region', 'aria-label': 'Admin content', tabindex: '-1' });
  const main = h('main', { class: 'ash-main', id: 'ash-main' }, testbar, h('div', { class: 'ash-content' }, panel));

  const el = h('div', { class: 'admin ash ash--wait', dataset: { testid: 'admin', shell: 'on' } }, topbar, h('div', { class: 'ash-body' }, sidebar, scrim, main));

  /* ---- layout state ---- */
  function applyLayout() {
    const lay = navLayout(window.innerWidth, st.pref, st.drawer);
    el.dataset.nav = lay.mode;
    el.classList.toggle('is-drawer-open', lay.mode === 'drawer' && lay.open);
    const visible = lay.mode !== 'drawer' || lay.open;
    sidebar.inert = !visible;
    scrim.hidden = motion ? lay.mode !== 'drawer' : !(lay.mode === 'drawer' && lay.open);
    if (motion) { hideTip(); sidebar.style.transform = ''; sidebar.classList.remove('is-dragging'); syncTitles(lay.mode); }
    toggle.setAttribute('aria-expanded', String(lay.mode === 'drawer' ? lay.open : lay.mode === 'full'));
    requestAnimationFrame(() => { placePill(); placeTabIndicator(); });
  }
  function toggleNav() {
    const lay = navLayout(window.innerWidth, st.pref, st.drawer);
    if (lay.mode === 'drawer') { st.drawer = !st.drawer; } else { st.pref = lay.mode === 'full'; save('adminNav', { collapsed: st.pref }); }
    applyLayout();
    if (motion) trackPill();
    if (lay.mode === 'drawer' && st.drawer) navBody.querySelector('.ash-item')?.focus({ preventScroll: true });
  }
  function closeDrawer() { if (st.drawer) { st.drawer = false; applyLayout(); } }
  const onResize = () => { if (window.innerWidth >= 768) st.drawer = false; applyLayout(); };
  window.addEventListener('resize', onResize);
  cleanups.push(() => window.removeEventListener('resize', onResize));

  /* ---- v5 motion: pill tracking, collapsed tooltips, swipe-to-close, section cross-fade ---- */
  let trackId = 0;
  function trackPill() {
    if (reduced()) { placePill(); return; }
    cancelAnimationFrame(trackId);
    const t0 = performance.now();
    pill.classList.add('is-tracking');
    const step = () => {
      placePill();
      if (performance.now() - t0 < 260) trackId = requestAnimationFrame(step);
      else { pill.classList.remove('is-tracking'); placePill(); }
    };
    step();
  }
  const tip = h('div', { class: 'ash-tip', role: 'tooltip', hidden: true });
  function hideTip() { tip.hidden = true; tip.classList.remove('is-on'); }
  function showTip(btn) {
    if (el.dataset.nav !== 'rail') return;
    const r = btn.getBoundingClientRect();
    tip.textContent = btn.dataset.label || '';
    tip.hidden = false;
    tip.style.left = `${Math.round(r.right + 8)}px`;
    tip.style.top = `${Math.round(r.top + r.height / 2)}px`;
    requestAnimationFrame(() => tip.classList.add('is-on'));
  }
  function syncTitles(mode) {
    for (const b of Object.values(navBtns)) {
      if (mode === 'rail') b.removeAttribute('title'); else b.setAttribute('title', b.dataset.label || '');
    }
  }
  if (motion) {
    el.classList.add('ash--motion');
    el.append(tip);
    const onOver = (e) => { const b = e.target.closest?.('.ash-item'); if (b) showTip(b); };
    const onOut = (e) => { if (e.target.closest?.('.ash-item')) hideTip(); };
    navBody.addEventListener('pointerover', onOver);
    navBody.addEventListener('pointerout', onOut);
    navBody.addEventListener('focusin', (e) => { if (e.target.matches?.('.ash-item:focus-visible')) onOver(e); });
    navBody.addEventListener('focusout', onOut);
    navBody.addEventListener('scroll', hideTip, { passive: true });
    sidebar.addEventListener('scroll', hideTip, { passive: true });
    const body = el.querySelector('.ash-body');
    body.addEventListener('transitionend', (e) => { if (e.target === body) placePill(); });
    // swipe left on the open drawer to close it
    let sw = null;
    sidebar.addEventListener('pointerdown', (e) => {
      if (!st.drawer || e.pointerType === 'mouse') return;
      sw = { x: e.clientX, y: e.clientY, dx: 0, t: performance.now(), on: false, id: e.pointerId };
    });
    sidebar.addEventListener('pointermove', (e) => {
      if (!sw || e.pointerId !== sw.id) return;
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
      if (!sw.on) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; }
        if (dx < -8 && Math.abs(dx) > Math.abs(dy)) { sw.on = true; sidebar.classList.add('is-dragging'); try { sidebar.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
      }
      if (sw && sw.on) { sw.dx = Math.min(0, dx); sidebar.style.transform = `translateX(${sw.dx}px)`; }
    });
    const endSwipe = () => {
      if (!sw) return;
      const s = sw; sw = null;
      sidebar.classList.remove('is-dragging');
      if (!s.on) return;
      const fast = s.dx / Math.max(1, performance.now() - s.t) < -0.4;
      sidebar.style.transform = '';
      if (s.dx < -(sidebar.offsetWidth * 0.3) || fast) { closeDrawer(); toggle.focus({ preventScroll: true }); }
    };
    sidebar.addEventListener('pointerup', endSwipe);
    sidebar.addEventListener('pointercancel', endSwipe);
  }
  function ghostOut() {
    if (!motion || reduced() || !panel.firstElementChild) return;
    const host = panel.parentElement;
    const r = panel.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const ghost = panel.cloneNode(true);
    ghost.removeAttribute('id'); ghost.removeAttribute('role'); ghost.removeAttribute('aria-label'); ghost.removeAttribute('tabindex');
    ghost.querySelectorAll('[data-testid],[id]').forEach((n) => { n.removeAttribute('data-testid'); n.removeAttribute('id'); });
    ghost.classList.remove('adm-panel--in');
    ghost.classList.add('ash-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.style.cssText = `left:${r.left - hr.left}px;top:${r.top - hr.top}px;width:${r.width}px;max-height:${Math.max(200, window.innerHeight - r.top)}px`;
    host.append(ghost);
    const rm = () => ghost.remove();
    ghost.addEventListener('animationend', rm);
    setTimeout(rm, 400);
  }

  drawNav();
  if (motion) { for (const b of Object.values(navBtns)) b.dataset.label = b.querySelector('.ash-item__label')?.textContent || ''; }
  drawCrumbs();
  applyLayout();
  refreshTabs();
  const onBuilderChange = () => refreshTabs();
  document.addEventListener('cw:builder-change', onBuilderChange);
  cleanups.push(() => document.removeEventListener('cw:builder-change', onBuilderChange));
  ensureShellCss().then(() => {
    el.classList.remove('ash--wait');
    requestAnimationFrame(() => { placePill(); placeTabIndicator(); });
  });
  if (document.fonts?.ready) document.fonts.ready.then(() => { placePill(); placeTabIndicator(); });

  return {
    el, panel, toggle,
    setCurrent(section, { testTab = '' } = {}) {
      if (section !== st.section) ghostOut();
      st.section = section;
      st.testTab = testTab;
      markActive();
      refreshTabs();
    },
    setRecent,
    refreshTabs,
    closeDrawer,
    destroy() { cleanups.forEach((fn) => { try { fn(); } catch { /* ignore */ } }); },
  };
}
