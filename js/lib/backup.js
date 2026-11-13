// Backup / restore (V4-08, S17). One JSON bundle with every test (published + drafts) and the question bank.
// Pure helpers; the Settings view does the network and file work.
//   makeBundle({ tests, bank, tags, site }) -> { kind: 'chemworks-backup', version: 1, createdAt, site, tests, bank, tags }
//   readBundle(text) -> { ok, tests, bank, tags, errors }   (tags = this teacher's local tags, like drafts)   (each test validated with the schema)
import { normalizeTest, validateTest } from './schema.js';

export const BUNDLE_KIND = 'chemworks-backup';

export function makeBundle({ tests = [], bank = [], tags = [], site = '' } = {}, now = new Date()) {
  const seen = new Set();
  const uniq = tests.filter((t) => t && t.code && !seen.has(t.code) && seen.add(t.code));
  return { kind: BUNDLE_KIND, version: 1, createdAt: now.toISOString(), site, tests: uniq, bank: Array.isArray(bank) ? bank : [], tags: Array.isArray(tags) ? tags : [] };
}

export function readBundle(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, tests: [], bank: [], errors: ['This file is not valid JSON.'] }; }
  if (!data || data.kind !== BUNDLE_KIND || !Array.isArray(data.tests)) return { ok: false, tests: [], bank: [], errors: ['This is not a ChemWorks backup file.'] };
  const errors = [];
  const tests = [];
  for (const raw of data.tests) {
    const t = normalizeTest(raw);
    const v = validateTest(t);
    if (v.valid) tests.push(t); else errors.push(`${t.code || '(no code)'}: ${v.errors[0]}`);
  }
  const bank = (Array.isArray(data.bank) ? data.bank : []).filter((i) => i && i.question && i.question.type);
  const tags = Array.isArray(data.tags) ? data.tags : [];
  return { ok: true, tests, bank, tags, errors };
}
