// V4-09 built-in chemistry functions (S10).
import test from 'node:test';
import assert from 'node:assert/strict';
import { molarMass, molarMassBreakdown, parseFormulaCounts, convert, idealGasP, idealGasV, idealGasN, idealGasT, dilutionC2, dilutionV1, dilutionV2, pH, hFromPH, pHStrongAcid, pHStrongBase, pHWeakAcid, pHWeakBase, moles, massFromMoles, CHEM_FUNCS } from '../../js/lib/chemfuncs.js';

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test('molarMass: simple, parentheses, hydrates, charges', () => {
  near(molarMass('NaCl'), 58.44);
  near(molarMass('H2O'), 18.02);
  near(molarMass('Ca(OH)2'), 74.10);
  near(molarMass('Fe2(SO4)3'), 399.91);
  near(molarMass('CuSO4.5H2O'), 249.72);
  near(molarMass('CuSO4·5H2O'), 249.72);
  near(molarMass('SO4^2-'), 96.07);
  near(molarMass('Al2(SO4)3'), 342.17);
  near(molarMass('[Cu(NH3)4]SO4'), 227.8 + 0.01, 0.1);
});

test('molarMass: unreadable formulas give NaN', () => {
  for (const f of ['', 'Xx', '(OH', 'OH)', 'ca(OH)2', '2', null, undefined]) assert.ok(Number.isNaN(molarMass(f)), String(f));
});

test('parseFormulaCounts and the breakdown rows', () => {
  assert.deepEqual(parseFormulaCounts('Ca(OH)2'), { Ca: 1, O: 2, H: 2 });
  assert.deepEqual(molarMassBreakdown('NaCl').map((r) => [r.symbol, r.count, r.total]), [['Na', 1, 22.99], ['Cl', 1, 35.45]]);
  assert.equal(molarMassBreakdown('zzz'), null);
});

test('moles and mass', () => {
  near(moles(58.44, 'NaCl'), 1);
  near(massFromMoles(2, 'H2O'), 36.04);
});

test('unit conversion', () => {
  near(convert(250, 'mL', 'L'), 0.25);
  near(convert(1, 'atm', 'kPa'), 101.325);
  near(convert(760, 'mmHg', 'atm'), 1);
  near(convert(25, 'C', 'K'), 298.15);
  near(convert(212, 'F', 'C'), 100);
  near(convert(2, 'kJ', 'J'), 2000);
  near(convert(1.5, 'kg', 'g'), 1500);
  assert.throws(() => convert(1, 'g', 'L'));
  assert.throws(() => convert(1, 'constructor', 'g'));
});

test('ideal gas: the four rearrangements agree', () => {
  const P = idealGasP(1, 273.15, 22.414);
  near(P, 1, 1e-3);
  near(idealGasV(1, 273.15, 1), 22.414, 1e-2);
  near(idealGasN(1, 22.414, 273.15), 1, 1e-3);
  near(idealGasT(1, 22.414, 1), 273.15, 0.5);
});

test('dilution', () => {
  near(dilutionC2(2, 10, 40), 0.5);
  near(dilutionV2(2, 10, 0.5), 40);
  near(dilutionV1(0.5, 40, 2), 10);
});

test('pH', () => {
  near(pH(1e-3), 3);
  near(hFromPH(4), 1e-4, 1e-12);
  near(pHStrongAcid(0.01), 2);
  near(pHStrongBase(0.01), 12);
  near(pHWeakAcid(0.1, 1.8e-5), 2.875, 5e-3);
  near(pHWeakBase(0.1, 1.8e-5), 11.125, 5e-3);
});

test('the whitelist has no surprises', () => {
  for (const name of ['eval', 'Function', 'constructor', '__proto__', 'toString', 'process']) assert.equal(Object.prototype.hasOwnProperty.call(CHEM_FUNCS, name), false);
  assert.ok(Object.isFrozen(CHEM_FUNCS));
});
