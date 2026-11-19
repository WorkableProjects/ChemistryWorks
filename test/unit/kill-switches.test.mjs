// V6 kill switches: CONFIG.KILL_SWITCHES and killed(name).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, killed, mergeConfig } from '../../js/config.js';

test('kill switches all default off', () => {
  assert.deepEqual({ ...CONFIG.KILL_SWITCHES }, { classHub: false, gameModes: false, studentSync: false });
  for (const name of ['classHub', 'gameModes', 'studentSync']) assert.equal(killed(name, CONFIG), false, name);
});

test('killed: only the exact value true is on; unknown names are off', () => {
  const cfg = { KILL_SWITCHES: { classHub: true, gameModes: 'yes', studentSync: false } };
  assert.equal(killed('classHub', cfg), true);
  assert.equal(killed('gameModes', cfg), false);
  assert.equal(killed('studentSync', cfg), false);
  assert.equal(killed('nope', cfg), false);
  assert.equal(killed('classHub', {}), false);
});

test('mergeConfig: a page override switches one kill switch and keeps the rest', () => {
  const out = mergeConfig({ KILL_SWITCHES: { classHub: false, gameModes: false } }, { KILL_SWITCHES: { gameModes: true } });
  assert.equal(killed('classHub', out), false);
  assert.equal(killed('gameModes', out), true);
});
