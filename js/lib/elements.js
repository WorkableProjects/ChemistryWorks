// Periodic table data (118 elements) for the runner's reference pane. Pure data, no DOM.
//   { number, symbol, name, mass, group, period, category }
// mass: standard atomic weight (number) or the conventional mass number in brackets (string, e.g. "[98]")
//       for elements with no stable isotope. group: 1-18, or null for the lanthanide / actinide rows.

// symbol, name, mass
const RAW = `H,Hydrogen,1.008|He,Helium,4.0026|Li,Lithium,6.94|Be,Beryllium,9.0122|B,Boron,10.81|C,Carbon,12.011|N,Nitrogen,14.007|O,Oxygen,15.999|F,Fluorine,18.998|Ne,Neon,20.18|
Na,Sodium,22.99|Mg,Magnesium,24.305|Al,Aluminium,26.982|Si,Silicon,28.085|P,Phosphorus,30.974|S,Sulfur,32.06|Cl,Chlorine,35.45|Ar,Argon,39.95|
K,Potassium,39.098|Ca,Calcium,40.078|Sc,Scandium,44.956|Ti,Titanium,47.867|V,Vanadium,50.942|Cr,Chromium,51.996|Mn,Manganese,54.938|Fe,Iron,55.845|Co,Cobalt,58.933|Ni,Nickel,58.693|Cu,Copper,63.546|Zn,Zinc,65.38|Ga,Gallium,69.723|Ge,Germanium,72.63|As,Arsenic,74.922|Se,Selenium,78.971|Br,Bromine,79.904|Kr,Krypton,83.798|
Rb,Rubidium,85.468|Sr,Strontium,87.62|Y,Yttrium,88.906|Zr,Zirconium,91.224|Nb,Niobium,92.906|Mo,Molybdenum,95.95|Tc,Technetium,[98]|Ru,Ruthenium,101.07|Rh,Rhodium,102.91|Pd,Palladium,106.42|Ag,Silver,107.87|Cd,Cadmium,112.41|In,Indium,114.82|Sn,Tin,118.71|Sb,Antimony,121.76|Te,Tellurium,127.6|I,Iodine,126.9|Xe,Xenon,131.29|
Cs,Caesium,132.91|Ba,Barium,137.33|La,Lanthanum,138.91|Ce,Cerium,140.12|Pr,Praseodymium,140.91|Nd,Neodymium,144.24|Pm,Promethium,[145]|Sm,Samarium,150.36|Eu,Europium,151.96|Gd,Gadolinium,157.25|Tb,Terbium,158.93|Dy,Dysprosium,162.5|Ho,Holmium,164.93|Er,Erbium,167.26|Tm,Thulium,168.93|Yb,Ytterbium,173.05|Lu,Lutetium,174.97|Hf,Hafnium,178.49|Ta,Tantalum,180.95|W,Tungsten,183.84|Re,Rhenium,186.21|Os,Osmium,190.23|Ir,Iridium,192.22|Pt,Platinum,195.08|Au,Gold,196.97|Hg,Mercury,200.59|Tl,Thallium,204.38|Pb,Lead,207.2|Bi,Bismuth,208.98|Po,Polonium,[209]|At,Astatine,[210]|Rn,Radon,[222]|
Fr,Francium,[223]|Ra,Radium,[226]|Ac,Actinium,[227]|Th,Thorium,232.04|Pa,Protactinium,231.04|U,Uranium,238.03|Np,Neptunium,[237]|Pu,Plutonium,[244]|Am,Americium,[243]|Cm,Curium,[247]|Bk,Berkelium,[247]|Cf,Californium,[251]|Es,Einsteinium,[252]|Fm,Fermium,[257]|Md,Mendelevium,[258]|No,Nobelium,[259]|Lr,Lawrencium,[266]|Rf,Rutherfordium,[267]|Db,Dubnium,[268]|Sg,Seaborgium,[269]|Bh,Bohrium,[270]|Hs,Hassium,[277]|Mt,Meitnerium,[278]|Ds,Darmstadtium,[281]|Rg,Roentgenium,[282]|Cn,Copernicium,[285]|Nh,Nihonium,[286]|Fl,Flerovium,[289]|Mc,Moscovium,[290]|Lv,Livermorium,[293]|Ts,Tennessine,[294]|Og,Oganesson,[294]`;

export const CATEGORIES = [
  ['alkali-metal', 'Alkali metal'],
  ['alkaline-earth-metal', 'Alkaline earth metal'],
  ['transition-metal', 'Transition metal'],
  ['post-transition-metal', 'Post-transition metal'],
  ['metalloid', 'Metalloid'],
  ['nonmetal', 'Nonmetal'],
  ['halogen', 'Halogen'],
  ['noble-gas', 'Noble gas'],
  ['lanthanide', 'Lanthanide'],
  ['actinide', 'Actinide'],
];

const PERIOD_ENDS = [2, 10, 18, 36, 54, 86, 118];
const NONMETALS = new Set(['H', 'C', 'N', 'O', 'P', 'S', 'Se']);
const METALLOIDS = new Set(['B', 'Si', 'Ge', 'As', 'Sb', 'Te']);
const POST_TRANSITION = new Set(['Al', 'Ga', 'In', 'Sn', 'Tl', 'Pb', 'Bi', 'Po', 'Nh', 'Fl', 'Mc', 'Lv']);

function layout(n) {
  const period = PERIOD_ENDS.findIndex((end) => n <= end) + 1;
  const start = period === 1 ? 1 : PERIOD_ENDS[period - 2] + 1;
  const i = n - start; // 0-based position within the period
  let group;
  if (period === 1) group = i === 0 ? 1 : 18;
  else if (period <= 3) group = i < 2 ? i + 1 : i + 11;
  else if (period <= 5) group = i + 1;
  else if (n >= 57 && n <= 71) group = null; // lanthanides
  else if (n >= 89 && n <= 103) group = null; // actinides
  else group = n <= 56 || (n >= 87 && n <= 88) ? i + 1 : i + 1 - 14; // after the f-block, 14 cells are skipped
  return { period, group };
}

function categoryOf(symbol, n, group) {
  if (n >= 57 && n <= 71) return 'lanthanide';
  if (n >= 89 && n <= 103) return 'actinide';
  if (group === 18) return 'noble-gas';
  if (NONMETALS.has(symbol)) return 'nonmetal';
  if (METALLOIDS.has(symbol)) return 'metalloid';
  if (POST_TRANSITION.has(symbol)) return 'post-transition-metal';
  if (group === 17) return 'halogen';
  if (group === 1) return 'alkali-metal';
  if (group === 2) return 'alkaline-earth-metal';
  return 'transition-metal';
}

export const ELEMENTS = RAW.split('|').map((row) => row.trim()).filter(Boolean).map((row, idx) => {
  const [symbol, name, massText] = row.split(',');
  const number = idx + 1;
  const { period, group } = layout(number);
  const mass = massText.startsWith('[') ? massText : Number(massText);
  return { number, symbol, name, mass, group, period, category: categoryOf(symbol, number, group) };
});

/** Mass as shown in the table: numbers keep their printed decimals (20.18 -> "20.18"), brackets stay. */
export function formatMass(mass) {
  return typeof mass === 'string' ? mass : String(mass);
}
