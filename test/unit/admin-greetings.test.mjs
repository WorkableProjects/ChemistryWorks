import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOTS, DAYS, pickGreeting, greetingPool, slotForHour, fillName, firstNameOf } from '../../js/lib/greetings.js';
import { navLayout, navGroups, registerNavItem, showTestTabs, testTabFor, breadcrumbFor, initialsOf, avatarTone, NAV_ITEMS, TEST_TABS } from '../../js/views/admin/shell.js';
import { computeDashboard, flaggedCount } from '../../js/views/admin/dashboard.js';
import { matchesLibraryFilter } from '../../js/views/admin/library.js';

const at = (y, m, d, hh = 12) => new Date(y, m - 1, d, hh, 0, 0);

test('every time slot has at least 10 greetings, each with a name placeholder', () => {
  assert.equal(SLOTS.length, 6);
  for (const s of SLOTS) {
    assert.ok(s.lines.length >= 10, `${s.id} has ${s.lines.length}`);
    for (const l of s.lines) assert.ok(l.includes('{FirstName}'), l);
  }
});

test('slotForHour covers all 24 hours with the plan boundaries', () => {
  const want = { 5: 'early', 7: 'early', 8: 'morning', 11: 'morning', 12: 'afternoon', 16: 'afternoon', 17: 'evening', 20: 'evening', 21: 'night', 23: 'night', 0: 'night', 1: 'verylate', 4: 'verylate' };
  for (const [h, id] of Object.entries(want)) assert.equal(slotForHour(Number(h)), id, `hour ${h}`);
  for (let h = 0; h < 24; h++) assert.ok(SLOTS.some((s) => s.id === slotForHour(h)));
});

test('pickGreeting uses the name, the slot pool and the injected random source', () => {
  const d = at(2026, 11, 4, 9); // a Wednesday morning
  const first = pickGreeting(d, 'Ada', () => 0);
  assert.ok(first.includes('Ada') && !first.includes('{'));
  assert.ok(greetingPool(d).includes(SLOTS.find((s) => s.id === 'morning').lines[0]));
  const last = pickGreeting(d, 'Ada', () => 0.999999);
  assert.ok(last.includes('Ada'));
  assert.notEqual(first, last);
  // out-of-range random values never crash
  assert.ok(pickGreeting(d, 'Ada', () => 5));
  assert.ok(pickGreeting(d, 'Ada', () => NaN));
});

test('day-of-week greetings join the pool', () => {
  const fri = greetingPool(at(2026, 11, 6, 9));
  assert.ok(fri.includes(DAYS[5][0]));
  assert.ok(greetingPool(at(2026, 11, 7, 9)).includes(DAYS[6][0]));
});

test('Mole Day (Oct 23) replaces the normal pool', () => {
  const pool = greetingPool(at(2026, 10, 23, 14));
  assert.ok(pool.every((l) => /Mole Day/.test(l)));
  assert.match(pickGreeting(at(2026, 10, 23, 3), 'Ada', () => 0), /Happy Mole Day, Ada!/);
});

test('no name: placeholders and their punctuation vanish', () => {
  for (const s of SLOTS) for (const l of s.lines) {
    const out = fillName(l, '');
    assert.ok(!out.includes('{') && !out.includes('}'), out);
    assert.ok(!/\s{2}|,\s*$|\s[?!.,]/.test(out), `"${out}"`);
    assert.ok(out.length > 3);
  }
  assert.equal(fillName('Good morning, {FirstName}', ''), 'Good morning');
  assert.equal(fillName('Hey {FirstName}, ready to react?', ''), 'Hey, ready to react?');
  assert.equal(fillName('Bed. Now. {FirstName}.', ''), 'Bed. Now.');
  assert.equal(fillName('Happy Friday, {FirstName}!', ''), 'Happy Friday!');
  assert.equal(fillName('Up before the bell, {FirstName}?', ''), 'Up before the bell?');
  assert.equal(fillName('Good morning, {FirstName}', '  Ada '), 'Good morning, Ada');
});

test('firstNameOf takes the first word of a display name and ignores emails', () => {
  assert.equal(firstNameOf({ name: 'Ada Lovelace' }), 'Ada');
  assert.equal(firstNameOf({ given_name: 'Grace', name: 'G. Hopper' }), 'Grace');
  assert.equal(firstNameOf({ name: 'ada@example.org' }), '');
  assert.equal(firstNameOf(null), '');
});

test('navLayout: full >= 1200, icons-only 768-1199, drawer below 768, remembered preference wins', () => {
  assert.deepEqual(navLayout(1440), { mode: 'full', open: true });
  assert.deepEqual(navLayout(1200), { mode: 'full', open: true });
  assert.deepEqual(navLayout(1199), { mode: 'rail', open: true });
  assert.deepEqual(navLayout(768), { mode: 'rail', open: true });
  assert.deepEqual(navLayout(767), { mode: 'drawer', open: false });
  assert.deepEqual(navLayout(390, null, true), { mode: 'drawer', open: true });
  assert.equal(navLayout(1440, true).mode, 'rail');
  assert.equal(navLayout(900, false).mode, 'full');
  assert.equal(navLayout(390, false, false).mode, 'drawer');
});

test('navGroups hides entries whose view is not registered yet, and shows them once it is', () => {
  const items = NAV_ITEMS.map((x) => ({ ...x }));
  let g = navGroups(items);
  assert.deepEqual(g.map((x) => x.id), ['teaching', 'bottom']);
  assert.deepEqual(g[0].items.map((x) => x.id), ['dashboard', 'library', 'builder', 'grading']);
  assert.deepEqual(g[1].items.map((x) => x.id), ['settings']);
  registerNavItem({ id: 'bank', render: () => {} }, items);
  registerNavItem({ id: 'live', label: 'Live', icon: 'play', group: 'tools', render: () => {} }, items);
  g = navGroups(items);
  assert.deepEqual(g[1].items.map((x) => x.id), ['bank', 'live']);
  assert.equal(items.filter((x) => x.id === 'bank').length, 1);
});

test('in-test tabs and breadcrumb', () => {
  assert.equal(showTestTabs('builder', 'CHEM101'), true);
  assert.equal(showTestTabs('builder', ''), false);
  assert.equal(showTestTabs('dashboard', 'CHEM101'), false);
  assert.equal(testTabFor('builder'), 'questions');
  assert.equal(testTabFor('grading'), 'submissions');
  assert.equal(testTabFor('builder', 'settings'), 'settings');
  assert.equal(testTabFor('grading', 'settings'), 'submissions');
  assert.deepEqual(TEST_TABS.map((t) => t.label), ['Overview', 'Questions', 'Submissions', 'Settings']);
  assert.deepEqual(breadcrumbFor(NAV_ITEMS, 'grading', 'UNIT3').map((p) => p.label), ['ChemWorks', 'Grading', 'UNIT3']);
  assert.deepEqual(breadcrumbFor(NAV_ITEMS, 'dashboard').map((p) => p.label), ['ChemWorks', 'Dashboard']);
});

test('initials and avatar tone', () => {
  assert.equal(initialsOf('Ada Lovelace'), 'AL');
  assert.equal(initialsOf('Plato'), 'PL');
  assert.equal(initialsOf('', 'grace.hopper@example.org'), 'GH');
  assert.equal(initialsOf('', ''), '?');
  assert.ok([0, 1, 2, 3].includes(avatarTone('Ada')));
  assert.equal(avatarTone('Ada'), avatarTone('Ada'));
});

test('computeDashboard: grading queues, unreleased, week count, latest average, schedule', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  const row = (o) => ({ submission_id: o.id, test_code: o.code, test_title: o.code, student_name: o.id, timestamp: o.t, score_achieved: o.pct, score_total: 100, percentage: o.pct, status: o.status, released_at: o.rel || '', needs_grading: o.status === 'Needs grading', responses: [] });
  const rows = [
    row({ id: 'a', code: 'U1', t: '2026-11-03T10:00:00Z', pct: 80, status: 'Needs grading' }),
    row({ id: 'b', code: 'U1', t: '2026-11-02T10:00:00Z', pct: 60, status: 'Graded' }),
    row({ id: 'c', code: 'U2', t: '2026-10-01T10:00:00Z', pct: 90, status: 'Graded', rel: '2026-10-02T00:00:00Z' }),
    row({ id: 'd', code: 'U1', t: '2026-11-03T11:00:00Z', pct: 10, status: 'Extra attempt' }),
    row({ id: 'e', code: 'U3', t: '2026-11-03T09:00:00Z', pct: 50, status: 'Needs grading' }),
  ];
  const tests = [{ code: 'U1', title: 'Unit 1', closesAt: '2026-11-04T20:00:00Z' }, { code: 'U2', opensAt: '2026-11-09T12:00:00Z' }, { code: 'U3', closesAt: '2026-12-25T00:00:00Z' }];
  const d = computeDashboard({ rows, tests, log: [{ action: 'saveGrade' }], now });
  assert.deepEqual(d.toGrade, [{ code: 'U1', n: 1 }, { code: 'U3', n: 1 }]);
  assert.equal(d.toGradeTotal, 2);
  assert.deepEqual(d.unreleased, [{ code: 'U1', n: 1 }]);
  assert.equal(d.submissionsThisWeek, 3, 'extra attempts and old rows are not counted');
  assert.equal(d.latest.code, 'U1');
  assert.equal(d.latest.count, 2);
  assert.equal(Math.round(d.latest.average), 70);
  assert.deepEqual(d.schedule.map((s) => [s.code, s.kind, s.today]), [['U1', 'closes', true], ['U2', 'opens', false]]);
  assert.equal(d.recentSubmissions.length, 4);
  assert.equal(d.recentLog.length, 1);
  assert.equal(d.flagged, 0);
});

test('computeDashboard copes with no data', () => {
  const d = computeDashboard({});
  assert.equal(d.toGradeTotal, 0);
  assert.equal(d.latest, null);
  assert.deepEqual(d.schedule, []);
});

test('flaggedCount reads teacher flags when present', () => {
  assert.equal(flaggedCount({ flags: { teacher_flags: ['q1', 'q2'] } }), 2);
  assert.equal(flaggedCount({ flags: {} }), 0);
  assert.equal(flaggedCount(null), 0);
});

test('library search and filters', () => {
  const a = { code: 'CHEM101', title: 'Atoms and ions', source: 'published' };
  const b = { code: 'CHEM102', title: 'Bonding', source: 'bundled' };
  const counts = { CHEM101: 3 };
  const grading = new Set(['CHEM101']);
  assert.equal(matchesLibraryFilter(a, { query: 'atoms' }), true);
  assert.equal(matchesLibraryFilter(a, { query: 'bond' }), false);
  assert.equal(matchesLibraryFilter(b, { query: '102' }), true);
  assert.equal(matchesLibraryFilter(b, { filters: ['published'] }), false);
  assert.equal(matchesLibraryFilter(a, { filters: ['published', 'submissions'], counts }), true);
  assert.equal(matchesLibraryFilter(b, { filters: ['submissions'], counts }), false);
  assert.equal(matchesLibraryFilter(a, { filters: ['grading'], grading }), true);
  assert.equal(matchesLibraryFilter(b, { filters: ['grading'], grading }), false);
  assert.equal(matchesLibraryFilter(a, { filters: ['grading'] }), false);
});
