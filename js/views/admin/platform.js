// Settings › Platform (V4-08, S17 + S12 settings): error reports and release emails toggles, recent client errors,
// backup / restore of every test and the bank, and a link to import & templates.
import { h, icon, toast, openModal } from '../../ui.js';
import { adminCall, listPublishedTests, publishTest, fetchPublishedTest } from '../../lib/api.js';
import { getDrafts, saveDraft } from '../../lib/tests.js';
import { makeBundle, readBundle } from '../../lib/backup.js';
import { adminKey } from '../../lib/admin-session.js';
import { switchEl, downloadFile } from './common.js';

export function platformPanel(ctx, { go } = {}) {
  const gasUrl = ctx.config.GAS_WEB_APP_URL;
  const box = h('section', { class: 'card stack', 'aria-label': 'Platform', dataset: { testid: 'platform' } }, h('h3', { class: 'adm-h3' }, icon('settings', { size: 18 }), ' Platform'));
  const toggles = h('div', { class: 'adm-switches' }, h('p', { class: 'faint' }, 'Loading settings…'));
  const errorsBox = h('div', { class: 'stack' });
  const loadSettings = async () => {
    const r = await adminCall('getSettings', {}, { gasUrl });
    if (!r.ok) { toggles.replaceChildren(h('p', { class: 'faint' }, r.error.startsWith('unknown_action') ? 'Update Code.gs to 4.0 to use these settings.' : r.error)); return; }
    const s = r.data.settings || {};
    const put = (k) => async (v) => { const res = await adminCall('saveSettings', { settings: { [k]: v } }, { gasUrl }); toast(res.ok ? 'Saved' : res.error, { type: res.ok ? 'success' : 'error' }); };
    toggles.replaceChildren(
      switchEl({ label: 'Error reports', hint: 'Browsers send errors (never answers) to an Errors sheet so problems show up early. Rate-limited.', checked: s.errorReports, testid: 'setting-errorReports', onChange: put('errorReports') }),
      switchEl({ label: 'Release emails', hint: 'When grades are released, email each student "Your grade for … is ready" (no score). Needs the MailApp permission; Gmail quota ~100/day.', checked: s.releaseEmails, testid: 'setting-releaseEmails', onChange: put('releaseEmails') }));
  };
  const showErrors = async () => {
    const r = await adminCall('getErrors', { limit: 50 }, { gasUrl });
    errorsBox.replaceChildren(r.ok && r.data.errors.length
      ? h('ul', { class: 'adm-errors', dataset: { testid: 'errors-list' } }, r.data.errors.map((e) => h('li', {}, h('strong', {}, new Date(e.time).toLocaleString()), ` ${e.page} — ${e.message}`)))
      : h('p', { class: 'faint', dataset: { testid: 'errors-empty' } }, r.ok ? 'No errors reported.' : r.error));
  };
  const backup = async () => {
    const pub = gasUrl ? await listPublishedTests({ gasUrl, adminKey: adminKey() }) : { tests: [] };
    const tests = [];
    for (const t of pub.tests || []) { const full = await fetchPublishedTest(t.code, { gasUrl }); if (full) tests.push(full); }
    tests.push(...Object.values(getDrafts()));
    const bank = gasUrl ? await adminCall('listBank', {}, { gasUrl }) : { ok: false };
    const bundle = makeBundle({ tests, bank: bank.ok ? bank.data.items : [], site: location.origin });
    downloadFile(`ChemistryWorks backup ${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(bundle, null, 2));
    toast(`Backup downloaded: ${bundle.tests.length} tests, ${bundle.bank.length} bank questions`, { type: 'success' });
  };
  const restoreInput = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', id: 'restore-file', dataset: { testid: 'restore-file' }, on: { change: async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const b = readBundle(await f.text());
    if (!b.ok) { toast(b.errors[0], { type: 'error' }); return; }
    const checks = b.tests.map((t) => h('input', { type: 'checkbox', checked: true, value: t.code }));
    openModal({ title: 'Restore from backup', testid: 'restore-modal', wide: true, body: h('div', { class: 'stack' },
      h('p', {}, `${b.tests.length} tests and ${b.bank.length} bank questions in this file.${b.errors.length ? ` ${b.errors.length} test(s) skipped: ${b.errors.join('; ')}` : ''}`),
      h('div', { class: 'stack' }, b.tests.map((t, i) => h('label', { class: 'row' }, checks[i], h('span', {}, `${t.code} — ${t.title}`)))),
      h('p', { class: 'faint' }, 'Selected tests are saved as drafts on this device and published (if the backend is connected). Existing tests with the same code are replaced.')),
    actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Restore', variant: 'primary', testid: 'restore-go', onClick: async (close) => {
      let n = 0;
      for (const t of b.tests.filter((_, i) => checks[i].checked)) { saveDraft(t); if (gasUrl) { const r = await publishTest(t, { gasUrl, adminKey: adminKey() }); if (r.ok) n++; } }
      let m = 0;
      if (gasUrl) for (const item of b.bank) { const r = await adminCall('saveBankItem', { item: { question: item.question, tags: item.tags || {} } }, { gasUrl }); if (r.ok) m++; }
      close(); toast(`Restored ${n} published test(s)${m ? ` and ${m} bank question(s)` : ''}; drafts saved on this device`, { type: 'success' });
    } }] });
    e.target.value = '';
  } } });
  box.append(
    toggles,
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'backup-download' }, on: { click: backup } }, icon('download', { size: 14 }), 'Download backup'),
      h('label', { class: 'btn btn--ghost btn--sm', for: 'restore-file' }, icon('upload', { size: 14 }), 'Restore from backup'), restoreInput,
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'errors-show' }, on: { click: showErrors } }, icon('alert', { size: 14 }), 'Recent errors'),
      go ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => go('import') } }, icon('upload', { size: 14 }), 'Import & templates') : null),
    errorsBox);
  if (gasUrl) loadSettings(); else toggles.replaceChildren(h('p', { class: 'faint' }, 'Set GAS_WEB_APP_URL to use platform settings.'));
  return box;
}
