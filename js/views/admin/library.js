// Admin "Library" tab: bundled tests, local drafts, and tests published to the Google Sheet.
import { h, mount, icon, toast, openModal } from '../../ui.js';
import { CONFIG } from '../../config.js';
import { load } from '../../lib/storage.js';
import { loadCatalog, loadTest, getDrafts, deleteDraft } from '../../lib/tests.js';
import { normalizeTest } from '../../lib/schema.js';
import { listPublishedTests, deletePublishedTest, fetchPublishedTest } from '../../lib/api.js';
import { skeleton, emptyState, copyText, fmtDate, round2, iconButton } from './common.js';

const points = (t) => round2((t.questions || []).reduce((s, q) => s + (Number(q.points) || 0), 0));

export function testLink(code) {
  return new URL(`test?code=${encodeURIComponent(code)}`, location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '')).href;
}

export function renderLibrary(root, ctx, { openInBuilder, goSettings }) {
  let alive = true;
  const body = h('div', { class: 'stack adm-library' }, skeleton(4));
  mount(root, body);

  const stat = (iconName, text) => h('span', { class: 'adm-stat' }, icon(iconName, { size: 14 }), text);

  function itemEl({ code, title, test, source, note }) {
    const actions = h('div', { class: 'adm-item__actions' });
    const add = (iconName, label, onClick, testid, extra = {}) => actions.appendChild(iconButton(iconName, label, onClick, { testid, ...extra }));
    const can = !!test;
    add('list', 'Edit in builder', () => openInBuilder(test, { duplicate: false }), `edit-${code}`, { disabled: !can });
    add('eye', 'Preview as a student', () => ctx.navigate('runner', { test, source, preview: true }), `preview-${code}`, { disabled: !can });
    add('right', 'Copy student link', async () => {
      const ok = await copyText(testLink(code));
      toast(ok ? 'Link copied' : 'Could not copy link', { type: ok ? 'success' : 'error' });
    }, `copy-link-${code}`);
    add('copy', 'Duplicate into builder', () => openInBuilder({ ...test, code: `${code}_COPY`.slice(0, 32) }, { duplicate: true }), `duplicate-${code}`, { disabled: !can });
    if (source !== 'bundled') {
      add('trash', source === 'draft' ? 'Delete draft' : 'Delete published test', () => confirmDelete(code, source), `delete-${code}`, { className: 'icon-btn--danger' });
    }
    return h('li', { class: 'adm-item', dataset: { testid: `library-item-${code}`, source } },
      h('span', { class: 'adm-item__code' }, code),
      h('div', { class: 'adm-item__main' },
        h('strong', { class: 'adm-item__title' }, title || '(untitled)'),
        h('div', { class: 'adm-item__stats' },
          test ? [stat('list', `${test.questions.length} question${test.questions.length === 1 ? '' : 's'}`), stat('check', `${points(test)} pts`),
            stat('clock', test.timeLimitMinutes ? `${test.timeLimitMinutes} min` : 'Untimed')] : null,
          note ? h('span', { class: 'faint' }, note) : null)),
      actions);
  }

  function confirmDelete(code, source) {
    openModal({
      title: `Delete ${code}?`, testid: 'confirm-delete-test',
      body: source === 'draft' ? 'This draft will be removed from this device.' : 'This removes the published test from the Google Sheet. Students will no longer be able to open it with this code.',
      actions: [
        { label: 'Cancel', variant: 'ghost', autofocus: true },
        { label: 'Delete', variant: 'danger', testid: 'confirm-action', onClick: async (close) => {
          close();
          if (source === 'draft') { deleteDraft(code); toast(`Draft ${code} deleted`, { type: 'success' }); }
          else {
            const res = await deletePublishedTest(code, { gasUrl: CONFIG.GAS_WEB_APP_URL, adminKey: load('adminKey', '', 'session') });
            toast(res.ok ? `Deleted ${code}` : `Delete failed: ${res.error || 'unknown error'}`, { type: res.ok ? 'success' : 'error' });
          }
          if (alive) refresh();
        } },
      ],
    });
  }

  const section = (title, hint, content, testid) => h('section', { class: 'card adm-section', dataset: { testid } },
    h('div', { class: 'adm-section__head' }, h('h3', { class: 'adm-h3' }, title), hint ? h('span', { class: 'faint' }, hint) : null), content);

  async function refresh() {
    mount(body, skeleton(4));
    const gasUrl = CONFIG.GAS_WEB_APP_URL;
    const adminKey = load('adminKey', '', 'session');
    const settle = (p) => p.then((v) => v, () => null);

    // Bundled
    const catalog = (await settle(loadCatalog())) || [];
    const bundled = await Promise.all(catalog.map(async (c) => {
      const r = await settle(loadTest(c.code, { config: {} }));
      return { code: c.code, title: c.title, test: r?.test || null, note: r ? '' : 'Could not load' };
    }));
    // Drafts
    const drafts = Object.values(getDrafts()).map((d) => {
      let test = null;
      try { test = normalizeTest(d); } catch { /* shown without stats */ }
      return { code: d.code, title: d.title, test, updatedAt: d.updatedAt };
    }).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    // Published
    let publishedContent;
    if (gasUrl && adminKey) {
      const res = await settle(listPublishedTests({ gasUrl, adminKey }));
      if (!res || !res.ok) {
        publishedContent = h('div', { class: 'notice notice--error' }, icon('alert'), h('span', {}, `Could not load published tests${res?.error ? `: ${res.error}` : ''}. Check your admin key in Settings.`));
      } else if (!res.tests.length) {
        publishedContent = emptyState('sheet', 'Nothing published yet', 'Use “Publish to Sheet” in the builder.');
      } else {
        const items = await Promise.all(res.tests.map(async (t) => {
          const raw = await settle(fetchPublishedTest(t.code, { gasUrl }));
          return { code: t.code, title: t.title, test: raw ? normalizeTest(raw) : null, source: 'published', note: t.updatedAt ? `Updated ${fmtDate(t.updatedAt)}` : '' };
        }));
        publishedContent = h('ul', { class: 'adm-items' }, items.map(itemEl));
      }
    } else {
      publishedContent = h('div', { class: 'notice notice--info' }, icon('info'),
        h('span', {}, 'Publishing needs an Apps Script URL and your admin key. ',
          h('a', { href: '#settings', on: { click: (e) => { e.preventDefault(); goSettings(); } } }, 'Open Settings')));
    }
    if (!alive) return;

    mount(body,
      section('Bundled (data/tests)', 'Committed to the repository',
        bundled.length ? h('ul', { class: 'adm-items' }, bundled.map((b) => itemEl({ ...b, source: 'bundled' }))) : emptyState('flask', 'No bundled tests', 'Add JSON files to data/tests/ and list them in index.json.'), 'library-bundled'),
      section('Drafts on this device', 'Stored in this browser only',
        drafts.length ? h('ul', { class: 'adm-items' }, drafts.map((d) => itemEl({ ...d, source: 'draft', note: d.test ? '' : 'Needs repair' }))) : emptyState('list', 'No drafts yet', 'Save a draft from the builder and it will show up here.'), 'library-drafts'),
      section('Published to Google Sheet', 'Available to students by code', publishedContent, 'library-published'));
  }

  refresh();
  return () => { alive = false; };
}
