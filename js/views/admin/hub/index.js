// Class page for teachers (V5-10, behind feature('classHub')): Stream · Assignments · Roster, plus the tracker.
import { h, mount, icon } from '../../../ui.js';
import { skeleton } from '../common.js';
import { openAccommodationEditor } from '../accommodations.js';
import { assignmentsRes, fmtWhen, studentHref } from './data.js';
import { openAssignDialog } from './assign.js';
import { renderStream } from './stream.js';
import { renderTracker } from './tracker.js';

const TABS = [['stream', 'Stream'], ['assignments', 'Assignments'], ['roster', 'Roster']];

/** classes = every class (for Copy to class); cls = the one shown. */
export function renderClassHub(root, ctx, { cls, classes, onBack, tab: startTab = 'stream' }) {
  let tab = startTab;
  let cleanup = null;
  let alive = true;
  const assigns = assignmentsRes();
  const panel = h('div', { class: 'hub-panel' });
  const tabBtns = {};
  const stopTab = () => { try { cleanup?.(); } catch { /* ignore */ } cleanup = null; };

  function assignmentsTab() {
    const host = h('div', { class: 'stack' }, skeleton(3));
    mount(panel, host);
    const paint = () => {
      if (!alive) return;
      const list = (assigns.peek() || []).filter((a) => a.classId === cls.id).sort((a, b) => String(b.dueAt || b.createdAt).localeCompare(String(a.dueAt || a.createdAt)));
      const assign = h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: 'assign-btn' }, on: { click: () => openAssignDialog(ctx, { classes, classId: cls.id }) } }, icon('plus', { size: 14 }), 'Assign a test');
      mount(host, h('div', { class: 'row row--wrap' }, h('span', { class: 'faint' }, `${list.length} assignment${list.length === 1 ? '' : 's'}`), h('span', { class: 'spacer' }), assign),
        !list.length ? h('p', { class: 'hub-empty', dataset: { testid: 'assignments-empty' } }, 'No assignments yet. Assign a test from the library')
          : h('ul', { class: 'hub-list' }, list.map((a) => h('li', { class: 'hub-item', dataset: { testid: `assignment-${a.id}` } },
            h('button', { class: 'hub-item__main', type: 'button', on: { click: () => openTracker(a) } },
              h('span', { class: 'hub-tile', 'aria-hidden': 'true' }, String(a.testCode || '').slice(0, 3)),
              h('span', { class: 'hub-item__text' }, h('span', { class: 'hub-item__title' }, a.title || a.testCode),
                h('span', { class: 'faint' }, a.dueAt ? `Due ${fmtWhen(a.dueAt)}` : 'No due date', a.required ? '' : ' · Optional'))),
            h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: `copy-assignment-${a.id}` }, on: { click: () => openAssignDialog(ctx, { classes: classes.filter((c) => c.id !== cls.id), copyFrom: a }) } }, icon('copy', { size: 14 }), 'Copy to class')))));
    };
    const unsub = assigns.subscribe(paint);
    paint();
    assigns.get().then(paint).catch(() => { if (!assigns.peek()) mount(host, h('p', { class: 'notice notice--error' }, 'Could not load assignments')); });
    return () => unsub();
  }

  function rosterTab() {
    const emails = cls.emails || [];
    mount(panel, !emails.length ? h('p', { class: 'hub-empty' }, 'No students on this class. Add emails from Edit on the class list')
      : h('ul', { class: 'hub-list', dataset: { testid: 'class-roster' } }, emails.map((e) => h('li', { class: 'hub-item' },
        h('a', { class: 'hub-link hub-item__main', href: studentHref(e), dataset: { testid: `roster-student-${e}` } }, e),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => openAccommodationEditor(ctx, { email: e }) } }, 'Accommodations')))));
    return null;
  }

  function openTracker(a) {
    stopTab();
    tabs.hidden = true;
    mount(panel);
    cleanup = renderTracker(panel, ctx, { assignment: a, classes, onBack: () => { tabs.hidden = false; show('assignments'); }, onChanged: () => {} });
  }

  function show(id) {
    tab = id;
    stopTab();
    Object.entries(tabBtns).forEach(([k, b]) => { b.setAttribute('aria-selected', String(k === id)); b.tabIndex = k === id ? 0 : -1; });
    mount(panel);
    if (id === 'stream') cleanup = renderStream(panel, ctx, cls);
    else if (id === 'assignments') cleanup = assignmentsTab();
    else cleanup = rosterTab();
  }
  const tabs = h('div', { class: 'hub-tabs', role: 'tablist', 'aria-label': 'Class sections', dataset: { testid: 'class-tabs' } },
    TABS.map(([id, label]) => { tabBtns[id] = h('button', { class: 'hub-tab', type: 'button', role: 'tab', dataset: { testid: `class-tab-${id}` }, on: { click: () => show(id) } }, label); return tabBtns[id]; }));

  mount(root, h('div', { class: 'stack hub-admin', dataset: { testid: 'class-hub' } },
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'class-hub-back' }, on: { click: onBack } }, icon('left', { size: 14 }), 'Classes'),
      h('h2', { class: 'adm-h2' }, cls.name, cls.period ? h('span', { class: 'faint' }, ` · Period ${cls.period}`) : null)),
    tabs, panel));
  show(tab);
  return () => { alive = false; stopTab(); };
}
