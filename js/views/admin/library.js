// Admin "Library" tab: bundled tests, local drafts, and tests published to the Google Sheet.
import { h, mount, icon, toast, openModal } from '../../ui.js';
import { CONFIG } from '../../config.js';
import { load, save } from '../../lib/storage.js';
import { adminKey, hasAdminAuth } from '../../lib/admin-session.js';
import { duplicateTest, versionTest, suggestCopyCode, validateNewCode } from '../../lib/versions.js';
import { loadCatalog, loadTest, getDrafts, deleteDraft } from '../../lib/tests.js';
import { resource } from '../../lib/store.js';
import { tagIdsOf } from '../../lib/tags.js';
import { currentLookup } from './tag-picker.js';
import { normalizeTest } from '../../lib/schema.js';
import { deletePublishedTest, fetchPublishedTest, listTestsSummary } from '../../lib/api.js';
import { skeleton, emptyState, copyText, fmtDate, round2, iconButton } from './common.js';

const points = (t) => round2((t.questions || []).reduce((s, q) => s + (Number(q.points) || 0), 0));

export function testLink(code) {
  return new URL(`?code=${encodeURIComponent(code)}`, location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '')).href;
}

// V4-01 library view state (card grid / table, search, filters); the view mode is remembered per device.
const L = { query: '', filters: new Set(), tag: '' };
export function setLibraryQuery(q) { L.query = String(q || ''); L.filters = new Set(); }
export const LIBRARY_FILTERS = ['published', 'submissions', 'grading'];

/** Pure: does a library item pass the search text and the active filters? counts = { CODE: n }, grading = Set of codes. */
export function matchesLibraryFilter(item, { query = '', filters = [], counts = null, grading = null, tag = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (q && !`${item.code} ${item.title || ''}`.toLowerCase().includes(q)) return false;
  const f = new Set(filters);
  const code = String(item.code || '').toUpperCase();
  if (f.has('published') && item.source !== 'published') return false;
  if (f.has('submissions') && !(counts && Number(counts[code]) > 0)) return false;
  if (f.has('grading') && !(grading && grading.has(code))) return false;
  if (tag && !(item.tags || (item.test ? tagIdsOf(item.test) : [])).includes(tag)) return false;
  return true;
}

export function renderLibrary(root, ctx, { openInBuilder, goSettings, goGrading }) {
  let needGrading = null; // Set of upper-case codes with submissions waiting to be graded (V4-01 filter), null = unknown
  let alive = true;
  const unsubs = [];
  const knownCodes = new Set(); // every code in the library (bundled, drafts, published): new codes must not clash
  let counts = null; // { CODE: n } once loaded with the admin key; null = unavailable (no counts shown)
  const body = h('div', { class: 'stack adm-library' }, skeleton(4));
  mount(root, body);

  const stat = (iconName, text) => h('span', { class: 'adm-stat' }, icon(iconName, { size: 14 }), text);

  const countStat = (code) => {
    const n = Number(counts[String(code).toUpperCase()]) || 0;
    return h('span', { class: 'adm-stat', dataset: { testid: `submission-count-${code}` } }, icon('sheet', { size: 14 }), `${n} submission${n === 1 ? '' : 's'}`);
  };

  function buildActions(item) {
    const { code, test, source } = item;
    const actions = h('div', { class: 'adm-item__actions' });
    const add = (iconName, label, onClick, testid, extra = {}) => actions.appendChild(iconButton(iconName, label, onClick, { testid, ...extra }));
    const can = !!test || !!item.lazy;
    // Store-backed items carry only summary fields: the full test loads when an action needs it.
    const withTest = (fn) => async () => {
      const t = await resolveTest(item);
      if (t) fn(t); else toast('Could not load this test', { type: 'error' });
    };
    add('list', 'Edit in builder', withTest((t) => openInBuilder(t, { duplicate: false })), `edit-${code}`, { disabled: !can });
    add('eye', 'Preview as a student', withTest((t) => ctx.navigate('runner', { test: t, source, preview: true })), `preview-${code}`, { disabled: !can });
    // Drafts live only in this browser, so students cannot open them by link.
    if (source !== 'draft') {
      actions.appendChild(h('button', { class: 'btn btn--ghost btn--sm adm-item__link', type: 'button', title: 'Students open this link, sign in with Google, and the test starts',
        dataset: { testid: `copy-link-${code}` }, on: { click: async () => {
          const ok = await copyText(testLink(code));
          toast(ok ? `Student link copied: ${testLink(code)}` : 'Could not copy link', { type: ok ? 'success' : 'error', timeout: 5000 });
        } } }, icon('copy', { size: 14 }), 'Copy student link'));
    }
    add('copy', 'Duplicate into builder', withTest((t) => openInBuilder({ ...t, code: `${code}_COPY`.slice(0, 32) }, { duplicate: true })), `duplicate-${code}`, { disabled: !can });
    add('layers', 'Duplicate with a new code', withTest(askDuplicate), `duplicate-new-${code}`, { disabled: !can });
    add('sort', 'Make version B (shuffled questions and options)', withTest(makeVersionB), `version-b-${code}`, { disabled: !can });
    add('download', 'Print test (student copy or answer key)', withTest(askPrint), `print-${code}`, { disabled: !can });
    if (source !== 'bundled') {
      add('trash', source === 'draft' ? 'Delete draft' : 'Delete published test', () => confirmDelete(code, source), `delete-${code}`, { className: 'icon-btn--danger' });
    }
    if (goGrading && counts && Number(counts[String(code).toUpperCase()]) > 0) add('pen', 'Grade submissions', () => goGrading(code), `grade-${code}`);
    return actions;
  }

  function itemEl(item) {
    const { code, title, test, source, note } = item;
    const actions = buildActions(item);
    return h('li', { class: 'adm-item', dataset: { testid: `library-item-${code}`, source } },
      h('span', { class: 'adm-item__code' }, code),
      h('div', { class: 'adm-item__main' },
        h('strong', { class: 'adm-item__title' }, title || '(untitled)'),
        h('div', { class: 'adm-item__stats' },
          !test && item.questionCount != null ? [stat('list', `${item.questionCount} question${item.questionCount === 1 ? '' : 's'}`), stat('check', `${round2(item.points || 0)} pts`),
            item.timeLimitMinutes ? stat('clock', `${item.timeLimitMinutes} min`) : null] : null,
          test ? [stat('list', `${test.questions.length} question${test.questions.length === 1 ? '' : 's'}`), stat('check', `${points(test)} pts`),
            stat('clock', test.timeLimitMinutes ? `${test.timeLimitMinutes} min` : 'Untimed'),
            test.singleSubmission ? h('span', { class: 'adm-stat adm-stat--tag', dataset: { testid: `test-single-submission-${code}` } }, icon('lock', { size: 14 }), '1 attempt') : null] : null,
          counts ? countStat(code) : null,
          note ? h('span', { class: 'faint' }, note) : null)),
      actions);
  }

  function askDuplicate(test) {
    const input = h('input', { class: 'input', type: 'text', maxlength: '32', value: suggestCopyCode(test.code, knownCodes), 'aria-label': 'New test code', dataset: { testid: 'duplicate-code' } });
    const err = h('span', { class: 'field-error', role: 'alert', dataset: { testid: 'duplicate-error' } });
    openModal({
      title: `Duplicate ${test.code}`, testid: 'duplicate-modal',
      body: h('div', { class: 'stack' }, h('p', {}, 'The copy opens in the builder as a draft. Choose a code that is not used yet.'), h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'New code'), input), err),
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        { label: 'Duplicate', variant: 'primary', testid: 'duplicate-confirm', onClick: (close) => {
          const msg = validateNewCode(input.value, knownCodes);
          if (msg) { err.textContent = msg; input.focus(); return; }
          close();
          openInBuilder(duplicateTest(test, input.value), { duplicate: true });
        } },
      ],
    });
    setTimeout(() => input.select(), 0);
  }

  function makeVersionB(test) {
    const copy = versionTest(test, { label: 'B', existingCodes: knownCodes });
    toast(`Version B created as ${copy.code}. Review it, then save or publish.`, { type: 'success' });
    openInBuilder(copy, { duplicate: true });
  }

  function askPrint(test) {
    const version = h('select', { class: 'select adm-select-sm', 'aria-label': 'Version', dataset: { testid: 'print-version' } }, h('option', { value: 'A' }, 'Version A (as written)'), h('option', { value: 'B' }, 'Version B (shuffled)'));
    const run = async (key, close) => {
      close();
      try {
        const { printTest } = await import('./print-test.js');
        await printTest({ test, key, version: version.value });
      } catch (e) { toast(`Could not print: ${e && e.message ? e.message : 'unavailable'}`, { type: 'error' }); }
    };
    openModal({
      title: `Print ${test.code}`, testid: 'print-modal',
      body: h('div', { class: 'stack' }, h('p', {}, 'Opens your browser print dialog. The student copy has no answers; the answer key shows them. Drawing and graph questions leave an answer box.'), h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Version'), version)),
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        { label: 'Answer key', variant: 'ghost', testid: 'print-key', onClick: (close) => run(true, close) },
        { label: 'Student copy', variant: 'primary', testid: 'print-student', onClick: (close) => run(false, close) },
      ],
    });
  }

  function confirmDelete(code, source) {
    openModal({
      title: `Delete ${code}?`, testid: 'confirm-delete-test',
      body: source === 'draft' ? 'This draft will be removed from this device.' : 'This removes the published test from the Google Sheet. Students will no longer be able to open it with this code.',
      actions: [
        { label: 'Cancel', variant: 'ghost', autofocus: true },
        { label: 'Delete', variant: 'danger', testid: 'confirm-action', onClick: async (close) => {
          close();
          await storeDelete(code, source);
        } },
      ],
    });
  }

  const section = (title, hint, content, testid) => h('section', { class: 'card adm-section', dataset: { testid } },
    h('div', { class: 'adm-section__head' }, h('h3', { class: 'adm-h3' }, title), hint ? h('span', { class: 'faint' }, hint) : null), content);

  async function refresh() {
    return refreshStore();
  }


  /* ---- V5-11: library on the data store (one summary list, no per-test fetches, patched in place) ---- */
  const gasUrlNow = () => CONFIG.GAS_WEB_APP_URL;
  const catalogRes = resource('catalog', { ttl: 600000, fetch: async () => (await loadCatalog()) || [] });
  const testsRes = resource('tests', { fetch: async (signal) => {
    const r = await listTestsSummary({ gasUrl: gasUrlNow(), adminKey: adminKey() });
    if (signal && signal.aborted) return null;
    if (!r.ok) throw new Error(r.error || 'unknown error');
    return Array.isArray(r.data.tests) ? r.data.tests : [];
  } });
  let storeErr = '';
  const pubAvailable = () => !!(gasUrlNow() && hasAdminAuth());

  async function resolveTest(item) {
    if (item.test) return item.test;
    try {
      if (item.source === 'bundled') item.test = (await loadTest(item.code, { config: {} })).test;
      else if (item.source === 'published') { const raw = await fetchPublishedTest(item.code, { gasUrl: gasUrlNow() }); item.test = raw ? normalizeTest(raw) : null; }
    } catch { item.test = null; }
    return item.test;
  }

  function paintStore() {
    if (!alive) return;
    const catalog = catalogRes.peek() || [];
    const summary = pubAvailable() ? testsRes.peek() : null;
    catalog.forEach((c) => knownCodes.add(String(c.code).toUpperCase()));
    const bundled = catalog.map((c) => ({ code: c.code, title: c.title, source: 'bundled', lazy: true, questionCount: c.questionCount, points: c.points, timeLimitMinutes: c.timeLimitMinutes, test: null, note: '' }));
    const drafts = Object.values(getDrafts()).map((d) => {
      let test = null;
      try { test = normalizeTest(d); } catch { /* shown without stats */ }
      return { code: d.code, title: d.title, test, updatedAt: d.updatedAt, source: 'draft', note: test ? '' : 'Needs repair' };
    }).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    drafts.forEach((d) => knownCodes.add(String(d.code).toUpperCase()));
    let pubItems = null;
    let publishedContent;
    counts = null; needGrading = null;
    if (pubAvailable()) {
      if (summary) {
        counts = {}; needGrading = new Set();
        summary.forEach((t) => {
          const k = String(t.code).toUpperCase();
          knownCodes.add(k);
          counts[k] = Number(t.submissionCount) || 0;
          if (t.needsGrading) needGrading.add(k);
        });
        pubItems = summary.map((t) => ({ code: t.code, title: t.title, source: 'published', lazy: true, questionCount: t.questionCount, points: t.points, test: null, note: t.updatedAt ? `Updated ${fmtDate(t.updatedAt)}` : '' }));
        publishedContent = emptyState('sheet', 'Nothing published yet', 'Use “Publish to Sheet” in the builder.');
      } else {
        publishedContent = storeErr
          ? h('div', { class: 'notice notice--error' }, icon('alert'), h('span', {}, `Could not load published tests: ${storeErr}. Check your admin key in Settings.`))
          : skeleton(2);
      }
    } else {
      publishedContent = h('div', { class: 'notice notice--info' }, icon('info'),
        h('span', {}, 'Publishing needs an Apps Script URL and your admin key. ',
          h('a', { href: '#settings', on: { click: (e) => { e.preventDefault(); goSettings(); } } }, 'Open Settings')));
    }
    drawV2({ bundled, drafts, pubItems, publishedContent });
  }

  async function refreshStore() {
    // Cached data paints at once; the skeleton shows only on the very first load.
    if (catalogRes.peek() === undefined) mount(body, skeleton(4));
    unsubs.push(testsRes.subscribe(paintStore), catalogRes.subscribe(paintStore));
    await catalogRes.get().catch(() => {});
    paintStore();
    if (pubAvailable()) {
      try { storeErr = ''; await testsRes.get(); } catch (e) { storeErr = e && e.message ? e.message : 'unknown error'; paintStore(); }
    }
  }

  async function storeDelete(code, source) {
    const key = String(code);
    const el = [...body.querySelectorAll('[data-source]')].find((n) => n.dataset.testid === `library-item-${key}` && n.dataset.source === source);
    if (el && !matchMedia('(prefers-reduced-motion: reduce)').matches) { el.classList.add('is-leaving'); await new Promise((r) => setTimeout(r, 180)); }
    if (source === 'draft') { // local only: no network request
      deleteDraft(code);
      toast(`Draft ${code} deleted`, { type: 'success' });
      paintStore();
      return;
    }
    const out = await testsRes.optimistic((list) => (list || []).filter((t) => String(t.code).toUpperCase() !== key.toUpperCase()),
      () => deletePublishedTest(code, { gasUrl: gasUrlNow(), adminKey: adminKey() }), { message: `Could not delete ${code}` });
    if (out.ok) toast(`Deleted ${code}`, { type: 'success' });
  }

  /* ---- V4-01: card grid / table, search, filters ---- */
  function rowEl(item, i) {
    const { code, title, test, source, note } = item;
    const n = counts ? Number(counts[String(code).toUpperCase()]) || 0 : null;
    return h('tr', { dataset: { testid: `library-item-${code}`, source }, style: `--i:${Math.min(i, 12)}` },
      h('td', {}, h('span', { class: 'adm-item__code' }, code)),
      h('td', {}, h('strong', {}, title || '(untitled)'), note ? h('div', { class: 'faint' }, note) : null),
      h('td', {}, test ? `${test.questions.length} q · ${points(test)} pts` : item.questionCount != null ? `${item.questionCount} q · ${round2(item.points || 0)} pts` : '—'),
      h('td', {}, test ? (test.timeLimitMinutes ? `${test.timeLimitMinutes} min` : 'Untimed') : item.questionCount != null ? (item.timeLimitMinutes ? `${item.timeLimitMinutes} min` : 'Untimed') : '—'),
      h('td', {}, n == null ? '—' : h('span', { dataset: { testid: `submission-count-${code}` } }, String(n))),
      h('td', {}, source === 'published' ? 'Published' : source === 'draft' ? 'Draft' : 'Bundled'),
      h('td', {}, buildActions(item)));
  }

  function drawV2({ bundled, drafts, pubItems, publishedContent }) {
    const view = () => load('adminLibView', 'grid');
    const host = h('div', { class: 'stack', dataset: { testid: 'library-sections' } });
    const pass = (it) => matchesLibraryFilter(it, { query: L.query, filters: [...L.filters], counts, grading: needGrading, tag: L.tag });
    const listFor = (items, empty) => {
      if (!items.length) return empty;
      const shown = items.filter(pass);
      if (!shown.length) return h('p', { class: 'lib2-empty', dataset: { testid: 'library-no-match' } }, 'No tests match your search or filters.');
      if (view() === 'table') {
        return h('div', { class: 'lib2-table-wrap' }, h('table', { class: 'lib2-table', dataset: { testid: 'library-table' } },
          h('thead', {}, h('tr', {}, ['Code', 'Title', 'Size', 'Time', 'Submissions', 'Where', 'Actions'].map((c) => h('th', { scope: 'col' }, c)))),
          h('tbody', {}, shown.map(rowEl))));
      }
      return h('ul', { class: 'adm-items lib2-grid', dataset: { testid: 'library-grid' } }, shown.map((it, i) => { const li = itemEl(it); li.style.setProperty('--i', String(Math.min(i, 12))); return li; }));
    };
    const paint = () => mount(host,
      section('Bundled (data/tests)', 'Committed to the repository',
        listFor(bundled, emptyState('flask', 'No bundled tests', 'Add JSON files to data/tests/ and list them in index.json.')), 'library-bundled'),
      section('Drafts on this device', 'Stored in this browser only',
        listFor(drafts, emptyState('list', 'No drafts yet', 'Save a draft from the builder and it will show up here.')), 'library-drafts'),
      section('Published to Google Sheet', 'Available to students by code', pubItems ? listFor(pubItems, publishedContent) : publishedContent, 'library-published'));
    const search = h('input', { class: 'input adm-search', type: 'search', placeholder: 'Search tests by code or title', 'aria-label': 'Search tests', value: L.query, dataset: { testid: 'lib-search' },
      on: { input: () => { L.query = search.value; paint(); } } });
    const chipDefs = [['published', 'Published', 'sheet', true], ['submissions', 'Has submissions', 'inbox', !!counts], ['grading', 'Needs grading', 'pen', !!needGrading]];
    const chips = chipDefs.map(([id, label, ic, ok]) => h('button', { class: 'lib2-chip', type: 'button', 'aria-pressed': String(L.filters.has(id)), disabled: !ok,
      title: ok ? '' : 'Needs the Google Sheet and your admin key', dataset: { testid: `lib-filter-${id}` },
      on: { click: (e) => { if (L.filters.has(id)) L.filters.delete(id); else L.filters.add(id); e.currentTarget.setAttribute('aria-pressed', String(L.filters.has(id))); paint(); } } }, icon(ic, { size: 16 }), label));
    const viewBtns = ['grid', 'table'].map((m) => h('button', { type: 'button', title: m === 'grid' ? 'Card view' : 'Table view', 'aria-label': m === 'grid' ? 'Card view' : 'Table view', 'aria-pressed': String(view() === m),
      dataset: { testid: `lib-view-${m}` }, on: { click: () => { save('adminLibView', m); viewBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(['grid', 'table'][k] === m))); paint(); } } }, icon(m === 'grid' ? 'grid' : 'list', { size: 18 })));
    const allItems = [...bundled, ...drafts, ...(pubItems || [])];
    const usedTags = [...new Set(allItems.flatMap((it) => it.tags || (it.test ? tagIdsOf(it.test) : [])))];
    const look = currentLookup();
    const tagSel = usedTags.length ? h('select', { class: 'select select--sm', 'aria-label': 'Filter by tag', dataset: { testid: 'lib-filter-tag' },
      on: { change: (e) => { L.tag = e.currentTarget.value; paint(); } } },
      h('option', { value: '' }, 'Any tag'), usedTags.map((id) => h('option', { value: id, selected: id === L.tag }, look.get(id)?.name || 'Unknown tag'))) : null;
    mount(body, h('div', { class: 'lib2-bar' }, search, h('div', { class: 'lib2-chips', role: 'group', 'aria-label': 'Filters' }, chips, tagSel), h('div', { class: 'lib2-view', role: 'group', 'aria-label': 'View' }, viewBtns)), host);
    paint();
  }

  refresh();
  return () => { alive = false; unsubs.forEach((u) => u()); catalogRes.cancel(); testsRes.cancel(); };
}
