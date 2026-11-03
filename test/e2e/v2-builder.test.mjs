import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, tid, waitText, waitAttr, unlockAdmin, addQuestion } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const editor = (page, i) => page.locator(tid('question-editor')).nth(i);
const jsonOf = async (page) => {
  await page.locator(tid('builder-mode-json')).click();
  const text = await page.locator(tid('json-textarea')).inputValue();
  return { text, obj: JSON.parse(text) };
};

test('builder v2: sections, references, orbital question and Lewis charges round-trip', () => withSession(env, {}, async ({ page, url }) => {
  await unlockAdmin(page, url);
  await page.locator(tid('new-test')).click();
  await page.locator(tid('test-code')).waitFor();
  await page.locator(tid('test-code')).fill('V2B');
  await page.locator(tid('test-title')).fill('V2 builder test');

  // ----- sections -----
  await page.locator(tid('sections-editor')).waitFor();
  await page.locator(tid('add-section')).click();
  await page.locator(tid('section-title-0')).fill('Part A: Bonding');
  await page.locator(tid('section-instructions-0')).fill('Show your work with $\\ce{H2O}$.');
  await page.locator(tid('add-section')).click();
  await page.locator(tid('section-title-1')).fill('Part B: Orbitals');
  await waitText(page.locator(tid('section-points-0')), /0 pts · 0 questions/);

  // ----- references -----
  await page.locator(tid('add-reference-periodic-table')).click();
  assert.ok(await page.locator(tid('add-reference-periodic-table')).isDisabled(), 'only one periodic table');
  await page.locator(tid('add-reference-text')).click();
  await page.locator(tid('ref-title-1')).fill('Constants');
  await page.locator(tid('ref-content-1')).fill('$R = 8.314$ J/(mol·K)');
  await page.locator(tid('add-reference-image')).click();
  await page.locator(tid('ref-title-2')).fill('Chart');
  await page.locator(tid('ref-url-2')).fill('https://example.test/chart.png');
  await page.locator(tid('ref-alt-2')).fill('Solubility chart');
  await page.locator(tid('ref-down-1')).click(); // text <-> image
  assert.equal(await page.locator(tid('ref-title-1')).inputValue(), 'Chart');
  await page.locator(tid('ref-up-2')).click(); // and back
  assert.equal(await page.locator(tid('ref-title-1')).inputValue(), 'Constants');
  await page.locator(tid('ref-delete-2')).click(); // drop the image reference again
  assert.equal(await page.locator(tid('reference-row')).count(), 2);

  // ----- questions -----
  await addQuestion(page, 'mcq');
  await page.locator(tid('q-text')).first().fill('Which gas makes up most of air?');
  await page.locator(tid('option-text-0')).fill('Oxygen');
  await page.locator(tid('option-text-1')).fill('Nitrogen');
  await page.locator(tid('option-correct-1')).check();
  await page.locator(tid('q-points')).first().fill('1');

  await addQuestion(page, 'orbital');
  assert.equal(await editor(page, 1).locator(tid('q-section')).inputValue(), '', 'new question after an unsectioned one is unsectioned');
  await editor(page, 1).locator(tid('q-section')).selectOption('sec2');
  await waitText(page.locator(tid('section-points-1')), /2 pts · 1 question/);
  await editor(page, 1).locator(tid('orbital-max')).selectOption('3d');
  await editor(page, 1).locator(tid('orbital-type-d')).check();
  await waitText(editor(page, 1).locator(tid('orbital-sublevels')), /1s 2s 2p 3s 3p 4s 3d$/);

  await addQuestion(page, 'structure');
  assert.equal(await editor(page, 2).locator(tid('q-section')).inputValue(), 'sec2', 'new question joins the last question\'s section');
  await editor(page, 2).locator(tid('q-section')).selectOption('sec1');
  // the list is reordered: mcq, structure (sec1), orbital (sec2)
  const st = editor(page, 1);
  await st.locator(tid('structure-charge')).waitFor();
  await st.locator(tid('q-points')).fill('3');
  await st.locator('label.adm-switch').filter({ has: page.locator(tid('structure-student-charges')) }).click();
  assert.ok(await st.locator(tid('structure-student-charges')).isChecked());
  await st.locator(tid('structure-key-bracket')).check();
  await st.locator(tid('structure-key-charge')).fill('-1');
  await st.locator(tid('atom-fc-0')).fill('-1');
  await st.locator(tid('structure-preview')).waitFor();

  // grouping + calculated totals
  await waitText(page.locator(tid('section-points-0')), /3 pts · 1 question/);
  await waitText(page.locator(tid('section-points-1')), /2 pts · 1 question/);
  await page.locator(tid('builder-section-sec1')).waitFor();
  await page.locator(tid('builder-section-sec2')).waitFor();
  await waitAttr(page.locator(tid('validation-errors')), 'data-count', '0');

  // ----- JSON -----
  const { text, obj } = await jsonOf(page);
  assert.ok(text.includes('"sections"'));
  assert.ok(text.includes('"references"'));
  assert.ok(text.includes('"studentCharges": true'));
  assert.ok(text.includes('"maxSublevel": "3d"'));
  assert.deepEqual(obj.questions.map((q) => q.type), ['mcq', 'structure', 'orbital']);
  assert.deepEqual(obj.questions.map((q) => q.section ?? null), [null, 'sec1', 'sec2']);
  assert.equal(obj.sections.length, 2);
  assert.deepEqual(obj.references.map((r) => r.type), ['periodic-table', 'text']);
  assert.equal(obj.questions[1].correctAnswer.bracket, true);
  assert.equal(obj.questions[1].correctAnswer.charge, -1);
  assert.deepEqual(Object.values(obj.questions[1].correctAnswer.formalCharges), [-1]);
  await page.locator(tid('builder-mode-visual')).click();
  await page.locator(tid('sections-editor')).waitFor();
  await waitAttr(page.locator(tid('validation-errors')), 'data-count', '0');

  // ----- delete section 1: its question is kept, unsectioned -----
  await page.locator(tid('section-delete-0')).click();
  await page.locator(tid('confirm-action')).click();
  await page.locator(tid('builder-section-sec1')).waitFor({ state: 'detached' });
  assert.equal(await page.locator(tid('question-editor')).count(), 3);
  assert.equal(await editor(page, 1).locator(tid('q-section')).inputValue(), '');
  assert.equal(await page.locator(tid('section-title-0')).inputValue(), 'Part B: Orbitals');
  await waitText(page.locator(tid('section-points-0')), /2 pts · 1 question/);
  await waitAttr(page.locator(tid('validation-errors')), 'data-count', '0');

  // ----- save draft, reload, reopen from the library -----
  await page.locator(tid('save-draft')).click();
  await waitText(page.locator(tid('toast')).last(), /Draft V2B saved/);
  await page.reload();
  await page.locator(tid('admin')).waitFor();
  await page.locator(tid('tab-library')).click();
  await page.locator(tid('edit-V2B')).click();
  await page.locator(tid('sections-editor')).waitFor();
  assert.equal(await page.locator(tid('section-title-0')).inputValue(), 'Part B: Orbitals');
  assert.equal(await page.locator(tid('reference-row')).count(), 2);
  assert.equal(await page.locator(tid('ref-content-1')).inputValue(), '$R = 8.314$ J/(mol·K)');
  assert.equal(await page.locator(tid('question-editor')).count(), 3);
  assert.equal(await editor(page, 2).locator(tid('q-section')).inputValue(), 'sec2');
  await waitAttr(page.locator(tid('validation-errors')), 'data-count', '0');

  // ----- preview shows question cards -----
  await page.locator(tid('preview-test')).click();
  await page.locator(tid('preview-banner')).waitFor();
  await page.locator(tid('question-card')).first().waitFor();
  assert.ok((await page.locator(tid('question-card')).count()) >= 1);
}));
