import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aufbauCounts, parseConfiguration, resolveOrbitalSource, diagramFromCounts, configurationText, rangeForCounts } from '../../js/lib/orbital.js';
import { ELEMENTS } from '../../js/lib/elements.js';

test('aufbau counts and configuration text', () => {
  assert.equal(configurationText(aufbauCounts(7)), '1s2 2s2 2p3');
  assert.equal(configurationText(aufbauCounts(26)), '1s2 2s2 2p6 3s2 3p6 4s2 3d6');
});

test('parse configurations', () => {
  assert.deepEqual(parseConfiguration('1s2 2s2 2p3').counts, { '1s': 2, '2s': 2, '2p': 3 });
  assert.deepEqual(parseConfiguration('1s² 2s^2 2p⁴').counts, { '1s': 2, '2s': 2, '2p': 4 });
  assert.deepEqual(parseConfiguration('[Ne] 3s1').counts, { '1s': 2, '2s': 2, '2p': 6, '3s': 1 });
  assert.ok(parseConfiguration('2p7').error);
  assert.ok(parseConfiguration('[Xx] 3s1').error);
  assert.ok(parseConfiguration('hello').error);
});

test('resolve symbol or configuration', () => {
  assert.equal(resolveOrbitalSource('n', ELEMENTS).label, 'N');
  assert.equal(configurationText(resolveOrbitalSource('O', ELEMENTS).counts), '1s2 2s2 2p4');
  assert.ok(resolveOrbitalSource('Qq', ELEMENTS).error);
  assert.deepEqual(resolveOrbitalSource('1s1', ELEMENTS).counts, { '1s': 1 });
});

test("Hund's rule diagram and range", () => {
  assert.deepEqual(diagramFromCounts({ '2p': 3 })['2p'], ['u', 'u', 'u']);
  assert.deepEqual(diagramFromCounts({ '2p': 4 })['2p'], ['ud', 'u', 'u']);
  assert.deepEqual(diagramFromCounts({ '3d': 6 })['3d'], ['ud', 'u', 'u', 'u', 'u']);
  assert.deepEqual(rangeForCounts(aufbauCounts(26)), { maxSublevel: '3d', orbitalTypes: ['s', 'p', 'd'] });
});
