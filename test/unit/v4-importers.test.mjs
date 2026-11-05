import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlainText, parseCsv, parseQuestionCsv, parseFormsCsv, parseRoster } from '../../js/lib/importers.js';
import { normalizeTest, validateTest } from '../../js/lib/schema.js';

const valid = (t) => validateTest(normalizeTest({ ...t, code: 'IMP1' })).errors;

test('plain text: mcq with *, multi, numeric with unit, true/false, short', () => {
  const { test: t, warnings } = parsePlainText(`1. Which particle is negative?\na) proton\n*b) electron\nc) neutron\n2. Pick the gases\n*a) O2\nb) Fe\n*c) N2\n3. Moles in 18.0 g water?\nAnswer: 1.00 mol\n4. Water is a compound.\nAnswer: true\n5. Explain bonding.`);
  assert.deepEqual(t.questions.map((q) => q.type), ['mcq', 'multi', 'numeric', 'truefalse', 'short']);
  assert.equal(t.questions[0].correctAnswer, 'b');
  assert.deepEqual(t.questions[1].correctAnswer, ['a', 'c']);
  assert.equal(t.questions[2].unit, 'mol');
  assert.equal(warnings.length, 1); // short answer without a sample
  assert.deepEqual(valid(t), []);
});

test('CSV parser handles quotes, commas and newlines', () => {
  assert.deepEqual(parseCsv('a,"b, c","d ""e"""\n"x\ny",2'), [['a', 'b, c', 'd "e"'], ['x\ny', '2']]);
});

test('question CSV and Google Forms CSV become valid tests', () => {
  const q = parseQuestionCsv('Question,Type,Option A,Option B,Answer,Points\nPick B,mcq,A,B,b,2\nTrue?,truefalse,,,true,1\nHow many?,numeric,,,4,1');
  assert.deepEqual(q.test.questions.map((x) => x.type), ['mcq', 'truefalse', 'numeric']);
  assert.equal(q.test.questions[0].points, 2);
  assert.deepEqual(valid(q.test), []);
  const f = parseFormsCsv('Question,Choices,Correct\nNoble gas?,Neon|Sodium|Iron,Neon');
  assert.equal(f.test.questions[0].correctAnswer, 'a');
  assert.deepEqual(valid(f.test), []);
});

test('roster: emails from any CSV, lower-cased and de-duplicated', () => {
  assert.deepEqual(parseRoster('Name,Email\nAda,ADA@x.org\nBo,bo@x.org\nAda again,ada@x.org').emails, ['ada@x.org', 'bo@x.org']);
  assert.equal(parseRoster('nothing here').emails.length, 0);
});
