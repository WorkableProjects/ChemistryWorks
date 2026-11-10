// Class Hub on the student home (V5-10): "Up next" rows from profile.hub, shared date/status helpers, teacher-reminder banner.
// Rows reuse the home's .row / element-tile style. Tokens only (css/hub.css, css/home.css).

import { h, icon } from '../../ui.js';
import { elementTile, symbolOf } from './parts.js';

const DAY = 86400000;
const DONE = new Set(['turned_in', 'graded', 'released']);

/** ms epoch from a number, numeric string or ISO string; null when absent. */
export const toMs = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : (/^\d+$/.test(String(v)) ? Number(v) : Date.parse(v));
  return Number.isFinite(n) ? n : null;
};
export const dueOf = (a) => toMs(a.effectiveDueAt != null ? a.effectiveDueAt : a.dueAt);
export const isDone = (a) => DONE.has(a.status) || (a.status === 'late' && !!(a.submittedAt || a.late));
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayDiff = (t, now) => Math.round((startOfDay(t) - startOfDay(now)) / DAY);
const weekday = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short' });
const dateShort = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const timeShort = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** { text, tone } chip for an assignment at `now` (tone: info | warn | muted). */
export function assignmentChip(a, now = Date.now()) {
  const due = dueOf(a); const opens = toMs(a.opensAt);
  if (isDone(a)) {
    if (a.status === 'late' || a.late) return { text: 'Late', tone: 'warn' };
    return { text: a.status === 'graded' || a.status === 'released' ? 'Graded' : 'Turned in', tone: 'muted' };
  }
  if (a.status === 'missing') return { text: 'Missing', tone: 'warn' };
  if (a.status === 'late') return { text: 'Late', tone: 'warn' };
  if (opens != null && opens > now) return { text: dayDiff(opens, now) < 7 ? `Opens ${weekday(opens)}` : `Opens ${dateShort(opens)}`, tone: 'muted' };
  if (a.required === false) return { text: 'Optional practice', tone: 'muted' };
  if (due != null) {
    if (due < now) return { text: 'Late', tone: 'warn' };
    const d = dayDiff(due, now);
    if (d === 0) return { text: 'Due today', tone: 'info' };
    if (d === 1) return { text: 'Due tomorrow', tone: 'info' };
    return { text: d < 7 ? `Due ${weekday(due)}` : `Due ${dateShort(due)}`, tone: 'muted' };
  }
  return { text: 'No due date', tone: 'muted' };
}

export const dueText = (a) => { const d = dueOf(a); return d == null ? 'No due date' : `${dateShort(d)}, ${timeShort(d)}`; };

/** Assignments not yet turned in, due soonest first (no due date last). */
export function upcomingAssignments(hub) {
  const list = hub && Array.isArray(hub.assignments) ? hub.assignments : [];
  return list.filter((a) => !isDone(a)).sort((x, y) => (dueOf(x) ?? Infinity) - (dueOf(y) ?? Infinity));
}

export const chipEl = (c, testid) => h('span', { class: `chip hub-chip hub-chip--${c.tone}`, dataset: testid ? { testid } : {} }, c.text);

/** One assignment row. Opens the test with the assignment's allowed modes (no code typed). */
export function assignmentRow(ctx, a, { now = Date.now() } = {}) {
  const c = assignmentChip(a, now);
  const opens = toMs(a.opensAt);
  const done = isDone(a);
  const locked = (opens != null && opens > now) || (a.canSubmit === false && !done);
  const meta = [dueText(a), a.percentDone > 0 && !done ? `${Math.round(a.percentDone)}% done` : null].filter(Boolean).join(' · ');
  return h('li', { class: 'row', dataset: { testid: `assignment-${a.id}`, code: a.testCode } },
    elementTile(symbolOf(a.testCode), null),
    h('div', { class: 'row__main' },
      h('span', { class: 'row__title' }, a.title || a.testCode),
      h('span', { class: 'row__meta' }, meta),
      chipEl(c, `assignment-chip-${a.id}`)),
    h('div', { class: 'row__actions' }, locked || done ? null
      : h('button', { type: 'button', class: 'btn btn--primary btn--sm', dataset: { testid: `assignment-open-${a.id}` },
        on: { click: () => ctx.openTest(a.testCode, { modes: a.modes, mode: a.lastMode || (a.modes && a.modes[0]) || null }) } },
      a.percentDone > 0 ? 'Continue' : 'Open', icon('right', { size: 14 }))));
}

/** Fill the #home-upnext slot. Returns true when it painted assignments. */
export function paintHubUpNext(slot, ctx, profile, now = Date.now()) {
  const items = upcomingAssignments(profile.hub).slice(0, 5);
  if (!items.length) return false;
  slot.dataset.testid = 'up-next';
  slot.replaceChildren(h('h2', { class: 'home-section__title' }, 'Up next'),
    h('ul', { class: 'rows', dataset: { testid: 'up-next-list' } }, items.map((a) => assignmentRow(ctx, a, { now }))));
  return true;
}

/** Banner for tests the teacher reminded this student about. */
export function reminderBanner(ctx, profile) {
  const hub = profile.hub;
  const codes = hub && Array.isArray(hub.reminders) ? hub.reminders : [];
  if (!codes.length) return null;
  const titleOf = (code) => ((hub.assignments || []).find((a) => a.testCode === code) || {}).title || code;
  return h('div', { class: 'hub-student hub-banner', role: 'status', dataset: { testid: 'reminder-banner' } },
    icon('alert', { size: 16 }),
    h('span', {}, codes.length === 1 ? `Your teacher reminded you about ${titleOf(codes[0])}` : `Your teacher reminded you about ${codes.length} assignments`),
    h('button', { type: 'button', class: 'btn btn--ghost btn--sm', on: { click: () => ctx.openTest(codes[0]) } }, 'Open'));
}
