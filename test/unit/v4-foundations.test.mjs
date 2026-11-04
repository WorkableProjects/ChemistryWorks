// S01: feature flags and site version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG, feature, urlFeatures } from '../../js/config.js';
import { SITE_VERSION } from '../../js/version.js';

test('feature flags default off and unknown flags are off', () => {
  for (const [name, on] of Object.entries(CONFIG.FEATURES)) assert.equal(feature(name, CONFIG, ''), on, name);
  assert.equal(feature('nope', CONFIG, '?features=all'), false);
});

test('feature flags: config wins, ?features= switches on per page', () => {
  const cfg = { FEATURES: { a: false, b: true } };
  assert.equal(feature('a', cfg, ''), false);
  assert.equal(feature('b', cfg, ''), true);
  assert.equal(feature('a', cfg, '?features=a'), true);
  assert.equal(feature('a', cfg, '?features=x,%20a'), true);
  assert.equal(feature('a', cfg, '?features=all'), true);
  assert.deepEqual(urlFeatures('?features=a,,b'), ['a', 'b']);
});

test('site version matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(SITE_VERSION, pkg.version);
  assert.match(SITE_VERSION, /^\d+\.\d+\.\d+/);
});
