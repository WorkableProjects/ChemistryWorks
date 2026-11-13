// Shared date formatting. Every function returns '' (or the fallback) for a missing or unreadable date.
const parse = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) && t > 0 ? new Date(t) : null;
};

/** "Nov 13, 2026, 3:41 PM" */
export function formatDateTime(v, fallback = '') {
  const d = parse(v);
  return d ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : fallback;
}

/** "Nov 13, 2026" */
export function formatDate(v, fallback = '') {
  const d = parse(v);
  return d ? d.toLocaleDateString(undefined, { dateStyle: 'medium' }) : fallback;
}

/** "Due Nov 13, 2026, 3:41 PM" or "No due date". */
export function formatDue(v) {
  const s = formatDateTime(v);
  return s ? `Due ${s}` : 'No due date';
}
