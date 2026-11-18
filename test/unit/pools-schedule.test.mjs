// S11 pools + S12 schedule / accommodations helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instantiateTest } from '../../js/lib/instantiate.js';
import { drawPools } from '../../js/lib/pools.js';
import { windowState, latePenaltyPercent, applyAccommodations } from '../../js/lib/schedule.js';
import { validateTest, normalizeTest } from '../../js/lib/schema.js';

const mcq = (id, section) => ({ id, type: 'mcq', text: id, points: 1, section, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }, { id: 'd', text: 'D' }], correctAnswer: 'a' });
const pooled = { code: 'P1', title: 'P', sections: [{ id: 's1', title: 'Pool', pool: { draw: 2 } }], questions: [mcq('q0'), mcq('a1', 's1'), mcq('a2', 's1'), mcq('a3', 's1'), mcq('a4', 's1')] };

test('pools: each student gets N questions, stable per email, different across students', () => {
  const a1 = instantiateTest(pooled, { email: 'ada@x.org' });
  const a2 = instantiateTest(pooled, { email: 'ADA@x.org' });
  assert.equal(a1.questions.length, 3);
  assert.deepEqual(a1.questions.map((q) => q.id), a2.questions.map((q) => q.id));
  assert.deepEqual(a1.instance.drawn, a1.questions.filter((q) => q.section === 's1').map((q) => q.id));
  const sets = new Set(['a@x', 'b@x', 'c@x', 'd@x', 'e@x', 'f@x'].map((e) => instantiateTest(pooled, { email: e }).instance.drawn.join()));
  assert.ok(sets.size > 1, 'different students get different draws');
});

test('pools: tags narrow the candidates; validation catches a draw larger than the section', () => {
  const t = { ...pooled, sections: [{ id: 's1', title: 'Pool', pool: { draw: 1, tags: ['hard'] } }], questions: pooled.questions.map((q) => (q.id === 'a3' ? { ...q, tags: ['hard'] } : q)) };
  assert.deepEqual(drawPools(t, () => 0.5).drawn, ['a3']);
  const bad = normalizeTest({ ...pooled, sections: [{ id: 's1', title: 'Pool', pool: { draw: 9 } }] });
  assert.ok(validateTest(bad).errors.some((e) => /draws 9/.test(e)));
});

test('window: before / open / late / closed and extensions', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const t = { opensAt: '2026-11-10T08:00:00Z', closesAt: '2026-11-10T10:00:00Z', late: { until: '2026-11-11T10:00:00Z', penalty: { type: 'percentPerDay', value: 10 } } };
  assert.equal(windowState(t, null, Date.parse('2026-11-10T07:00:00Z')).state, 'before');
  assert.equal(windowState(t, null, Date.parse('2026-11-10T09:00:00Z')).state, 'open');
  assert.equal(windowState(t, null, now).state, 'late');
  assert.equal(windowState(t, { extensionUntil: '2026-11-10T13:00:00Z' }, now).state, 'open');
  assert.equal(windowState(t, null, Date.parse('2026-11-12T00:00:00Z')).state, 'closed');
  assert.equal(latePenaltyPercent(t.late.penalty, t.closesAt, now), 10);
  assert.equal(latePenaltyPercent({ type: 'flat', value: 25 }, t.closesAt, now), 25);
  assert.ok(validateTest(normalizeTest({ code: 'AB', title: 'x', questions: [mcq('q1')], opensAt: 'nope' })).errors.some((e) => /opensAt/.test(e)));
});

test('accommodations: extra time, one wrong option removed deterministically, read-aloud', () => {
  const t = { code: 'A1', timeLimitMinutes: 20, questions: [mcq('q1')] };
  const a = applyAccommodations(t, { extraTime: 1.5, reducedChoices: true, readAloud: true }, 'seed');
  assert.equal(a.timeLimitMinutes, 30);
  assert.equal(a.instance.timeLimitApplied, 30);
  assert.equal(a.questions[0].options.length, 3);
  assert.ok(a.questions[0].options.some((o) => o.id === 'a'), 'the right answer is never removed');
  assert.deepEqual(applyAccommodations(t, { reducedChoices: true }, 'seed').questions[0].options, applyAccommodations(t, { reducedChoices: true }, 'seed').questions[0].options);
  assert.equal(a.tools.readAloud, true);
  assert.equal(t.timeLimitMinutes, 20, 'input not mutated');
});
