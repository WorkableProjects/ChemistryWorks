// One catalog: data/tests/catalog.json lists the bundled tests; there is no index.json and no fallback to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, copyFileSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../../js/lib/tests.js';
import { buildCatalog } from '../../scripts/build-catalog.mjs';
import { validateBank } from '../../scripts/validate-tests.mjs';

const FIXTURES = fileURLToPath(new URL('../fixtures/tests/', import.meta.url));

/** A scratch copy of the fixture tests, with a catalog built from them. */
async function scratchBank() {
  const dir = mkdtempSync(join(tmpdir(), 'cw-bank-'));
  for (const f of readdirSync(FIXTURES).filter((n) => n.endsWith('.json') && n !== 'catalog.json')) copyFileSync(join(FIXTURES, f), join(dir, f));
  writeFileSync(join(dir, 'catalog.json'), `${JSON.stringify(await buildCatalog(dir), null, 2)}\n`);
  return dir;
}

test('index.json is gone from data/tests and from the fixtures', () => {
  assert.equal(existsSync(new URL('../../data/tests/index.json', import.meta.url)), false);
  assert.equal(existsSync(new URL('../fixtures/tests/index.json', import.meta.url)), false);
});

test('loadCatalog asks for catalog.json only, and returns an empty list when it is missing', async () => {
  const asked = [];
  const missing = async (url) => { asked.push(url); return { ok: false }; };
  assert.deepEqual(await loadCatalog(missing), []);
  assert.deepEqual(asked, ['data/tests/catalog.json']);
  const list = [{ code: 'A1', title: 'A' }];
  assert.deepEqual(await loadCatalog(async () => ({ ok: true, json: async () => list })), list);
  assert.deepEqual(await loadCatalog(async () => { throw new Error('offline'); }), []);
});

test('buildCatalog lists every test file by code with its counts', async () => {
  const dir = await scratchBank();
  const catalog = await buildCatalog(dir);
  const codes = readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'catalog.json').map((n) => n.replace(/\.json$/, '')).sort();
  assert.deepEqual(catalog.map((c) => c.code), codes);
  const chem101 = JSON.parse(readFileSync(join(dir, 'CHEM101.json'), 'utf8'));
  const entry = catalog.find((c) => c.code === 'CHEM101');
  assert.equal(entry.title, chem101.title);
  assert.equal(entry.questionCount, chem101.questions.length);
});

test('validateBank accepts a catalog built from the tests', async () => {
  const { errors } = await validateBank(await scratchBank());
  assert.deepEqual(errors, []);
});

test('validateBank reports a test missing from catalog.json, a stale catalog and a missing catalog', async () => {
  const dir = await scratchBank();
  const catalog = JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8'));

  writeFileSync(join(dir, 'catalog.json'), JSON.stringify(catalog.slice(1)));
  let { errors } = await validateBank(dir);
  assert.ok(errors.some((e) => /missing from catalog\.json/.test(e)), errors.join('\n'));

  writeFileSync(join(dir, 'catalog.json'), JSON.stringify(catalog.map((c, i) => (i ? c : { ...c, questionCount: c.questionCount + 1 }))));
  ({ errors } = await validateBank(dir));
  assert.ok(errors.some((e) => /out of date/.test(e)), errors.join('\n'));

  writeFileSync(join(dir, 'catalog.json'), JSON.stringify([...catalog, { code: 'GHOST' }]));
  ({ errors } = await validateBank(dir));
  assert.ok(errors.some((e) => /GHOST has no GHOST\.json/.test(e)), errors.join('\n'));

  writeFileSync(join(dir, 'catalog.json'), 'not json');
  ({ errors } = await validateBank(dir));
  assert.ok(errors.some((e) => /^catalog\.json:/.test(e)), errors.join('\n'));
});
