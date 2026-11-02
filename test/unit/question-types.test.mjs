// Ordering, fill-in-the-blank, Lewis structure, open response, and charge/exponent typing help.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTest, validateTest, blankQuestion, MANUAL_TYPES } from '../../js/lib/schema.js';
import { gradeQuestion, gradeTest, isAnswered, formatAnswer } from '../../js/lib/grading.js';
import { valenceTotal, electronsDrawn, formalCharges, layoutAtoms, normalizeStructureAnswer } from '../../js/lib/structure.js';
import { splitBlanks, blankedText, wordBankChoices } from '../../js/lib/blanks.js';
import { formatHelpFor, formulaHasCharge, needsScientific } from '../../js/lib/hints.js';

const one = (q) => normalizeTest({ code: 'T1', title: 'T', questions: [q] });
const errorsFor = (q) => validateTest(one(q)).errors;
const norm = (q) => one(q).questions[0];

/* ---------------------------------------------------------------- structure */

const co2 = {
  id: 'q1', type: 'structure', text: 'Draw CO2', points: 3,
  atoms: [{ id: 'o1', symbol: 'O', x: 0, y: 0 }, { id: 'c', symbol: 'C', x: 1, y: 0 }, { id: 'o2', symbol: 'O', x: 2, y: 0 }],
  bonds: [['o1', 'c'], ['c', 'o2']],
  correctAnswer: { bonds: [2, 2], lonePairs: { o1: 2, c: 0, o2: 2 } },
};

const nitrate = {
  id: 'q2', type: 'structure', text: 'Draw NO3^-', points: 4, charge: -1, partialCredit: true,
  atoms: [{ id: 'n', symbol: 'N' }, { id: 'o1', symbol: 'O' }, { id: 'o2', symbol: 'O' }, { id: 'o3', symbol: 'O' }],
  bonds: [['n', 'o1'], ['n', 'o2'], ['n', 'o3']],
  correctAnswer: [
    { bonds: [2, 1, 1], lonePairs: { o1: 2, o2: 3, o3: 3 } },
    { bonds: [1, 2, 1], lonePairs: { o1: 3, o2: 2, o3: 3 } },
    { bonds: [1, 1, 2], lonePairs: { o1: 3, o2: 3, o3: 2 } },
  ],
};

test('structure: valid CO2 and nitrate (resonance) pass validation', () => {
  assert.deepEqual(errorsFor(co2), []);
  assert.deepEqual(errorsFor(nitrate), []);
  assert.equal(valenceTotal(norm(co2)), 16);
  assert.equal(valenceTotal(norm(nitrate)), 24);
});

test('structure: electron count mismatch is reported', () => {
  const bad = { ...co2, correctAnswer: { bonds: [2, 2], lonePairs: { o1: 2, o2: 1 } } };
  const errs = errorsFor(bad);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /uses 14 electrons but the atoms have 16/);
});

test('structure: skeleton errors', () => {
  assert.match(errorsFor({ ...co2, bonds: [['o1', 'zz'], ['c', 'o2']] }).join('\n'), /unknown atom id/);
  assert.match(errorsFor({ ...co2, bonds: [['o1', 'c'], ['c', 'o1']] }).join('\n'), /listed twice/);
  assert.match(errorsFor({ ...co2, correctAnswer: { bonds: [2], lonePairs: {} } }).join('\n'), /one bond order for each of the 2 bonds/);
  assert.match(errorsFor({ ...co2, atoms: [{ id: 'o1', symbol: '12' }, ...co2.atoms.slice(1)] }).join('\n'), /element symbol/);
  assert.match(errorsFor({ ...co2, correctAnswer: { bonds: [4, 0], lonePairs: {} } }).join('\n'), /bond orders must be 1, 2 or 3/);
  assert.match(errorsFor({ ...co2, charge: 0.5 }).join('\n'), /charge must be a whole number/);
});

test('structure: grading exact, resonance, partial credit', () => {
  const q = norm(co2);
  assert.equal(gradeQuestion(q, { bonds: [2, 2], lonePairs: { o1: 2, c: 0, o2: 2 } }).isCorrect, true);
  assert.equal(gradeQuestion(q, { bonds: [2, 2], lonePairs: { o1: 2, o2: 2 } }).isCorrect, true, 'missing lone pairs count as 0');
  assert.equal(gradeQuestion(q, { bonds: [1, 1], lonePairs: { o1: 3, c: 0, o2: 3 } }).pointsEarned, 0, 'no partial credit by default');

  const n = norm(nitrate);
  assert.equal(gradeQuestion(n, { bonds: [1, 1, 2], lonePairs: { o1: 3, o2: 3, o3: 2 } }).isCorrect, true, 'any resonance form');
  // 3 bonds + 4 atoms = 7 parts; single bonds everywhere with right lone pairs for form 1 except o1 → best form matches 5/7
  const g = gradeQuestion(n, { bonds: [1, 1, 1], lonePairs: { n: 0, o1: 3, o2: 3, o3: 3 } });
  assert.equal(g.isCorrect, false);
  assert.equal(g.pointsEarned, Math.round((5 / 7) * 4 * 100) / 100);
});

test('structure: isAnswered, electrons, formal charges, describe, layout', () => {
  const q = norm(nitrate);
  assert.equal(isAnswered(q, { bonds: [0, 0, 0], lonePairs: {} }), false);
  assert.equal(isAnswered(q, { bonds: [1, 0, 0], lonePairs: {} }), true);
  assert.equal(electronsDrawn(q, q.correctAnswer[0]), 24);
  assert.deepEqual(formalCharges(q, q.correctAnswer[0]), { n: 1, o1: 0, o2: -1, o3: -1 });
  assert.match(formatAnswer(q, q.correctAnswer[0]), /N–O\(o1\) double/);
  const pos = layoutAtoms(q);
  assert.deepEqual(pos.n, { x: 0, y: 0 }, 'central atom (most bonds) at the origin');
  assert.equal(Object.keys(pos).length, 4);
  assert.deepEqual(normalizeStructureAnswer(q, { bonds: [9, -1], lonePairs: { n: 7 } }), { bonds: [3, 0, 0], lonePairs: { n: 4, o1: 0, o2: 0, o3: 0 } });
});

/* ---------------------------------------------------------------- fill in the blank */

const fill = {
  id: 'q3', type: 'fillblank', points: 3,
  text: 'Sodium forms the ion {{b1}}. One mole is {{b2}} particles. Ionic bonds involve electron {{b3}}.',
  blanks: [
    { id: 'b1', answers: ['Na+'], kind: 'formula' },
    { id: 'b2', answers: ['6.022e23'], kind: 'number', tolerance: 1, toleranceType: 'percent' },
    { id: 'b3', answers: ['transfer', 'transferring'] },
  ],
};

test('fillblank: parsing helpers', () => {
  assert.deepEqual(splitBlanks('A {{b1}} B {{ b2 }}'), [{ text: 'A ' }, { blank: 'b1' }, { text: ' B ' }, { blank: 'b2' }]);
  assert.equal(blankedText(fill.text), 'Sodium forms the ion ____(1). One mole is ____(2) particles. Ionic bonds involve electron ____(3).');
  assert.deepEqual(wordBankChoices({ blanks: fill.blanks, distractors: ['sharing', 'transfer'] }), ['Na+', '6.022e23', 'transfer', 'sharing']);
});

test('fillblank: validation', () => {
  assert.deepEqual(errorsFor(fill), []);
  assert.match(errorsFor({ ...fill, text: 'No markers' }).join('\n'), /missing the marker \{\{b1\}\}/);
  assert.match(errorsFor({ ...fill, text: `${fill.text} {{b9}}` }).join('\n'), /no blank with id "b9"/);
  assert.match(errorsFor({ ...fill, blanks: [{ id: 'b1', answers: [] }, ...fill.blanks.slice(1)] }).join('\n'), /needs answers/);
  assert.match(errorsFor({ ...fill, blanks: [{ id: 'b1', answers: ['x'], kind: 'color' }, ...fill.blanks.slice(1)] }).join('\n'), /kind must be/);
  assert.match(errorsFor({ ...fill, blanks: [fill.blanks[0], { id: 'b2', answers: ['lots'], kind: 'number' }, fill.blanks[2]] }).join('\n'), /every answer must be a number/);
});

test('fillblank: grading per kind and partial credit', () => {
  const q = norm(fill);
  const full = gradeQuestion(q, { b1: 'Na^+', b2: '6.02 x 10^23', b3: ' Transfer. ' });
  assert.equal(full.isCorrect, true);
  const part = gradeQuestion(q, { b1: 'Na', b2: '6.02e23' });
  assert.equal(part.pointsEarned, 1);
  assert.equal(gradeQuestion({ ...q, partialCredit: false }, { b1: 'Na+' }).pointsEarned, 0);
  assert.equal(gradeQuestion({ ...q, caseSensitive: true }, { b1: 'Na+', b2: '6.022e23', b3: 'Transfer' }).isCorrect, false);
  assert.equal(isAnswered(q, { b1: '  ' }), false);
  const res = gradeTest(one(fill), { q3: { b3: 'transfer' } }).results[0];
  assert.equal(res.questionText, blankedText(fill.text));
  assert.equal(res.givenAnswerText, '(1) —; (2) —; (3) transfer');
});

/* ---------------------------------------------------------------- ordering */

const order = {
  id: 'q4', type: 'ordering', text: 'Order by electronegativity', points: 4,
  items: [{ id: 'na', text: 'Na' }, { id: 'c', text: 'C' }, { id: 'o', text: 'O' }, { id: 'f', text: 'F' }],
  correctAnswer: ['na', 'c', 'o', 'f'],
};

test('ordering: validation, grading, partial credit', () => {
  assert.deepEqual(errorsFor(order), []);
  assert.match(errorsFor({ ...order, correctAnswer: ['na', 'c', 'o'] }).join('\n'), /every item id exactly once/);
  assert.match(errorsFor({ ...order, correctAnswer: ['na', 'na', 'o', 'f'] }).join('\n'), /every item id exactly once/);
  const q = norm(order);
  assert.equal(q.partialCredit, true);
  assert.equal(gradeQuestion(q, ['na', 'c', 'o', 'f']).isCorrect, true);
  assert.equal(gradeQuestion(q, ['na', 'o', 'c', 'f']).pointsEarned, 2);
  assert.equal(gradeQuestion({ ...q, partialCredit: false }, ['na', 'o', 'c', 'f']).pointsEarned, 0);
  assert.equal(formatAnswer(q, ['f', 'o', 'c', 'na']), 'F → O → C → Na');
});

/* ---------------------------------------------------------------- open response */

const open = {
  id: 'q5', type: 'open', text: 'Explain', points: 4, minWords: 20, maxWords: 80,
  rubric: [{ text: 'Ions', points: 2 }, { text: 'Lattice energy', points: 2 }],
};

test('open: teacher graded, rubric validated and carried into results', () => {
  assert.ok(MANUAL_TYPES.includes('open'));
  assert.deepEqual(errorsFor(open), []);
  assert.match(errorsFor({ ...open, points: 5 }).join('\n'), /rubric points add up to 4 but the question is worth 5/);
  assert.match(errorsFor({ ...open, rubric: [{ text: '', points: 2 }, { text: 'x', points: 2 }] }).join('\n'), /needs text/);
  assert.match(errorsFor({ ...open, minWords: 50, maxWords: 10 }).join('\n'), /maxWords must be at least minWords/);
  const g = gradeTest(one(open), { q5: 'Because ions attract strongly.' });
  assert.equal(g.pendingCount, 1);
  assert.equal(g.results[0].needsGrading, true);
  assert.deepEqual(g.results[0].rubric, [{ text: 'Ions', points: 2 }, { text: 'Lattice energy', points: 2 }]);
  assert.match(g.results[0].correctAnswerText, /Rubric:\n• Ions \(2 pts\)/);
});

test('every new blank question validates', () => {
  for (const t of ['ordering', 'fillblank', 'structure', 'open']) assert.deepEqual(errorsFor(blankQuestion(t, 'q1')), [], t);
});

/* ---------------------------------------------------------------- typing help */

test('charge / exponent detection', () => {
  assert.equal(formulaHasCharge('SO4^2-'), true);
  assert.equal(formulaHasCharge('Na+'), true);
  assert.equal(formulaHasCharge('Fe³⁺'), true);
  assert.equal(formulaHasCharge('H2SO4'), false);
  assert.equal(needsScientific(6.022e23), true);
  assert.equal(needsScientific(0.0005), true);
  assert.equal(needsScientific(18.02), false);
  assert.equal(needsScientific(0), false);
});

test('formatHelpFor: auto / always / never per type', () => {
  const f = (o) => formatHelpFor(norm({ id: 'q1', type: 'formula', text: 'Write the formula.', correctAnswer: 'H2O', ...o }));
  assert.deepEqual(f({}), { charges: false, exponents: false });
  assert.deepEqual(f({ correctAnswer: 'SO4^2-' }), { charges: true, exponents: false });
  assert.deepEqual(f({ correctAnswer: ['NH4+', 'NH₄⁺'] }), { charges: true, exponents: false });
  assert.deepEqual(f({ text: 'Write the formula of the sulfide ion.', correctAnswer: 'S2-' }), { charges: true, exponents: false });
  assert.deepEqual(f({ text: 'Which ion forms?' }), { charges: true, exponents: false }, 'ion wording');
  assert.deepEqual(f({ correctAnswer: 'SO4^2-', formatHelp: 'never' }), { charges: false, exponents: false });
  assert.deepEqual(f({ formatHelp: 'always' }), { charges: true, exponents: false });

  const n = (o) => formatHelpFor(norm({ id: 'q1', type: 'numeric', text: 'How many?', correctAnswer: 12, ...o }));
  assert.deepEqual(n({}), { charges: false, exponents: false });
  assert.deepEqual(n({ correctAnswer: 1.204e24 }), { charges: false, exponents: true });
  assert.deepEqual(n({ text: 'Give your answer in scientific notation.' }), { charges: false, exponents: true });
  assert.deepEqual(n({ correctAnswer: 3e-5, formatHelp: 'never' }), { charges: false, exponents: false });

  assert.deepEqual(formatHelpFor(norm(fill)), { charges: true, exponents: true });
  assert.deepEqual(formatHelpFor(norm({ ...fill, blanks: [fill.blanks[2]], text: 'Ionic bonds involve electron {{b3}}.' })), { charges: false, exponents: false });
  assert.match(errorsFor({ id: 'q1', type: 'formula', text: 'x', correctAnswer: 'H2O', formatHelp: 'sometimes' }).join('\n'), /formatHelp must be/);
});
