// Validates every bundled test in data/tests/*.json and the catalog.json list of them.
//   node scripts/validate-tests.mjs      (exit 1 on any error)
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTest, validateTest } from '../js/lib/schema.js';
import { buildCatalog, testFiles } from './build-catalog.mjs';

const DIR = fileURLToPath(new URL('../data/tests/', import.meta.url));

/** catalog.json must be an array of entries with a unique code. Returns the entries (empty when unreadable). */
async function readCatalog(dir, errors) {
  try {
    const catalog = JSON.parse(await readFile(join(dir, 'catalog.json'), 'utf8'));
    if (!Array.isArray(catalog)) throw new Error('catalog.json must be an array');
    return catalog;
  } catch (e) {
    errors.push(`catalog.json: ${e.message} (run npm run build:catalog)`);
    return [];
  }
}

async function checkTestFile(dir, f, catalog) {
  const base = f.replace(/\.json$/, '');
  const row = { file: f, code: '', questions: 0, points: 0, status: 'ok' };
  const local = [];
  try {
    const test = normalizeTest(JSON.parse(await readFile(join(dir, f), 'utf8')));
    row.code = test.code;
    row.questions = test.questions.length;
    row.points = Math.round(test.questions.reduce((s, q) => s + (Number(q.points) || 0), 0) * 100) / 100;
    if (test.code !== base) local.push(`${f}: file name must equal <code>.json (code is "${test.code}")`);
    const { errors: errs } = validateTest(test);
    for (const e of errs) local.push(`${f}: ${e}`);
    const entry = catalog.find((c) => c && c.code === base);
    if (entry && entry.title !== test.title) local.push(`${f}: catalog.json title "${entry.title}" differs from test title "${test.title}"`);
  } catch (e) {
    local.push(`${f}: ${e.message}`);
  }
  if (!catalog.some((c) => c && c.code === base)) local.push(`${f}: missing from catalog.json (run npm run build:catalog)`);
  if (local.length) row.status = 'ERROR';
  return { row, local };
}

export async function validateBank(dir = DIR) {
  const errors = [];
  const rows = [];
  const files = await testFiles(dir);
  const catalog = await readCatalog(dir, errors);

  const catalogCodes = new Set();
  for (const entry of catalog) {
    if (!entry || typeof entry.code !== 'string') { errors.push('catalog.json: entry without a code'); continue; }
    if (catalogCodes.has(entry.code)) errors.push(`catalog.json: duplicate code ${entry.code}`);
    catalogCodes.add(entry.code);
  }

  const fileCodes = new Set();
  for (const f of files) {
    fileCodes.add(f.replace(/\.json$/, ''));
    const { row, local } = await checkTestFile(dir, f, catalog);
    errors.push(...local);
    rows.push(row);
  }
  for (const code of catalogCodes) if (!fileCodes.has(code)) errors.push(`catalog.json: ${code} has no ${code}.json file`);
  if (catalog.length && !errors.length && JSON.stringify(catalog) !== JSON.stringify(await buildCatalog(dir))) {
    errors.push('catalog.json is out of date (run npm run build:catalog)');
  }
  return { rows, errors };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { rows, errors } = await validateBank();
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('FILE', 18)}${pad('CODE', 10)}${pad('QUESTIONS', 11)}${pad('POINTS', 8)}STATUS`);
  for (const r of rows) console.log(`${pad(r.file, 18)}${pad(r.code, 10)}${pad(r.questions, 11)}${pad(r.points, 8)}${r.status}`);
  if (errors.length) {
    console.error(`\n${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`\nAll ${rows.length} tests valid.`);
}
