// Question tags. A tag is local (browser storage, like a draft) until a published test uses it; publishing writes it to
// the Sheet's Tags sheet, and from then on the Sheet is the source of truth. Only the owner edits a Sheet tag.
//
//   Local store       key `tags:<email>` (storage.js adds `cw:`): [{ id, name, color, description, onSheet, updatedAt }]
//   Sheet tags        the store resource `tags` (listTags): [{ id, ownerEmail, ownerName, name, color, description, mergedInto, usage }]
//   resolve(ids)      display records, local first, then Sheet (following mergedInto)
//   tagDefsFor(test)  the definitions publishTest sends

import { load, save } from './storage.js';
import { resource } from './store.js';
import { listTags } from './api.js';
import { getUser } from './auth.js';
import { confirmedAdminEmail } from './admin-session.js';

export const TAG_COLORS = ['blue', 'violet', 'teal', 'green', 'orange', 'rose', 'gray'];
export const TAG_ID_RE = /^tg_[0-9a-z]{6}$/;
export const TAG_NAME_MAX = 40;
export const TAG_DESCRIPTION_MAX = 200;
export const UNKNOWN_TAG_NAME = 'Unknown tag';

/** CSS custom properties (css/base.css) behind a tag colour: { bg, ink }. */
export const tagColorTokens = (color) => {
  const c = TAG_COLORS.includes(color) ? color : 'gray';
  return { bg: `--tag-${c}-bg`, ink: `--tag-${c}-ink` };
};

const lower = (s) => String(s || '').trim().toLowerCase();

/** Whose local store to use: the confirmed Google admin, else the signed-in user, else the demo admin. */
export function currentEmail() {
  return lower(confirmedAdminEmail() || getUser()?.email) || 'local';
}

const storeKey = (email) => `tags:${lower(email) || 'local'}`;

function clean(raw) {
  const color = TAG_COLORS.includes(raw?.color) ? raw.color : 'blue';
  return {
    id: String(raw?.id || ''),
    name: String(raw?.name ?? '').trim().slice(0, TAG_NAME_MAX),
    color,
    description: String(raw?.description ?? '').trim().slice(0, TAG_DESCRIPTION_MAX),
    onSheet: raw?.onSheet === true,
    updatedAt: String(raw?.updatedAt || ''),
  };
}

/** All local tags for this teacher (a damaged store reads as empty). */
export function listLocal(email = currentEmail()) {
  const raw = load(storeKey(email), []);
  return (Array.isArray(raw) ? raw : []).filter((t) => t && TAG_ID_RE.test(String(t.id))).map(clean);
}

export function writeLocal(list, email = currentEmail()) {
  return save(storeKey(email), list.map(clean));
}

/** `tg_` plus 6 base-36 characters that no tag in `taken` uses. `rand` returns a number in [0, 1). */
export function newTagId(taken = [], rand = Math.random) {
  const used = new Set(taken);
  for (let tries = 0; tries < 1000; tries++) {
    let s = '';
    for (let i = 0; i < 6; i++) s += Math.floor(rand() * 36).toString(36);
    const id = `tg_${s}`;
    if (!used.has(id)) return id;
  }
  throw new Error('Could not make a tag id');
}

const now = () => new Date().toISOString();

/**
 * Make a local tag. A local tag with the same name (any case) is returned instead of a duplicate.
 * Throws when the name is empty.
 */
export function createTag({ name, color, description = '' } = {}, { email = currentEmail(), rand } = {}) {
  const nm = String(name ?? '').trim().slice(0, TAG_NAME_MAX);
  if (!nm) throw new Error('A tag needs a name.');
  const list = listLocal(email);
  const same = list.find((t) => lower(t.name) === lower(nm));
  if (same) return same;
  const used = list.map((t) => t.id).concat((sheetTags() || []).map((t) => t.id));
  const tag = clean({
    id: newTagId(used, rand),
    name: nm,
    color: color || TAG_COLORS[list.length % TAG_COLORS.length],
    description,
    onSheet: false,
    updatedAt: now(),
  });
  writeLocal([...list, tag], email);
  return tag;
}

/** Rename or recolour a local tag. A tag that is already on the Sheet is edited with saveTag, so this returns null for it. */
export function updateLocalTag(id, patch = {}, { email = currentEmail() } = {}) {
  const list = listLocal(email);
  const i = list.findIndex((t) => t.id === id);
  if (i < 0 || list[i].onSheet) return null;
  const next = clean({ ...list[i], ...patch, id, onSheet: false, updatedAt: now() });
  if (!next.name) return null;
  list[i] = next;
  writeLocal(list, email);
  return next;
}

/** Delete a local tag. A tag that is already on the Sheet is deleted with deleteTag, so this returns false for it. */
export function deleteLocalTag(id, { email = currentEmail() } = {}) {
  const list = listLocal(email);
  const t = list.find((x) => x.id === id);
  if (!t || t.onSheet) return false;
  writeLocal(list.filter((x) => x.id !== id), email);
  return true;
}

/**
 * Apply the `tags` of a successful publish: each local record (and each new tag you own) gets `onSheet: true`, carrying the
 * name and colour the Sheet kept. Tags owned by someone else are not added. Returns the updated local list.
 */
export function markOnSheet(replyTags, { email = currentEmail() } = {}) {
  const list = listLocal(email);
  for (const r of Array.isArray(replyTags) ? replyTags : []) {
    if (!r || !TAG_ID_RE.test(String(r.id))) continue;
    const next = clean({ id: r.id, name: r.name, color: r.color, description: r.description, onSheet: true, updatedAt: now() });
    const i = list.findIndex((t) => t.id === r.id);
    if (i >= 0) list[i] = next;
    else if (!r.ownerEmail || lower(r.ownerEmail) === lower(email)) list.push(next); // someone else's tag is not yours to keep
  }
  writeLocal(list, email);
  return list;
}

/** Restore from a backup: add the tags whose id is not already stored. Existing records win. Returns how many were added. */
export function mergeLocal(tags, { email = currentEmail() } = {}) {
  const list = listLocal(email);
  const have = new Set(list.map((t) => t.id));
  const add = (Array.isArray(tags) ? tags : []).filter((t) => t && TAG_ID_RE.test(String(t.id)) && String(t.name || '').trim() && !have.has(t.id)).map(clean);
  if (add.length) writeLocal([...list, ...add], email);
  return add.length;
}

/* ---------------------------------------------------------------- Sheet tags */

/** The store resource that holds listTags. `gasUrl` is only needed to (re)fetch. */
export function sheetTagsResource(gasUrl) {
  return resource('tags', gasUrl ? { fetch: async () => {
    const r = await listTags({ gasUrl });
    if (!r.ok) throw new Error(r.error || 'Could not load tags');
    return Array.isArray(r.data.tags) ? r.data.tags : [];
  } } : {});
}

/** Sheet tags already in the store (no request); [] before the first load. */
export function sheetTags() {
  const d = resource('tags').peek();
  return Array.isArray(d) ? d : [];
}

/* ---------------------------------------------------------------- resolving */

const unknown = (id) => ({ id, name: UNKNOWN_TAG_NAME, color: 'gray', description: '', source: 'unknown', unknown: true, onSheet: false, mine: false, owner: '' });

/**
 * Display records for tag ids, in order: { id, name, color, description, source: 'local' | 'sheet' | 'unknown', onSheet,
 * mine, owner }. A local tag wins, unless it is cached from the Sheet and the Sheet has it (the Sheet is the source of
 * truth). Sheet tags follow `mergedInto` (chains, with a loop guard). An id found nowhere is "Unknown tag".
 */
export function resolve(ids, { local, sheet, email = currentEmail() } = {}) {
  const loc = new Map((local || listLocal(email)).map((t) => [t.id, t]));
  const sh = new Map((sheet || sheetTags()).map((t) => [t.id, t]));
  const me = lower(email);
  const fromSheet = (t) => ({ id: t.id, name: t.name, color: TAG_COLORS.includes(t.color) ? t.color : 'gray', description: t.description || '', source: 'sheet', onSheet: true, mine: lower(t.ownerEmail) === me, owner: t.ownerName || String(t.ownerEmail || '').split('@')[0] });
  return (Array.isArray(ids) ? ids : []).map((id) => {
    let cur = sh.get(id);
    for (let hops = 0; cur && cur.mergedInto && sh.has(cur.mergedInto) && hops < 20; hops++) cur = sh.get(cur.mergedInto);
    const l = loc.get(id);
    if (l && !(l.onSheet && cur)) return { ...l, source: 'local', mine: true, owner: '' };
    if (cur) return { ...fromSheet(cur), id };
    if (l) return { ...l, source: 'local', mine: true, owner: '' };
    return unknown(id);
  });
}

/** Every distinct tag id the test's questions use, in first-use order. */
export function usedTagIds(test) {
  const out = [];
  for (const q of Array.isArray(test?.questions) ? test.questions : []) {
    for (const id of Array.isArray(q?.tags) ? q.tags : []) if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** The `tagDefs` for publishTest: [{ id, name, color, description }] for every tag the test uses that this teacher can see. */
export function tagDefsFor(test, opts = {}) {
  return resolve(usedTagIds(test), opts).filter((t) => !t.unknown).map((t) => ({ id: t.id, name: t.name, color: t.color, description: t.description || '' }));
}

/** Ids of every tag the picker may offer (local and Sheet), for validation warnings. */
export function knownTagIds(opts = {}) {
  return [...new Set([...(opts.local || listLocal(opts.email)).map((t) => t.id), ...(opts.sheet || sheetTags()).map((t) => t.id)])];
}

/**
 * The picker's two groups. "Your tags": local tags plus Sheet tags you own. "Shared tags": other owners' Sheet tags that a
 * published test uses (usage.tests > 0) and that are not merged away. Each group is sorted by name.
 */
export function pickerGroups({ local, sheet, email = currentEmail() } = {}) {
  const loc = local || listLocal(email);
  const sh = (sheet || sheetTags()).filter((t) => !t.mergedInto);
  const me = lower(email);
  const mine = new Map();
  for (const t of loc) mine.set(t.id, resolve([t.id], { local: loc, sheet: sh, email })[0]);
  const shared = [];
  for (const t of sh) {
    if (mine.has(t.id)) continue;
    const rec = resolve([t.id], { local: [], sheet: sh, email })[0];
    if (lower(t.ownerEmail) === me) mine.set(t.id, rec);
    else if ((t.usage?.tests || 0) > 0) shared.push(rec);
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  return { mine: [...mine.values()].sort(byName), shared: shared.sort(byName) };
}
