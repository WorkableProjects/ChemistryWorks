// Admin panel: library, test builder, grading, settings.
// Sub-views live in js/views/admin/*.js. Builder state is module-level so it survives tab switches.

import { h, mount, icon, openModal } from '../ui.js';
import { CONFIG } from '../config.js';
import { load, save, remove } from '../lib/storage.js';
import { renderBuilder, setBuilderTest, newBuilderTest, builderIsDirty, getBuilderTest } from './admin/builder.js';
import { renderLibrary, setLibraryQuery } from './admin/library.js';
import { renderGrading, setGradingFocus } from './admin/grading.js';
import { renderDashboard } from './admin/dashboard.js';
import { buildAdminShell, NAV_ITEMS, isAvailable, registerNavItem } from './admin/shell.js';
import { renderClasses } from './admin/classes.js';
import { renderBank } from './admin/bank.js';
import { renderAccommodations } from './admin/accommodations.js';
import { renderLive } from './admin/live.js';
import { renderImport } from './admin/import.js';
import { renderStudent } from './admin/student.js';

import { renderSettings } from './admin/settings.js';
import { mountPalette } from './admin/palette.js';
import { loadCatalog } from '../lib/tests.js';
import { clearAdminConfirmed } from '../lib/admin-session.js';

export * from './admin/stats.js';

// Removed sections (v5 S01): old links and remembered tabs land on the closest kept section.
const LEGACY_TABS = { insights: 'grading', mastery: 'dashboard' };
const resolveTab = (id) => LEGACY_TABS[id] || id;
// `?section=` is the old deep link; `params.tab` wins when a caller passes one.
const requestedTab = (params) => params?.tab || new URLSearchParams(location.search).get('section') || '';

// Extra sections in the sidebar.
registerNavItem({ id: 'bank', render: (host, ctx, o) => renderBank(host, ctx, o) });
registerNavItem({ id: 'classes', render: (host, ctx, o) => renderClasses(host, ctx, o) });
registerNavItem({ id: 'accommodations', render: (host, ctx, o) => renderAccommodations(host, ctx, o) });
registerNavItem({ id: 'live', render: (host, ctx, o) => renderLive(host, ctx, o) });
registerNavItem({ id: 'import', render: (host, ctx, o) => renderImport(host, ctx, o) });
// Teacher student view (S13a): opened by link (?section=student&email=), not listed in the sidebar.
registerNavItem({ id: 'student', label: 'Student', icon: 'user', hidden: true, render: (host, ctx, o) => renderStudent(host, ctx, o) });

export function render(root, ctx, params = {}) {
  return renderShelled(root, ctx, params);
}

function renderShelled(root, ctx, params = {}) {
  const sectionOk = (id) => NAV_ITEMS.some((t) => t.id === id && isAvailable(t));
  let tab = resolveTab(requestedTab(params) || load('adminTab', 'dashboard', 'session'));
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

  // V5-06: command palette (Ctrl/Cmd K) to jump to a section or a test.
  const palette = mountPalette({ getItems: async () => [
    ...NAV_ITEMS.filter(isAvailable).map((t) => ({ id: t.id, label: t.label, kind: 'Section', icon: t.icon, run: () => select(t.id) })),
    ...((await loadCatalog().catch(() => [])) || []).map((c) => ({ id: c.code, label: `${c.code} ${c.title || ''}`.trim(), kind: 'Test', icon: 'flask', run: () => { setLibraryQuery(c.code); select('library', { force: true }); } })),
  ] });

  return () => {
    palette?.destroy();
    shell.destroy();
    try { tabCleanup?.(); } catch (e) { console.error(e); }
  };
}
