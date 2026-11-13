// Student class page (?view=class&id=): stream (pinned first), upcoming and past assignments.
import { h, mount, icon, themeControl } from '../ui.js';
import { getUser } from '../lib/auth.js';
import { loadProfile, subscribeProfile } from '../lib/profile.js';
import { assignmentRow, isDone, upcomingAssignments, toMs, dueOf } from './home/upnext.js';

const when = (t) => { const ms = toMs(t); return ms == null ? '' : new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };

const postRow = (p) => h('li', { class: ['hub-post', p.pinned ? 'is-pinned' : ''], dataset: { testid: `stream-post-${p.id}` } },
  h('div', { class: 'hub-post__head' }, p.pinned ? h('span', { class: 'chip hub-chip hub-chip--info' }, 'Pinned') : null, h('span', { class: 'row__meta' }, when(p.createdAt))),
  h('p', { class: 'hub-post__body' }, p.body || ''));

export function render(root, ctx, params = {}) {
  const user = getUser();
  if (!user) { ctx.navigate('landing'); return undefined; }
  const classId = params.id;
  const main = h('main', { class: 'home hub-student', dataset: { testid: 'class-page' } });
  mount(root, main);

  function paint(p) {
    const hub = p && p.hub; const now = Date.now();
    const cls = hub && (hub.classes || []).find((c) => c.id === classId);
    const topbar = h('div', { class: 'home-topbar' },
      h('button', { type: 'button', class: 'btn btn--subtle btn--sm', dataset: { testid: 'class-back' }, on: { click: () => ctx.navigate('landing') } }, icon('left', { size: 16 }), 'Home'),
      themeControl());
    if (!cls) { main.replaceChildren(topbar, h('p', { class: 'empty' }, hub ? 'This class was not found' : 'Loading your class')); return; }
    const all = (hub.assignments || []).filter((a) => a.classId === classId);
    const upcoming = upcomingAssignments({ assignments: all });
    const past = all.filter(isDone).sort((a, b) => (dueOf(b) || 0) - (dueOf(a) || 0));
    const stream = (hub.stream || []).filter((s) => s.classId === classId)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0));
    const sec = (title, testid, ...body) => h('section', { class: 'home-section', dataset: { testid } }, h('h2', { class: 'home-section__title' }, title), ...body);
    main.replaceChildren(topbar,
      h('header', { class: 'home-header hub-class-head' },
        h('div', { class: 'home-header__text' }, h('h1', { class: 'home-greeting' }, cls.name),
          h('p', { class: 'home-meta' }, [cls.period, cls.teacherName || cls.teacher].filter(Boolean).join(' · ')))),
      h('div', { class: 'home-grid' },
        h('div', { class: 'home-main' },
          sec('Stream', 'class-stream', stream.length ? h('ul', { class: 'hub-posts' }, stream.map(postRow)) : h('p', { class: 'empty' }, 'No posts yet'))),
        h('aside', { class: 'home-side' },
          sec('Upcoming', 'class-assignments', upcoming.length ? h('ul', { class: 'rows' }, upcoming.map((a) => assignmentRow(ctx, a, { now }))) : h('p', { class: 'empty' }, 'Nothing due')),
          past.length ? sec('Past', 'class-past', h('ul', { class: 'rows' }, past.map((a) => assignmentRow(ctx, a, { now })))) : null)));
  }

  const { profile, done } = loadProfile(user, { onUpdate: (p) => { if (root.contains(main)) paint(p); } });
  paint(profile);
  done.then((p) => { if (p && root.contains(main)) paint(p); });
  const off = subscribeProfile(user, (p) => { if (root.contains(main)) paint(p); });
  return () => { off(); };
}
