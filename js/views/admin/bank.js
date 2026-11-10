// Admin › Question bank (V4-02, S11): questions shared by all admins on this deployment, with tags (topic, unit,
// difficulty, NGSS). Search, filter, preview, insert a copy into the builder test, import every question of a test,
// edit tags, delete. Edits record who and when (Bank sheet).
import { h, mount, icon, toast, openModal, richText, renderMath } from '../../ui.js';
import { adminCall } from '../../lib/api.js';
import { hasAdminAuth } from '../../lib/admin-session.js';
import { resource } from '../../lib/store.js';
import { TYPE_LABELS, nextQuestionId } from '../../lib/schema.js';
import { loadTest } from '../../lib/tests.js';
import { field, emptyState, skeleton, fmtDate } from './common.js';
import { getBuilderTest, setBuilderTest } from './builder.js';

const TAGS = ['topic', 'unit', 'difficulty', 'ngss'];

/** Save one question to the bank (used by the builder's "Save to bank"). */
export async function saveToBank(ctx, question, tags = {}) {
  const q = JSON.parse(JSON.stringify(question));
  delete q.section;
  return adminCall('saveBankItem', { item: { question: q, tags } }, { gasUrl: ctx.config.GAS_WEB_APP_URL });
}

export function renderBank(root, ctx, { goSettings, go } = {}) {
  const gasUrl = ctx.config.GAS_WEB_APP_URL;
  if (!gasUrl || !hasAdminAuth()) {
    mount(root, emptyState('key', 'Connect the backend first', 'The question bank lives in the Google Sheet and is shared by every admin.', 'bank-no-auth'),
      goSettings ? h('button', { class: 'btn btn--primary', type: 'button', on: { click: goSettings } }, 'Open Settings') : null);
    return undefined;
  }
  let alive = true;
  let items = [];
  const bankRes = resource('bank', { fetch: async () => {
    const r = await adminCall('listBank', {}, { gasUrl });
    if (!r.ok) throw new Error(r.error || 'Request failed');
    return (r.data.items || []).filter((i) => i.question);
  } });
  const unsub = bankRes.subscribe((d) => { if (alive && d) { items = d; fillFilters(); draw(); } });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search questions', 'aria-label': 'Search the bank', dataset: { testid: 'bank-search' }, on: { input: () => draw() } });
  const filters = Object.fromEntries(TAGS.map((t) => [t, h('select', { class: 'select adm-select-sm', 'aria-label': `Filter by ${t}`, dataset: { testid: `bank-filter-${t}` }, on: { change: () => draw() } })]));
  const listEl = h('div', { class: 'stack', dataset: { testid: 'bank-list' } }, skeleton(3));

  const fillFilters = () => {
    for (const t of TAGS) {
      const vals = [...new Set(items.map((i) => String(i.tags?.[t] || '').trim()).filter(Boolean))].sort();
      const cur = filters[t].value;
      filters[t].replaceChildren(h('option', { value: '' }, `Any ${t === 'ngss' ? 'NGSS' : t}`), ...vals.map((v) => h('option', { value: v, selected: v === cur }, v)));
    }
  };
  function draw() {
    const q = search.value.trim().toLowerCase();
    const shown = items.filter((i) => {
      if (q && !JSON.stringify(i.question || {}).toLowerCase().includes(q) && !JSON.stringify(i.tags || {}).toLowerCase().includes(q)) return false;
      return TAGS.every((t) => !filters[t].value || String(i.tags?.[t] || '') === filters[t].value);
    });
    if (!items.length) { mount(listEl, emptyState('layers', 'The bank is empty', 'Save questions from the builder, or import every question from a test.', 'bank-empty')); return; }
    if (!shown.length) { mount(listEl, h('p', { class: 'muted', dataset: { testid: 'bank-no-match' } }, 'No questions match.')); return; }
    mount(listEl, ...shown.map((i) => h('article', { class: 'card adm-bank-item', dataset: { testid: `bank-item-${i.id}` } },
      h('div', { class: 'row row--wrap' },
        h('span', { class: 'pill pill--primary' }, TYPE_LABELS[i.question?.type] || i.question?.type || '?'),
        ...TAGS.filter((t) => i.tags?.[t]).map((t) => h('span', { class: 'pill' }, `${t === 'ngss' ? 'NGSS' : t}: ${i.tags[t]}`)),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: `bank-insert-${i.id}` }, on: { click: () => insert(i) } }, icon('plus', { size: 14 }), 'Insert'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => editTags(i) } }, 'Tags'),
        h('button', { class: 'btn btn--subtle btn--sm', type: 'button', 'aria-label': 'Delete from bank', on: { click: () => remove(i) } }, icon('trash', { size: 14 }))),
      richText(i.question?.text || '', 'p', 'adm-bank-item__text'),
      h('p', { class: 'faint' }, `Added by ${i.added_by || '—'} ${fmtDate(i.added_at)}${i.edited_by ? ` · edited by ${i.edited_by} ${fmtDate(i.edited_at)}` : ''}`))));
    renderMath(listEl);
  }
  async function load({ force = false } = {}) {
    try { items = await bankRes.get({ force: force || undefined }); } catch (e) {
      if (alive && bankRes.peek() === undefined) mount(listEl, h('p', { class: 'notice notice--error' }, icon('alert'), h('span', {}, e.message)));
      return;
    }
    if (!alive) return;
    fillFilters(); draw();
  }
  function insert(i) {
    const t = getBuilderTest();
    const q = JSON.parse(JSON.stringify(i.question));
    q.id = nextQuestionId(t.questions || []);
    delete q.section;
    setBuilderTest({ ...t, questions: [...(t.questions || []), q] });
    toast(`Added to ${t.code || 'the builder test'} as question ${t.questions.length + 1}`, { type: 'success' });
  }
  function editTags(i) {
    const inputs = Object.fromEntries(TAGS.map((t) => [t, h('input', { class: 'input', value: i.tags?.[t] || '', dataset: { testid: `bank-tag-${t}` } })]));
    openModal({ title: 'Tags', testid: 'bank-tags-modal', body: h('div', { class: 'stack' }, ...TAGS.map((t) => field(t === 'ngss' ? 'NGSS standard' : t[0].toUpperCase() + t.slice(1), inputs[t]))),
      actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Save', variant: 'primary', testid: 'bank-tags-save', onClick: async (close) => {
        const tags = Object.fromEntries(TAGS.map((t) => [t, inputs[t].value.trim()]).filter(([, v]) => v));
        close();
        const done = await bankRes.optimistic((d) => (d || []).map((x) => (x.id === i.id ? { ...x, tags } : x)),
          () => adminCall('saveBankItem', { item: { id: i.id, question: i.question, tags } }, { gasUrl }), { message: 'Could not save the tags' });
        if (done.ok) toast('Tags saved', { type: 'success' });
      } }] });
  }
  function remove(i) {
    openModal({ title: 'Delete from the bank?', testid: 'bank-delete-modal', body: 'Tests that already use a copy of this question keep it.',
      actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Delete', variant: 'danger', onClick: async (close) => {
        close();
        const done = await bankRes.optimistic((d) => (d || []).filter((x) => x.id !== i.id), () => adminCall('deleteBankItem', { id: i.id }, { gasUrl }), { message: 'Could not delete the question' });
        if (done.ok) toast('Deleted', { type: 'success' });
      } }] });
  }
  function importFromTest() {
    const code = h('input', { class: 'input', placeholder: 'e.g. CHEM101', dataset: { testid: 'bank-import-code' } });
    const topic = h('input', { class: 'input', placeholder: 'Optional topic tag', dataset: { testid: 'bank-import-topic' } });
    const err = h('p', { class: 'field-error', role: 'alert' });
    openModal({ title: 'Import questions from a test', testid: 'bank-import-modal', body: h('div', { class: 'stack' }, field('Test code', code), field('Topic', topic), err),
      actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Import', variant: 'primary', testid: 'bank-import-go', onClick: async (close) => {
        try {
          const { test } = await loadTest(code.value, { config: ctx.config, includeDrafts: true });
          let n = 0;
          for (const q of test.questions) { const r = await saveToBank(ctx, q, topic.value.trim() ? { topic: topic.value.trim(), unit: test.title } : { unit: test.title }); if (r.ok) n++; }
          close(); toast(`${n} question${n === 1 ? '' : 's'} added to the bank`, { type: 'success' }); load({ force: true });
        } catch (e) { err.textContent = e.message; }
      } }] });
  }
  mount(root, h('div', { class: 'stack', dataset: { testid: 'bank' } },
    h('div', { class: 'row row--wrap' }, h('h2', { class: 'adm-h2' }, 'Question bank'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'bank-import' }, on: { click: importFromTest } }, icon('download', { size: 16 }), 'Import from a test'),
      go ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => go('builder') } }, icon('grid', { size: 16 }), 'Open builder') : null),
    h('p', { class: 'muted' }, 'Shared by every admin. Inserting copies the question into the test open in the builder.'),
    h('div', { class: 'row row--wrap adm-toolbar--wrap' }, search, ...Object.values(filters)),
    listEl));
  load();
  return () => { alive = false; unsub(); };
}
