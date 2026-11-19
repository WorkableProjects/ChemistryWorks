// Generates data/tests/catalog.json from the bundled tests: { code, title, description, questionCount, points,
// timeLimitMinutes } per test, sorted by code. catalog.json is the only list of bundled tests.
//   node scripts/build-catalog.mjs [dir]
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../data/tests/', import.meta.url));
const round2 = (n) => Math.round(n * 100) / 100;

/** The test files in a folder: every .json except the catalog itself. */
export async function testFiles(dir = DIR) {
  return (await readdir(dir)).filter((f) => f.endsWith('.json') && f !== 'catalog.json').sort();
}

export async function buildCatalog(dir = DIR) {
  const out = [];
  for (const f of await testFiles(dir)) {
    const t = JSON.parse(await readFile(join(dir, f), 'utf8'));
    const qs = Array.isArray(t.questions) ? t.questions : [];
    out.push({ code: f.replace(/\.json$/, ''), title: t.title || '', description: t.description || '', questionCount: qs.length,
      points: round2(qs.reduce((s, q) => s + (Number(q.points) || 0), 0)), timeLimitMinutes: Number(t.timeLimitMinutes) || 0 });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ? `${process.argv[2].replace(/\/?$/, '/')}` : DIR;
  await writeFile(`${dir}catalog.json`, `${JSON.stringify(await buildCatalog(dir), null, 2)}\n`);
  console.log(`wrote ${dir}catalog.json`);
}
