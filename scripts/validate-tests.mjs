// Validates every bundled test in data/tests/*.json and the index.json catalog.
//   node scripts/validate-tests.mjs      (exit 1 on any error)
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTest, validateTest } from '../js/lib/schema.js';

const DIR = fileURLToPath(new URL('../data/tests/', import.meta.url));

export async function validateBank(dir = DIR) {
  const errors = [];
  const rows = [];
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();

  let index = [];
  try {
    index = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8'));
    if (!Array.isArray(index)) throw new Error('index.json must be an array');
  } catch (e) {
    errors.push(`index.json: ${e.message}`);
  }
  const indexCodes = new Set();
  for (const entry of index) {
    if (!entry || typeof entry.code !== 'string') { errors.push('index.json: entry without a code'); continue; }
    if (indexCodes.has(entry.code)) errors.push(`index.json: duplicate code ${entry.code}`);
    indexCodes.add(entry.code);
  }

  const fileCodes = new Set();
  for (const f of files) {
    const base = f.replace(/\.json$/, '');
    fileCodes.add(base);
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
      const entry = index.find((i) => i && i.code === base);
      if (entry && entry.title !== test.title) local.push(`${f}: index.json title "${entry.title}" differs from test title "${test.title}"`);
    } catch (e) {
      local.push(`${f}: ${e.message}`);
    }
    if (!indexCodes.has(base)) local.push(`${f}: missing from index.json`);
    if (local.length) row.status = 'ERROR';
    errors.push(...local);
    rows.push(row);
  }
  for (const code of indexCodes) if (!fileCodes.has(code)) errors.push(`index.json: ${code} has no data/tests/${code}.json file`);
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
