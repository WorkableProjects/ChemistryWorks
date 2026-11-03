import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  orderQuestions, groupQuestions, sectionPoints, sectionOf, nextSectionId, nextReferenceId,
  safeImageUrl, referenceTitle, REFERENCE_TYPES,
} from '../../js/lib/sections.js';

const T = () => ({
  sections: [{ id: 'A', title: 'Part A' }, { id: 'B', title: 'Part B' }],
  questions: [
    { id: 'q1', section: 'B', points: 2 },
    { id: 'q2', points: 1 },
    { id: 'q3', section: 'A', points: 1.5 },
    { id: 'q4', section: 'B', points: 0.25 },
    { id: 'q5', section: 'ghost', points: 1 },
    { id: 'q6', section: 'A', points: 1.5 },
    { id: 'q7', points: 1 },
  ],
});
const ids = (qs) => qs.map((q) => q.id);

test('orderQuestions: unsectioned first, section order, stable, unknown = unsectioned', () => {
  assert.deepEqual(ids(orderQuestions(T())), ['q2', 'q5', 'q7', 'q3', 'q6', 'q1', 'q4']);
});

test('orderQuestions: no sections keeps order, returns a copy; junk input', () => {
  const t = { questions: [{ id: 'a' }, { id: 'b', section: 'x' }] };
  const out = orderQuestions(t);
  assert.deepEqual(ids(out), ['a', 'b']);
  assert.notEqual(out, t.questions);
  assert.deepEqual(orderQuestions(null), []);
  assert.deepEqual(orderQuestions({}), []);
});

test('orderQuestions does not mutate input', () => {
  const t = T();
  const before = JSON.stringify(t);
  orderQuestions(t);
  assert.equal(JSON.stringify(t), before);
});

test('groupQuestions: groups with points', () => {
  const g = groupQuestions(T());
  assert.equal(g.length, 3);
  assert.equal(g[0].section, null);
  assert.deepEqual(ids(g[0].questions), ['q2', 'q5', 'q7']);
  assert.equal(g[0].points, 3);
  assert.equal(g[1].section.id, 'A');
  assert.equal(g[1].points, 3);
  assert.equal(g[2].section.id, 'B');
  assert.equal(g[2].points, 2.25);
});

test('groupQuestions: empty unsectioned omitted; empty sections kept unless skipEmpty', () => {
  const t = { sections: [{ id: 'A' }, { id: 'B' }], questions: [{ id: 'q', section: 'A', points: 1 }] };
  const g = groupQuestions(t);
  assert.deepEqual(g.map((x) => x.section && x.section.id), ['A', 'B']);
  assert.equal(g[1].points, 0);
  assert.deepEqual(g[1].questions, []);
  assert.deepEqual(groupQuestions(t, { skipEmpty: true }).map((x) => x.section.id), ['A']);
});

test('groupQuestions: no sections -> single unsectioned group; no questions -> none', () => {
  const g = groupQuestions({ questions: [{ id: 'a', points: 2 }] });
  assert.equal(g.length, 1);
  assert.equal(g[0].section, null);
  assert.deepEqual(groupQuestions({ questions: [] }), []);
});

test('sectionPoints (rounded, 0 for unknown) and sectionOf', () => {
  const t = T();
  assert.equal(sectionPoints(t, 'A'), 3);
  assert.equal(sectionPoints(t, 'B'), 2.25);
  assert.equal(sectionPoints(t, 'nope'), 0);
  assert.equal(sectionPoints({ questions: [{ section: 'A', points: 0.1 }, { section: 'A', points: 0.2 }] }, 'A'), 0.3);
  assert.equal(sectionOf(t, 'q3').id, 'A');
  assert.equal(sectionOf(t, 'q2'), null);
  assert.equal(sectionOf(t, 'q5'), null);
  assert.equal(sectionOf(t, 'missing'), null);
});

test('nextSectionId / nextReferenceId', () => {
  assert.equal(nextSectionId([]), 'sec1');
  assert.equal(nextSectionId(undefined), 'sec1');
  assert.equal(nextSectionId([{ id: 'sec1' }, { id: 'sec3' }]), 'sec2');
  assert.equal(nextSectionId([{ id: 'sec1' }, { id: 'sec2' }]), 'sec3');
  assert.equal(nextReferenceId([]), 'ref1');
  assert.equal(nextReferenceId([{ id: 'ref1' }, { id: 'x' }]), 'ref2');
});

test('safeImageUrl', () => {
  assert.equal(safeImageUrl('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(safeImageUrl('  https://example.com/a.png '), 'https://example.com/a.png');
  assert.equal(safeImageUrl('img/chart.png'), 'img/chart.png');
  assert.equal(safeImageUrl('/img/chart.png'), '/img/chart.png');
  for (const bad of ['http://example.com/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '//evil.com/a.png', 'ftp://x/y', '', '   ', null, undefined]) {
    assert.equal(safeImageUrl(bad), '', String(bad));
  }
});

test('referenceTitle fallback', () => {
  assert.equal(referenceTitle({ type: 'text', title: ' Constants ' }), 'Constants');
  assert.equal(referenceTitle({ type: 'periodic-table', title: '' }), 'Periodic table');
  assert.equal(referenceTitle({ type: 'text', title: '  ' }), 'Text');
  assert.equal(referenceTitle({ type: 'image' }), 'Image');
  assert.equal(referenceTitle({ type: 'weird' }), 'Reference');
  assert.equal(referenceTitle(null), 'Reference');
  assert.deepEqual(REFERENCE_TYPES, ['periodic-table', 'constants', 'text', 'image']);
  assert.equal(referenceTitle({ type: 'constants', title: '' }), 'Constants');
});
