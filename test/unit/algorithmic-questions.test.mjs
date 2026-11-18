// V4-09 algorithmic questions (S10): the safe formula parser, variables, instantiate step, validation.
globalThis.window = { CHEMISTRYWORKS_CONFIG: { FEATURES: { v4Types: true } } };
import test from 'node:test';
import assert from 'node:assert/strict';
const A = await import('../../js/lib/algorithmic.js');
const { instantiateTest } = await import('../../js/lib/instantiate.js');
const { gradeQuestion } = await import('../../js/lib/grading.js');
const { countSigFigs } = await import('../../js/lib/qtypes/sigfigs.js');
const { normalizeTest, validateTest } = await import('../../js/lib/schema.js');
const { evalFormula, parseExpression, drawVariables, substitute, applyAlgorithmic, validateVariables, sampleDraw, seededRand, astVariables } = A;

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('parser: precedence, associativity, unary minus, symbols', () => {
  assert.equal(evalFormula('2 + 3 * 4'), 14);
  assert.equal(evalFormula('= (2 + 3) * 4'), 20);
  assert.equal(evalFormula('2 ^ 3 ^ 2'), 512);
  assert.equal(evalFormula('-2 ^ 2'), -4);
  assert.equal(evalFormula('2 ^ -1'), 0.5);
  assert.equal(evalFormula('6 ÷ 3 × 2 − 1'), 3);
  assert.equal(evalFormula('2 ** 3'), 8);
  near(evalFormula('6.02e23 / 2e23'), 3.01);
  assert.equal(evalFormula('x * y', { x: 3, y: 4 }), 12);
  near(evalFormula('pi'), Math.PI);
  near(evalFormula('m / molarMass(c)', { m: 58.44, c: 'NaCl' }), 1, 1e-3);
  near(evalFormula('molarMass("H2O") + round(1.234, 1)'), 18.02 + 1.2, 1e-3);
  assert.equal(evalFormula('max(1, 5, 3) - min(4, 2)'), 3);
});

test('parser: errors are readable and nothing else is reachable', () => {
  const bad = ['', '2 +', '(1', '1)', '2 3', 'foo(1)', 'x', '1 / 0', 'molarMass(1)', '"a" + 1', 'process.exit()', 'constructor', '__proto__', 'toString()', 'this', 'a.b', '1; 2', '`x`', '[1]', 'x = 1', 'sqrt(-1)', 'log(0)'];
  for (const f of bad) assert.throws(() => evalFormula(f, {}), Error, f);
  assert.throws(() => evalFormula('x', { }), /unknown variable/);
  assert.throws(() => parseExpression('x'.repeat(500)), /longer/);
  assert.throws(() => parseExpression(`${'('.repeat(100)}1${')'.repeat(100)}`), /deeply/);
  // inherited names are never variables
  assert.throws(() => evalFormula('constructor', { x: 1 }), /unknown variable/);
  assert.deepEqual([...astVariables(parseExpression('m / molarMass(c) + pi'))].sort(), ['c', 'm']);
});

test('the module never uses eval or Function', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['js/lib/algorithmic.js', 'js/lib/chemfuncs.js']) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/\beval\s*\(/.test(src) && !/new\s+Function\b/.test(src) && !/\bFunction\s*\(/.test(src), f);
  }
});

test('drawVariables: ranges, steps, sig figs, picks, derived values', () => {
  const vars = { m: { min: 1, max: 10, step: 0.5, sigFigs: 3 }, c: { pick: ['NaCl', 'KCl'] }, n: { formula: 'm / molarMass(c)', sigFigs: 2 } };
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const { values, texts } = drawVariables(vars, seededRand(`s${i}`));
    assert.ok(values.m >= 1 && values.m <= 10 && Math.abs(values.m * 2 - Math.round(values.m * 2)) < 1e-9, String(values.m));
    assert.equal(countSigFigs(texts.m), 3, texts.m); // trailing zeros are kept: "5.50", "10.0"
    assert.ok(['NaCl', 'KCl'].includes(values.c));
    assert.equal(values.n, Number(values.n.toPrecision(2)));
    seen.add(values.c);
  }
  assert.equal(seen.size, 2);
  const free = drawVariables({ x: { min: 0, max: 1 } }, seededRand('f'));
  assert.equal(free.values.x, Number(free.values.x.toPrecision(3)));
  assert.throws(() => drawVariables({ x: { nope: 1 } }, seededRand('x')));
  assert.throws(() => drawVariables({ x: { pick: [] } }, seededRand('x')));
});

test('substitute: only known names, LaTeX braces untouched', () => {
  assert.equal(substitute('{m} g of $\\ce{{c}}$ and \\frac{1}{2} {zzz}', { m: '5.0', c: 'NaCl' }), '5.0 g of $\\ce{NaCl}$ and \\frac{1}{2} {zzz}');
});

const numericQ = () => ({ id: 'n', type: 'numeric', text: 'Moles in {m} g of {c}?', points: 2, correctAnswer: 1, tolerance: 1, toleranceType: 'percent', unit: 'mol',
  options: undefined, variables: { m: { min: 10, max: 100, step: 5 }, c: { pick: ['NaCl', 'KCl'] } }, answerFormula: '= m / molarMass(c)' });

test('applyAlgorithmic: numeric sets correctAnswer, text and drawn; not drawn twice', () => {
  const q = numericQ();
  assert.equal(applyAlgorithmic(q, seededRand('a')), true);
  assert.match(q.text, /^Moles in \d+ g of (NaCl|KCl)\?$/);
  near(q.correctAnswer, Number((q.drawn.m / (q.drawn.c === 'NaCl' ? 58.44 : 74.55)).toPrecision(12)), 1e-6);
  const before = JSON.stringify(q);
  assert.equal(applyAlgorithmic(q, seededRand('b')), false);
  assert.equal(JSON.stringify(q), before);
});

test('sigfigs rounds the key to sigFigs; dimensional uses givenVariable', () => {
  const s = { id: 's', type: 'sigfigs', text: '{T} K', answer: 1, sigFigs: 3, tolerance: 0, variables: { T: { min: 250, max: 350, step: 10 } }, answerFormula: 'idealGasN(1, 2, T)' };
  applyAlgorithmic(s, seededRand('s'));
  assert.equal(s.answer, Number(s.answer.toPrecision(3)));
  const d = { id: 'd', type: 'dimensional', text: '{m} g', given: { value: 117, unit: 'g' }, answer: { value: 2, unit: 'mol' }, tolerance: 1, toleranceType: 'percent',
    variables: { m: { min: 50, max: 250, step: 10 } }, givenVariable: 'm', answerFormula: '= m / molarMass("NaCl")' };
  applyAlgorithmic(d, seededRand('d'));
  assert.equal(d.given.value, d.drawn.m);
  near(d.answer.value, d.drawn.m / 58.44, 1e-6);
  assert.equal(d.answer.unit, 'mol');
});

test('multipart: shared variables, per-part formulas and extra part variables', () => {
  const q = { id: 'mp', type: 'multipart', text: 'x', stem: 'A sample of {m} g of NaCl.', points: 3,
    variables: { m: { min: 10, max: 50, step: 10 } },
    parts: [
      { id: 'a', type: 'numeric', text: 'Moles in {m} g?', points: 1, correctAnswer: 1, answerFormula: 'm / molarMass("NaCl")' },
      { id: 'b', type: 'numeric', text: 'Particles in {extra} mol?', points: 2, correctAnswer: 1, variables: { extra: { pick: [2, 4] } }, answerFormula: 'extra * NA' },
    ] };
  applyAlgorithmic(q, seededRand('mp'));
  assert.match(q.stem, /A sample of \d+ g of NaCl\./);
  near(q.parts[0].correctAnswer, q.drawn.m / 58.44, 1e-6);
  assert.match(q.parts[1].text, /Particles in [24] mol\?/);
  near(q.parts[1].correctAnswer / 6.022e23, q.drawn.extra, 1e-9);
  assert.equal(q.parts[0].text, `Moles in ${q.drawn.m} g?`);
});

const testWith = (qs) => ({ code: 'ALG', title: 'Alg', questions: qs });

test('instantiate: same email -> same numbers, other email -> usually different; original untouched', () => {
  const t = testWith([numericQ()]);
  const a = instantiateTest(t, { email: 'ada@example.org' });
  const b = instantiateTest(t, { email: 'ADA@example.org ' });
  assert.deepEqual(a.questions[0].drawn, b.questions[0].drawn);
  assert.equal(a.questions[0].text, b.questions[0].text);
  assert.equal(a.questions[0].correctAnswer, b.questions[0].correctAnswer);
  assert.equal(t.questions[0].drawn, undefined);
  assert.match(t.questions[0].text, /\{m\}/);
  const texts = new Set();
  for (let i = 0; i < 20; i++) texts.add(instantiateTest(t, { email: `s${i}@example.org` }).questions[0].text);
  assert.ok(texts.size > 5);
});

test('instantiate: a drawn question is not redrawn (regrade safety) and grading uses the stored key', () => {
  const inst = instantiateTest(testWith([numericQ()]), { email: 'ada@example.org' });
  const again = instantiateTest(inst, { email: 'someone-else@example.org' });
  assert.deepEqual(again.questions[0].drawn, inst.questions[0].drawn);
  assert.equal(again.questions[0].correctAnswer, inst.questions[0].correctAnswer);
  const q = normalizeTest(inst).questions[0];
  assert.equal(gradeQuestion(q, String(inst.questions[0].correctAnswer)).isCorrect, true);
  assert.equal(gradeQuestion(q, '999').isCorrect, false);
});

test('instantiate: a bad definition leaves the question as written', () => {
  const q = { ...numericQ(), answerFormula: '= nope(1)' };
  const out = instantiateTest(testWith([q]), { email: 'a@b.co' });
  assert.equal(out.questions[0].drawn, undefined);
  assert.equal(out.questions[0].text, q.text);
});

const errs = (q) => { const e = []; validateVariables(q, 'Q1', e); return e; };

test('validateVariables: good questions and every error path', () => {
  assert.deepEqual(errs(numericQ()), []);
  assert.deepEqual(errs({ id: 'x', type: 'numeric' }), []);
  assert.ok(errs({ ...numericQ(), type: 'mcq' }).some((e) => /numeric, sigfigs/.test(e)));
  assert.ok(errs({ ...numericQ(), variables: { 'bad name': { min: 1, max: 2 } } }).some((e) => /needs a name/.test(e)));
  assert.ok(errs({ ...numericQ(), variables: { pi: { min: 1, max: 2 } } }).some((e) => /reserved/.test(e)));
  assert.ok(errs({ ...numericQ(), variables: { m: { min: 5, max: 1 } } }).some((e) => /min must not be above max/.test(e)));
  assert.ok(errs({ ...numericQ(), variables: { m: { min: 1, max: 5, step: 0 } } }).some((e) => /step/.test(e)));
  assert.ok(errs({ ...numericQ(), variables: { m: { min: 1, max: 5, sigFigs: 0 } } }).some((e) => /sigFigs/.test(e)));
  assert.ok(errs({ ...numericQ(), variables: { m: { pick: [] } } }).some((e) => /pick/.test(e)));
  assert.ok(errs({ ...numericQ(), answerFormula: '= m /' }).some((e) => /answerFormula/.test(e)));
  assert.ok(errs({ ...numericQ(), answerFormula: '= q * 2' }).some((e) => /"q"/.test(e)));
  assert.ok(errs({ ...numericQ(), answerFormula: '= molarMass(m)' }).some((e) => /answerFormula/.test(e)));
  assert.ok(errs({ ...numericQ(), answerFormula: undefined }).some((e) => /need an answerFormula/.test(e)));
  assert.ok(errs({ ...numericQ(), variables: { a: { formula: 'b + 1' } } }).some((e) => /not another variable/.test(e)));
  assert.ok(errs({ id: 'd', type: 'dimensional', variables: { m: { min: 1, max: 2 } }, givenVariable: 'zz', answerFormula: 'm' }).some((e) => /givenVariable/.test(e)));
  assert.ok(errs({ id: 'p', type: 'multipart', variables: { m: { min: 1, max: 2 } }, answerFormula: 'm', parts: [] }).some((e) => /parts of a multipart/.test(e)));
  assert.ok(errs({ id: 'p', type: 'multipart', variables: { m: { min: 1, max: 2 } }, parts: [{ id: 'a', type: 'numeric', answerFormula: 'zz + 1' }] }).some((e) => /part \(a\).*"zz"/.test(e)));
  assert.ok(errs({ id: 'p', type: 'multipart', variables: { m: { min: 1, max: 2 } }, parts: [{ id: 'a', type: 'mcq', answerFormula: 'm' }] }).some((e) => /numeric, sigfigs and dimensional parts/.test(e)));
});

test('sampleDraw never throws and shows the answer', () => {
  const r = sampleDraw(numericQ(), 'one');
  assert.equal(r.ok, true);
  assert.ok(r.values.some(([k]) => k === 'm'));
  assert.equal(typeof r.answers[0].value, 'number');
  assert.equal(sampleDraw({ id: 'x', type: 'numeric' }).ok, false);
  assert.equal(sampleDraw({ ...numericQ(), answerFormula: '= nope(' }).ok, false);
});

test('demo test DEMOV4C: algorithmic questions draw per student and still validate', async () => {
  const { readFileSync } = await import('node:fs');
  const demo = JSON.parse(readFileSync(new URL('../../data/tests/DEMOV4C.json', import.meta.url), 'utf8'));
  const norm = normalizeTest(demo);
  assert.deepEqual(validateTest(norm).errors, []);
  for (const q of norm.questions) assert.deepEqual(errs(q), [], q.id);
  const a = instantiateTest(norm, { email: 'ada@example.org' });
  const b = instantiateTest(norm, { email: 'ada@example.org' });
  assert.deepEqual(a.questions.map((q) => q.drawn), b.questions.map((q) => q.drawn));
  assert.ok(a.questions.filter((q) => q.drawn).length === 3);
});
