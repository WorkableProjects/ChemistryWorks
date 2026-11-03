import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENTS, GROUP_LABELS, STAIRCASE_RIGHT } from '../../js/lib/elements.js';

const el = (s) => ELEMENTS.find((e) => e.symbol === s);

test('118 elements in order with unique symbols and names', () => {
  assert.equal(ELEMENTS.length, 118);
  ELEMENTS.forEach((e, i) => assert.equal(e.number, i + 1));
  assert.equal(new Set(ELEMENTS.map((e) => e.symbol)).size, 118);
  assert.equal(new Set(ELEMENTS.map((e) => e.name)).size, 118);
  for (const e of ELEMENTS) assert.match(e.mass, /^(\d+\.\d{1,2}|\(\d+\))$/, `${e.symbol} ${e.mass}`);
});

test('masses and names exactly as printed on the CST reference sheet', () => {
  const want = { H: '1.01', He: '4.00', O: '16.00', Cl: '35.45', Fe: '55.85', Cu: '63.55', Zn: '65.39', Te: '127.60', Pb: '207.2',
    Tc: '(98)', Rn: '(222)', Rf: '(261)', Uup: '(294)', Uuo: '(294)', Lr: '(262)', Yb: '173.04', Dy: '162.50' };
  for (const [s, m] of Object.entries(want)) assert.equal(el(s).mass, m, s);
  assert.equal(el('Al').name, 'Aluminum');
  assert.equal(el('Cs').name, 'Cesium');
  assert.equal(el('Ds').name, 'Darmstadium');
  assert.equal(ELEMENTS[112].symbol, 'Uut');
});

test('layout: La/Ac in group 3, Ce–Lu and Th–Lr in the f-block rows', () => {
  assert.deepEqual([el('La').group, el('La').period], [3, 6]);
  assert.deepEqual([el('Ac').group, el('Ac').period], [3, 7]);
  assert.deepEqual([el('Hf').group, el('Rf').group, el('Fe').group, el('Uuo').group], [4, 4, 8, 18]);
  const f = ELEMENTS.filter((e) => e.group === null).map((e) => e.number);
  assert.deepEqual(f, [...Array.from({ length: 14 }, (_, i) => 58 + i), ...Array.from({ length: 14 }, (_, i) => 90 + i)]);
  assert.equal(GROUP_LABELS[0], '1A');
  assert.equal(GROUP_LABELS[7], '8B');
  assert.equal(GROUP_LABELS[17], '8A');
  assert.ok(STAIRCASE_RIGHT.has('Si') && !STAIRCASE_RIGHT.has('Al'));
});
