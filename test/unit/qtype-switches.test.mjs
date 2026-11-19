// Types that moved to the TypeDef contract must not be named in the old per-type switches again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MOVED = ['mcq', 'multi', 'truefalse', 'numeric', 'formula', 'matching', 'ordering', 'fillblank', 'categorize', 'balance', 'econfig', 'ptable', 'sigfigs', 'hotspot'];
const SWITCH_FILES = ['js/lib/grading.js', 'js/lib/schema.js', 'js/views/runner/widgets.js', 'js/views/admin/editors/core.js'];

for (const file of SWITCH_FILES) {
  test(`${file} has no case for a moved type`, () => {
    const src = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    for (const type of MOVED) assert.equal(new RegExp(`case '${type}'`).test(src), false, `${file} still has case '${type}'`);
  });
}
