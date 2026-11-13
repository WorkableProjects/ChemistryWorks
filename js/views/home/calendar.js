// 7-day strip on the student home: one cell per day with the assignments due that day.
import { h } from '../../ui.js';
import { dueOf, isDone } from './upnext.js';

const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function calendarStrip(hub, now = Date.now()) {
  const list = hub && Array.isArray(hub.assignments) ? hub.assignments.filter((a) => !isDone(a)) : [];
  const base = startOfDay(now);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() + i); return d.getTime(); });
  const cell = (t, i) => {
    const next = i < 6 ? days[i + 1] : Infinity;
    const due = list.filter((a) => { const d = dueOf(a); return d != null && (i === 0 ? d < next : d >= t && d < next); });
    const label = i === 0 ? 'Today' : new Date(t).toLocaleDateString(undefined, { weekday: 'short' });
    return h('li', { class: ['cal-day', i === 0 ? 'is-today' : '', due.length ? 'has-due' : ''], dataset: { testid: `cal-day-${i}` } },
      h('span', { class: 'cal-day__name' }, label),
      h('span', { class: 'cal-day__num' }, new Date(t).getDate()),
      due.length ? h('ul', { class: 'cal-day__items' }, due.map((a) => h('li', { class: 'cal-day__item', title: a.title || a.testCode }, a.title || a.testCode))) : null);
  };
  return h('ol', { class: 'cal-strip hub-student', 'aria-label': 'Next 7 days', dataset: { testid: 'calendar-strip' } }, days.map(cell));
}
