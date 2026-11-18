// Helpers shared by question-type definitions and by schema.js / grading.js. Pure, no DOM.
import { safeImageUrl } from '../sections.js';

export const DASH = '—';
export const ID_RE = /^[A-Za-z0-9_-]+$/;

export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const str = (v, d = '') => (v === undefined || v === null ? d : String(v));
export const bool = (v, d) => (v === undefined || v === null ? d : Boolean(v));
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const nonEmptyStr = (v) => typeof v === 'string' && v.trim() !== '';
export const squash = (s) => String(s).replace(/\s+/g, '').toLowerCase();

/** Choice / item lists: { id, text, image? } with ids and text as strings. */
export function normOptions(list) {
  if (!Array.isArray(list)) return [];
  return list.map((o) => {
    const src = isObj(o) ? o : { id: o, text: o };
    const out = { ...src, id: str(src.id).trim(), text: str(src.text) };
    // Optional picture for this choice / item: kept only with a url, so existing tests normalize unchanged.
    if (isObj(src.image) && str(src.image.url).trim()) out.image = { url: str(src.image.url).trim(), alt: str(src.image.alt) };
    else delete out.image;
    return out;
  });
}

/** Validates a list of choices / items (2 or more, unique ids, text or a safe image). Returns the set of ids. */
export function validateList(list, label, where, errors) {
  if (!Array.isArray(list) || list.length < 2) {
    errors.push(`${where}: ${label} needs at least 2 entries.`);
    return new Set();
  }
  const ids = new Set();
  list.forEach((o, i) => {
    const n = i + 1;
    if (!isObj(o)) { errors.push(`${where}: ${label} ${n} must be an object with id and text.`); return; }
    if (!nonEmptyStr(o.id) || !ID_RE.test(o.id)) errors.push(`${where}: ${label} ${n} has an invalid id (use letters, digits, "_" or "-").`);
    else if (ids.has(o.id)) errors.push(`${where}: duplicate ${label} id "${o.id}".`);
    else ids.add(o.id);
    const hasImage = isObj(o.image);
    if (hasImage) {
      if (!safeImageUrl(o.image.url)) errors.push(`${where}: ${label} ${n} image url must start with https:// or be a path on this site.`);
      if (!nonEmptyStr(o.image.alt)) errors.push(`${where}: ${label} ${n} image needs alt text describing the image.`);
    }
    if (!nonEmptyStr(o.text) && !(hasImage && safeImageUrl(o.image.url))) errors.push(`${where}: ${label} ${n} has empty text.`);
  });
  return ids;
}

/** The text of the choice with this id; an image-only choice reads as its picture's description. */
export function optionText(list, id) {
  const o = Array.isArray(list) ? list.find((x) => x && String(x.id) === String(id)) : null;
  if (!o) return String(id);
  const text = String(o.text ?? '');
  if (text.trim() === '' && o.image && typeof o.image === 'object') return `[image: ${String(o.image.alt || 'picture')}]`;
  return text;
}
