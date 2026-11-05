// Admin panel: library, test builder, grading, settings.
// Sub-views live in js/views/admin/*.js. Builder state is module-level so it survives tab switches.

import { h, mount, icon, appHeader, openModal } from '../ui.js';
import { CONFIG, feature } from '../config.js';
import { load, save, remove } from '../lib/storage.js';
import { renderBuilder, setBuilderTest, newBuilderTest, builderIsDirty, getBuilderTest } from './admin/builder.js';
import { renderLibrary, setLibraryQuery } from './admin/library.js';
import { renderGrading, setGradingFocus } from './admin/grading.js';
import { renderDashboard } from './admin/dashboard.js';
import { buildAdminShell, NAV_ITEMS, isAvailable, registerNavItem } from './admin/shell.js';
import { renderInsights } from './admin/insights.js';
import { renderClasses } from './admin/classes.js';
import { renderBank } from './admin/bank.js';
import { renderAccommodations } from './admin/accommodations.js';
import { renderLive } from './admin/live.js';
import { renderMastery } from './admin/mastery.js';
import { renderImport } from './admin/import.js';

import { renderSettings } from './admin/settings.js';
import { clearAdminConfirmed } from '../lib/admin-session.js';

export * from './admin/stats.js';

// Classic tabs: the v4 S11–S13 views live behind one "Tools" tab (the sidebar shell lists them individually).
const TOOL_VIEWS = [
  { id: 'bank', label: 'Question bank', icon: 'layers', render: (host, ctx, o) => renderBank(host, ctx, o) },
  { id: 'classes', label: 'Classes', icon: 'user', render: (host, ctx, o) => renderClasses(host, ctx, o) },
  { id: 'accommodations', label: 'Accommodations', icon: 'user', render: (host, ctx, o) => renderAccommodations(host, ctx, o) },
  { id: 'live', label: 'Live monitor', icon: 'clock', render: (host, ctx, o) => renderLive(host, ctx, o) },
  { id: 'mastery', label: 'Mastery', icon: 'award', render: (host, ctx, o) => renderMastery(host, ctx, o) },
  { id: 'import', label: 'Import & templates', icon: 'upload', render: (host, ctx, o) => renderImport(host, ctx, o) },
];
function renderToolsHub(root, ctx, opts) {
  let cleanup = null;
  const body = h('div', { class: 'adm-tools-body' });
  const open = (v) => { try { cleanup?.(); } catch { /* ignore */ } mount(body); const r = v.render(body, ctx, opts); cleanup = typeof r === 'function' ? r : null; };
  mount(root, h('div', { class: 'stack', dataset: { testid: 'tools-hub' } },
    h('div', { class: 'row row--wrap adm-toolbar--wrap', role: 'group', 'aria-label': 'Tools' },
      TOOL_VIEWS.map((v) => h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `tools-${v.id}` }, on: { click: () => open(v) } }, icon(v.icon, { size: 16 }), v.label))),
    body));
  open(TOOL_VIEWS[0]);
  return () => { try { cleanup?.(); } catch { /* ignore */ } };
}

// V4 S11–S13 views in the sidebar shell (the classic tabs list them in TABS below).
registerNavItem({ id: 'bank', render: (host, ctx, o) => renderBank(host, ctx, o) });
registerNavItem({ id: 'classes', render: (host, ctx, o) => renderClasses(host, ctx, o) });
registerNavItem({ id: 'accommodations', render: (host, ctx, o) => renderAccommodations(host, ctx, o) });
registerNavItem({ id: 'live', render: (host, ctx, o) => renderLive(host, ctx, o) });
registerNavItem({ id: 'mastery', render: (host, ctx, o) => renderMastery(host, ctx, o) });
registerNavItem({ id: 'import', render: (host, ctx, o) => renderImport(host, ctx, o) });

const TABS = [
  { id: 'library', label: 'Library', icon: 'list' },
  { id: 'builder', label: 'Builder', icon: 'grid' },
  { id: 'grading', label: 'Grading', icon: 'pen' },
  { id: 'insights', label: 'Insights', icon: 'chart' },
  { id: 'tools', label: 'Tools', icon: 'layers' },
  { id: 'settings', label: 'Settings', icon: 'key' },
];

export function render(root, ctx, params = {}) {
  if (feature('adminShell')) return renderShelled(root, ctx, params);
  let tab = TABS.some((t) => t.id === params?.tab) ? params.tab : load('adminTab', 'library', 'session');
  if (!TABS.some((t) => t.id === tab)) tab = 'library';
  let tabCleanup = null;
  let alive = true;

  const sheetLink = CONFIG.SHEET_URL
    ? h('a', { class: 'btn btn--ghost btn--sm', href: CONFIG.SHEET_URL, target: '_blank', rel: 'noopener', dataset: { testid: 'sheet-link' } }, icon('sheet', { size: 16 }), h('span', { class: 'adm-hide-sm' }, 'Open Google Sheet'))
    : h('a', { class: 'btn btn--ghost btn--sm is-disabled', role: 'link', 'aria-disabled': 'true', tabindex: '-1', title: 'Set SHEET_URL in js/config.js to link your Google Sheet', dataset: { testid: 'sheet-link' } }, icon('sheet', { size: 16 }), h('span', { class: 'adm-hide-sm' }, 'Open Google Sheet'));
  const lockBtn = h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: 'lock-admin' }, on: { click: () => {
    remove('adminUnlocked', 'session');
    remove('adminKey', 'session');
    clearAdminConfirmed(); // V4-07: also forget the confirmed Google admin for this tab
    ctx.navigate('landing');
  } } }, icon('logout', { size: 16 }), h('span', { class: 'adm-hide-sm' }, 'Lock'));

  const panel = h('div', { class: 'adm-panel', role: 'tabpanel', tabindex: '-1' });
  const indicator = h('span', { class: 'adm-tabs__indicator', 'aria-hidden': 'true' });
  const tabBtns = {};
  const tabsEl = h('div', { class: 'adm-tabs', role: 'tablist', 'aria-label': 'Admin sections' },
    TABS.map((t) => (tabBtns[t.id] = h('button', {
      class: 'adm-tab', type: 'button', role: 'tab', id: `adm-tab-${t.id}`, 'aria-controls': 'adm-panel',
      dataset: { testid: `tab-${t.id}` },
      on: {
        click: () => select(t.id),
        keydown: (e) => {
          const i = TABS.findIndex((x) => x.id === t.id);
          const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
          if (next == null) return;
          e.preventDefault();
          const target = TABS[(next + TABS.length) % TABS.length].id;
          select(target);
          tabBtns[target].focus();
        },
      },
    }, icon(t.icon, { size: 16 }), h('span', {}, t.label)))),
    indicator);
  panel.id = 'adm-panel';

  const newBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: 'new-test' }, on: { click: () => startNew() } }, icon('plus', { size: 16 }), 'New test');

  function startNew() {
    const go = () => { newBuilderTest(); select('builder', { force: true }); };
    if (!builderIsDirty()) return go();
    openModal({
      title: 'Start a new test?', testid: 'confirm-new-test',
      body: 'The test currently in the builder will be replaced. Save it as a draft or download it first if you want to keep it.',
      actions: [
        { label: 'Cancel', variant: 'ghost', autofocus: true },
        { label: 'Start new test', variant: 'primary', testid: 'confirm-action', onClick: (close) => { close(); go(); } },
      ],
    });
  }

  function placeIndicator() {
    const b = tabBtns[tab];
    if (!b || !b.offsetWidth) return;
    indicator.style.width = `${b.offsetWidth}px`;
    indicator.style.transform = `translateX(${b.offsetLeft}px)`;
  }

  const openInBuilder = (test) => { setBuilderTest(test); select('builder', { force: true }); };
  const goSettings = () => select('settings');

  function drawTab() {
    try { tabCleanup?.(); } catch (e) { console.error(e); }
    tabCleanup = null;
    panel.setAttribute('aria-labelledby', `adm-tab-${tab}`);
    panel.classList.remove('adm-panel--in');
    void panel.offsetWidth;
    panel.classList.add('adm-panel--in');
    panel.dataset.tab = tab;
    const host = h('div', { class: 'adm-tabhost', dataset: { tab } });
    mount(panel, host);
    const sub = { library: () => renderLibrary(host, ctx, { openInBuilder, goSettings }),
      builder: () => renderBuilder(host, ctx),
      grading: () => renderGrading(host, ctx, { goSettings }),
      insights: () => renderInsights(host, ctx, { goSettings }),
      tools: () => renderToolsHub(host, ctx, { goSettings, go: select, openInBuilder }),
      settings: () => renderSettings(host, ctx, { openInBuilder, go: select }) }[tab];
    const res = sub();
    tabCleanup = typeof res === 'function' ? res : null;
  }

  function select(id, { force = false } = {}) {
    if (id === tab && !force) return;
    tab = id;
    save('adminTab', id, 'session');
    for (const t of TABS) {
      const on = t.id === tab;
      tabBtns[t.id].setAttribute('aria-selected', String(on));
      tabBtns[t.id].tabIndex = on ? 0 : -1;
    }
    placeIndicator();
    drawTab();
  }

  const onResize = () => placeIndicator();
  window.addEventListener('resize', onResize);

  mount(root, h('div', { class: 'admin', dataset: { testid: 'admin' } },
    appHeader({ title: 'ChemistryWorks', subtitle: 'Admin', onHome: () => ctx.navigate('landing'), right: [sheetLink, lockBtn] }),
    h('main', { class: 'adm-shell' },
      h('div', { class: 'adm-tabbar' }, tabsEl, newBtn),
      panel)));

  // Initial state without animation of the indicator
  for (const t of TABS) {
    tabBtns[t.id].setAttribute('aria-selected', String(t.id === tab));
    tabBtns[t.id].tabIndex = t.id === tab ? 0 : -1;
  }
  indicator.style.transition = 'none';
  drawTab();
  requestAnimationFrame(() => { placeIndicator(); requestAnimationFrame(() => { if (alive) indicator.style.transition = ''; }); });
  if (document.fonts?.ready) document.fonts.ready.then(() => alive && placeIndicator());

  return () => {
    alive = false;
    window.removeEventListener('resize', onResize);
    try { tabCleanup?.(); } catch (e) { console.error(e); }
  };
}

/* ---------------------------------------------------------------------------------------------------------------
   V4-01 shell (feature 'adminShell'): sidebar + top bar + dashboard. Same views, same data-testids as above.
   --------------------------------------------------------------------------------------------------------------- */
function renderShelled(root, ctx, params = {}) {
  const sectionOk = (id) => NAV_ITEMS.some((t) => t.id === id && isAvailable(t));
  let tab = sectionOk(params?.tab) ? params.tab : load('adminTab', 'dashboard', 'session');
  if (!sectionOk(tab)) tab = 'dashboard';
  let tabCleanup = null;

  const sheetLink = CONFIG.SHEET_URL
    ? h('a', { class: 'btn btn--ghost btn--sm', href: CONFIG.SHEET_URL, target: '_blank', rel: 'noopener', dataset: { testid: 'sheet-link' } }, icon('sheet', { size: 16 }), h('span', { class: 'adm-hide-sm' }, 'Open Google Sheet'))
    : h('a', { class: 'btn btn--ghost btn--sm is-disabled', role: 'link', 'aria-disabled': 'true', tabindex: '-1', title: 'Set SHEET_URL in js/config.js to link your Google Sheet', dataset: { testid: 'sheet-link' } }, icon('sheet', { size: 16 }), h('span', { class: 'adm-hide-sm' }, 'Open Google Sheet'));
  const lock = () => {
    remove('adminUnlocked', 'session');
    remove('adminKey', 'session');
    clearAdminConfirmed();
    ctx.navigate('landing');
  };
  const lockBtn = h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: 'lock-admin' }, on: { click: lock } }, icon('logout', { size: 16 }), h('span', { class: 'adm-hide-sm' }, 'Lock'));
  const newBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: 'new-test' }, on: { click: () => startNew() } }, icon('plus', { size: 16 }), h('span', { class: 'ash-newlabel' }, 'New test'));

  const remember = (code) => {
    const c = String(code || '').trim();
    if (!c) return;
    const list = [c, ...load('adminRecent', []).filter((x) => x !== c)].slice(0, 4);
    save('adminRecent', list);
    shell.setRecent(list);
  };

  const shell = buildAdminShell({
    items: NAV_ITEMS, current: tab, newBtn, sheetLink, lockBtn,
    getTestCode: () => { try { return getBuilderTest().code || ''; } catch { return ''; } },
    onHome: () => select('dashboard'),
    onNavigate: (id) => select(id),
    onSignOut: lock,
    onTestTab: (t) => select(t.section, { force: true, testTab: t.id, focus: t.focus }),
    onRecent: (code) => {
      let cur = '';
      try { cur = getBuilderTest().code; } catch { /* none */ }
      if (cur === code) select('builder');
      else { setLibraryQuery(code); select('library', { force: true }); }
    },
  });
  const panel = shell.panel;

  function startNew() {
    const go = () => { newBuilderTest(); select('builder', { force: true }); };
    if (!builderIsDirty()) return go();
    openModal({
      title: 'Start a new test?', testid: 'confirm-new-test',
      body: 'The test currently in the builder will be replaced. Save it as a draft or download it first if you want to keep it.',
      actions: [
        { label: 'Cancel', variant: 'ghost', autofocus: true },
        { label: 'Start new test', variant: 'primary', testid: 'confirm-action', onClick: (close) => { close(); go(); } },
      ],
    });
  }

  const openInBuilder = (test) => { setBuilderTest(test); remember(test && test.code); select('builder', { force: true }); };
  const goSettings = () => select('settings');
  const goGrading = (code) => { setGradingFocus({ code, openFirst: false }); select('grading', { force: true }); };
  const gradeNext = ({ code } = {}) => { setGradingFocus({ code: code || 'all', openFirst: true }); select('grading', { force: true }); };

  function drawTab(opts = {}) {
    try { tabCleanup?.(); } catch (e) { console.error(e); }
    tabCleanup = null;
    panel.setAttribute('aria-label', (NAV_ITEMS.find((t) => t.id === tab) || {}).label || 'Admin');
    panel.classList.remove('adm-panel--in');
    void panel.offsetWidth;
    panel.classList.add('adm-panel--in');
    panel.dataset.tab = tab;
    const host = h('div', { class: 'adm-tabhost', dataset: { tab } });
    mount(panel, host);
    const extra = NAV_ITEMS.find((t) => t.id === tab && typeof t.render === 'function');
    const views = {
      dashboard: () => renderDashboard(host, ctx, { go: select, newTest: startNew, openInBuilder, goSettings, gradeNext }),
      library: () => renderLibrary(host, ctx, { openInBuilder, goSettings, goGrading }),
      builder: () => renderBuilder(host, ctx),
      grading: () => renderGrading(host, ctx, { goSettings }),
      insights: () => renderInsights(host, ctx, { goSettings }),
      settings: () => renderSettings(host, ctx, { openInBuilder, go: select }),
    };
    const sub = extra ? () => extra.render(host, ctx, { openInBuilder, goSettings, go: select }) : views[tab];
    const res = sub();
    tabCleanup = typeof res === 'function' ? res : null;
    if (tab === 'builder') remember(getBuilderTest().code);
    if (opts.focus === 'settings') requestAnimationFrame(() => panel.querySelector('[aria-label="Test settings"]')?.scrollIntoView({ block: 'start', behavior: 'auto' }));
  }

  function select(id, { force = false, testTab = '', focus = '' } = {}) {
    if (!sectionOk(id)) return;
    if (id === tab && !force) return;
    tab = id;
    save('adminTab', id, 'session');
    shell.setCurrent(id, { testTab });
    drawTab({ focus });
  }

  mount(root, shell.el);
  drawTab();
  shell.setRecent(load('adminRecent', []));

  return () => {
    shell.destroy();
    try { tabCleanup?.(); } catch (e) { console.error(e); }
  };
}
