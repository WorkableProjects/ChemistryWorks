// Date text shared by the student and teacher views. Pure functions; locale comes from the browser.

/** ms since the epoch from a number, a numeric string, an ISO string or a Date; null when empty or not a date. */
export function toMillis(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const n = typeof value === 'number' ? value : (/^\d+$/.test(String(value)) ? Number(value) : Date.parse(value));
  return Number.isFinite(n) ? n : null;
}

/** "Mar 3, 2026, 9:30 AM". `fallback` is returned for an empty or invalid value. `time: false` drops the time. */
export function formatDate(value, { fallback = '', time = true } = {}) {
  const ms = toMillis(value);
  if (ms == null) return fallback;
  return new Date(ms).toLocaleString(undefined, time ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

/** "3 Mar, 9:30 AM" for a due time; `fallback` when there is none. */
export function formatDue(value, { fallback = 'No due date' } = {}) {
  const ms = toMillis(value);
  if (ms == null) return fallback;
  const d = new Date(ms);
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/** "Just now", "5 min ago", "3 h ago", then the short date ("3 Mar"). Empty string for an empty or invalid value. */
export function formatRelative(value, now = Date.now()) {
  const ms = toMillis(value);
  if (ms == null) return '';
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
