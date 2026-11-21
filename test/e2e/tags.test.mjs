// Question tags in the browser: a teacher creates a tag, tags questions and publishes; a second teacher sees it as a
// shared tag and cannot edit it; the owner renames it and the second teacher's builder shows the new name.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, newSession, tid, poll, waitText, unlockAdmin, addQuestion, withAdminKey } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const ANN = 'ann@school.org';
const BOB = 'bob@school.org';

/** A small shared Apps Script stand-in for the tag actions: the Tags rows and the published tests live in `state`. */
function tagsBackend() {
  const state = { tags: [], tests: {}, published: [] };
  const usage = (id) => {
    const tests = Object.values(state.tests).filter((t) => t.questions.some((q) => (q.tags || []).includes(id)));
    return { questions: tests.reduce((n, t) => n + t.questions.filter((q) => (q.tags || []).includes(id)).length, 0), tests: tests.length };
  };
  const handle = (body, email) => {
    switch (body.action) {
      case 'listTests': return { result: 'success', tests: [] };
      case 'getResults': case 'getLog': return { result: 'success', rows: [] };
      case 'getSubmissionCounts': return { result: 'success', counts: {} };
      case 'listTags': return { result: 'success', tags: state.tags.map((t) => ({ ...t, ownerName: t.ownerEmail.split('@')[0], usage: usage(t.id) })) };
      case 'publishTest': {
        const defs = Array.isArray(body.tagDefs) ? body.tagDefs : [];
        const used = [...new Set(body.test.questions.flatMap((q) => q.tags || []))];
        const missing = used.filter((id) => !defs.some((d) => d.id === id) && !state.tags.some((t) => t.id === id));
        if (missing.length) return { result: 'error', error: 'unknown_tag', ids: missing };
        const reply = [];
        for (const id of used) {
          const row = state.tags.find((t) => t.id === id);
          if (!row) {
            const d = defs.find((x) => x.id === id);
            const made = { id, ownerEmail: email, name: d.name, color: d.color, description: d.description || '', firstTestCode: body.test.code, mergedInto: '' };
            state.tags.push(made);
            reply.push({ ...made, applied: 'created' });
          } else reply.push({ ...row, applied: row.ownerEmail === email ? 'unchanged' : 'sheet_wins' });
        }
        state.tests[body.test.code] = body.test;
        state.published.push({ email, code: body.test.code, tagDefs: defs });
        return { result: 'success', updated: false, tags: reply };
      }
      case 'saveTag': {
        const row = state.tags.find((t) => t.id === body.tag.id);
        if (!row) return { result: 'error', error: 'not_on_sheet' };
        if (row.ownerEmail !== email) return { result: 'error', error: 'owner_only' };
        Object.assign(row, Object.fromEntries(['name', 'color', 'description'].filter((k) => body.tag[k] !== undefined).map((k) => [k, body.tag[k]])));
        return { result: 'success', tag: row };
      }
      default: return null;
    }
  };
  return { state, attach: (s, email) => { s.onGas = (body) => handle(body, email); } };
}

async function teacher(be, email) {
  const s = await newSession(env);
  await s.context.addInitScript((u) => {
    try { if (!sessionStorage.getItem('cw:user')) sessionStorage.setItem('cw:user', JSON.stringify({ name: u.split('@')[0], email: u, picture: null, provider: 'demo' })); } catch { /* ignore */ }
  }, email);
  await withAdminKey(s);
  be.attach(s, email);
  return s;
}

const editor = (page, i) => page.locator(tid('question-editor')).nth(i);
/** Question editors are collapsed accordions; open one before looking inside it. */
async function openEditor(page, i) {
  const toggle = editor(page, i).locator('.adm-q__toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}
const localTags = (page, email) => page.evaluate((e) => JSON.parse(localStorage.getItem(`cw:tags:${e}`) || '[]'), email);

async function newTestWith(page, url, code, nQuestions) {
  await unlockAdmin(page, url);
  await page.locator(tid('new-test')).click();
  await page.locator(tid('test-code')).waitFor();
  await page.locator(tid('test-code')).fill(code);
  await page.locator(tid('test-title')).fill(`Test ${code}`);
  for (let i = 0; i < nQuestions; i++) await addQuestion(page, 'truefalse');
}

async function publishAndWait(page) {
  await poll(async () => !(await page.locator(tid('publish-test')).isDisabled()), { message: 'publish enabled' });
  await page.locator(tid('publish-test')).click();
  await page.locator(tid('published-link')).waitFor({ state: 'visible' });
}

test('teachers share tags: create, tag 3 questions, publish, shared use without edit controls, rename shows for the other teacher', async () => {
  const be = tagsBackend();
  const a = await teacher(be, ANN);
  const b = await teacher(be, BOB);
  try {
    /* ---- 1. Teacher A creates a tag, tags 3 questions and publishes ---- */
    await newTestWith(a.page, a.url, 'TAGS1', 3);
    const q1 = editor(a.page, 0).locator(tid('q-tag-input'));
    await q1.fill('Ions');
    await q1.press('Enter');
    await editor(a.page, 0).locator('[data-testid^="tag-chip-tg_"]').waitFor();
    assert.equal((await localTags(a.page, ANN)).length, 1, 'Enter creates one local tag');
    const [local] = await localTags(a.page, ANN);
    assert.deepEqual([local.name, local.onSheet], ['Ions', false]);
    assert.match(local.id, /^tg_[0-9a-z]{6}$/);

    // questions 2 and 3: tick them and apply the tag
    await editor(a.page, 1).locator(tid('q-select')).check();
    await editor(a.page, 2).locator(tid('q-select')).check();
    await waitText(a.page.locator(tid('q-selected-count')), '2 selected');
    await a.page.locator(tid('tag-apply')).click();
    await a.page.locator(tid('apply-tag-select')).selectOption({ label: 'Ions' });
    await a.page.locator(tid('apply-tag-go')).click();
    for (const i of [0, 1, 2]) await editor(a.page, i).locator(`${tid(`tag-chip-${local.id}`)}`).waitFor();
    assert.equal((await localTags(a.page, ANN)).length, 1, 'applying an existing tag makes no new tag');

    // the filter hides questions without the tag
    await a.page.locator(tid('tag-filter')).selectOption('none');
    assert.equal(await a.page.locator(`${tid('question-editor')}:visible`).count(), 0);
    await a.page.locator(tid('tag-filter')).selectOption(local.id);
    assert.equal(await a.page.locator(`${tid('question-editor')}:visible`).count(), 3);

    await publishAndWait(a.page);
    const sent = be.state.published.find((p) => p.code === 'TAGS1');
    assert.deepEqual(sent.tagDefs.map((d) => [d.id, d.name]), [[local.id, 'Ions']], 'publish sends the definitions of the tags it uses');
    assert.ok(be.state.tests.TAGS1.questions.every((q) => q.tags.length === 1 && q.tags[0] === local.id));
    await poll(async () => (await localTags(a.page, ANN))[0].onSheet === true, { message: 'local tag marked onSheet' });

    /* ---- 2. The Sheet (mock) has the tag ---- */
    assert.deepEqual(be.state.tags.map((t) => [t.id, t.ownerEmail, t.name, t.firstTestCode]), [[local.id, ANN, 'Ions', 'TAGS1']]);

    /* ---- 3. Teacher B sees it under Shared tags, uses it, has no edit controls ---- */
    await newTestWith(b.page, b.url, 'TAGS2', 1);
    await b.page.locator(tid('q-tag-input')).first().click();
    await b.page.locator(tid('tag-group-shared')).waitFor();
    assert.equal(await b.page.locator(tid('tag-group-mine')).count(), 0, 'B has no tags of their own');
    await waitText(b.page.locator(tid('tag-group-shared')), /Ions/);
    await b.page.locator(tid(`tag-option-${local.id}`)).click();
    await editor(b.page, 0).locator(tid(`tag-chip-${local.id}`)).waitFor();
    assert.equal((await localTags(b.page, BOB)).length, 0, 'using a shared tag stores nothing locally');

    await b.page.locator(tid('tab-tags')).click();
    await b.page.locator(tid('tags-view')).waitFor();
    await b.page.locator(tid(`tag-shared-${local.id}`)).waitFor();
    await waitText(b.page.locator(tid(`tag-shared-${local.id}`)), /by ann/);
    for (const control of ['tag-edit', 'tag-delete', 'tag-merge']) assert.equal(await b.page.locator(tid(`${control}-${local.id}`)).count(), 0, `${control} is not offered for a shared tag`);
    await b.page.locator(tid('tags-mine-empty')).waitFor();

    /* ---- 4. A renames it; B's builder shows the new name ---- */
    await a.page.locator(tid('tab-tags')).click();
    await a.page.locator(tid(`tag-mine-${local.id}`)).waitFor();
    await waitText(a.page.locator(tid(`tag-mine-${local.id}`)), /3 questions in 1 test/);
    await a.page.locator(tid(`tag-edit-${local.id}`)).click();
    await a.page.locator(tid('tag-name')).fill('Ionic compounds');
    await a.page.locator(tid('tag-save')).click();
    await waitText(a.page.locator(tid(`tag-mine-${local.id}-chip`)), 'Ionic compounds');
    assert.equal(be.state.tags[0].name, 'Ionic compounds');

    await b.page.reload(); // the admin panel reopens on the last section, Tags
    await b.page.locator(tid('tags-view')).waitFor();
    await b.page.locator(tid('tab-builder')).click();
    await editor(b.page, 0).waitFor();
    await waitText(editor(b.page, 0).locator(tid(`tag-chip-${local.id}`)), 'Ionic compounds');

    assert.deepEqual([...a.errors, ...b.errors], []);
  } finally {
    await a.close();
    await b.close();
  }
});

test('publish with a tag the Sheet does not know shows which questions use it', async () => {
  const be = tagsBackend();
  const a = await teacher(be, ANN);
  try {
    await newTestWith(a.page, a.url, 'TAGS3', 2);
    await a.page.locator(tid('builder-mode-json')).click();
    const obj = JSON.parse(await a.page.locator(tid('json-textarea')).inputValue());
    obj.questions[1].tags = ['tg_zzzzzz'];
    await a.page.locator(tid('json-textarea')).fill(JSON.stringify(obj));
    await a.page.locator(tid('apply-json')).click();
    await a.page.locator(tid('builder-mode-visual')).click();
    await a.page.locator(tid('validation-warnings')).waitFor();
    await waitText(a.page.locator(tid('validation-warnings')), /Question 2/);
    await editor(a.page, 1).locator(tid('tag-chip-tg_zzzzzz')).waitFor();
    await waitText(editor(a.page, 1).locator(tid('tag-chip-tg_zzzzzz')), 'Unknown tag');

    await poll(async () => !(await a.page.locator(tid('publish-test')).isDisabled()), { message: 'publish enabled' });
    await a.page.locator(tid('publish-test')).click();
    await a.page.locator(tid('publish-tag-error')).waitFor({ state: 'visible' });
    assert.equal(await a.page.locator(tid('unknown-tag-q2')).count(), 1);
    assert.equal(await a.page.locator(tid('unknown-tag-q1')).count(), 0, 'only the question that uses the tag is listed');
    assert.equal(await a.page.locator(tid('published-link')).isVisible(), false, 'nothing was published');
    assert.deepEqual(be.state.published, []);
  } finally { await a.close(); }
});

test('importing a test with tag names: matches local tags, then asks about the rest', async () => {
  const be = tagsBackend();
  const a = await teacher(be, ANN);
  try {
    await a.context.addInitScript(([key, seed]) => { try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed)); } catch { /* ignore */ } },
      [`cw:tags:${ANN}`, [{ id: 'tg_ions01', name: 'Ions', color: 'violet', description: '', onSheet: false, updatedAt: '2026-01-01T00:00:00.000Z' }]]);
    await newTestWith(a.page, a.url, 'TAGS4', 2);
    await a.page.locator(tid('builder-mode-json')).click();
    const obj = JSON.parse(await a.page.locator(tid('json-textarea')).inputValue());
    obj.questions[0].tags = ['ions', 'Bonding'];
    obj.questions[1].tags = ['Bonding', 'Moles'];
    await a.page.locator(tid('json-textarea')).fill(JSON.stringify(obj));
    await a.page.locator(tid('apply-json')).click();

    await a.page.locator(tid('import-tags-modal')).waitFor();
    const listed = (await a.page.locator(tid('import-tags-list')).locator('li').allTextContents()).map((s) => s.trim());
    assert.deepEqual(listed, ['Bonding', 'Moles'], 'Ions matched the local tag, so only the new names are listed');
    await a.page.locator(tid('import-tags-create')).click();
    await a.page.locator(tid('import-tags-modal')).waitFor({ state: 'detached' });

    const stored = await localTags(a.page, ANN);
    assert.deepEqual(stored.map((t) => t.name).sort(), ['Bonding', 'Ions', 'Moles']);
    const ids = Object.fromEntries(stored.map((t) => [t.name, t.id]));
    assert.equal(ids.Ions, 'tg_ions01');
    await a.page.locator(tid('builder-mode-visual')).click();
    await openEditor(a.page, 0);
    await openEditor(a.page, 1);
    await editor(a.page, 0).locator(tid(`tag-chip-${ids.Ions}`)).waitFor();
    await editor(a.page, 0).locator(tid(`tag-chip-${ids.Bonding}`)).waitFor();
    await editor(a.page, 1).locator(tid(`tag-chip-${ids.Moles}`)).waitFor();
    assert.equal(await editor(a.page, 1).locator(tid(`tag-chip-${ids.Ions}`)).count(), 0);
    assert.deepEqual(a.errors, []);
  } finally { await a.close(); }
});

test('Admin > Tags: local tags can be created, recoloured and deleted, with an empty state first', async () => {
  const be = tagsBackend();
  const a = await teacher(be, ANN);
  try {
    await unlockAdmin(a.page, a.url);
    await a.page.locator(tid('tab-tags')).click();
    await a.page.locator(tid('tags-local-empty')).waitFor();
    await a.page.locator(tid('tag-new')).click();
    await a.page.locator(tid('tag-name')).fill('Acids');
    await a.page.locator(tid('tag-color-rose')).click();
    await a.page.locator(tid('tag-save')).click();
    const [t] = await localTags(a.page, ANN);
    assert.deepEqual([t.name, t.color], ['Acids', 'rose']);
    await a.page.locator(tid(`tag-local-${t.id}`)).waitFor();

    await a.page.locator(tid(`tag-edit-${t.id}`)).click();
    await a.page.locator(tid('tag-name')).fill('Acids and bases');
    await a.page.locator(tid('tag-color-green')).click();
    await a.page.locator(tid('tag-save')).click();
    await waitText(a.page.locator(tid(`tag-local-${t.id}-chip`)), 'Acids and bases');
    assert.equal((await localTags(a.page, ANN))[0].color, 'green');

    await a.page.locator(tid(`tag-delete-${t.id}`)).click();
    await a.page.locator(tid('confirm-action')).click();
    await a.page.locator(tid('tags-local-empty')).waitFor();
    assert.deepEqual(await localTags(a.page, ANN), []);
    assert.deepEqual(a.errors, []);
  } finally { await a.close(); }
});
