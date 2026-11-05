// Release notes (Settings > What's new). One Markdown file per version in changelog/<version>.md, listed newest first
// in changelog/index.json. Pure helpers here: parsing a small Markdown subset into blocks, and the "seen" marker.
// Markdown subset: "# title", "## heading", "- item", blank-line paragraphs, inline **bold** and `code`.

import { load, save } from './storage.js';
import { SITE_VERSION } from '../version.js';

const SEEN_KEY = 'changelogSeen';

/** Path of a version's notes, relative to the site root. */
export const changelogPath = (version) => `changelog/${version}.md`;

/** "# 4.0.0 — 2026-11-05" -> { version: '4.0.0', date: '2026-11-05' }; missing parts are ''. */
export function parseTitle(line) {
  const m = /^#\s+v?(\S+)(?:\s+[—–-]\s+(.+))?\s*$/.exec(String(line || '').trim());
  return m ? { version: m[1], date: (m[2] || '').trim() } : { version: '', date: '' };
}

/** Inline spans: [{ type: 'text'|'bold'|'code', text }]. */
export function parseInline(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let m;
  const s = String(text ?? '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ type: 'text', text: s.slice(last, m.index) });
    out.push(m[1] != null ? { type: 'bold', text: m[1] } : { type: 'code', text: m[2] });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ type: 'text', text: s.slice(last) });
  return out;
}

/**
 * Markdown -> { version, date, blocks }. blocks: { type: 'heading', text } | { type: 'list', items: [text] } |
 * { type: 'para', text }. The "# title" line is taken out of the blocks.
 */
export function parseChangelog(md) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  let title = { version: '', date: '' };
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) { blocks.push({ type: 'para', text: para.join(' ') }); para = []; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^#\s/.test(line) && !title.version) { flush(); title = parseTitle(line); continue; }
    const hd = /^#{2,6}\s+(.*)$/.exec(line);
    if (hd) { flush(); blocks.push({ type: 'heading', text: hd[1] }); continue; }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === 'list') prev.items.push(li[1]); else blocks.push({ type: 'list', items: [li[1]] });
      continue;
    }
    para.push(line);
  }
  flush();
  return { ...title, blocks };
}

/** True when this device has not opened the notes for the current version yet. */
export function hasUnseenChangelog(version = SITE_VERSION) {
  return load(SEEN_KEY, '') !== version;
}

export function markChangelogSeen(version = SITE_VERSION) {
  save(SEEN_KEY, version);
}

/** -> [{ version, date, blocks, error? }] newest first. Never throws; a missing file becomes an entry with error. */
export async function fetchChangelog({ fetchImpl = globalThis.fetch, base = '' } = {}) {
  const res = await fetchImpl(`${base}changelog/index.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`changelog index: HTTP ${res.status}`);
  const versions = await res.json();
  return Promise.all((Array.isArray(versions) ? versions : []).map(async (v) => {
    try {
      const r = await fetchImpl(`${base}${changelogPath(v)}`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const parsed = parseChangelog(await r.text());
      return { ...parsed, version: v, date: parsed.date };
    } catch (e) {
      return { version: v, date: '', blocks: [], error: e.message };
    }
  }));
}
