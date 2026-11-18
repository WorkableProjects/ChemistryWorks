// S09 question types (dimensional, nuclear, reaction, vsepr, datatable): runs the DEMOV4B sample test end to end.
// The types sit behind FEATURES.v4Types, so every session turns it on.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startEnv, newSession, startTest, goNext, submit, tid, noHorizontalScroll, unlockAdmin, addQuestion, poll } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const NOT = { result: 'success', submitted: false, blocking: false, attempts: 0, latest: null, others: [] };
const DEMO = JSON.parse(fs.readFileSync('data/tests/DEMOV4B.json', 'utf8'));
const session = async (opts = {}) => {
  const s = await newSession(env, { config: { FEATURES: { v4Types: true } }, ...opts });
  s.onGas = (b) => (b.action === 'getStudentStatus' ? NOT : null);
  s.serveTest('DEMOV4B', DEMO);
  return s;
};

/** Answer the five questions; `wrong` swaps in one deliberately wrong answer per question. */
async function answerAll(page, wrong) {
  const fill = (id, v) => page.locator(tid(id)).fill(v);
  // q1 dimensional
  await page.locator(tid('dimensional-add-factor')).click();
  await fill('dimensional-factor-0-top-value', '1');
  await fill('dimensional-factor-0-top-unit', 'mol');
  await fill('dimensional-factor-0-bottom-value', '58.5');
  await fill('dimensional-factor-0-bottom-unit', 'g');
  await fill('dimensional-value', wrong ? '3' : '2');
  await fill('dimensional-unit', 'mol');
  await goNext(page);
  // q2 nuclear
  await fill('nuclear-R0-A', '234');
  await fill('nuclear-R0-Z', wrong ? '91' : '90');
  await fill('nuclear-R0-symbol', 'th');
  await goNext(page);
  // q3 reaction
  await fill('reaction-input', wrong ? 'AgCl(s)' : 'NaNO3(aq) + AgCl(s)');
  await goNext(page);
  // q4 vsepr (labels carry the test ids; the radios inside are visually hidden)
  await page.locator(tid('vsepr-electron-tetrahedral')).click();
  await page.locator(tid('vsepr-molecular-trigonal-pyramidal')).click();
  await page.locator(tid(wrong ? 'vsepr-angle-109-5' : 'vsepr-angle-107')).click();
  await goNext(page);
  // q5 datatable
  await fill('datatable-cell-r1-n', '12');
  await fill('datatable-cell-r1-e', '11');
  await fill('datatable-cell-r2-n', wrong ? '17' : '18');
  await fill('datatable-cell-r2-e', '18');
}

test('answer every question correctly: full marks and a readable review', async () => {
  const s = await session();
  try {
    await startTest(s, 'DEMOV4B');
    await answerAll(s.page, false);
    await submit(s.page);
    assert.match(await s.page.locator(tid('score-points')).innerText(), /13 \/ 13/);
    for (const id of ['q1', 'q2', 'q3', 'q4', 'q5']) assert.equal(await s.page.locator(`${tid(`review-item-${id}`)}[data-correct="true"]`).count(), 1, id);
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('one wrong answer per question: partial credit and the correct answer shown', async () => {
  const s = await session();
  try {
    await startTest(s, 'DEMOV4B');
    await answerAll(s.page, true);
    await submit(s.page);
    // dimensional 1 (good chain, wrong entry = half), nuclear 0, reaction 1, vsepr 2, datatable 3
    assert.match(await s.page.locator(tid('score-points')).innerText(), /7 \/ 13/);
    for (const id of ['q1', 'q2', 'q3', 'q4', 'q5']) assert.equal(await s.page.locator(`${tid(`review-item-${id}`)}[data-correct="false"]`).count(), 1, id);
    const q2 = s.page.locator(tid('review-item-q2'));
    await q2.locator('.results-item__head').click();
    const text = await q2.innerText();
    assert.match(text, /234\/90 Th/, 'correct answer text');
    assert.match(text, /234\/91 th/i, 'given answer text');
    assert.equal(await q2.locator(tid('nuclear-review')).count(), 2, 'review visuals for given and correct');
    const q5 = s.page.locator(tid('review-item-q5'));
    await q5.locator('.results-item__head').click();
    assert.equal(await q5.locator('td.is-wrong').count(), 1);
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('dimensional: units that cancel are struck through, tiles can be removed, answers persist across navigation', async () => {
  const s = await session();
  try {
    await startTest(s, 'DEMOV4B');
    const { page } = s;
    await page.locator(tid('dimensional-add-factor')).click();
    await page.locator(tid('dimensional-factor-0-top-unit')).fill('mol');
    await page.locator(tid('dimensional-factor-0-bottom-unit')).fill('g');
    await poll(async () => (await page.locator(`${tid('dimensional-units-line')} .is-cancelled`).count()) === 2, { message: 'g cancels top and bottom' });
    await page.locator(tid('dimensional-value')).fill('2');
    await goNext(page);
    await page.locator(tid('prev-btn')).click();
    await page.locator(tid('dimensional-value')).waitFor();
    assert.equal(await page.locator(tid('dimensional-value')).inputValue(), '2');
    assert.equal(await page.locator(tid('dimensional-factor-0-top-unit')).inputValue(), 'mol');
    await page.locator(tid('dimensional-remove-0')).click();
    assert.equal(await page.locator(tid('dimensional-factor-0')).count(), 0);
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('nuclear shows whether the equation balances; reaction previews formulas', async () => {
  const s = await session();
  try {
    await startTest(s, 'DEMOV4B');
    const { page } = s;
    await goNext(page);
    await page.locator(tid('nuclear-R0-A')).fill('230');
    await page.locator(tid('nuclear-R0-Z')).fill('90');
    await poll(async () => /not balanced/.test(await page.locator(tid('nuclear-balance')).innerText()), { message: 'unbalanced' });
    await page.locator(tid('nuclear-R0-A')).fill('234');
    await poll(async () => /: balanced/.test(await page.locator(tid('nuclear-balance')).innerText()), { message: 'balanced' });
    await goNext(page);
    await page.locator(tid('reaction-input')).fill('Ba(OH)2(aq)');
    await poll(async () => (await page.locator(`${tid('reaction-preview')} sub`).count()) > 0, { message: 'subscripts in the preview' });
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('vsepr radios and datatable inputs work from the keyboard and are labelled', async () => {
  const s = await session();
  try {
    await startTest(s, 'DEMOV4B');
    const { page } = s;
    for (let i = 0; i < 3; i++) await goNext(page);
    await page.locator(`${tid('vsepr-electron-linear')} input`).focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator(`${tid('vsepr-electron-trigonal-planar')} input`).isChecked(), true, 'arrow keys move through the group');
    assert.equal(await page.locator('.q-vsepr__group').count(), 3);
    assert.ok((await page.locator('.q-vsepr__svg').count()) > 10, 'shape pictures');
    await goNext(page);
    assert.equal(await page.locator(tid('datatable-cell-r1-n')).getAttribute('aria-label'), 'Na, Neutrons');
    assert.equal(await page.locator('table th[scope="col"]').count(), 4);
    assert.equal(await page.locator('table th[scope="row"]').count(), 2);
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('phone width: no horizontal scroll for any of the five widgets, light and dark', async () => {
  const s = await session({ viewport: { width: 360, height: 780 } });
  try {
    await startTest(s, 'DEMOV4B');
    const { page } = s;
    await page.locator(tid('dimensional-add-factor')).click();
    assert.ok(await noHorizontalScroll(page), 'dimensional');
    for (const name of ['nuclear', 'reaction', 'vsepr', 'datatable']) {
      await goNext(page);
      assert.ok(await noHorizontalScroll(page), name);
    }
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    assert.ok(await noHorizontalScroll(page), 'datatable dark');
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('builder: each type is offered and its editor edits the question', async () => {
  const s = await session();
  try {
    const { page, url } = s;
    s.onGas = (b) => (b.action === 'getResults' ? { result: 'success', rows: [] } : null);
    await unlockAdmin(page, url);
    await page.locator(tid('tab-builder')).click();
    const editors = {
      dimensional: 'dimensional-edit-given-value', nuclear: 'nuclear-edit-L0', reaction: 'reaction-edit-products',
      vsepr: 'vsepr-edit-formula', datatable: 'datatable-edit-add-row',
    };
    for (const [type, probe] of Object.entries(editors)) {
      await addQuestion(page, type);
      await page.locator(tid(probe)).first().waitFor();
    }
    // edit one: change the VSEPR formula and see it stick
    await page.locator(tid('vsepr-edit-formula')).fill('SF4');
    assert.equal(await page.locator(tid('vsepr-edit-formula')).inputValue(), 'SF4');
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});
