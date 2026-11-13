// Question tags. A tag lives in this browser (like a draft) until a published test uses it; publishing writes it to
// the Tags sheet, and from then on the Sheet is the source of truth for its name and colour.
//
//   Local store: storage key `tags:<email>` -> [{ id, name, color, description, onSheet, updatedAt }]
//   Questions hold IDs only: question.tags = ['tg_ab12cd', ...] (at most MAX_TAGS).

import { load, save } from './storage.js';

export const MAX_TAGS = 10;
export const TAG_COLORS = ['navy', 'teal', 'green', 'amber', 'red', 'violet', 'slate'];
const ID_RE = /^tg_[A-Za-z0-9]{4,16}$/;

const norm = (e) => String(e || '').trim().toLowerCase();
const keyFor = (email) => `tags:${norm(email) || 'local'}`;
const cleanName = (n) => String(n ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);

export function isTagId(id) { return ID_RE.test(String(id || '')); }

export function newTagId(rand = Math.random) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += abc[Math.floor(rand() * abc.length)];
  return `tg_${s}`;
}

/** Every local tag for this teacher, including ones already on the Sheet (flagged onSheet). */
export function localTags(email) {
  const list = load(keyFor(email), []);
  return Array.isArray(list) ? list.filter((t) => t && isTagId(t.id)) : [];
}

function write(email, list) { save(keyFor(email), list); return list; }

export function createLocalTag(email, { name, color = '', description = '' } = {}) {
  const n = cleanName(name);
  if (!n) return null;
  const list = localTags(email);
  const dup = list.find((t) => t.name.toLowerCase() === n.toLowerCase());
  if (dup) return dup;
  const tag = { id: newTagId(), name: n, color: TAG_COLORS.includes(color) ? color : TAG_COLORS[list.length % TAG_COLORS.length], description: String(description).slice(0, 300), onSheet: false, updatedAt: Date.now() };
  write(email, [...list, tag]);
  return tag;
}

/** Rename / recolour a local tag. Tags already on the Sheet are edited through the Sheet instead. */
export function updateLocalTag(email, id, patch = {}) {
  const list = localTags(email);
  const t = list.find((x) => x.id === id);
  if (!t || t.onSheet) return null;
  if (patch.name !== undefined && cleanName(patch.name)) t.name = cleanName(patch.name);
  if (patch.color !== undefined && TAG_COLORS.includes(patch.color)) t.color = patch.color;
  if (patch.description !== undefined) t.description = String(patch.description).slice(0, 300);
  t.updatedAt = Date.now();
  write(email, list);
  return t;
}

export function deleteLocalTag(email, id) {
  const list = localTags(email);
  const next = list.filter((t) => t.id !== id || t.onSheet);
  write(email, next);
  return next.length !== list.length;
}

/** After a successful publish: these IDs now live on the Sheet. */
export function markOnSheet(email, ids) {
  const set = new Set(ids || []);
  const list = localTags(email);
  let changed = false;
  list.forEach((t) => { if (set.has(t.id) && !t.onSheet) { t.onSheet = true; changed = true; } });
  if (changed) write(email, list);
  return changed;
}

/** Replace the whole local list (backup restore). Unknown or malformed entries are dropped. */
export function restoreLocalTags(email, list) {
  const clean = (Array.isArray(list) ? list : []).filter((t) => t && isTagId(t.id) && cleanName(t.name))
    .map((t) => ({ id: t.id, name: cleanName(t.name), color: TAG_COLORS.includes(t.color) ? t.color : 'slate', description: String(t.description || '').slice(0, 300), onSheet: !!t.onSheet, updatedAt: Number(t.updatedAt) || Date.now() }));
  const byId = new Map(localTags(email).map((t) => [t.id, t]));
  clean.forEach((t) => byId.set(t.id, t));
  return write(email, [...byId.values()]);
}

/** Tag IDs used anywhere in a test. */
export function tagIdsOf(test) {
  const ids = new Set();
  for (const q of test?.questions || []) for (const id of q?.tags || []) ids.add(id);
  return [...ids];
}

/** Definitions sent with publishTest: every local tag the test uses that has a definition here. */
export function tagDefsFor(test, email) {
  const used = new Set(tagIdsOf(test));
  return localTags(email).filter((t) => used.has(t.id)).map(({ id, name, color, description }) => ({ id, name, color, description }));
}

/**
 * One lookup for names: local tags first, then Sheet tags (`sheet` = listTags rows), then a test's tagIndex.
 * Returns Map(id -> { id, name, color, mine, onSheet, ownerEmail }).
 */
export function tagLookup({ email = '', local, sheet = [], index = {} } = {}) {
  const me = norm(email);
  const map = new Map();
  for (const [id, t] of Object.entries(index || {})) map.set(id, { id, name: t.name, color: t.color, mine: false, onSheet: true, ownerEmail: '' });
  for (const t of sheet || []) map.set(t.id, { id: t.id, name: t.name, color: t.color, mine: norm(t.ownerEmail) === me, onSheet: true, ownerEmail: t.ownerEmail || '', questions: t.questions || 0, tests: t.tests || 0 });
  for (const t of local || localTags(email)) if (!t.onSheet || !map.has(t.id)) map.set(t.id, { id: t.id, name: t.name, color: t.color, mine: true, onSheet: !!t.onSheet, ownerEmail: me });
  return map;
}

/**
 * Import: questions may carry tag names ("tags": ["Ions"]). Names match local tags first, then Sheet tags.
 * -> { test, unknown: [names] }. Unknown names are left out of the questions; pass createMissing to make local tags.
 */
export function resolveTagNames(test, { email = '', sheet = [], createMissing = false } = {}) {
  const local = localTags(email);
  const byName = (list, n) => list.find((t) => String(t.name).toLowerCase() === n.toLowerCase());
  const unknown = new Set();
  const questions = (test?.questions || []).map((q) => {
    if (!Array.isArray(q?.tags) || !q.tags.length) return q;
    const ids = [];
    for (const raw of q.tags) {
      const v = String(raw || '').trim();
      if (!v) continue;
      if (isTagId(v)) { ids.push(v); continue; }
      const hit = byName(local, v) || byName(sheet, v);
      if (hit) ids.push(hit.id);
      else if (createMissing) { const t = createLocalTag(email, { name: v }); if (t) { local.push(t); ids.push(t.id); } }
      else unknown.add(v);
    }
    return { ...q, tags: [...new Set(ids)].slice(0, MAX_TAGS) };
  });
  return { test: { ...test, questions }, unknown: [...unknown] };
}

/**
 * Points per tag from graded responses. `results` = [{ id, pointsEarned, pointsPossible }] (the stored responses),
 * `grades` = teacher overrides { qid: points }. Questions still waiting for a teacher are left out.
 * -> [{ id, earned, possible }] in first-seen order.
 */
export function scoresByTag(test, results = [], grades = {}) {
  const byQ = new Map((results || []).map((r) => [String(r.id ?? r.questionId), r]));
  const out = new Map();
  for (const q of test?.questions || []) {
    if (!q?.tags?.length) continue;
    const r = byQ.get(String(q.id));
    if (!r) continue;
    const possible = Number(r.pointsPossible ?? r.points ?? q.points ?? 1) || 0;
    const override = grades && grades[q.id] !== undefined && grades[q.id] !== null && grades[q.id] !== '' ? Number(grades[q.id]) : null;
    if (override === null && (r.pending || r.needsGrading)) continue;
    const earned = override !== null ? override : Number(r.pointsEarned ?? r.earned ?? 0) || 0;
    for (const id of q.tags) {
      const s = out.get(id) || { id, earned: 0, possible: 0 };
      s.earned += earned; s.possible += possible;
      out.set(id, s);
    }
  }
  return [...out.values()];
}

/** "Ions 8/10 · Stoichiometry 3/6" */
export function byTopicText(scores, lookup) {
  return scores.map((s) => `${lookup.get(s.id)?.name || 'Untitled tag'} ${round(s.earned)}/${round(s.possible)}`).join(' · ');
}
const round = (n) => Math.round(n * 100) / 100;

/** Questions in a test that carry `id` (merge rewrite helper, also used locally for drafts). */
export function replaceTagInTest(test, from, into) {
  return { ...test, questions: (test?.questions || []).map((q) => (q?.tags?.includes(from) ? { ...q, tags: [...new Set(q.tags.map((x) => (x === from ? into : x)))] } : q)) };
}
