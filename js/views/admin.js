// Admin panel: library, test builder, grading, analytics, settings.
// Sub-views live in js/views/admin/*.js. Builder state is module-level so it survives tab switches.

import { h, mount, icon, appHeader, openModal } from '../ui.js';
import { CONFIG } from '../config.js';
import { load, save, remove } from '../lib/storage.js';
import { renderBuilder, setBuilderTest, newBuilderTest, builderIsDirty } from './admin/builder.js';
import { renderLibrary } from './admin/library.js';
import { renderAnalytics } from './admin/analytics.js';
import { renderGrading } from './admin/grading.js';
import { renderSettings } from './admin/settings.js';

export * from './admin/stats.js';

const TABS = [
  { id: 'library', label: 'Library', icon: 'list' },
  { id: 'builder', label: 'Builder', icon: 'grid' },
  { id: 'grading', label: 'Grading', icon: 'pen' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'key' },
];

export function render(root, ctx, params = {}) {
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
      analytics: () => renderAnalytics(host, ctx, { goSettings }),
      settings: () => renderSettings(host, ctx, {}) }[tab];
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
