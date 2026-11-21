// js/config.local.js is written by the Pages workflow from repository variables; the app merges it under window overrides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLocalConfig, mergeConfig, CONFIG } from '../../js/config.js';

const defaults = { A: 'default-a', B: 'default-b', KILL_SWITCHES: { x: false, y: false } };

test('mergeConfig: later layers win, KILL_SWITCHES merge key by key', () => {
  const out = mergeConfig(defaults, { A: 'local', KILL_SWITCHES: { y: true } }, { B: 'window', KILL_SWITCHES: { x: true } });
  assert.equal(out.A, 'local');
  assert.equal(out.B, 'window');
  assert.deepEqual({ ...out.KILL_SWITCHES }, { x: true, y: true });
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.KILL_SWITCHES));
});

test('mergeConfig: empty and missing layers change nothing', () => {
  const out = mergeConfig(defaults, {}, null, undefined);
  assert.equal(out.A, 'default-a');
  assert.deepEqual({ ...out.KILL_SWITCHES }, defaults.KILL_SWITCHES);
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
  assert.equal(typeof CONFIG.KILL_SWITCHES, 'object');
  assert.equal(CONFIG.KILL_SWITCHES.classHub, false);
});
