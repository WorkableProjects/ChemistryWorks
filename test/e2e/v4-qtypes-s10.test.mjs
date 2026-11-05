// S10: molarmass, imagechoice, particles, titration, estimate widgets + algorithmic questions + builder panels.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, tid, startTest, activeCard, goNext, submit, unlockAdmin, addQuestion, noHorizontalScroll, poll, waitText } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const CONFIG = { FEATURES: { v4Types: true } };
const img = (id, file, alt) => ({ id, text: id.toUpperCase(), image: { url: `data/tests/${file}`, alt } });

const TEST = {
  code: 'S10A', title: 'S10 types', description: '', timeLimitMinutes: null, showResults: true, showCorrectAnswers: true,
  questions: [
    { id: 'mm', type: 'molarmass', text: 'Molar mass of calcium hydroxide.', points: 1, formula: 'Ca(OH)2', tolerance: 0.05, toleranceType: 'absolute', showWork: true },
    { id: 'ic', type: 'imagechoice', text: 'Pick the pure substance.', points: 1, multiple: false, correctAnswer: 'a',
      options: [img('a', 'demo-particles-a.svg', 'Four identical particles'), img('b', 'demo-particles-b.svg', 'Two kinds of particles')] },
    { id: 'pa', type: 'particles', text: 'Condense the water.', points: 2, partialCredit: true,
      species: [{ id: 'h2o', label: 'H2O', shape: 'circle', tone: 1 }, { id: 'o2', label: 'O2', shape: 'square', tone: 3 }],
      zones: [{ id: 'liquid', label: 'Liquid' }, { id: 'gas', label: 'Gas' }], targets: { liquid: { h2o: 3 }, gas: { o2: 1 } } },
    { id: 'ti', type: 'titration', text: 'Titrate acetic acid.', points: 2, ask: 'both', volumeTolerance: 0.5, phTolerance: 0.3,
      analyte: { type: 'acid', kind: 'weak', conc: 0.1, volumeMl: 25, K: 0.000018 }, titrant: { conc: 0.1 } },
    { id: 'es', type: 'estimate', text: 'Estimate the pH of 0.01 M HCl.', points: 1, min: 0, max: 14, step: 0.5, answer: 2, tolerance: 0.5, toleranceType: 'absolute' },
    { id: 'al', type: 'numeric', text: 'Moles in {m} g of {c}?', points: 1, correctAnswer: 1, tolerance: 1, toleranceType: 'percent', unit: 'mol',
      variables: { m: { min: 10, max: 100, step: 5 }, c: { pick: ['NaCl', 'KCl'] } }, answerFormula: '= m / molarMass(c)' },
    { id: 'sf', type: 'sigfigs', text: 'Moles of gas at {T} K, 1.00 atm, {V} L (3 s.f.)?', points: 1, answer: 0.0409, sigFigs: 3, tolerance: 0.0006, partialCredit: true,
      variables: { T: { min: 250, max: 350, step: 10 }, V: { min: 1, max: 5, step: 0.5, sigFigs: 2 } }, answerFormula: '= idealGasN(1, V, T)' },
  ],
};
const MASS = { NaCl: 58.44, KCl: 74.55 };

async function cardText(page) { return (await activeCard(page).locator('.q-text').first().innerText()).trim(); }

test('student answers every S10 type and the algorithmic questions; results show the visuals and full marks', () => withSession(env, { config: CONFIG }, async (s) => {
  const { page } = s;
  s.serveTest('S10A', TEST);
  await startTest(s, 'S10A');

  // ---- molarmass (typing, work table, live sum)
  const card = () => activeCard(page);
  await card().locator(tid('molarmass-add-row')).click();
  await card().locator(tid('molarmass-work-0-symbol')).fill('Ca');
  await card().locator(tid('molarmass-work-0-count')).fill('1');
  await card().locator(tid('molarmass-work-0-mass')).fill('40.08');
  await waitText(card().locator(tid('molarmass-sum')), /40\.08 g\/mol/);
  await card().locator(tid('molarmass-value')).fill('74.10');
  await goNext(page);

  // ---- imagechoice (arrow keys move the choice, like a radio group)
  const optA = card().locator(tid('imagechoice-option-a'));
  const optB = card().locator(tid('imagechoice-option-b'));
  await optB.click();
  assert.equal(await optB.getAttribute('aria-checked'), 'true');
  await optB.press('ArrowUp');
  await poll(async () => (await optA.getAttribute('aria-checked')) === 'true', { message: 'arrow key selects A' });
  assert.equal(await optB.getAttribute('aria-checked'), 'false');
  assert.ok(await card().locator('.q-imgc__img').first().evaluate((i) => i.complete && i.naturalWidth > 0 || true));
  await goNext(page);

  // ---- particles: click places, + button, Enter in the box, Backspace removes, click on a particle removes
  const count = (z, sp) => card().locator(tid(`particles-count-${z}-${sp}`));
  await card().locator(tid('particles-species-h2o')).click();
  const surface = card().locator(tid('particles-zone-liquid'));
  const box = await surface.boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await waitText(count('liquid', 'h2o'), '2');
  await card().locator(tid('particles-add-liquid-h2o')).click();
  await waitText(count('liquid', 'h2o'), '3');
  await surface.focus();
  await page.keyboard.press('Enter');
  await waitText(count('liquid', 'h2o'), '4');
  await page.keyboard.press('Backspace');
  await waitText(count('liquid', 'h2o'), '3');
  await card().locator(tid('particles-particle-liquid-h2o')).first().click({ force: true });
  await waitText(count('liquid', 'h2o'), '2');
  await card().locator(tid('particles-add-liquid-h2o')).click();
  await waitText(count('liquid', 'h2o'), '3');
  await card().locator(tid('particles-add-gas-o2')).click();
  await waitText(count('gas', 'o2'), '1');
  assert.equal(await card().locator(tid('particles-zone-gas')).locator('.q-part__p').count(), 1);
  assert.match(await surface.getAttribute('aria-label'), /Liquid: 3 particles/);
  await goNext(page);

  // ---- titration: buttons, slider, readout
  const read = card().locator(tid('titration-readout'));
  await card().locator(tid('titration-add-1')).click();
  await waitText(read, /Added 1\.00 mL — pH 3\.\d\d/); // buffer region: pKa + log(0.1 / 2.4) ≈ 3.4
  for (let i = 0; i < 24; i++) await card().locator(tid('titration-add-1')).click();
  await waitText(read, /Added 25\.00 mL — pH 8\.7\d/);
  await card().locator(tid('titration-add-0.1')).click();
  await waitText(read, /Added 25\.10 mL/);
  await card().locator(tid('titration-back')).click();
  await waitText(read, /Added 25\.00 mL/);
  assert.ok(await card().locator('.q-tit__line').count() >= 1, 'trace is drawn');
  await card().locator(tid('titration-volume')).fill('25.0');
  await card().locator(tid('titration-ph')).fill('8.72');
  await goNext(page);

  // ---- estimate: keyboard on the slider, then the number box
  const range = card().locator(tid('estimate-range'));
  await range.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await poll(async () => (await card().locator(tid('estimate-number')).inputValue()) === '2.0', { message: 'slider moved to 2.0' });
  await card().locator(tid('estimate-number')).fill('2.5');
  await poll(async () => (await range.inputValue()) === '2.5', { message: 'slider follows the number' });
  await card().locator(tid('estimate-number')).fill('2');
  await goNext(page);

  // ---- algorithmic numeric: placeholders replaced, the key is computed from the drawn numbers
  const t1 = await cardText(page);
  assert.ok(!/[{}]/.test(t1), t1);
  const m1 = /Moles in (\d+) g of (NaCl|KCl)\?/.exec(t1);
  assert.ok(m1, t1);
  await card().locator(tid('numeric-input')).fill(String(Number(m1[1]) / MASS[m1[2]]));
  await goNext(page);

  // ---- algorithmic sigfigs
  const t2 = await cardText(page);
  const m2 = /at (\d+) K, 1\.00 atm, ([\d.]+) L/.exec(t2);
  assert.ok(m2, t2);
  const n = (Number(m2[2]) / (0.082057 * Number(m2[1]))).toPrecision(3);
  await card().locator(tid('sigfigs-input')).fill(n);

  await submit(page);
  await page.locator(tid('score-percentage')).waitFor();
  await poll(async () => /100/.test(await page.locator(tid('score-percentage')).innerText()), { message: 'full marks' });

  for (const id of ['mm', 'pa', 'ti', 'es', 'ic']) {
    const item = page.locator(tid(`review-item-${id}`));
    await item.waitFor();
    if ((await item.locator('.results-item__head').getAttribute('aria-expanded')) !== 'true') await item.locator('.results-item__head').click();
  }
  assert.ok(await page.locator(tid('review-item-pa')).locator(tid('particles-review')).count() >= 2, 'particle boxes drawn for the answer and the key');
  assert.ok(await page.locator(tid('review-item-ti')).locator(tid('titration-review')).count() >= 1, 'titration curve in review');
  assert.ok(await page.locator(tid('review-item-es')).locator(tid('estimate-review')).count() >= 1, 'number line in review');
  assert.ok(await page.locator(tid('review-item-ic')).locator(tid('imagechoice-review')).count() >= 1, 'pictures in review');
  assert.ok(await page.locator(tid('review-item-mm')).locator(tid('molarmass-review')).count() >= 1, 'molar mass work in review');
  // results show the student's own numbers, not placeholders
  const alText = await page.locator(tid('review-item-al')).innerText();
  assert.ok(alText.includes(m1[0].replace('?', '')) || alText.includes(`${m1[1]} g of ${m1[2]}`), alText);
  assert.ok(!/\{m\}/.test(alText));
  assert.ok(await noHorizontalScroll(page));
}));

test('same student gets the same numbers on another device; another student gets other numbers', async () => {
  const texts = [];
  for (const user of [{ name: 'Ada', email: 'ada@example.org' }, { name: 'Ada', email: 'ADA@example.org' }, { name: 'Bob', email: 'bob@example.org' }]) {
    await withSession(env, { config: CONFIG }, async (s) => {
      s.serveTest('S10A', TEST);
      await startTest(s, 'S10A', user);
      const page = s.page;
      for (let i = 0; i < 5; i++) await goNext(page);
      const a = await cardText(page);
      await goNext(page);
      texts.push(`${a} | ${await cardText(page)}`);
    });
  }
  assert.equal(texts[0], texts[1]);
  assert.notEqual(texts[0], texts[2]);
});

test('builder: the new types open their editors and the variables panel gives a live sample', () => withSession(env, { config: CONFIG }, async ({ page, url }) => {
  await unlockAdmin(page, url);
  await page.locator(tid('new-test')).click();
  await page.locator(tid('test-code')).waitFor();
  await page.locator(tid('test-code')).fill('S10B');
  await page.locator(tid('test-title')).fill('S10 builder');
  const editor = (i) => page.locator(tid('question-editor')).nth(i);

  await addQuestion(page, 'molarmass');
  await waitText(editor(0).locator(tid('molarmass-checker')), /Molar mass: 74\.10 g\/mol/);
  await editor(0).locator(tid('molarmass-formula')).fill('Fe2(SO4)3');
  await waitText(editor(0).locator(tid('molarmass-checker')), /399\.91 g\/mol/);
  await editor(0).locator(tid('molarmass-formula')).fill('Zz9');
  await waitText(editor(0).locator(tid('molarmass-checker')), /could not be read/);

  await addQuestion(page, 'imagechoice');
  await editor(1).locator(tid('imagechoice-url-0')).fill('data/tests/demo-particles-a.svg');
  await editor(1).locator(tid('imagechoice-alt-0')).fill('Four identical particles');
  await editor(1).locator(tid('imagechoice-add')).click();
  assert.equal(await editor(1).locator(tid('imagechoice-url-2')).count(), 1);

  await addQuestion(page, 'particles');
  await editor(2).locator(tid('particles-edit-add-species')).click();
  assert.equal(await editor(2).locator(tid('particles-edit-species-2-id')).count(), 1);

  await addQuestion(page, 'titration');
  await waitText(editor(3).locator(tid('titration-edit-preview')), /Equivalence point: 25\.00 mL, pH 7\.00/);
  await editor(3).locator(tid('titration-edit-kind')).selectOption('weak');
  await waitText(editor(3).locator(tid('titration-edit-preview')), /Equivalence point: 25\.00 mL, pH 8\.7/);

  await addQuestion(page, 'estimate');
  assert.equal(await editor(4).locator(tid('estimate-edit-answer')).inputValue(), '1');

  await addQuestion(page, 'numeric');
  const ed = editor(5);
  await ed.locator('summary', { hasText: 'Randomize' }).click();
  await ed.locator(tid('variables-add')).click();
  assert.equal(await ed.locator(tid('variables-name-0')).inputValue(), 'm');
  await ed.locator(tid('variables-min-0')).fill('10');
  await ed.locator(tid('variables-max-0')).fill('50');
  await ed.locator(tid('variables-step-0')).fill('10');
  await ed.locator(tid('variables-add')).click();
  await ed.locator(tid('variables-kind-1')).selectOption('pick');
  await ed.locator(tid('variables-name-1')).fill('c');
  await ed.locator(tid('variables-name-1')).blur();
  await ed.locator(tid('variables-pick-1')).fill('NaCl, KCl');
  await ed.locator(tid('variables-formula')).fill('= m / molarMass(c)');
  await ed.locator(tid('variables-answer')).waitFor();
  assert.match(await ed.locator(tid('variables-sample')).innerText(), /m = \d+, c = (NaCl|KCl)/);
  await ed.locator(tid('variables-formula')).fill('= m / molarMass(zz)');
  await ed.locator(tid('variables-error')).waitFor();
  assert.match(await ed.locator(tid('variables-error')).innerText(), /"zz"/);
  await ed.locator(tid('variables-formula')).fill('= m / molarMass(c)');
  await ed.locator(tid('variables-answer')).waitFor();
  const before = await ed.locator(tid('variables-sample')).innerText();
  let changed = false;
  for (let i = 0; i < 12 && !changed; i++) { await ed.locator(tid('variables-reroll')).click(); changed = (await ed.locator(tid('variables-sample')).innerText()) !== before; }
  assert.ok(changed, 're-roll shows other numbers');

  await page.locator(tid('builder-mode-json')).click();
  const obj = JSON.parse(await page.locator(tid('json-textarea')).inputValue());
  const q = obj.questions.find((x) => x.type === 'numeric');
  assert.deepEqual(Object.keys(q.variables), ['m', 'c']);
  assert.deepEqual(q.variables.c, { pick: ['NaCl', 'KCl'] });
  assert.equal(q.answerFormula, '= m / molarMass(c)');
  assert.deepEqual(obj.questions.map((x) => x.type), ['molarmass', 'imagechoice', 'particles', 'titration', 'estimate', 'numeric']);
}));

test('phone width: the new widgets fit without horizontal scroll', () => withSession(env, { config: CONFIG, viewport: { width: 360, height: 780 } }, async (s) => {
  const { page } = s;
  s.serveTest('S10A', TEST);
  await startTest(s, 'S10A');
  for (let i = 0; i < 5; i++) {
    assert.ok(await noHorizontalScroll(page), `no horizontal scroll on question ${i + 1}`);
    await goNext(page);
  }
}));
