import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFormula, formulaToHTML, formulaToLatex, formulasEqual } from '../../js/lib/formula.js';

const NORMALIZE = [
  ['H2O', 'H2O'],
  ['  H2 O  ', 'H2O'],
  ['H₂O', 'H2O'],
  ['H₂SO₄', 'H2SO4'],
  ['SO₄²⁻', 'SO4^2-'],
  ['Ca²⁺', 'Ca^2+'],
  ['Na⁺', 'Na^+'],
  ['Cl⁻', 'Cl^-'],
  ['SO4^2-', 'SO4^2-'],
  ['SO4{2-}', 'SO4^2-'],
  ['SO4^-2', 'SO4^2-'],
  ['SO4^{2-}', 'SO4^2-'],
  ['SO4^2−', 'SO4^2-'],
  ['SO42-', 'SO4^2-'],
  ['CO32-', 'CO3^2-'],
  ['Na+', 'Na^+'],
  ['Na^+', 'Na^+'],
  ['Na^1+', 'Na^+'],
  ['Cl-', 'Cl^-'],
  ['Cl−', 'Cl^-'],
  ['Fe3+', 'Fe^3+'],
  ['Fe^3+', 'Fe^3+'],
  ['CuSO4·5H2O', 'CuSO4.5H2O'],
  ['CuSO4•5H2O', 'CuSO4.5H2O'],
  ['CuSO4∙5H2O', 'CuSO4.5H2O'],
  ['CuSO4*5H2O', 'CuSO4.5H2O'],
  ['CuSO4.5H2O', 'CuSO4.5H2O'],
  ['Ca(OH)2', 'Ca(OH)2'],
  ['[Fe(CN)6]^3-', '[Fe(CN)6]^3-'],
  ['2H2 + O2 -> 2H2O', '2H2+O2->2H2O'],
  ['Na+ + Cl-', 'Na^++Cl^-'],
  ['', ''],
];
for (const [input, expected] of NORMALIZE) {
  test(`normalizeFormula(${JSON.stringify(input)})`, () => {
    assert.equal(normalizeFormula(input), expected);
  });
}

test('normalizeFormula handles non-strings', () => {
  assert.equal(normalizeFormula(null), '');
  assert.equal(normalizeFormula(undefined), '');
  assert.equal(normalizeFormula(42), '42');
});

test('normalizeFormula is idempotent', () => {
  for (const [input] of NORMALIZE) {
    const once = normalizeFormula(input);
    assert.equal(normalizeFormula(once), once, input);
  }
});

test('normalizeFormula leaves multi-digit subscripts at end alone when no sign', () => {
  assert.equal(normalizeFormula('C12H22O11'), 'C12H22O11');
});

const HTML = [
  ['H2O', 'H<sub>2</sub>O'],
  ['CuSO4.5H2O', 'CuSO<sub>4</sub>·5H<sub>2</sub>O'],
  ['CuSO4·5H2O', 'CuSO<sub>4</sub>·5H<sub>2</sub>O'],
  ['SO4^2-', 'SO<sub>4</sub><sup>2−</sup>'],
  ['SO₄²⁻', 'SO<sub>4</sub><sup>2−</sup>'],
  ['Ca(OH)2', 'Ca(OH)<sub>2</sub>'],
  ['Na^+', 'Na<sup>+</sup>'],
  ['Na+', 'Na<sup>+</sup>'],
  ['Cl-', 'Cl<sup>−</sup>'],
  ['Fe3+', 'Fe<sup>3+</sup>'],
  ['2H2 + O2', '2H<sub>2</sub> + O<sub>2</sub>'],
  ['[Fe(CN)6]^3-', '[Fe(CN)<sub>6</sub>]<sup>3−</sup>'],
  ['C12H22O11', 'C<sub>12</sub>H<sub>22</sub>O<sub>11</sub>'],
  ['', ''],
];
for (const [input, expected] of HTML) {
  test(`formulaToHTML(${JSON.stringify(input)})`, () => {
    assert.equal(formulaToHTML(input), expected);
  });
}

test('formulaToHTML keeps leading coefficients normal', () => {
  assert.equal(formulaToHTML('2H2O'), '2H<sub>2</sub>O');
});

test('formulaToHTML escapes every unsafe character', () => {
  const out = formulaToHTML(`<img src=x onerror="alert('x')">&`);
  assert.ok(!out.includes('<img'));
  assert.ok(!/<(?!\/?(sub|sup)>)/.test(out), out);
  assert.ok(out.includes('&lt;img'));
  assert.ok(out.includes('&quot;'));
  assert.ok(out.includes('&#39;'));
  assert.ok(out.includes('&gt;'));
  assert.ok(out.includes('&amp;'));
});

test('formulaToHTML escapes script payloads', () => {
  const out = formulaToHTML('<script>alert(1)</script>');
  assert.ok(!out.includes('<script'));
  assert.ok(out.startsWith('&lt;script&gt;'));
});

test('formulaToLatex wraps in \\ce and escapes', () => {
  assert.equal(formulaToLatex('H2O'), '\\ce{H2O}');
  assert.equal(formulaToLatex('SO₄²⁻'), '\\ce{SO4^2-}');
  assert.equal(formulaToLatex('CuSO4.5H2O'), '\\ce{CuSO4*5H2O}');
  assert.equal(formulaToLatex('a{b}\\c'), '\\ce{a\\{b\\}\\\\c}');
});

test('formulasEqual compares normalized forms', () => {
  assert.ok(formulasEqual('H₂SO₄', 'H2SO4'));
  assert.ok(formulasEqual('SO4^2-', 'SO₄²⁻'));
  assert.ok(formulasEqual('CuSO4·5H2O', 'CuSO4.5H2O'));
  assert.ok(!formulasEqual('H2O', 'H2O2'));
  assert.ok(!formulasEqual('NaCl', 'NACL'));
});

test('formulasEqual caseSensitive:false', () => {
  assert.ok(formulasEqual('nacl', 'NaCl', { caseSensitive: false }));
  assert.ok(!formulasEqual('nacl', 'NaCl', { caseSensitive: true }));
  assert.ok(!formulasEqual('co', 'Co2', { caseSensitive: false }));
});

test('implicit charges: polyatomic vs monatomic heuristics', () => {
  const cases = {
    'NH4+': 'NH4^+', 'H3O+': 'H3O^+', 'Fe3+': 'Fe^3+', 'Al3+': 'Al^3+', 'O2-': 'O^2-',
    'SO42-': 'SO4^2-', 'PO43-': 'PO4^3-', 'Cr2O72-': 'Cr2O7^2-', 'SO4 2-': 'SO4^2-', '2Fe3+': '2Fe^3+',
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(normalizeFormula(input), expected, input);
  assert.equal(normalizeFormula('2H2 + O2 -> 2H2O'), '2H2+O2->2H2O');
  assert.ok(formulasEqual('NH4+', 'NH₄⁺'));
  assert.ok(formulasEqual('SO4 2-', 'SO4^2-'));
});

test('formulaToHTML renders reaction arrows', () => {
  assert.equal(formulaToHTML('H2 -> H2'), 'H<sub>2</sub>  →  H<sub>2</sub>');
  assert.equal(formulaToHTML('NH4+'), 'NH<sub>4</sub><sup>+</sup>');
});
