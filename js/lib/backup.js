// Backup / restore. One JSON bundle with every test (published + drafts) and the question bank.
// Pure helpers; the Settings view does the network and file work.
//   makeBundle({ tests, bank, tags, site }) -> { kind: 'chemworks-backup', version: 1, createdAt, site, tests, bank, tags }
//   readBundle(text) -> { ok, tests, bank, tags, errors }   (each test validated with the schema)
import { normalizeTest, validateTest } from './schema.js';

export const BUNDLE_KIND = 'chemworks-backup';

const TAG_ID_RE = /^tg_[0-9a-z]{6}$/;
const cleanTags = (list) => (Array.isArray(list) ? list : []).filter((t) => t && TAG_ID_RE.test(String(t.id)) && String(t.name || '').trim());

// `tags` are the teacher's local tags (js/lib/tags.js), saved so a restore on a new device keeps question tags readable.
export function makeBundle({ tests = [], bank = [], tags = [], site = '' } = {}, now = new Date()) {
  const seen = new Set();
  const uniq = tests.filter((t) => t && t.code && !seen.has(t.code) && seen.add(t.code));
  return { kind: BUNDLE_KIND, version: 1, createdAt: now.toISOString(), site, tests: uniq, bank: Array.isArray(bank) ? bank : [], tags: cleanTags(tags) };
}

export function readBundle(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, tests: [], bank: [], tags: [], errors: ['This file is not valid JSON.'] }; }
  if (!data || data.kind !== BUNDLE_KIND || !Array.isArray(data.tests)) return { ok: false, tests: [], bank: [], tags: [], errors: ['This is not a ChemWorks backup file.'] };
  const errors = [];
  const tests = [];
  for (const raw of data.tests) {
    const t = normalizeTest(raw);
    const v = validateTest(t);
    if (v.valid) tests.push(t); else errors.push(`${t.code || '(no code)'}: ${v.errors[0]}`);
  }
  const bank = (Array.isArray(data.bank) ? data.bank : []).filter((i) => i && i.question && i.question.type);
  return { ok: true, tests, bank, tags: cleanTags(data.tags), errors };
}
