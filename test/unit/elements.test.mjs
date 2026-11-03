import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENTS, CATEGORIES } from '../../js/lib/elements.js';

const bySymbol = (s) => ELEMENTS.find((e) => e.symbol === s);

test('118 elements, numbers 1-118 in order, unique symbols and names', () => {
  assert.equal(ELEMENTS.length, 118);
  ELEMENTS.forEach((e, i) => assert.equal(e.number, i + 1, `number at index ${i}`));
  assert.equal(new Set(ELEMENTS.map((e) => e.symbol)).size, 118);
  assert.equal(new Set(ELEMENTS.map((e) => e.name)).size, 118);
});

test('fields are well-formed', () => {
  const cats = new Set(CATEGORIES.map(([id]) => id));
  for (const e of ELEMENTS) {
    assert.match(e.symbol, /^[A-Z][a-z]?$/);
    assert.ok(cats.has(e.category), `${e.symbol} category ${e.category}`);
    assert.ok(Number.isInteger(e.period) && e.period >= 1 && e.period <= 7);
    assert.ok(e.group === null || (Number.isInteger(e.group) && e.group >= 1 && e.group <= 18));
    assert.ok((typeof e.mass === 'number' && e.mass > 0) || /^\[\d+\]$/.test(e.mass), `${e.symbol} mass ${e.mass}`);
  }
});

test('known positions', () => {
  assert.deepEqual([bySymbol('H').group, bySymbol('H').period], [1, 1]);
  assert.deepEqual([bySymbol('He').group, bySymbol('He').period], [18, 1]);
  assert.deepEqual([bySymbol('Li').group, bySymbol('Li').period], [1, 2]);
  assert.deepEqual([bySymbol('Ne').group, bySymbol('Ne').period], [18, 2]);
  assert.deepEqual([bySymbol('Al').group, bySymbol('Al').period], [13, 3]);
  assert.deepEqual([bySymbol('Cl').group, bySymbol('Cl').period], [17, 3]);
  assert.deepEqual([bySymbol('Fe').group, bySymbol('Fe').period], [8, 4]);
  assert.deepEqual([bySymbol('Zn').group, bySymbol('Zn').period], [12, 4]);
  assert.deepEqual([bySymbol('Kr').group, bySymbol('Kr').period], [18, 4]);
  assert.deepEqual([bySymbol('Ag').group, bySymbol('Ag').period], [11, 5]);
  assert.deepEqual([bySymbol('Ba').group, bySymbol('Ba').period], [2, 6]);
  assert.deepEqual([bySymbol('Hf').group, bySymbol('Hf').period], [4, 6]);
  assert.deepEqual([bySymbol('Pb').group, bySymbol('Pb').period], [14, 6]);
  assert.deepEqual([bySymbol('Rn').group, bySymbol('Rn').period], [18, 6]);
  assert.deepEqual([bySymbol('Ra').group, bySymbol('Ra').period], [2, 7]);
  assert.deepEqual([bySymbol('Rf').group, bySymbol('Rf').period], [4, 7]);
  assert.deepEqual([bySymbol('Og').group, bySymbol('Og').period], [18, 7]);
});

test('lanthanides and actinides have no group', () => {
  const ln = ELEMENTS.filter((e) => e.category === 'lanthanide');
  const ac = ELEMENTS.filter((e) => e.category === 'actinide');
  assert.equal(ln.length, 15);
  assert.equal(ac.length, 15);
  assert.ok(ln.every((e) => e.group === null && e.period === 6));
  assert.ok(ac.every((e) => e.group === null && e.period === 7));
  assert.equal(bySymbol('La').category, 'lanthanide');
  assert.equal(bySymbol('Lu').category, 'lanthanide');
  assert.equal(bySymbol('Ac').category, 'actinide');
  assert.equal(bySymbol('Lr').category, 'actinide');
});

test('categories of common elements', () => {
  const cat = (s) => bySymbol(s).category;
  assert.equal(cat('H'), 'nonmetal');
  assert.equal(cat('Na'), 'alkali-metal');
  assert.equal(cat('Mg'), 'alkaline-earth-metal');
  assert.equal(cat('Fe'), 'transition-metal');
  assert.equal(cat('Al'), 'post-transition-metal');
  assert.equal(cat('Si'), 'metalloid');
  assert.equal(cat('O'), 'nonmetal');
  assert.equal(cat('Cl'), 'halogen');
  assert.equal(cat('Ar'), 'noble-gas');
});

test('masses', () => {
  assert.equal(bySymbol('H').mass, 1.008);
  assert.equal(bySymbol('C').mass, 12.011);
  assert.equal(bySymbol('Cl').mass, 35.45);
  assert.equal(bySymbol('Fe').mass, 55.845);
  assert.equal(bySymbol('Tc').mass, '[98]');
});
