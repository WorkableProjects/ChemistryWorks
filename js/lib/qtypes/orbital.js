// `orbital`: fill an energy orbital diagram. Teacher graded. Answer: { [sublevel]: ['u' | 'd' | 'ud' | '', ...] }.
import { registerType } from './registry.js';
import {
  ORBITAL_TYPES, DEFAULT_MAX_SUBLEVEL, DEFAULT_ORBITAL_TYPES, validateOrbital, isOrbitalAnswered, describeOrbital,
} from '../orbital.js';
import { str, DASH } from './shared.js';

export const def = {
  type: 'orbital',
  label: 'Orbital diagram (teacher graded)',
  shortLabel: 'Orbital diagram',
  group: 'Diagrams & graphs',
  manual: true,

  normalize(q) {
    q.maxSublevel = q.maxSublevel === undefined || q.maxSublevel === null || q.maxSublevel === '' ? DEFAULT_MAX_SUBLEVEL : str(q.maxSublevel).trim().toLowerCase();
    q.orbitalTypes = Array.isArray(q.orbitalTypes)
      ? ORBITAL_TYPES.filter((t) => q.orbitalTypes.map((x) => str(x).trim().toLowerCase()).includes(t))
      : DEFAULT_ORBITAL_TYPES.slice();
    if (q.sampleAnswer === undefined || q.sampleAnswer === '') q.sampleAnswer = null;
  },

  validate: (q, where, errors) => validateOrbital(q, where, errors),

  blank: (base) => ({
    ...base, points: 2, text: 'Draw the orbital diagram for a ground-state nitrogen atom.',
    element: 'N', maxSublevel: '2p', orbitalTypes: ['s', 'p'],
    sampleAnswer: { '1s': ['ud'], '2s': ['ud'], '2p': ['u', 'u', 'u'] },
  }),

  isAnswered: (q, answer) => isOrbitalAnswered(q, answer),

  grade: () => ({ fraction: 0, full: false }),

  format: (q, answer) => describeOrbital(q, answer),

  keyText: (q) => (q.sampleAnswer ? `Sample: ${describeOrbital(q, q.sampleAnswer)}` : DASH),

  correctAnswer: (q) => q.sampleAnswer || null,
};

registerType(def);
export default def;
