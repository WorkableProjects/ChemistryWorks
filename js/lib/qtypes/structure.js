// `structure`: a full Lewis structure (bond orders and lone pairs on a given skeleton). Answer: { bonds, lonePairs },
// plus { bracket, charge, formalCharges } when the student also draws charges (`studentCharges`, teacher graded).
import { registerType } from './registry.js';
import { normalizeSymbol } from '../lewis.js';
import {
  bondEnds, validateStructure, isStructureAnswered, scoreStructure, describeStructure, acceptedStructures,
} from '../structure.js';
import { str, bool, isObj, DASH } from './shared.js';

export const def = {
  type: 'structure',
  label: 'Lewis structure (bonding)',
  shortLabel: 'Lewis structure',
  group: 'Diagrams & graphs',
  manual: false,
  // Graded by the teacher only when the student draws brackets and charges.
  isManual: (q) => q.studentCharges === true,

  normalize(q) {
    q.atoms = Array.isArray(q.atoms) ? q.atoms.map((a) => {
      const src = isObj(a) ? a : {};
      const sym = normalizeSymbol(src.symbol);
      return { ...src, id: str(src.id).trim(), symbol: sym || str(src.symbol).trim() };
    }) : [];
    q.bonds = Array.isArray(q.bonds) ? q.bonds.map((b) => bondEnds(b) || b) : [];
    q.charge = q.charge === undefined || q.charge === null || q.charge === '' ? 0 : Number(q.charge);
    q.partialCredit = bool(q.partialCredit, false);
    q.showElectronCount = bool(q.showElectronCount, false);
    q.studentCharges = bool(q.studentCharges, false);
  },

  validate: (q, where, errors) => validateStructure(q, where, errors),

  blank: (base) => ({
    ...base, points: 3, text: 'Draw the Lewis structure of carbon dioxide, $\\ce{CO2}$.', partialCredit: false,
    atoms: [{ id: 'o1', symbol: 'O', x: 0, y: 0 }, { id: 'c', symbol: 'C', x: 1, y: 0 }, { id: 'o2', symbol: 'O', x: 2, y: 0 }],
    bonds: [['o1', 'c'], ['c', 'o2']], charge: 0, showElectronCount: false,
    correctAnswer: { bonds: [2, 2], lonePairs: { o1: 2, c: 0, o2: 2 } },
    studentCharges: false,
  }),

  isAnswered: (q, answer) => isStructureAnswered(answer),

  grade: (q, answer) => scoreStructure(q, answer),

  format: (q, answer) => describeStructure(q, answer),

  keyText(q) {
    const list = acceptedStructures(q);
    if (!list.length) return DASH;
    return list.map((k, i) => `${list.length > 1 ? `Form ${i + 1}: ` : ''}${describeStructure(q, k)}`).join(' | ');
  },

  correctAnswer: (q) => q.correctAnswer,
};

registerType(def);
export default def;
