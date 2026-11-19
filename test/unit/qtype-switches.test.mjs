// Every question type is on the TypeDef contract, so the old per-type switches are gone: no consumer names a type in a
// `case`, and none switches on the question's type at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { registeredTypes } = await import('../../js/lib/qtypes/registry.js');
await import('../../js/lib/qtypes/index.js');

const SWITCH_FILES = ['js/lib/grading.js', 'js/lib/schema.js', 'js/views/runner/widgets.js', 'js/views/admin/editors/core.js'];
const BUILT_IN = ['mcq', 'multi', 'numeric', 'formula', 'truefalse', 'matching', 'ordering', 'fillblank', 'lewis', 'structure', 'orbital', 'short', 'open', 'balance', 'econfig', 'ptable', 'sigfigs', 'categorize', 'hotspot', 'graph'];

test('all 20 built-in types and the registry types are registered', () => {
  const types = registeredTypes();
  for (const t of BUILT_IN) assert.ok(types.includes(t), `${t} is registered`);
  assert.equal(types.length, 42);
});

for (const file of SWITCH_FILES) {
  test(`${file} has no case for any question type`, () => {
    const src = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    for (const type of registeredTypes()) assert.equal(new RegExp(`case '${type}'`).test(src), false, `${file} still has case '${type}'`);
    assert.equal(/switch\s*\(\s*(q|question)?\.?type\s*\)/.test(src), false, `${file} still switches on the question type`);
  });
}

test('teacher grading follows the definition', async () => {
  const { isManualQuestion } = await import('../../js/lib/schema.js');
  for (const type of ['short', 'open', 'orbital']) assert.equal(isManualQuestion({ type }), true, type);
  for (const type of ['mcq', 'lewis', 'graph']) assert.equal(isManualQuestion({ type }), false, type);
  assert.equal(isManualQuestion({ type: 'structure', studentCharges: true }), true);
  assert.equal(isManualQuestion({ type: 'structure', studentCharges: false }), false);
  assert.equal(isManualQuestion({ type: 'nope' }), false);
});
