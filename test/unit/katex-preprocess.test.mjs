import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixTextModeUnicode as f } from '../../js/ui.js';

test('typed middle dot inside text-mode groups becomes {\\char"B7}; math mode and \\ce are untouched', () => {
  assert.equal(f('\\text{L·atm}'), '\\text{L{\\char"B7}atm}');
  assert.equal(f('\\frac{\\text{L·atm}}{\\textbf{mol·K}}'), '\\frac{\\text{L{\\char"B7}atm}}{\\textbf{mol{\\char"B7}K}}');
  assert.equal(f('\\mbox{x·y} · z'), '\\mbox{x{\\char"B7}y} · z');
  assert.equal(f('L·atm'), 'L·atm');
  assert.equal(f('\\ce{CuSO4·5H2O}'), '\\ce{CuSO4·5H2O}');
  assert.equal(f('\\text{a{b·}c}·d'), '\\text{a{b{\\char"B7}}c}·d');
  assert.equal(f('6.02 \\times 10^{23}'), '6.02 \\times 10^{23}');
});
