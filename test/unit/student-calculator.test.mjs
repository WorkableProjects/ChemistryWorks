import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, formatResult, tokenize } from '../../js/views/tools/calc-parser.js';
import { convert, UNIT_CATEGORIES } from '../../js/views/tools/units.js';

const v = (s, o) => { const r = evaluate(s, o); assert.ok(r.ok, `${s}: ${r.error}`); return r.value; };
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test('arithmetic and precedence', () => {
  assert.equal(v('2+3*4'), 14);
  assert.equal(v('(2+3)*4'), 20);
  assert.equal(v('2^3^2'), 512); // right-associative
  assert.equal(v('-2^2'), -4);
  assert.equal(v('2^-3'), 0.125);
  assert.equal(v('10/4'), 2.5);
  assert.equal(v('7 - -3'), 10);
  assert.equal(v('50%'), 0.5);
  assert.equal(v('5!'), 120);
});

test('scientific notation, unicode operators and implicit multiplication', () => {
  assert.equal(v('1.5e-3*2'), 0.003);
  assert.equal(v('6.022E23/2'), 3.011e23);
  assert.equal(v('2×3÷4'), 1.5);
  assert.equal(v('5−2'), 3);
  assert.equal(v('2(3+4)'), 14);
  assert.equal(v('(1+2)(3+4)'), 21);
  close(v('2pi'), 2 * Math.PI);
  close(v('2π'), 2 * Math.PI);
});

test('functions: log, ln, powers, roots, trig in both angle modes', () => {
  assert.equal(v('log(1000)'), 3);
  close(v('ln(e)'), 1);
  assert.equal(v('sqrt(81)'), 9);
  assert.equal(v('√(16)+1'), 5);
  assert.equal(v('log 100'), 2);
  close(v('sin(90)', { angle: 'deg' }), 1);
  close(v('sin(pi/2)', { angle: 'rad' }), 1);
  close(v('asin(1)', { angle: 'deg' }), 90);
  close(v('10^-2.5'), 10 ** -2.5);
  close(v('-log(1.8e-5)'), 4.744727494896694);
});

test('ans and memory-free expressions', () => {
  assert.equal(v('ans*2', { ans: 21 }), 42);
});

test('errors are reported, never thrown', () => {
  for (const bad of ['', '2+', '(2', '2)', '1/0', 'foo(2)', 'log(-1)', '2 $ 3', '1.2.3', '(-1)!', 'sqrt', '*3']) {
    const r = evaluate(bad);
    assert.equal(r.ok, false, bad);
    assert.ok(typeof r.error === 'string' && r.error.length > 0);
  }
  assert.equal(evaluate('10^400').ok, false);
});

test('no code execution path: identifiers that look like JS are just unknown names', () => {
  for (const evil of ['constructor', 'process.exit()', 'alert(1)', 'globalThis', '__proto__', 'toString']) assert.equal(evaluate(evil).ok, false, evil);
  assert.deepEqual(tokenize('2+3').map((t) => t.t), ['num', 'op', 'num']);
});

test('formatResult', () => {
  assert.equal(formatResult(0), '0');
  assert.equal(formatResult(0.1 + 0.2), '0.3');
  assert.equal(formatResult(1234.5678), '1234.5678');
  assert.equal(formatResult(6.022e23), '6.022e+23');
  assert.equal(formatResult(0.000012345), '1.2345e-5');
  assert.equal(formatResult(NaN), '');
});

test('unit converter', () => {
  close(convert(12, 'mL', 'L', 'volume'), 0.012);
  close(convert(1, 'atm', 'kPa', 'pressure'), 101.325);
  close(convert(760, 'mmHg', 'atm', 'pressure'), 1, 1e-6);
  close(convert(25, '°C', 'K', 'temperature'), 298.15);
  close(convert(212, '°F', '°C', 'temperature'), 100);
  close(convert(1, 'kcal', 'kJ', 'energy'), 4.184);
  close(convert(1, 'nm', 'Å', 'length'), 10);
  assert.ok(Number.isNaN(convert(1, 'm', 'L', 'length')));
  assert.ok(Number.isNaN(convert('abc', 'g', 'kg', 'mass')));
  assert.ok(Object.keys(UNIT_CATEGORIES).length >= 5);
});

test('two bare numbers are not silently multiplied', () => {
  assert.equal(evaluate('2 3').ok, false);
});
