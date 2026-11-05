// V4-03 S10 question types: molarmass, imagechoice, particles, titration, estimate.
globalThis.window = { CHEMISTRYWORKS_CONFIG: { FEATURES: { v4Types: true } } };
import test from 'node:test';
import assert from 'node:assert/strict';
const { normalizeTest, validateTest, blankQuestion, QUESTION_TYPES } = await import('../../js/lib/schema.js');
const { gradeQuestion, formatAnswer, correctAnswerText, isAnswered } = await import('../../js/lib/grading.js');
const { titrationPH, equivalenceVolume, maxTitrantVolume, curvePoints, keyValues } = await import('../../js/lib/qtypes/titration.js');
const { countParticles, keyParticles, gridPositions } = await import('../../js/lib/qtypes/particles.js');
const { parseMolarMass, molarMassKey } = await import('../../js/lib/qtypes/molarmass.js');

const norm = (q) => normalizeTest({ code: 'TST', title: 'T', questions: [{ id: 'q1', points: 2, text: 'T', ...q }] }).questions[0];
const errs = (q) => validateTest(normalizeTest({ code: 'TST', title: 'T', questions: [{ id: 'q1', points: 2, text: 'T', ...q }] })).errors;
const grade = (q, a) => gradeQuestion(norm(q), a);
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('the five types are registered and offered by the builder', () => {
  for (const t of ['molarmass', 'imagechoice', 'particles', 'titration', 'estimate']) {
    assert.ok(QUESTION_TYPES.includes(t), t);
    assert.deepEqual(errs(blankQuestion(t, 'q1')), [], `${t} blank is valid`);
  }
});

// ---------------- molarmass
const mm = { type: 'molarmass', formula: 'Ca(OH)2' };
test('molarmass: key from the formula, units and tolerance', () => {
  near(molarMassKey(mm), 74.1);
  assert.equal(parseMolarMass('74.10 g/mol'), 74.1);
  assert.equal(parseMolarMass('74.1 g'), 74.1);
  assert.equal(parseMolarMass('74,1'.replace(',', '.')), 74.1);
  assert.ok(Number.isNaN(parseMolarMass('abc')));
  assert.equal(grade(mm, { value: '74.10' }).isCorrect, true);
  assert.equal(grade(mm, { value: '74.1 g/mol' }).isCorrect, true);
  assert.equal(grade(mm, { value: '74.14' }).isCorrect, true);
  assert.equal(grade(mm, { value: '74.3' }).isCorrect, false);
  assert.equal(grade({ ...mm, tolerance: 1 }, { value: '74.9' }).isCorrect, true);
  assert.equal(grade({ ...mm, tolerance: 1, toleranceType: 'percent' }, { value: '74.7' }).isCorrect, true);
  assert.equal(grade(mm, { value: '' }).answered, false);
  assert.equal(grade(mm, { value: '74.1', work: [{ symbol: 'Ca', count: '1', mass: '40.08' }] }).isCorrect, true, 'work is not graded');
  assert.equal(grade({ ...mm, answer: 75 }, { value: '75' }).isCorrect, true, 'own answer wins');
});
test('molarmass: text, work and validation', () => {
  const a = { value: '74.10', work: [{ symbol: 'Ca', count: '1', mass: '40.08' }, { symbol: 'O', count: '2', mass: '16.00' }] };
  assert.match(formatAnswer(norm(mm), a), /^74\.10 g\/mol \(work: Ca 1 × 40\.08; O 2 × 16\.00\)$/);
  assert.equal(correctAnswerText(norm(mm)), '74.10 g/mol');
  assert.equal(isAnswered(norm(mm), { value: '', work: [{ symbol: 'Ca', count: '', mass: '' }] }), true);
  assert.ok(errs({ type: 'molarmass', formula: '' }).some((e) => /formula is required/.test(e)));
  assert.ok(errs({ type: 'molarmass', formula: 'Xx2' }).some((e) => /could not be read/.test(e)));
  assert.ok(errs({ ...mm, answer: -3 }).some((e) => /positive number/.test(e)));
  assert.ok(errs({ ...mm, tolerance: -1 }).some((e) => /tolerance/.test(e)));
  assert.deepEqual(errs(mm), []);
});

// ---------------- imagechoice
const img = (id, alt = 'a picture') => ({ id, image: { url: `https://example.test/${id}.png`, alt } });
const ic = { type: 'imagechoice', options: [img('a'), img('b'), img('c')], correctAnswer: 'b' };
test('imagechoice: single and multiple grading', () => {
  assert.equal(grade(ic, 'b').isCorrect, true);
  assert.equal(grade(ic, 'a').isCorrect, false);
  assert.equal(grade(ic, undefined).answered, false);
  const multi = { ...ic, multiple: true, correctAnswer: ['a', 'c'] };
  assert.equal(grade(multi, ['c', 'a']).isCorrect, true);
  assert.equal(grade(multi, ['a']).pointsEarned, 0);
  assert.equal(grade({ ...multi, partialCredit: true }, ['a']).pointsEarned, 1);
  assert.equal(grade({ ...multi, partialCredit: true }, ['a', 'b']).pointsEarned, 0);
  assert.equal(grade(multi, []).answered, false);
});
test('imagechoice: text and validation (alt text is required)', () => {
  assert.equal(formatAnswer(norm(ic), 'b'), 'a picture');
  assert.equal(correctAnswerText(norm(ic)), 'a picture');
  assert.deepEqual(errs(ic), []);
  assert.ok(errs({ ...ic, options: [img('a'), img('b', '')] }).some((e) => /alt text/.test(e)));
  assert.ok(errs({ ...ic, options: [img('a'), { id: 'b', image: { url: 'javascript:alert(1)', alt: 'x' } }] }).some((e) => /image url/.test(e)));
  assert.ok(errs({ ...ic, options: [img('a')] , correctAnswer: 'a' }).some((e) => /at least two/.test(e)));
  assert.ok(errs({ ...ic, correctAnswer: 'zz' }).some((e) => /correctAnswer/.test(e)));
  assert.ok(errs({ ...ic, options: [img('a'), img('a')] }).some((e) => /duplicate/.test(e)));
  assert.ok(errs({ ...ic, multiple: true, correctAnswer: [] }).some((e) => /non-empty/.test(e)));
});

// ---------------- particles
const pq = { type: 'particles', species: [{ id: 'h2', label: 'H2', shape: 'circle', tone: 1 }, { id: 'o2', label: 'O2', shape: 'square', tone: 2 }],
  zones: [{ id: 'liquid', label: 'Liquid' }, { id: 'gas', label: 'Gas' }], targets: { liquid: { h2: 3 }, gas: { o2: 1 } } };
const put = (z, s, n) => Array.from({ length: n }, (_, i) => ({ s, z, x: 0.2 + i * 0.1, y: 0.5 }));
test('particles: counts per zone and species', () => {
  const right = [...put('liquid', 'h2', 3), ...put('gas', 'o2', 1)];
  assert.deepEqual(countParticles(right), { liquid: { h2: 3 }, gas: { o2: 1 } });
  assert.equal(grade(pq, right).isCorrect, true);
  assert.equal(grade(pq, [...put('liquid', 'h2', 3)]).pointsEarned, 1, 'partial: one of two cells');
  assert.equal(grade({ ...pq, partialCredit: false }, [...put('liquid', 'h2', 3)]).pointsEarned, 0);
  assert.equal(grade(pq, [...put('liquid', 'h2', 2), ...put('gas', 'o2', 1)]).pointsEarned, 1);
  assert.equal(grade(pq, [...right, ...put('gas', 'h2', 1)]).isCorrect, false, 'an extra species in a zone is wrong');
  assert.equal(grade(pq, [...put('gas', 'h2', 3)]).pointsEarned, 0);
  assert.equal(grade(pq, []).answered, false);
  assert.equal(grade(pq, [{ nope: 1 }]).answered, false);
});
test('particles: text, key layout, validation', () => {
  assert.equal(correctAnswerText(norm(pq)), 'Liquid: 3 H2; Gas: 1 O2');
  assert.equal(formatAnswer(norm(pq), put('liquid', 'h2', 2)), 'Liquid: 2 H2; Gas: empty');
  const key = keyParticles(norm(pq));
  assert.equal(key.length, 4);
  for (const p of key) assert.ok(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1);
  assert.equal(new Set(gridPositions(12).map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size, 12);
  assert.deepEqual(errs(pq), []);
  assert.ok(errs({ ...pq, species: [] }).some((e) => /at least one species/.test(e)));
  assert.ok(errs({ ...pq, targets: { nope: { h2: 1 } } }).some((e) => /unknown zone/.test(e)));
  assert.ok(errs({ ...pq, targets: { liquid: { zz: 1 } } }).some((e) => /unknown species/.test(e)));
  assert.ok(errs({ ...pq, targets: { liquid: { h2: 99 } } }).some((e) => /whole number from 0 to/.test(e)));
  assert.ok(errs({ ...pq, targets: {} }).some((e) => /at least one particle/.test(e)));
  assert.ok(errs({ ...pq, species: [pq.species[0], { ...pq.species[0] }] }).some((e) => /duplicate species/.test(e)));
  assert.ok(errs({ ...pq, species: [{ id: 'h2', label: '', shape: 'circle', tone: 1 }] }).some((e) => /label/.test(e)));
  const one = { ...pq, zones: undefined, targets: { box: { h2: 2 } } };
  assert.equal(grade(one, put('box', 'h2', 2)).isCorrect, true, 'default single zone "box"');
});

// ---------------- titration
const sa = { analyte: { type: 'acid', kind: 'strong', conc: 0.1, volumeMl: 25 }, titrant: { conc: 0.1 } };
const wa = { analyte: { type: 'acid', kind: 'weak', conc: 0.1, volumeMl: 25, K: 1.8e-5 }, titrant: { conc: 0.1 } };
test('titration: the simulated curves match textbook values', () => {
  near(titrationPH(sa, 0), 1, 0.005);
  near(titrationPH(sa, 12.5), 1.477, 0.005);
  near(titrationPH(sa, 25), 7, 0.01);
  near(titrationPH(sa, 26), 11.29, 0.02);
  near(titrationPH(wa, 0), 2.875, 0.005);
  near(titrationPH(wa, 12.5), 4.745, 0.005);
  near(titrationPH(wa, 25), 8.72, 0.01);
  const sb = { analyte: { type: 'base', kind: 'strong', conc: 0.1, volumeMl: 25 }, titrant: { conc: 0.1 } };
  near(titrationPH(sb, 0), 13, 0.01); near(titrationPH(sb, 25), 7, 0.01); near(titrationPH(sb, 50), 1.48, 0.02);
  const wb = { analyte: { type: 'base', kind: 'weak', conc: 0.1, volumeMl: 25, K: 1.8e-5 }, titrant: { conc: 0.1 } };
  near(titrationPH(wb, 0), 11.125, 0.01); near(titrationPH(wb, 25), 5.28, 0.01);
  near(equivalenceVolume({ ...sa, titrant: { conc: 0.2 } }), 12.5);
  assert.equal(maxTitrantVolume(sa), 50);
  assert.equal(maxTitrantVolume({ ...sa, maxVolume: 40 }), 40);
  const pts = curvePoints(sa, 10);
  assert.equal(pts.length, 11);
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].ph >= pts[i - 1].ph - 1e-9, 'strong-acid curve rises');
  near(keyValues(wa).ph, 8.72, 0.01);
  near(keyValues({ ...wa, atVolume: 12.5 }).ph, 4.745, 0.005);
});
const tq = { type: 'titration', ...wa, ask: 'both', volumeTolerance: 0.5, phTolerance: 0.3 };
test('titration: grading each asked value', () => {
  assert.equal(grade(tq, { volume: '25.0', ph: '8.72' }).isCorrect, true);
  assert.equal(grade(tq, { volume: '25.3 mL', ph: '8.9' }).isCorrect, true);
  assert.equal(grade(tq, { volume: '25', ph: '7.0' }).pointsEarned, 1, 'half credit');
  assert.equal(grade({ ...tq, partialCredit: false }, { volume: '25', ph: '7.0' }).pointsEarned, 0);
  assert.equal(grade({ ...tq, ask: 'volume' }, { volume: '25' }).isCorrect, true);
  assert.equal(grade({ ...tq, ask: 'ph' }, { ph: '8.7' }).isCorrect, true);
  assert.equal(grade({ ...tq, ask: 'ph' }, { volume: '25' }).answered, false);
  assert.equal(grade(tq, {}).answered, false);
  assert.match(formatAnswer(norm(tq), { volume: '25.0', ph: '8.7' }), /volume 25\.0 mL; pH 8\.7/);
  assert.match(correctAnswerText(norm(tq)), /volume 25\.00 mL.*pH 8\.72/);
});
test('titration: validation', () => {
  assert.deepEqual(errs(tq), []);
  assert.ok(errs({ ...tq, analyte: { ...wa.analyte, K: undefined } }).some((e) => /needs analyte\.K/.test(e)));
  assert.ok(errs({ ...tq, titrant: { conc: 0 } }).some((e) => /titrant\.conc/.test(e)));
  assert.ok(errs({ ...tq, analyte: { ...wa.analyte, conc: -1 } }).some((e) => /analyte\.conc/.test(e)));
  assert.ok(errs({ ...tq, maxVolume: 10 }).some((e) => /larger than the equivalence/.test(e)));
  assert.ok(errs({ ...tq, atVolume: 500 }).some((e) => /atVolume/.test(e)));
  assert.ok(errs({ ...tq, phTolerance: -1 }).some((e) => /phTolerance/.test(e)));
});

// ---------------- estimate
const eq = { type: 'estimate', min: 0, max: 14, step: 0.5, answer: 2, tolerance: 0.5 };
test('estimate: tolerance, percent, text, validation', () => {
  assert.equal(grade(eq, 2.5).isCorrect, true);
  assert.equal(grade(eq, '1.5').isCorrect, true);
  assert.equal(grade(eq, 3).isCorrect, false);
  assert.equal(grade({ ...eq, answer: 100, min: 0, max: 200, tolerance: 10, toleranceType: 'percent' }, 109).isCorrect, true);
  assert.equal(grade(eq, undefined).answered, false);
  assert.equal(grade(eq, 'x').answered, false);
  assert.equal(formatAnswer(norm({ ...eq, unit: 'pH' }), 2.5), '2.5 pH');
  assert.match(correctAnswerText(norm(eq)), /^2\.0 \(± 0\.5\)$/);
  assert.deepEqual(errs(eq), []);
  assert.ok(errs({ ...eq, min: 5, max: 5 }).some((e) => /min must be below max/.test(e)));
  assert.ok(errs({ ...eq, answer: 20 }).some((e) => /between min and max/.test(e)));
  assert.ok(errs({ ...eq, step: 0 }).some((e) => /step/.test(e)));
  assert.ok(errs({ ...eq, tolerance: -1 }).some((e) => /tolerance/.test(e)));
});
