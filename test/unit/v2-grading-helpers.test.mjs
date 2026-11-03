import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePoints, isOverride } from '../../js/views/admin/stats.js';

test('validatePoints: empty, numbers, rounding', () => {
  assert.deepEqual(validatePoints('', 4), { ok: true, value: null });
  assert.deepEqual(validatePoints('   ', 4), { ok: true, value: null });
  assert.deepEqual(validatePoints(undefined, 4), { ok: true, value: null });
  assert.deepEqual(validatePoints('0', 4), { ok: true, value: 0 });
  assert.deepEqual(validatePoints('4', 4), { ok: true, value: 4 });
  assert.deepEqual(validatePoints(' 2.5 ', 4), { ok: true, value: 2.5 });
  assert.deepEqual(validatePoints('1.236', 4), { ok: true, value: 1.24 });
  assert.deepEqual(validatePoints(1.5, 4), { ok: true, value: 1.5 });
});

test('validatePoints: rejects bad input with messages', () => {
  assert.deepEqual(validatePoints('abc', 4), { ok: false, error: 'Enter a number.' });
  assert.deepEqual(validatePoints('1,5', 4), { ok: false, error: 'Enter a number.' });
  assert.deepEqual(validatePoints('1e2', 400), { ok: false, error: 'Enter a number.' });
  assert.deepEqual(validatePoints('-1', 4), { ok: false, error: 'Points can’t be negative.' });
  assert.deepEqual(validatePoints('4.01', 4), { ok: false, error: 'Maximum is 4 points.' });
  assert.deepEqual(validatePoints('99', 2.5), { ok: false, error: 'Maximum is 2.5 points.' });
});

test('isOverride', () => {
  const auto = { manual: false, pointsEarned: 1.5 };
  assert.equal(isOverride(auto, 1.5), false);
  assert.equal(isOverride(auto, 1.499), false);
  assert.equal(isOverride(auto, 2), true);
  assert.equal(isOverride(auto, null), false);
  assert.equal(isOverride({ manual: true, pointsEarned: 0 }, 3), false);
  assert.equal(isOverride({ manual: false, pointsEarned: 0 }, 0), false);
});
