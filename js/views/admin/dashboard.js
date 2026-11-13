// Admin Dashboard (V4-01): the first screen after sign-in when true is on.
// One combined load (submissions, published tests, activity log, backend version); every card hides when its data is missing.
// computeDashboard() is pure and unit-tested.

import { h, mount, icon, toast, openModal, prefersReducedMotion } from '../../ui.js';
import { CONFIG } from '../../config.js';
import { adminKey, hasAdminAuth } from '../../lib/admin-session.js';
import { getUser } from '../../lib/auth.js';
import { releaseAll } from '../../lib/api.js';
import { resultsResource, publishedTestsResource, logResource } from './data.js';
import { checkBackendVersion } from '../../lib/version-check.js';
import { getDrafts } from '../../lib/tests.js';
import { normalizeTest } from '../../lib/schema.js';
import { pickGreeting, firstNameOf } from '../../lib/greetings.js';
import { normalizeRow, STATUS } from './stats.js';
import { fmtDate } from './common.js';

const DAY = 86400000;
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const when = (x) => { const t = new Date(x).getTime(); return Number.isFinite(t) ? t : null; };

function countBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) m.set(keyFn(r), (m.get(keyFn(r)) || 0) + 1);
  return [...m.entries()].map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
}

/** Teacher flags on a submission (V4-05 stores them in flags); 0 until that feature exists. */
export function flaggedCount(row) {
  const f = (row && row.flags) || {};
  const list = f.teacher_flags || f.flagged_for_teacher || f.flaggedQuestions;
  return Array.isArray(list) ? list.length : 0;
}

/**
 * Everything the dashboard shows, from already-loaded data.
 *   rows   raw or normalised submission rows        tests  [{ code, title, opensAt?, closesAt? }] (published + drafts)
 *   log    [{ time, admin, action, target }]        now    ms
 */
export function computeDashboard({ rows = [], tests = [], log = [], now = Date.now() } = {}) {
  const all = rows.map((r) => (r && r.auto_responses ? r : normalizeRow(r)));
  const real = all.filter((r) => r.status !== STATUS.EXTRA);
  const toGrade = countBy(real.filter((r) => r.status === STATUS.NEEDS_GRADING), (r) => r.test_code);
  const unreleased = countBy(real.filter((r) => (r.status === STATUS.GRADED || r.status === STATUS.AUTO) && !r.released_at), (r) => r.test_code);
  const flagged = real.reduce((s, r) => s + flaggedCount(r), 0);
  const weekAgo = now - 7 * DAY;
  const submissionsThisWeek = real.filter((r) => { const t = when(r.timestamp); return t != null && t >= weekAgo && t <= now + DAY; }).length;
  const dated = real.map((r) => ({ r, t: when(r.timestamp) })).filter((x) => x.t != null).sort((a, b) => b.t - a.t);
  let latest = null;
  if (dated.length) {
    const code = dated[0].r.test_code;
    const mine = real.filter((r) => r.test_code === code);
    const avg = mine.reduce((s, r) => s + num(r.percentage), 0) / mine.length;
    latest = { code, title: dated[0].r.test_title || '', count: mine.length, average: avg };
  }
  const schedule = [];
  for (const t of tests) {
    const o = when(t.opensAt); const c = when(t.closesAt);
    if (o != null && o >= now && o <= now + 7 * DAY) schedule.push({ code: t.code, title: t.title || '', kind: 'opens', at: o, today: o - now < DAY });
    if (c != null && c >= now && c <= now + 7 * DAY) schedule.push({ code: t.code, title: t.title || '', kind: 'closes', at: c, today: c - now < DAY });
  }
  schedule.sort((a, b) => a.at - b.at);
  const recentSubmissions = dated.slice(0, 5).map(({ r }) => ({ name: r.student_name || r.student_email, code: r.test_code, at: r.timestamp, status: r.status }));
  return {
    toGrade, toGradeTotal: toGrade.reduce((s, x) => s + x.n, 0),
    unreleased, unreleasedTotal: unreleased.reduce((s, x) => s + x.n, 0),
    flagged, submissionsThisWeek, latest, schedule,
    recentSubmissions, recentLog: (log || []).slice(0, 6),
    published: tests.filter((t) => t.published !== false).length,
  };
}

function countUp(el, to, { suffix = '', decimals = 0 } = {}) {
  const fmt = (v) => `${decimals ? v.toFixed(decimals) : Math.round(v)}${suffix}`;
  if (prefersReducedMotion() || !(to > 0)) { el.textContent = fmt(to); return; }
  const start = performance.now();
  const dur = 360;
  const step = (t) => {
    const k = Math.min(1, (t - start) / dur);
    el.textContent = fmt(to * (1 - (1 - k) * (1 - k)));
    if (k < 1 && el.isConnected) requestAnimationFrame(step); else el.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}

/**
 * renderDashboard(root, ctx, { go, newTest, openInBuilder, goSettings, gradeNext })
 *   go(section)            switch the admin section
 *   gradeNext({ code })    open Grading on the oldest submission that needs grading
 */
export function renderDashboard(root, ctx, { go, newTest, openInBuilder, goSettings, gradeNext } = {}) {
  let alive = true;
  const gasUrl = CONFIG.GAS_WEB_APP_URL;
  const authed = !!gasUrl && hasAdminAuth();
  const greeting = h('h2', { class: 'dash__greet', dataset: { testid: 'dashboard-greeting' } }, pickGreeting(new Date(), firstNameOf(getUser())));
  const body = h('div', { class: 'dash__grid', 'aria-busy': 'true' }, h('div', { class: 'dash-card dash-skel' }, h('div', { class: 'adm-skeleton__row' }), h('div', { class: 'adm-skeleton__row' })));
  mount(root, h('div', { class: 'dash', dataset: { testid: 'dashboard' } },
    h('div', {}, greeting, h('p', { class: 'dash__sub' }, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))),
    body));

  const drafts = () => Object.values(getDrafts() || {});
  let idx = 0;
  const card = (title, iconName, content, { wide = false, testid } = {}) => h('section', { class: ['dash-card', wide && 'dash-card--wide'], style: `--i:${idx++}`, dataset: { testid }, 'aria-label': title },
    h('h3', { class: 'dash-card__title' }, icon(iconName, { size: 18 }), title), content);

  // Cached on the store: coming back to the dashboard paints at once and refreshes in the background.
  const resultsRes = resultsResource();
  const pubRes = publishedTestsResource();
  const logRes = logResource();
  let version = null;
  function paint() {
    if (!alive) return;
    const rows = resultsRes.peek() ? resultsRes.peek().rows : null;
    const pub = pubRes.peek() || null;
    const log = logRes.peek() || null;
    const tests = [...(pub || []), ...drafts().map((d) => ({ code: d.code, title: d.title, opensAt: d.opensAt, closesAt: d.closesAt, published: false }))];
    const data = computeDashboard({ rows: rows || [], tests, log: log || [] });
    draw({ data, haveRows: !!rows, havePub: !!pub, haveLog: !!(log && log.length), version });
  }
  let painted = false;
  const unsubs = authed ? [resultsRes, pubRes, logRes].map((r) => r.subscribe(() => { if (painted) paint(); })) : [];

  async function load() {
    const settle = (p) => p.then((v) => v, () => null);
    if (!authed) { paint(); painted = true; return; }
    const ver = settle(checkBackendVersion({ gasUrl })).then((v) => { version = v; if (painted) paint(); });
    await Promise.all([settle(resultsRes.get()), settle(pubRes.get()), settle(logRes.get())]);
    if (!alive) return;
    painted = true;
    paint();
    await ver;
  }

  function draw({ data, haveRows, havePub, haveLog, version }) {
    idx = 0;
    const cards = [];
    if (!authed) {
      cards.push(h('div', { class: 'dash-card dash-card--wide', style: '--i:0' }, h('div', { class: 'notice notice--info' }, icon('info'),
        h('span', {}, 'Connect your Google Sheet to see submissions here. ', h('button', { class: 'dash-link', type: 'button', on: { click: () => goSettings?.() } }, 'Open Settings')))));
    }
    if (version && version.outdated) {
      cards.push(h('div', { class: 'dash-card dash-card--wide', style: '--i:0', dataset: { testid: 'dash-version' } },
        h('div', { class: 'dash-banner' }, icon('alert'), h('span', {}, `The Apps Script backend is version ${version.backendVersion || 'older than 3.0.0'}; this site is ${version.siteVersion}. Update Code.gs (see Settings).`),
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => goSettings?.() } }, 'Settings'))));
    }
    if (haveRows) {
      const attention = h('ul', { class: 'dash-list' });
      for (const x of data.toGrade) {
        attention.appendChild(h('li', { dataset: { testid: `dash-grade-${x.code}` } }, icon('pen', { size: 16 }), h('strong', {}, String(x.n)), `to grade in ${x.code}`, h('span', { class: 'spacer' }),
          h('button', { class: 'dash-link', type: 'button', on: { click: () => gradeNext?.({ code: x.code }) } }, 'Grade')));
      }
      for (const x of data.unreleased) {
        attention.appendChild(h('li', {}, icon('send', { size: 16 }), h('strong', {}, String(x.n)), `graded, not released in ${x.code}`));
      }
      if (data.flagged) attention.appendChild(h('li', {}, icon('flag', { size: 16 }), h('strong', {}, String(data.flagged)), 'questions flagged by students'));
      cards.push(card('Needs attention', 'alert', attention.children.length ? attention : h('p', { class: 'muted', dataset: { testid: 'dash-all-clear' } }, 'Nothing to grade or release'), { testid: 'dash-attention' }));
    }
    if (data.schedule.length) {
      cards.push(card('Today and this week', 'clock', h('ul', { class: 'dash-list' }, data.schedule.map((s) => h('li', {},
        h('span', { class: ['pill', s.kind === 'closes' ? 'pill--warning' : 'pill--primary'] }, s.kind === 'closes' ? 'Closes' : 'Opens'), h('strong', {}, s.code), h('span', { class: 'muted' }, s.today ? 'today' : fmtDate(s.at))))), { testid: 'dash-schedule' }));
    }
    if (haveRows || havePub) {
      const stats = h('div', { class: 'dash-stats' });
      const stat = (label, value, opts) => { const v = h('span', { class: 'dash-stat__value' }, '0'); countUp(v, value, opts); stats.appendChild(h('div', { class: 'dash-stat' }, v, h('span', { class: 'dash-stat__label' }, label))); };
      if (havePub) stat('Tests published', data.published);
      if (haveRows) {
        stat('Submissions this week', data.submissionsThisWeek);
        if (data.latest) stat(`Class average, ${data.latest.code}`, data.latest.average, { suffix: '%', decimals: 1 });
      }
      cards.push(card('Quick stats', 'chart', h('div', { class: 'stack' }, stats), { testid: 'dash-stats' }));
    }
    if (haveRows && data.recentSubmissions.length) {
      cards.push(card('Recent activity', 'inbox', h('ul', { class: 'dash-list' }, data.recentSubmissions.map((s) => h('li', {},
        h('strong', {}, s.name || 'Student'), h('span', { class: 'muted' }, `${s.code} · ${fmtDate(s.at)}`)))), { testid: 'dash-activity' }));
    }
    if (haveLog) {
      cards.push(card('Admin actions', 'list', h('ul', { class: 'dash-list' }, data.recentLog.map((l) => h('li', {},
        h('strong', {}, l.action), h('span', { class: 'muted' }, [l.target, l.admin, fmtDate(l.time)].filter(Boolean).join(' · ')))), ), { testid: 'dash-log' }));
    }
    const last = drafts().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
    const actions = h('div', { class: 'dash-actions' },
      h('button', { class: 'btn btn--primary', type: 'button', dataset: { testid: 'dash-new-test' }, on: { click: () => newTest?.() } }, icon('plus', { size: 16 }), 'New test'),
      h('button', { class: 'btn btn--ghost', type: 'button', disabled: !last, title: last ? `Open ${last.code} in the builder` : 'No drafts yet', dataset: { testid: 'dash-open-last' },
        on: { click: () => { try { openInBuilder?.(normalizeTest(last)); } catch { toast('Could not open that draft.', { type: 'error' }); } } } }, icon('list', { size: 16 }), 'Open last edited'),
      h('button', { class: 'btn btn--ghost', type: 'button', disabled: !data.toGradeTotal, dataset: { testid: 'dash-grade-next' }, on: { click: () => gradeNext?.({ code: data.toGrade[0]?.code }) } }, icon('pen', { size: 16 }), 'Grade next'),
      h('button', { class: 'btn btn--ghost', type: 'button', disabled: !data.unreleasedTotal, dataset: { testid: 'dash-release-all' }, on: { click: () => confirmRelease(data.unreleased) } }, icon('send', { size: 16 }), 'Release all'));
    cards.push(card('Quick actions', 'list', actions, { wide: true, testid: 'dash-actions' }));
    body.removeAttribute('aria-busy');
    mount(body, cards);
  }

  function confirmRelease(list) {
    const total = list.reduce((s, x) => s + x.n, 0);
    openModal({
      title: 'Release all graded submissions?', testid: 'dash-release-modal',
      body: `${total} graded submission${total === 1 ? '' : 's'} across ${list.length} test${list.length === 1 ? '' : 's'} will be released. Students then see their score, answers and your comments.`,
      actions: [
        { label: 'Cancel', variant: 'ghost', autofocus: true },
        { label: 'Release all', variant: 'primary', testid: 'dash-confirm-release', onClick: async (close) => {
          close();
          let released = 0; let failed = 0;
          for (const x of list) {
            const r = await releaseAll({ gasUrl, adminKey: adminKey(), testCode: x.code });
            if (r.ok) released += r.released || 0; else failed++;
          }
          toast(failed ? `Released ${released}; ${failed} test${failed === 1 ? '' : 's'} failed` : `Released ${released} submission${released === 1 ? '' : 's'}`, { type: failed ? 'warning' : 'success' });
          if (alive) resultsRes.refresh();
        } },
      ],
    });
  }

  load();
  return () => { alive = false; unsubs.forEach((u) => u()); };
}

