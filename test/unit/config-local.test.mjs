// js/config.local.js is written by the Pages workflow from repository variables; the app merges it under window overrides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLocalConfig, mergeConfig, CONFIG } from '../../js/config.js';

const defaults = { A: 'default-a', B: 'default-b', FEATURES: { x: true, y: false } };

test('mergeConfig: later layers win, FEATURES merge key by key', () => {
  const out = mergeConfig(defaults, { A: 'local', FEATURES: { y: true } }, { B: 'window', FEATURES: { x: false } });
  assert.equal(out.A, 'local');
  assert.equal(out.B, 'window');
  assert.deepEqual({ ...out.FEATURES }, { x: false, y: true });
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.FEATURES));
});

test('mergeConfig: empty and missing layers change nothing', () => {
  const out = mergeConfig(defaults, {}, null, undefined);
  assert.equal(out.A, 'default-a');
  assert.deepEqual({ ...out.FEATURES }, defaults.FEATURES);
});

test('loadLocalConfig: a missing file is not an error', async () => {
  assert.deepEqual(await loadLocalConfig(async () => { throw new Error('404'); }), {});
  assert.deepEqual(await loadLocalConfig(async () => ({})), {});
  assert.deepEqual(await loadLocalConfig(async () => ({ default: 'nope' })), {});
});

test('loadLocalConfig: reads the default export', async () => {
  assert.deepEqual(await loadLocalConfig(async () => ({ default: { GAS_WEB_APP_URL: 'https://x/exec' } })), { GAS_WEB_APP_URL: 'https://x/exec' });
});

test('CONFIG loads with no config.local.js present', () => {
  assert.equal(CONFIG.APP_NAME, 'ChemistryWorks');
  assert.equal(typeof CONFIG.FEATURES, 'object');
});
