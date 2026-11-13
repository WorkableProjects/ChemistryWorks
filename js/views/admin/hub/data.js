// Class Hub (teacher) data on the store: assignments, stream posts and per-assignment status are cached
// resources under the `hub` name. Writes are optimistic and roll back with a Retry toast.
import { resource } from '../../../lib/store.js';
import { CONFIG } from '../../../config.js';
import { adminKey } from '../../../lib/admin-session.js';
import { listAssignments, adminCall, getAssignmentStatus } from '../../../lib/api.js';
import { formatDateTime } from '../../../lib/dates.js';

export const creds = () => ({ gasUrl: CONFIG.GAS_WEB_APP_URL, adminKey: adminKey() });

/** Every assignment of every class. */
export const assignmentsRes = () => resource('hub', { key: 'assignments', fetch: async () => {
  const r = await listAssignments(creds());
  if (!r.ok) throw new Error(r.error || 'Request failed');
  return r.data.assignments || [];
} });

/**
 * Stream posts of one class. The backend has no teacher-side stream listing yet: `listStream` is tried first, and
 * when it is unknown the posts this browser made (kept in the warm cache) are shown instead.
 */
export const streamRes = (classId) => {
  const res = resource('hub', { key: `stream:${classId}`, fetch: async () => {
    const r = await adminCall('listStream', { classId }, creds());
    if (r.ok && Array.isArray(r.data.posts)) return r.data.posts;
    return res.peek() || [];
  } });
  return res;
};

export const statusRes = (id) => resource('hub', { key: `status:${id}`, ttl: 15000, fetch: async () => {
  const r = await getAssignmentStatus({ ...creds(), id });
  if (!r.ok) throw new Error(r.error || 'Request failed');
  return { assignment: r.data.assignment, rows: r.data.rows || [], sync: r.data.classroomSync || {} };
} });

export const STATUS = {
  not_started: { label: 'Not started', cls: '' },
  in_progress: { label: 'In progress', cls: 'pill--primary' },
  turned_in: { label: 'Turned in', cls: 'pill--success' },
  late: { label: 'Late', cls: 'pill--warning' },
  missing: { label: 'Missing', cls: 'pill--danger' },
  graded: { label: 'Graded', cls: 'pill--success' },
  released: { label: 'Released', cls: 'pill--success' },
};
export const STATUS_ORDER = ['missing', 'late', 'in_progress', 'not_started', 'turned_in', 'graded', 'released'];

/** ISO string -> value for <input type="datetime-local"> (local time). */
export function toLocalInput(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : '');

export const fmtWhen = (iso) => formatDateTime(iso);

/** Where a teacher opens a student's page. */
export const studentHref = (email) => `?admin=true&section=student&email=${encodeURIComponent(email)}`;
