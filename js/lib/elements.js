// Periodic table data (118 elements) for the runner's reference pane. Pure data, no DOM.
// Values and layout follow the California Standards Test "Chemistry Reference Sheet" periodic table
// (CDE 2003, updated 2012): average atomic masses as printed there (2 decimals), masses in parentheses for
// the most stable isotope, 2012 names for 113/115/117/118, La and Ac in group 3 with Ce–Lu and Th–Lr below.
//   { number, symbol, name, mass, group, period, category }
// mass: string exactly as printed ("16.00", "207.2", "(98)"). group: 1-18, or null for the two f-block rows.

// symbol,name,mass
const RAW = `H,Hydrogen,1.01|He,Helium,4.00|Li,Lithium,6.94|Be,Beryllium,9.01|B,Boron,10.81|C,Carbon,12.01|N,Nitrogen,14.01|O,Oxygen,16.00|F,Fluorine,19.00|Ne,Neon,20.18|
Na,Sodium,22.99|Mg,Magnesium,24.31|Al,Aluminum,26.98|Si,Silicon,28.09|P,Phosphorus,30.97|S,Sulfur,32.07|Cl,Chlorine,35.45|Ar,Argon,39.95|
K,Potassium,39.10|Ca,Calcium,40.08|Sc,Scandium,44.96|Ti,Titanium,47.87|V,Vanadium,50.94|Cr,Chromium,52.00|Mn,Manganese,54.94|Fe,Iron,55.85|Co,Cobalt,58.93|Ni,Nickel,58.69|Cu,Copper,63.55|Zn,Zinc,65.39|Ga,Gallium,69.72|Ge,Germanium,72.61|As,Arsenic,74.92|Se,Selenium,78.96|Br,Bromine,79.90|Kr,Krypton,83.80|
Rb,Rubidium,85.47|Sr,Strontium,87.62|Y,Yttrium,88.91|Zr,Zirconium,91.22|Nb,Niobium,92.91|Mo,Molybdenum,95.94|Tc,Technetium,(98)|Ru,Ruthenium,101.07|Rh,Rhodium,102.91|Pd,Palladium,106.42|Ag,Silver,107.87|Cd,Cadmium,112.41|In,Indium,114.82|Sn,Tin,118.71|Sb,Antimony,121.76|Te,Tellurium,127.60|I,Iodine,126.90|Xe,Xenon,131.29|
Cs,Cesium,132.91|Ba,Barium,137.33|La,Lanthanum,138.91|Ce,Cerium,140.12|Pr,Praseodymium,140.91|Nd,Neodymium,144.24|Pm,Promethium,(145)|Sm,Samarium,150.36|Eu,Europium,151.96|Gd,Gadolinium,157.25|Tb,Terbium,158.93|Dy,Dysprosium,162.50|Ho,Holmium,164.93|Er,Erbium,167.26|Tm,Thulium,168.93|Yb,Ytterbium,173.04|Lu,Lutetium,174.97|Hf,Hafnium,178.49|Ta,Tantalum,180.95|W,Tungsten,183.84|Re,Rhenium,186.21|Os,Osmium,190.23|Ir,Iridium,192.22|Pt,Platinum,195.08|Au,Gold,196.97|Hg,Mercury,200.59|Tl,Thallium,204.38|Pb,Lead,207.2|Bi,Bismuth,208.98|Po,Polonium,(209)|At,Astatine,(210)|Rn,Radon,(222)|
Fr,Francium,(223)|Ra,Radium,(226)|Ac,Actinium,(227)|Th,Thorium,232.04|Pa,Protactinium,231.04|U,Uranium,238.03|Np,Neptunium,(237)|Pu,Plutonium,(244)|Am,Americium,(243)|Cm,Curium,(247)|Bk,Berkelium,(247)|Cf,Californium,(251)|Es,Einsteinium,(252)|Fm,Fermium,(257)|Md,Mendelevium,(258)|No,Nobelium,(259)|Lr,Lawrencium,(262)|Rf,Rutherfordium,(261)|Db,Dubnium,(262)|Sg,Seaborgium,(266)|Bh,Bohrium,(264)|Hs,Hassium,(269)|Mt,Meitnerium,(268)|Ds,Darmstadium,(281)|Rg,Roentgenium,(281)|Cn,Copernicium,(285)|Uut,Ununtrium,(286)|Fl,Flerovium,(289)|Uup,Ununpentium,(294)|Lv,Livermorium,(293)|Uus,Ununseptium,(294)|Uuo,Ununoctium,(294)`;

// Group headings as printed: IUPAC number and the older A/B label (8, 9, 10 share "8B").
export const GROUP_LABELS = ['1A', '2A', '3B', '4B', '5B', '6B', '7B', '8B', '8B', '8B', '1B', '2B', '3A', '4A', '5A', '6A', '7A', '8A'];

// Elements to the right of the reference sheet's heavy "staircase" line (nonmetals / metalloid side).
export const STAIRCASE_RIGHT = new Set(['B', 'C', 'N', 'O', 'F', 'Ne', 'Si', 'P', 'S', 'Cl', 'Ar', 'As', 'Se', 'Br', 'Kr', 'Te', 'I', 'Xe', 'At', 'Rn']);

const PERIOD_ENDS = [2, 10, 18, 36, 54, 86, 118];

function layout(n) {
  const period = PERIOD_ENDS.findIndex((end) => n <= end) + 1;
  const start = period === 1 ? 1 : PERIOD_ENDS[period - 2] + 1;
  const i = n - start; // 0-based position within the period
  let group;
  if (period === 1) group = i === 0 ? 1 : 18;
  else if (period <= 3) group = i < 2 ? i + 1 : i + 11;
  else if (period <= 5) group = i + 1;
  else if ((n >= 58 && n <= 71) || (n >= 90 && n <= 103)) group = null; // f-block rows (Ce–Lu, Th–Lr)
  else group = i < 3 ? i + 1 : i + 1 - 14; // La / Ac sit in group 3; the 14 f-block cells are skipped
  return { period, group };
}

export const ELEMENTS = RAW.split('|').map((row) => row.trim()).filter(Boolean).map((row, idx) => {
  const [symbol, name, mass] = row.split(',');
  const number = idx + 1;
  return { number, symbol, name, mass, ...layout(number) };
});

/** Mass exactly as printed on the reference sheet. */
export function formatMass(mass) {
  return String(mass);
}
