// V4-00 brand rules: no hex colours in view CSS, product naming (ChemistryWorks = full name, ChemWorks = short name).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const cssDir = new URL('../../css/', import.meta.url);
// base.css holds the tokens; print.css is black on white by design.
const VIEW_CSS = readdirSync(cssDir).filter((f) => f.endsWith('.css') && !['base.css', 'print.css'].includes(f));

for (const file of VIEW_CSS) {
  test(`${file}: no hex colour literals (use tokens from base.css)`, () => {
    const css = readFileSync(new URL(file, cssDir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const hits = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    assert.deepEqual(hits, [], `${file} has hex literals: ${hits.join(', ')}`);
  });
}

test('page title and app name use the full name', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /<title>ChemistryWorks<\/title>/);
});

test('no string mixes the full and short names', () => {
  const files = ['js/ui.js', 'js/app.js', 'js/views/landing.js', 'js/views/results.js', 'js/views/feedback.js', 'js/views/submitted.js', 'js/lib/export.js', 'index.html'];
  for (const f of files) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/(['"`])((?:(?!\1).){0,400}?)\1/g)) {
      const str = m[2];
      assert.ok(!(/ChemistryWorks/.test(str) && /ChemWorks(?!pace)/.test(str.replace(/ChemistryWorks/g, ''))), `${f}: mixed names in "${str}"`);
    }
  }
});
