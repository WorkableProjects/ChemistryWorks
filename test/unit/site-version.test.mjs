// Site version matches package.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SITE_VERSION } from '../../js/version.js';

test('site version matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(SITE_VERSION, pkg.version);
  assert.match(SITE_VERSION, /^\d+\.\d+\.\d+/);
});
