// `vsepr` question type: molecular shape. Pure definition, no DOM.
//   Question: { formula, electronGeometry, molecularGeometry, bondAngle, fields?: ['electron','molecular','angle'] }
//   Answer:   { electron, molecular, angle } (ids from the vocabularies below). Each enabled field is worth an equal share.
import { registerType } from './registry.js';

const str = (v) => (v === undefined || v === null ? '' : String(v));

export const ELECTRON_GEOMETRIES = ['linear', 'trigonal planar', 'tetrahedral', 'trigonal bipyramidal', 'octahedral'];
export const MOLECULAR_GEOMETRIES = [
  'linear', 'bent', 'trigonal planar', 'trigonal pyramidal', 'tetrahedral', 'see-saw', 'T-shaped',
  'trigonal bipyramidal', 'square pyramidal', 'square planar', 'octahedral',
];
/** Bond-angle ids (shown with a degree sign). */
export const BOND_ANGLES = ['180', '120', '<120', '109.5', '<109.5', '107', '104.5', '90', '<90', '90 & 120', '<90 & 120'];
export const FIELDS = ['electron', 'molecular', 'angle'];
export const FIELD_LABELS = { electron: 'Electron geometry', molecular: 'Molecular geometry', angle: 'Bond angle' };

/** Angle id as text for people: "<109.5" -> "<109.5°", "90 & 120" -> "90° & 120°". */
export const angleLabel = (id) => str(id).replace(/(\d+(?:\.\d+)?)/g, '$1°');

const canonGeo = (v) => str(v).trim().toLowerCase().replace(/[\s_]+/g, ' ').replace(/^see ?saw$/, 'see-saw').replace(/^t[ -]?shaped$/, 't-shaped');
export const canonAngle = (v) => str(v).trim().replace(/[°º]/g, '').replace(/\s*&\s*/g, ' & ').replace(/^<\s*/, '<').replace(/\s+/g, ' ');

/** The vocabulary entry equal to `value` once spelling is normalised, or '' when it is not in `list`. */
function vocab(list, value, canon) {
  const c = canon(value);
  return list.find((x) => canon(x) === c) || '';
}
const geoOf = (list, v) => vocab(list, v, canonGeo);
const angleOf = (v) => vocab(BOND_ANGLES, v, canonAngle);

/** Keys of the question that carry the answer for each field. */
const KEY = { electron: 'electronGeometry', molecular: 'molecularGeometry', angle: 'bondAngle' };

function enabledFields(q) {
  const f = Array.isArray(q.fields) ? q.fields.filter((x) => FIELDS.includes(x)) : [];
  return f.length ? FIELDS.filter((x) => f.includes(x)) : FIELDS.slice();
}
export const fieldsOf = enabledFields;

function score(q, answer) {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) return { fraction: 0, full: false };
  const fields = enabledFields(q);
  const ok = (f) => {
    if (f === 'angle') return angleOf(answer.angle) !== '' && angleOf(answer.angle) === angleOf(q.bondAngle);
    const list = f === 'electron' ? ELECTRON_GEOMETRIES : MOLECULAR_GEOMETRIES;
    return geoOf(list, answer[f]) !== '' && geoOf(list, answer[f]) === geoOf(list, q[KEY[f]]);
  };
  const right = fields.filter(ok).length;
  return { fraction: right / fields.length, full: right === fields.length };
}

const text = (q, a, f) => (f === 'angle' ? (a.angle ? angleLabel(a.angle) : '—') : str(a[f]).trim() || '—');

const def = {
  type: 'vsepr',
  label: 'Molecular shape (VSEPR)',
  shortLabel: 'Molecular shape',
  group: 'Chemistry',
  manual: false,
  normalize(q) {
    q.formula = str(q.formula).trim();
    q.electronGeometry = geoOf(ELECTRON_GEOMETRIES, q.electronGeometry) || str(q.electronGeometry).trim();
    q.molecularGeometry = geoOf(MOLECULAR_GEOMETRIES, q.molecularGeometry) || str(q.molecularGeometry).trim();
    q.bondAngle = angleOf(q.bondAngle) || canonAngle(q.bondAngle);
    q.fields = Array.isArray(q.fields) ? FIELDS.filter((f) => q.fields.includes(f)) : FIELDS.slice();
  },
  validate(q, where, errors) {
    if (!q.formula) errors.push(`${where}: formula is required.`);
    if (!q.fields.length) errors.push(`${where}: fields must include at least one of ${FIELDS.join(', ')}.`);
    if (q.fields.includes('electron') && !ELECTRON_GEOMETRIES.includes(q.electronGeometry)) errors.push(`${where}: electronGeometry must be one of ${ELECTRON_GEOMETRIES.join(', ')}.`);
    if (q.fields.includes('molecular') && !MOLECULAR_GEOMETRIES.includes(q.molecularGeometry)) errors.push(`${where}: molecularGeometry must be one of ${MOLECULAR_GEOMETRIES.join(', ')}.`);
    if (q.fields.includes('angle') && !BOND_ANGLES.includes(q.bondAngle)) errors.push(`${where}: bondAngle must be one of ${BOND_ANGLES.join(', ')}.`);
  },
  blank(base) {
    return { ...base, text: 'Describe the shape of the molecule.', formula: 'H2O', electronGeometry: 'tetrahedral', molecularGeometry: 'bent', bondAngle: '104.5', fields: FIELDS.slice() };
  },
  isAnswered: (q, answer) => answer !== null && typeof answer === 'object' && FIELDS.some((f) => str(answer[f]).trim() !== ''),
  score,
  answerText(q, answer) {
    const a = answer && typeof answer === 'object' ? answer : {};
    return enabledFields(q).map((f) => `${FIELD_LABELS[f]}: ${text(q, a, f)}`).join('; ');
  },
  keyText(q) {
    const a = { electron: q.electronGeometry, molecular: q.molecularGeometry, angle: q.bondAngle };
    return enabledFields(q).map((f) => `${FIELD_LABELS[f]}: ${text(q, a, f)}`).join('; ');
  },
  correctAnswer(q) {
    const out = {};
    for (const f of enabledFields(q)) out[f] = q[KEY[f]];
    return out;
  },
};

registerType(def);
export default def;
