import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speakableText, questionSpeech } from '../../js/views/tools/speech.js';
import { normalizeSettings, settingsAttrs, FONT_STEPS } from '../../js/views/tools/settings.js';
import { normalizeScratch, normalizeScratchMap, addStroke, undoStroke, isEmptyScratch, MAX_TEXT, SCRATCH_W } from '../../js/views/tools/scratch-model.js';
import { bannerState } from '../../js/views/tools/network.js';
import { buildDashboard } from '../../js/views/tools/dashboard-model.js';
import { toolsFor } from '../../js/views/tools/tools-config.js';
import { buildPayload, cleanFlagNotes } from '../../js/lib/submit.js';

test('speakableText: formulas, math and charges', () => {
  assert.equal(speakableText('Water is H2O.'), 'Water is H two O.');
  assert.equal(speakableText('Mix NaCl with CO2'), 'Mix N A C L with C O two');
  assert.equal(speakableText('He said No to In and As'), 'He said No to In and As');
  assert.equal(speakableText('Ca^{2+} ion'), 'Ca two plus ion');
  assert.equal(speakableText('$\\ce{2H2 + O2 -> 2H2O}$'), 'two H two + O two yields two H two O');
  assert.equal(speakableText('SO₄²⁻'), 'S O four two minus');
  assert.equal(speakableText('Use $10^{-3}$ mol/L'), 'Use 10 to the minus 3 mol per L');
  assert.equal(speakableText('**Bold** text'), 'Bold text');
  assert.equal(speakableText(null), '');
});

test('questionSpeech reads lettered options', () => {
  const s = questionSpeech({ type: 'mcq', text: 'Which is H2O?', options: [{ id: 'a', text: 'Water' }, { id: 'b', text: 'CO2' }] });
  assert.equal(s, 'Which is H two O? Option A. Water. Option B. C O two.');
  assert.equal(questionSpeech({ type: 'truefalse', text: 'Salt is NaCl.' }), 'Salt is N A C L. True or false.');
});

test('settings: font steps and spacing', () => {
  assert.deepEqual(normalizeSettings(null), { font: 'normal', spacing: false });
  assert.deepEqual(normalizeSettings({ font: 'xlarge', spacing: true }), { font: 'xlarge', spacing: true });
  assert.equal(normalizeSettings({ font: 'huge' }).font, 'normal');
  assert.equal(normalizeSettings({ spacing: 'yes' }).spacing, false);
  assert.equal(FONT_STEPS.length, 3);
  assert.deepEqual(settingsAttrs({ font: 'large', spacing: true }), { 'data-cw-font': 'large', 'data-cw-spacing': 'wide' });
  assert.deepEqual(settingsAttrs({}), { 'data-cw-font': null, 'data-cw-spacing': null });
});

test('scratch model', () => {
  const s = normalizeScratch({ text: 'x'.repeat(MAX_TEXT + 10), strokes: [[[1, 2], [3, 4]], 'bad', [], [[9999, -5]]] });
  assert.equal(s.text.length, MAX_TEXT);
  assert.equal(s.strokes.length, 2);
  assert.deepEqual(s.strokes[1], [[SCRATCH_W, 0]]);
  let p = addStroke(null, [[1, 1], [2, 2]]);
  p = addStroke(p, [[5, 5]]);
  assert.equal(p.strokes.length, 2);
  assert.equal(undoStroke(p).strokes.length, 1);
  assert.equal(isEmptyScratch({ text: '  ', strokes: [] }), true);
  assert.equal(isEmptyScratch(p), false);
  assert.deepEqual(Object.keys(normalizeScratchMap({ q1: { text: 'hi' }, q2: { text: '' }, gone: { text: 'x' } }, ['q1', 'q2'])), ['q1']);
});

test('bannerState', () => {
  assert.equal(bannerState({ online: true, outbox: 0 }), null);
  assert.equal(bannerState({ online: false, outbox: 0 }).kind, 'offline');
  assert.match(bannerState({ online: false, outbox: 2 }).text, /2 submissions/);
  assert.equal(bannerState({ online: true, outbox: 1 }).kind, 'queued');
  assert.match(bannerState({ online: true, outbox: 1 }).text, /A submission is waiting/);
});

test('buildDashboard merges progress and results', () => {
  const now = Date.parse('2026-01-10T00:00:00Z');
  const rows = buildDashboard({
    now,
    progress: [{ code: 'B', title: 'Test B', answers: { q1: 1, q2: 2 }, closes_at: '2026-01-11T00:00:00Z' }, { code: 'A', title: 'Test A', answers: {} }],
    results: [
      { test_code: 'A', test_title: 'Test A', submitted_at: '2026-01-01T00:00:00Z', percentage: '80.00', score_achieved: 4, score_total: 5 },
      { test_code: 'C', test_title: 'Test C', submitted_at: '2026-01-02T00:00:00Z', percentage: '50', released: true },
      { test_code: 'D', test_title: 'Test D', submitted_at: '2026-01-03T00:00:00Z', percentage: '90' },
    ],
  });
  assert.deepEqual(rows.map((r) => [r.code, r.status]), [['A', 'in-progress'], ['B', 'in-progress'], ['D', 'submitted'], ['C', 'released']]);
  assert.equal(rows.find((r) => r.code === 'B').dueSoon, true);
  assert.equal(rows.find((r) => r.code === 'B').answered, 2);
  assert.equal(rows.find((r) => r.code === 'A').score.percentage, 80);
  assert.equal(rows.find((r) => r.code === 'A').attempts, 1);
  assert.deepEqual(buildDashboard(), []);
});

test('toolsFor: flag, per-test controls and accommodation', () => {
  const t = { tools: { calculator: true, scratchpad: true, constants: 'yes' } };
  assert.deepEqual(Object.values(toolsFor(t, { enabled: false })), [false, false, false, false, false]);
  const on = toolsFor(t, { enabled: true });
  assert.equal(on.calculator, true);
  assert.equal(on.scratchpad, true);
  assert.equal(on.constants, false);
  assert.equal(on.readAloud, false);
  assert.equal(toolsFor({}, { enabled: true, accommodations: { readAloud: true } }).readAloud, true);
  assert.equal(toolsFor(null, { enabled: true }).calculator, false);
});

test('payload carries flag notes only when present', () => {
  const base = { test: { code: 'T' }, grade: {}, user: { name: 'A', email: 'a@x.y' } };
  assert.equal('questions' in buildPayload(base).flags, false);
  const p = buildPayload({ ...base, flags: { questions: { q1: '  confusing  ', q2: '' } } });
  assert.deepEqual(p.flags.questions, { q1: 'confusing', q2: '' });
  assert.deepEqual(cleanFlagNotes({ q: 'x'.repeat(300) }).q.length, 200);
  assert.equal(cleanFlagNotes([]), null);
  assert.equal(cleanFlagNotes({}), null);
});
