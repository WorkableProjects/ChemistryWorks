// Builder › Test settings › "Schedule, classes and tools" (V4-02 / V4-05 / V4-07): open / close window, late work,
// announcement, classes + roster only, question pools per section, student tools, assigned practice.
// testExtrasPanel(test, changed, ctx) -> <details>
import { h } from '../../ui.js';
import { adminCall } from '../../lib/api.js';
import { hasAdminAuth } from '../../lib/admin-session.js';
import { MODES as GAMES } from '../../lib/modes/index.js';
import { field, switchEl } from './common.js';

const toLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocal = (v) => (v ? new Date(v).toISOString() : undefined);
const TOOLS = [['calculator', 'Calculator'], ['constants', 'Units & constants'], ['scratchpad', 'Scratchpad'], ['highlighter', 'Highlighter / strike-out'], ['readAloud', 'Read-aloud for everyone']];

export function testExtrasPanel(t, changed, ctx) {
  const set = (k, v) => { if (v === undefined || v === '' || v === null) delete t[k]; else t[k] = v; changed(); };
  const dt = (key, testid) => h('input', { class: 'input', type: 'datetime-local', value: toLocal(t[key]), dataset: { testid }, on: { change: (e) => set(key, fromLocal(e.target.value)) } });
  const late = t.late || {};
  const lateUntil = h('input', { class: 'input', type: 'datetime-local', value: toLocal(late.until), dataset: { testid: 'test-late-until' } });
  const penType = h('select', { class: 'select', dataset: { testid: 'test-late-type' } }, h('option', { value: 'percentPerDay' }, '% per day'), h('option', { value: 'flat' }, 'Flat %'));
  penType.value = late.penalty?.type || 'percentPerDay';
  const penVal = h('input', { class: 'input', type: 'number', min: 0, max: 100, value: late.penalty?.value ?? 0, dataset: { testid: 'test-late-value' } });
  const saveLate = () => {
    if (!lateUntil.value) { delete t.late; changed(); return; }
    t.late = { until: fromLocal(lateUntil.value), penalty: { type: penType.value, value: Math.max(0, Math.min(100, Number(penVal.value) || 0)) } };
    changed();
  };
  [lateUntil, penType, penVal].forEach((el) => el.addEventListener('change', saveLate));
  const announce = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Shown at the top of the test and on the feedback page', dataset: { testid: 'test-announcement' },
    on: { input: (e) => set('announcement', e.target.value.trim() || undefined) } }, t.announcement || '');

  // classes (needs the backend)
  const classBox = h('div', { class: 'adm-class-picks', dataset: { testid: 'test-classes' } }, h('p', { class: 'faint' }, hasAdminAuth() ? 'Loading classes…' : 'Connect the backend to assign classes.'));
  if (hasAdminAuth() && ctx?.config?.GAS_WEB_APP_URL) {
    adminCall('listClasses', {}, { gasUrl: ctx.config.GAS_WEB_APP_URL }).then((r) => {
      const list = r.ok ? r.data.classes || [] : [];
      const chosen = new Set(Array.isArray(t.classes) ? t.classes : []);
      classBox.replaceChildren(...(list.length ? list.map((c) => h('label', { class: 'row' },
        h('input', { type: 'checkbox', checked: chosen.has(c.id), dataset: { testid: `test-class-${c.id}` }, on: { change: (e) => { if (e.target.checked) chosen.add(c.id); else chosen.delete(c.id); set('classes', chosen.size ? [...chosen] : undefined); } } }),
        h('span', {}, `${c.name}${c.period ? ` (P${c.period})` : ''} · ${c.emails.length}`))) : [h('p', { class: 'faint' }, 'No classes yet. Create them under Classes.')]));
    });
  }
  const roster = switchEl({ label: 'Roster only', hint: 'Only students on an assigned class can take it (checked by the backend).', checked: t.rosterOnly === true, testid: 'opt-rosterOnly', onChange: (v) => set('rosterOnly', v || undefined) });

  // pools per section
  const sections = Array.isArray(t.sections) ? t.sections : [];
  const pools = sections.length ? h('div', { class: 'stack' }, ...sections.map((s) => {
    const n = (t.questions || []).filter((q) => q.section === s.id).length;
    const inp = h('input', { class: 'input', type: 'number', min: 0, max: n, value: s.pool?.draw ?? '', placeholder: 'All', dataset: { testid: `pool-draw-${s.id}` },
      on: { change: (e) => { const v = Math.floor(Number(e.target.value)); if (v > 0) s.pool = { ...(s.pool || {}), draw: v }; else delete s.pool; changed(); } } });
    return field(`${s.title || s.id}: questions per student (of ${n})`, inp);
  })) : h('p', { class: 'faint' }, 'Add sections to draw a random set of questions per student.');

  // tools
  const tools = t.tools && typeof t.tools === 'object' ? t.tools : {};
  const toolSw = h('div', { class: 'adm-switches' }, ...TOOLS.map(([k, label]) => switchEl({ label, checked: k === 'readAloud' ? tools[k] === true : tools[k] !== false, testid: `tool-${k}`,
    onChange: (v) => { t.tools = { ...(t.tools || {}), [k]: v }; changed(); } })));

  // practice
  const practiceList = h('div', { class: 'stack' });
  const drawPractice = () => {
    const items = Array.isArray(t.practice) ? t.practice : [];
    practiceList.replaceChildren(...items.map((p, i) => h('div', { class: 'row row--wrap' },
      h('select', { class: 'select adm-select-sm', 'aria-label': 'Game', on: { change: (e) => { p.game = e.target.value; changed(); } } }, GAMES.filter((g) => g.id !== 'study').map((g) => h('option', { value: g.id, selected: g.id === p.game }, g.title))),
      h('input', { class: 'input adm-select-sm', type: 'number', min: 0, value: p.target || '', placeholder: 'Target score', 'aria-label': 'Target score', on: { change: (e) => { p.target = Number(e.target.value) || 0; changed(); } } }),
      h('input', { class: 'input adm-select-sm', type: 'date', value: p.due ? String(p.due).slice(0, 10) : '', 'aria-label': 'Due date', on: { change: (e) => { p.due = e.target.value || undefined; changed(); } } }),
      h('button', { class: 'btn btn--subtle btn--sm', type: 'button', on: { click: () => { items.splice(i, 1); if (!items.length) delete t.practice; changed(); drawPractice(); } } }, 'Remove'))),
    h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'practice-add' }, on: { click: () => { t.practice = [...(Array.isArray(t.practice) ? t.practice : []), { game: 'classic', target: 0 }]; changed(); drawPractice(); } } }, 'Assign a game'));
  };
  drawPractice();

  return h('details', { class: 'adm-extras', dataset: { testid: 'test-extras' }, open: !!(t.opensAt || t.closesAt || t.late || t.announcement || t.classes || t.practice) },
    h('summary', {}, 'Schedule, classes and tools'),
    h('div', { class: 'stack' },
      h('div', { class: 'adm-grid adm-grid--3' }, field('Opens', dt('opensAt', 'test-opens-at'), 'Before this, students see "Opens on …"'), field('Closes', dt('closesAt', 'test-closes-at'), 'After this, no new starts or submissions')),
      h('div', { class: 'adm-grid adm-grid--3' }, field('Accept late work until', lateUntil, 'Empty = no late work'), field('Late penalty', penType), field('Penalty %', penVal)),
      field('Announcement', announce),
      h('h4', { class: 'adm-h4' }, 'Classes'), classBox, roster,
      h('h4', { class: 'adm-h4' }, 'Question pools'), pools,
      h('h4', { class: 'adm-h4' }, 'Student tools'), toolSw,
      h('h4', { class: 'adm-h4' }, 'Assigned practice'), h('p', { class: 'faint' }, 'Shown on students\' dashboards for this test (game mode must be on).'), practiceList));
}
