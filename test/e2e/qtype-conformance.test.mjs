// Conformance for question types in the browser. For each type that has moved to the TypeDef contract, its fixture
// question is rendered in the runner, answered with the fixture's correct answer, played in every mode, submitted,
// shown in the results and drawn in the PDF documents, and the page must log no error. Also checks the lazy loaders.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startEnv, newSession, startTest, submit, tid, poll, STUDENT } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

// Types on the TypeDef contract so far.
const TYPES = ['mcq', 'multi', 'truefalse', 'numeric', 'formula', 'matching', 'ordering', 'fillblank', 'categorize', 'balance', 'econfig', 'ptable', 'sigfigs', 'hotspot', 'lewis', 'structure', 'orbital', 'graph', 'short', 'open'];
const MODES = ['classic', 'lightning', 'survival', 'flashcards', 'mistakes', 'tower', 'boss', 'matchup', 'quizshow', 'race', 'bingo', 'study'];
const NOT = { result: 'success', submitted: false, blocking: false, attempts: 0, latest: null, others: [] };

// Modes need several auto-graded questions to play, so the question under test comes last after five multiple-choice ones.
const FILLERS = ['Symbol for potassium', 'Lightest element', 'Noble gas in balloons', 'Most abundant gas in air', 'Liquid metal'].map((text, i) => ({
  id: `f${i + 1}`, type: 'mcq', text, points: 1, correctAnswer: i % 2 ? 'a' : 'b',
  options: i % 2 ? [{ id: 'a', text: `Right ${i}` }, { id: 'b', text: `Wrong ${i}` }] : [{ id: 'a', text: `Wrong ${i}` }, { id: 'b', text: `Right ${i}` }],
}));

const fixture = (type) => JSON.parse(readFileSync(new URL(`../fixtures/types/${type}.json`, import.meta.url), 'utf8'));

for (const type of TYPES) {
  test(`${type}: runner, every mode, results and PDF view`, async () => {
    const fx = fixture(type);
    const code = `CF${type.toUpperCase()}`.slice(0, 16);
    const raw = { code, title: `Conformance ${type}`, description: '', timeLimitMinutes: null, gameMode: true, showResults: true, showCorrectAnswers: true, questions: [...FILLERS, fx.question] };
    const s = await newSession(env);
    s.onGas = (b) => (b.action === 'getStudentStatus' ? NOT : null);
    s.serveTest(code, raw);
    try {
      const { page } = s;
      await startTest(s, code);
      const card = page.locator(`${tid('question-card')}.is-active`).first();
      await card.waitFor();
      assert.equal(await page.getByText(/Unsupported question type|Could not load/).count(), 0, 'the widget rendered');

      // Answer with the fixture's correct answer: save it as the attempt and reopen, so the widget draws that answer.
      await page.evaluate(([key, value]) => localStorage.setItem(`cw:${key}`, JSON.stringify(value)), [
        `progress:${STUDENT.email}:${code}`,
        { answers: { [fx.question.id]: fx.correct }, flagged: [], index: FILLERS.length, startedAt: Date.now(), mode: 'focus', v: 5, total: FILLERS.length + 1 },
      ]);
      await page.goto(`${s.url}/?code=${code}`);
      await page.locator(tid('runner')).waitFor();
      await page.locator(`${tid('question-card')}.is-active[data-question-id="${fx.question.id}"]`).waitFor();
      assert.equal(await page.getByText(/Unsupported question type|Could not load/).count(), 0, 'the widget rendered the saved answer');

      // Every mode opens without an error (a game with nothing it can ask shows its own message).
      for (const mode of MODES) {
        const option = page.locator(tid(`mode-option-${mode}`));
        await option.waitFor();
        if (await option.isDisabled()) continue;
        await option.click();
        if (mode === 'study') await page.locator(tid('runner')).waitFor();
        else await page.locator(`${tid('mode-shell')}[data-mode="${mode}"]`).waitFor();
      }

      await submit(page);
      const item = page.locator(tid(`review-item-${fx.question.id}`));
      await item.waitFor();
      if (fx.question.type !== 'short' && fx.question.type !== 'open') {
        assert.equal(await page.locator(`${tid(`review-item-${fx.question.id}`)}[data-correct="true"]`).count(), 1, 'the correct answer is marked correct');
      }

      // The PDF documents: the graded submission and the printable test with its answer key.
      const body = s.gas.find((b) => b && b.action === 'submit' || b && b.responses) || s.gas.find((b) => b && Array.isArray(b.responses));
      assert.ok(body, 'the submission reached the backend');
      const docs = await page.evaluate(async ({ payload, rawTest }) => {
        const { normalizeTest } = await import('/js/lib/schema.js');
        const { buildExportModel } = await import('/js/lib/export.js');
        const { exportDocument } = await import('/js/views/admin/export-view.js');
        const { printTestDocument } = await import('/js/views/admin/print-test.js');
        const t = normalizeTest(structuredClone(rawTest));
        const answered = exportDocument(buildExportModel({ row: payload, test: t })).textContent;
        const paper = printTestDocument(t, { key: false }).textContent;
        const key = printTestDocument(t, { key: true }).textContent;
        return { answered, paper, key };
      }, { payload: body.payload || body, rawTest: raw });
      assert.ok(docs.answered.includes(fx.question.text.slice(0, 20)), 'the submission document shows the question');
      assert.ok(docs.paper.trim().length > 0 && docs.key.trim().length > 0, 'the printable test and its key are not empty');

      assert.deepEqual(s.errors, []);
    } finally { await s.close(); }
  });
}

test('the UI and editor loaders load each type once and an unknown type rejects', async () => {
  const s = await newSession(env);
  try {
    await s.page.goto(`${s.url}/`);
    const out = await s.page.evaluate(async (types) => {
      const reg = await import('/js/lib/qtypes/registry.js');
      const res = {};
      for (const type of types) {
        const before = reg.typeUI(type);
        const p = reg.loadTypeUI(type);
        const same = reg.loadTypeUI(type) === p;
        const ui = await p;
        const ed = await reg.loadTypeEditor(type);
        res[type] = { before: before === null, same, ui: ui && ui.type === type && typeof ui.render === 'function', sync: reg.typeUI(type) === ui, ed: ed && ed.type === type && typeof ed.edit === 'function' };
      }
      const unknown = await reg.loadTypeUI('nope').then(() => 'resolved', (e) => e.message);
      return { res, unknown };
    }, TYPES);
    for (const type of TYPES) assert.deepEqual(out.res[type], { before: true, same: true, ui: true, sync: true, ed: true }, type);
    assert.equal(out.unknown, 'unknown_type:nope');
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('the landing page loads no moved type UI module', async () => {
  const s = await newSession(env);
  try {
    const seen = [];
    s.page.on('request', (r) => { if (/\/js\/(views\/qtypes|views\/admin\/editors)\/(mcq|multi|truefalse|numeric|formula|matching|ordering|fillblank|categorize|balance|econfig|ptable|sigfigs|hotspot|lewis|structure|orbital|graph|short|open)\.js/.test(r.url())) seen.push(r.url()); });
    await s.page.goto(`${s.url}/`);
    await poll(() => s.page.locator(tid('demo-name')).count(), { message: 'landing' });
    assert.deepEqual(seen, []);
  } finally { await s.close(); }
});
