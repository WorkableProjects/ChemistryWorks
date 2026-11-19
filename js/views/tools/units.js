// Constants and unit converter data for the "Units & constants" tab. Pure.

export const CONSTANTS = [
  { id: 'R-J', name: 'Gas constant', symbol: 'R', value: '8.314', unit: 'J/(mol·K)' },
  { id: 'R-atm', name: 'Gas constant', symbol: 'R', value: '0.08206', unit: 'L·atm/(mol·K)' },
  { id: 'NA', name: 'Avogadro constant', symbol: 'N_A', value: '6.022e23', unit: 'mol⁻¹' },
  { id: 'c', name: 'Speed of light', symbol: 'c', value: '2.998e8', unit: 'm/s' },
  { id: 'h', name: 'Planck constant', symbol: 'h', value: '6.626e-34', unit: 'J·s' },
  { id: 'kB', name: 'Boltzmann constant', symbol: 'k_B', value: '1.381e-23', unit: 'J/K' },
  { id: 'F', name: 'Faraday constant', symbol: 'F', value: '96485', unit: 'C/mol' },
  { id: 'e', name: 'Elementary charge', symbol: 'e', value: '1.602e-19', unit: 'C' },
  { id: 'me', name: 'Electron mass', symbol: 'm_e', value: '9.109e-31', unit: 'kg' },
  { id: 'Vm', name: 'Molar volume of an ideal gas at STP', symbol: 'V_m', value: '22.41', unit: 'L/mol' },
  { id: 'Kw', name: 'Water ion product at 25 °C', symbol: 'K_w', value: '1.0e-14', unit: '' },
  { id: 'cw', name: 'Specific heat of water', symbol: 'c', value: '4.184', unit: 'J/(g·°C)' },
];

/** Each category: factor = how many base units one of this unit is. Temperature is handled separately. */
export const UNIT_CATEGORIES = {
  mass: { label: 'Mass', base: 'g', units: { kg: 1000, g: 1, mg: 1e-3, 'µg': 1e-6, lb: 453.59237, oz: 28.349523125, amu: 1.66053906660e-24 } },
  volume: { label: 'Volume', base: 'L', units: { L: 1, mL: 1e-3, 'µL': 1e-6, 'cm³': 1e-3, 'dm³': 1, 'm³': 1000, gal: 3.785411784 } },
  pressure: { label: 'Pressure', base: 'Pa', units: { Pa: 1, kPa: 1000, atm: 101325, bar: 1e5, mmHg: 133.322387415, torr: 101325 / 760, psi: 6894.757293168 } },
  energy: { label: 'Energy', base: 'J', units: { J: 1, kJ: 1000, cal: 4.184, kcal: 4184, eV: 1.602176634e-19 } },
  length: { label: 'Length', base: 'm', units: { km: 1000, m: 1, cm: 1e-2, mm: 1e-3, 'µm': 1e-6, nm: 1e-9, pm: 1e-12, 'Å': 1e-10, in: 0.0254 } },
  temperature: { label: 'Temperature', base: 'K', units: { K: 1, '°C': 1, '°F': 1 } },
};

const toKelvin = { K: (x) => x, '°C': (x) => x + 273.15, '°F': (x) => ((x - 32) * 5) / 9 + 273.15 };
const fromKelvin = { K: (x) => x, '°C': (x) => x - 273.15, '°F': (x) => ((x - 273.15) * 9) / 5 + 32 };

/** convert(12, 'mL', 'L', 'volume') -> 0.012; returns NaN for unknown units or non-numeric input. */
export function convert(value, from, to, category) {
  const cat = UNIT_CATEGORIES[category];
  const v = Number(value);
  if (!cat || !Number.isFinite(v) || !(from in cat.units) || !(to in cat.units)) return NaN;
  if (category === 'temperature') return fromKelvin[to](toKelvin[from](v));
  return (v * cat.units[from]) / cat.units[to];
}
