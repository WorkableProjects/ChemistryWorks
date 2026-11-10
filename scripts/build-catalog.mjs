// Generates data/tests/catalog.json: { code, title, description, questionCount, points, timeLimitMinutes } per bundled test, in index.json order.
//   node scripts/build-catalog.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../data/tests/', import.meta.url));
const round2 = (n) => Math.round(n * 100) / 100;

export async function buildCatalog(dir = DIR) {
  const index = JSON.parse(await readFile(`${dir}index.json`, 'utf8'));
  const out = [];
  for (const e of index) {
    const t = JSON.parse(await readFile(`${dir}${e.code}.json`, 'utf8'));
    const qs = Array.isArray(t.questions) ? t.questions : [];
    out.push({ code: e.code, title: e.title || t.title || '', description: e.description || '', questionCount: qs.length,
      points: round2(qs.reduce((s, q) => s + (Number(q.points) || 0), 0)), timeLimitMinutes: Number(t.timeLimitMinutes) || 0 });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeFile(`${DIR}catalog.json`, `${JSON.stringify(await buildCatalog(), null, 2)}\n`);
  console.log('wrote data/tests/catalog.json');
}
