import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeTest, validateTest, blankQuestion, blankTest, isManualQuestion } from '../../js/lib/schema.js';

const chemv2 = () => JSON.parse(readFileSync(new URL('../fixtures/tests/CHEMV2.json', import.meta.url), 'utf8'));
const mcq = (id, extra = {}) => ({ ...blankQuestion('mcq', id), ...extra });
const base = (extra = {}) => ({ code: 'T1', title: 'T', questions: [mcq('q1')], ...extra });
const errsOf = (t) => validateTest(t).errors;
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected /${re}/ in ${JSON.stringify(errors)}`);

test('v2 defaults: sections and references are []', () => {
  const t = normalizeTest(base());
  assert.deepEqual(t.sections, []);
  assert.deepEqual(t.references, []);
  assert.deepEqual(blankTest().sections, []);
  assert.deepEqual(blankTest().references, []);
  assert.deepEqual(normalizeTest(null).sections, []);
});

test('questions without section have no section key (empty/null/blank stripped)', () => {
  const t = normalizeTest(base({
    questions: [mcq('a'), mcq('b', { section: '' }), mcq('c', { section: null }), mcq('d', { section: '  ' })],
  }));
  for (const q of t.questions) assert.equal('section' in q, false, q.id);
});

test('section id is trimmed on questions', () => {
  const t = normalizeTest(base({ sections: [{ id: 'A', title: 'A' }], questions: [mcq('a', { section: ' A ' })] }));
  assert.equal(t.questions[0].section, 'A');
});

test('normalizeTest reorders to canonical order and does not mutate input', () => {
  const raw = base({
    sections: [{ id: 'A', title: 'A' }, { id: 'B', title: 'B' }],
    questions: [mcq('q1', { section: 'B' }), mcq('q2'), mcq('q3', { section: 'A' }), mcq('q4', { section: 'B' })],
  });
  const snapshot = JSON.stringify(raw);
  const t = normalizeTest(raw);
  assert.deepEqual(t.questions.map((q) => q.id), ['q2', 'q3', 'q1', 'q4']);
  assert.equal(JSON.stringify(raw), snapshot);
  // idempotent
  assert.deepEqual(normalizeTest(t).questions.map((q) => q.id), ['q2', 'q3', 'q1', 'q4']);
});

test('references normalize per type', () => {
  const t = normalizeTest(base({
    references: [{ id: ' r1 ', type: 'text' }, { id: 'r2', type: 'image', url: ' https://x.org/a.png ' }, { id: 'r3', type: 'periodic-table' }],
  }));
  assert.equal(t.references[0].id, 'r1');
  assert.equal(t.references[0].content, '');
  assert.equal(t.references[1].url, 'https://x.org/a.png');
  assert.equal(t.references[1].alt, '');
  assert.equal(t.references[2].title, '');
});

test('validation: unknown question section', () => {
  has(errsOf(normalizeTest(base({ questions: [mcq('q1', { section: 'nope' })] }))), /section "nope" does not exist/);
});

test('validation: duplicate section id, missing title, missing id', () => {
  const t = normalizeTest(base({ sections: [{ id: 'A', title: 'One' }, { id: 'A', title: 'Two' }] }));
  has(errsOf(t), /duplicate section id "A"/);
  has(errsOf(normalizeTest(base({ sections: [{ id: 'A', title: '  ' }] }))), /Section 1: title is required/);
  has(errsOf(normalizeTest(base({ sections: [{ id: '', title: 'x' }] }))), /Section 1: id is required/);
  has(errsOf(base({ sections: 'x' })), /sections must be a list/);
});

test('validation: references', () => {
  const v = (references) => errsOf(normalizeTest(base({ references })));
  has(v([{ id: 'r', type: 'video' }]), /type must be one of/);
  has(v([{ id: 'r', type: 'text', title: 'C', content: '   ' }]), /text references need content/);
  has(v([{ id: 'r', type: 'image', url: 'https://x.org/a.png', alt: '' }]), /need alt text/);
  // FIX-3: http:// links are upgraded to https:// and raster data: URLs (uploaded pictures) are accepted.
  assert.ok(!v([{ id: 'r', type: 'image', url: 'http://x.org/a.png', alt: 'a' }]).some((e) => /image url/.test(e)));
  has(v([{ id: 'r', type: 'image', url: 'javascript:alert(1)', alt: 'a' }]), /image url must start with https/);
  assert.ok(!v([{ id: 'r', type: 'image', url: 'data:image/png;base64,AA', alt: 'a' }]).some((e) => /image url/.test(e)));
  has(v([{ id: 'r', type: 'image', url: 'data:image/svg+xml;base64,AA', alt: 'a' }]), /image url/);
  has(v([{ id: 'a', type: 'periodic-table' }, { id: 'b', type: 'periodic-table' }]), /periodic table reference only once/);
  has(v([{ id: 'a', type: 'text', content: 'x' }, { id: 'a', type: 'text', content: 'y' }]), /duplicate reference id/);
  has(errsOf(base({ references: 'x' })), /references must be a list/);
  assert.deepEqual(v([
    { id: 'a', type: 'periodic-table' }, { id: 'b', type: 'text', content: 'x' },
    { id: 'c', type: 'image', url: 'img/c.png', alt: 'chart' }, { id: 'd', type: 'image', url: 'https://x.org/c.png', alt: 'chart' },
  ]), []);
});

test('orbital blankQuestion is valid and defaults', () => {
  const q = blankQuestion('orbital');
  assert.equal(q.maxSublevel, '2p');
  assert.deepEqual(q.orbitalTypes, ['s', 'p']);
  assert.deepEqual(validateTest(normalizeTest({ code: 'T1', title: 'T', questions: [q] })), { valid: true, errors: [] });
});

test('orbital validation surfaces through validateTest', () => {
  const q = { ...blankQuestion('orbital'), maxSublevel: 'zz' };
  has(errsOf(normalizeTest({ code: 'T1', title: 'T', questions: [q] })), /maxSublevel/);
});

test('structure blankQuestion has studentCharges false and is valid', () => {
  const q = blankQuestion('structure');
  assert.equal(q.studentCharges, false);
  assert.deepEqual(validateTest(normalizeTest({ code: 'T1', title: 'T', questions: [q] })), { valid: true, errors: [] });
});

test('isManualQuestion', () => {
  assert.equal(isManualQuestion({ type: 'short' }), true);
  assert.equal(isManualQuestion({ type: 'open' }), true);
  assert.equal(isManualQuestion({ type: 'orbital' }), true);
  assert.equal(isManualQuestion({ type: 'structure' }), false);
  assert.equal(isManualQuestion({ type: 'structure', studentCharges: false }), false);
  assert.equal(isManualQuestion({ type: 'structure', studentCharges: true }), true);
  assert.equal(isManualQuestion({ type: 'mcq', studentCharges: true }), false);
  assert.equal(isManualQuestion({ type: 'mcq' }), false);
  assert.equal(isManualQuestion(null), false);
  assert.equal(isManualQuestion(undefined), false);
});

test('CHEMV2 fixture is valid and canonical', () => {
  const t = normalizeTest(chemv2());
  assert.deepEqual(validateTest(t), { valid: true, errors: [] });
  assert.equal(t.code, 'CHEMV2');
  assert.equal(t.sections.length, 2);
  assert.equal(t.references.length, 2);
  assert.equal(t.questions[0].id, 'warm');
  assert.equal('section' in t.questions[0], false);
  assert.deepEqual(t.questions.map((q) => q.section || null), [null, 'secA', 'secA', 'secA', 'secB', 'secB']);
});

/* ---------------------------------------------------------------- grading contract (gradeTest) */
import { gradeTest } from '../../js/lib/grading.js';

const gradeable = () => normalizeTest(chemv2());
const row = (res, id) => res.results.find((r) => r.questionId === id);

test('gradeTest: orbital answered -> needsGrading, manual, 0 points', () => {
  const t = gradeable();
  const res = gradeTest(t, { orbN: { '1s': ['ud'], '2s': ['ud'], '2p': ['u', 'u', 'u'] } });
  const r = row(res, 'orbN');
  assert.equal(r.needsGrading, true);
  assert.equal(r.manual, true);
  assert.equal(r.pointsEarned, 0);
  assert.equal(r.answered, true);
  assert.equal(r.isCorrect, false);
});

test('gradeTest: orbital unanswered -> 0, not pending, still manual', () => {
  const t = gradeable();
  for (const ans of [{}, { orbN: null }, { orbN: { '1s': [''] } }]) {
    const r = row(gradeTest(t, ans), 'orbN');
    assert.equal(r.answered, false);
    assert.equal(r.needsGrading, false);
    assert.equal(r.pointsEarned, 0);
    assert.equal(r.manual, true);
  }
});

test('gradeTest: studentCharges structure is manual; plain structure auto graded', () => {
  const t = gradeable();
  const full = { bonds: [2, 1, 1], lonePairs: { n: 0, o1: 2, o2: 3, o3: 3 }, bracket: true, charge: -1, formalCharges: { n: 1, o2: -1, o3: -1 } };
  const res = gradeTest(t, { no3: full, co2: { bonds: [2, 2], lonePairs: { o1: 2, c: 0, o2: 2 } } });
  const a = row(res, 'no3');
  assert.equal(a.manual, true);
  assert.equal(a.needsGrading, true);
  assert.equal(a.pointsEarned, 0);
  const b = row(res, 'co2');
  assert.equal(b.manual, false);
  assert.equal(b.needsGrading, false);
  assert.equal(b.isCorrect, true);
  assert.equal(b.pointsEarned, 2);
  // bracket-only counts as answered
  assert.equal(row(gradeTest(t, { no3: { bonds: [0, 0, 0], lonePairs: {}, bracket: true } }), 'no3').needsGrading, true);
  const none = row(gradeTest(t, {}), 'no3');
  assert.equal(none.needsGrading, false);
  assert.equal(none.pointsEarned, 0);
});

test('gradeTest: mcq manual false; sectionId only for sectioned questions', () => {
  const t = gradeable();
  const res = gradeTest(t, { warm: 'b' });
  const w = row(res, 'warm');
  assert.equal(w.manual, false);
  assert.equal(w.isCorrect, true);
  assert.equal('sectionId' in w, false);
  assert.equal(row(res, 'orbN').sectionId, 'secA');
  assert.equal(row(res, 'co2').sectionId, 'secB');
  assert.equal(row(res, 'config').manual, true);
});

test('gradeTest: pendingCount and pendingPoints', () => {
  const t = gradeable();
  const none = gradeTest(t, {});
  assert.equal(none.pendingCount, 0);
  assert.equal(none.pendingPoints, 0);
  const res = gradeTest(t, {
    warm: 'b',
    orbN: { '1s': ['ud'] },
    orbFe: { '1s': ['u'] },
    config: '1s2',
    no3: { bonds: [1, 1, 1], lonePairs: {} },
    co2: { bonds: [2, 2], lonePairs: { o1: 2, c: 0, o2: 2 } },
  });
  assert.equal(res.pendingCount, 4);
  assert.equal(res.pendingPoints, 3 + 4 + 1 + 4);
  assert.equal(res.scoreAchieved, 3); // warm 1 + co2 2
});
