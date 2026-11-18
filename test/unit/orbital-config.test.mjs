import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sublevelsFor, normalizeOrbitalAnswer, orbitalElectronCount, isOrbitalAnswered, describeOrbital, boxLabel,
  validateOrbital, boxCount, AUFBAU, BOX_STATES,
} from '../../js/lib/orbital.js';

const errs = (q) => { const e = []; validateOrbital(q, 'Q', e); return e; };

test('constants', () => {
  assert.equal(AUFBAU.slice(0, 7).join(' '), '1s 2s 2p 3s 3p 4s 3d');
  assert.deepEqual(BOX_STATES, ['', 'u', 'ud', 'd']);
  assert.deepEqual(['s', 'p', 'd', 'f'].map((t) => boxCount(`1${t}`)), [1, 3, 5, 7]);
});

test('sublevelsFor: defaults', () => {
  assert.deepEqual(sublevelsFor({}), ['1s', '2s', '2p']);
  assert.deepEqual(sublevelsFor(undefined), ['1s', '2s', '2p']);
  assert.deepEqual(sublevelsFor({ maxSublevel: 'zz', orbitalTypes: [] }), ['1s', '2s', '2p']);
});

test('sublevelsFor: maxSublevel 3d with s,p,d', () => {
  assert.deepEqual(sublevelsFor({ maxSublevel: '3d', orbitalTypes: ['s', 'p', 'd'] }), ['1s', '2s', '2p', '3s', '3p', '4s', '3d']);
});

test('sublevelsFor: type filter', () => {
  assert.deepEqual(sublevelsFor({ maxSublevel: '3p', orbitalTypes: ['p'] }), ['2p', '3p']);
  assert.deepEqual(sublevelsFor({ maxSublevel: '3d', orbitalTypes: ['d'] }), ['3d']);
});

test('normalizeOrbitalAnswer: pads, truncates, maps du, drops unknown', () => {
  const q = { maxSublevel: '2p', orbitalTypes: ['s', 'p'] };
  const n = normalizeOrbitalAnswer(q, {
    '1s': ['du'], '2s': [], '2p': ['u', 'D', 'ud', 'u', 'u'], '3s': ['ud'], junk: 5,
  });
  assert.deepEqual(n, { '1s': ['ud'], '2s': [''], '2p': ['u', 'd', 'ud'] });
  assert.deepEqual(Object.keys(n), ['1s', '2s', '2p']);
});

test('normalizeOrbitalAnswer: junk input and junk boxes', () => {
  const q = {};
  const empty = { '1s': [''], '2s': [''], '2p': ['', '', ''] };
  for (const bad of [null, undefined, 'x', 5, [], [1, 2]]) assert.deepEqual(normalizeOrbitalAnswer(q, bad), empty);
  assert.deepEqual(normalizeOrbitalAnswer(q, { '2p': ['x', 7, null, 'uu'] })['2p'], ['', '', '']);
  assert.deepEqual(normalizeOrbitalAnswer(q, { '1s': 'ud' })['1s'], ['']);
});

test('orbitalElectronCount and isOrbitalAnswered', () => {
  const q = {};
  const n = { '1s': ['ud'], '2s': ['ud'], '2p': ['u', 'u', 'u'] };
  assert.equal(orbitalElectronCount(q, n), 7);
  assert.equal(orbitalElectronCount(q, { '1s': ['ud', 'ud'], '4f': ['ud'] }), 2);
  assert.equal(orbitalElectronCount(q, null), 0);
  assert.equal(isOrbitalAnswered(q, n), true);
  assert.equal(isOrbitalAnswered(q, { '1s': ['d'] }), true);
  assert.equal(isOrbitalAnswered(q, { '1s': [''] }), false);
  assert.equal(isOrbitalAnswered(q, {}), false);
  assert.equal(isOrbitalAnswered(q, undefined), false);
});

test('describeOrbital', () => {
  const q = {};
  const t = describeOrbital(q, { '1s': ['ud'], '2s': ['ud'], '2p': ['u', 'u', 'u'] });
  assert.equal(t, '1s [↑↓] · 2s [↑↓] · 2p [↑][↑][↑] · 7 electrons');
  assert.equal(describeOrbital(q, { '1s': ['u'] }), '1s [↑] · 2s [_] · 2p [_][_][_] · 1 electron');
  assert.equal(describeOrbital(q, null), '—');
  assert.equal(describeOrbital(q, 'x'), '—');
});

test('boxLabel never relies on colour: says spin up / spin down', () => {
  assert.match(boxLabel('2p', 0, 'u'), /spin up/);
  assert.match(boxLabel('2p', 0, 'd'), /spin down/);
  assert.match(boxLabel('2p', 1, 'ud'), /spin up and spin down/);
  assert.match(boxLabel('2p', 2, ''), /empty/);
  assert.match(boxLabel('2p', 2, ''), /^2p orbital 3:/);
  assert.notEqual(boxLabel('1s', 0, 'u'), boxLabel('1s', 0, 'd'));
});

test('validateOrbital: valid question', () => {
  assert.deepEqual(errs({ maxSublevel: '2p', orbitalTypes: ['s', 'p'], sampleAnswer: { '1s': ['ud'], '2p': ['u', 'u', 'u'] } }), []);
  assert.deepEqual(errs({ maxSublevel: '3d', orbitalTypes: ['d'], sampleAnswer: null }), []);
  assert.deepEqual(errs({ maxSublevel: '2p', orbitalTypes: ['s'], sampleAnswer: '' }), []);
});

test('validateOrbital: bad maxSublevel / empty or bad types', () => {
  assert.match(errs({ maxSublevel: '9z', orbitalTypes: ['s'] }).join('|'), /maxSublevel/);
  assert.match(errs({ orbitalTypes: ['s'] }).join('|'), /maxSublevel/);
  assert.match(errs({ maxSublevel: '2p', orbitalTypes: [] }).join('|'), /orbitalTypes/);
  assert.match(errs({ maxSublevel: '2p' }).join('|'), /orbitalTypes/);
  assert.match(errs({ maxSublevel: '2p', orbitalTypes: ['s', 'x'] }).join('|'), /orbitalTypes/);
});

test('validateOrbital: no sublevels shown', () => {
  assert.match(errs({ maxSublevel: '2p', orbitalTypes: ['f'] }).join('|'), /no sublevels/);
});

test('validateOrbital: sampleAnswer problems', () => {
  const base = { maxSublevel: '2p', orbitalTypes: ['s', 'p'] };
  assert.match(errs({ ...base, sampleAnswer: 'text' }).join('|'), /sampleAnswer must be/);
  assert.match(errs({ ...base, sampleAnswer: [] }).join('|'), /sampleAnswer must be/);
  assert.match(errs({ ...base, sampleAnswer: { '3d': ['u'] } }).join('|'), /sublevel "3d"/);
  assert.match(errs({ ...base, sampleAnswer: { '2p': ['u', 'u', 'u', 'u'] } }).join('|'), /up to 3 boxes/);
  assert.match(errs({ ...base, sampleAnswer: { '1s': ['x'] } }).join('|'), /"1s" must list/);
  assert.match(errs({ ...base, sampleAnswer: { '1s': 'ud' } }).join('|'), /"1s" must list/);
});
