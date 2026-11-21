// Shared date text (js/lib/dates.js) and the removal of the four older copies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toMillis, formatDate, formatDue, formatRelative } from '../../js/lib/dates.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('toMillis reads numbers, numeric strings, ISO strings and Dates', () => {
  const iso = '2026-03-03T09:30:00.000Z';
  const ms = Date.parse(iso);
  assert.equal(toMillis(ms), ms);
  assert.equal(toMillis(String(ms)), ms);
  assert.equal(toMillis(iso), ms);
  assert.equal(toMillis(new Date(ms)), ms);
});

test('toMillis gives null for empty and invalid values', () => {
  for (const v of [null, undefined, '', 'not a date', NaN, new Date('x')]) assert.equal(toMillis(v), null, String(v));
});

test('formatDate returns the fallback for an empty or invalid value', () => {
  assert.equal(formatDate(''), '');
  assert.equal(formatDate('nope'), '');
  assert.equal(formatDate(null, { fallback: '—' }), '—');
});

test('formatDate shows the date and time, or only the date', () => {
  const when = new Date(2026, 2, 3, 9, 30).toISOString();
  const full = formatDate(when);
  const dateOnly = formatDate(when, { time: false });
  assert.match(full, /2026/);
  assert.ok(full.length > dateOnly.length, `"${full}" should be longer than "${dateOnly}"`);
  assert.match(dateOnly, /2026/);
});

test('formatDue joins a short date and a time, with a plain fallback', () => {
  const when = new Date(2026, 2, 3, 9, 30);
  assert.equal(formatDue(when), `${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`);
  assert.equal(formatDue(null), 'No due date');
  assert.equal(formatDue('', { fallback: '—' }), '—');
});

test('formatRelative: just now, minutes, hours, then the date', () => {
  const now = Date.parse('2026-03-03T12:00:00Z');
  assert.equal(formatRelative(now - 20 * 1000, now), 'Just now');
  assert.equal(formatRelative(now - 5 * 60000, now), '5 min ago');
  assert.equal(formatRelative(now - 3 * 3600000, now), '3 h ago');
  const old = now - 3 * 86400000;
  assert.equal(formatRelative(old, now), new Date(old).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
  assert.equal(formatRelative('', now), '');
  assert.equal(formatRelative(now + 60000, now), 'Just now', 'a time slightly in the future is not negative');
});

test('the views no longer format dates themselves', () => {
  for (const f of ['js/views/submitted.js', 'js/views/admin/common.js', 'js/views/admin/hub/data.js', 'js/views/notifications.js']) {
    assert.doesNotMatch(read(f), /toLocale(Date|Time)?String\(/, `${f} should use js/lib/dates.js`);
  }
});
