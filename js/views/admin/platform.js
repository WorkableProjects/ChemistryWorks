// Settings › Platform (V4-08, S17 + S12 settings): error reports and release emails toggles, recent client errors,
// backup / restore of every test and the bank, and a link to import & templates.
import { h, icon, toast, openModal } from '../../ui.js';
import { adminCall, listPublishedTests, publishTest, fetchPublishedTest } from '../../lib/api.js';
import { getDrafts, saveDraft } from '../../lib/tests.js';
import { makeBundle, readBundle } from '../../lib/backup.js';
import { adminKey, confirmedAdminEmail } from '../../lib/admin-session.js';
import { localTags, restoreLocalTags } from '../../lib/tags.js';
import { teacherEmail } from './tag-picker.js';
import { getDiag, listClassroomCourses } from '../../lib/api.js';
import { BACKEND_VERSION } from '../../version.js';
import { switchEl, downloadFile } from './common.js';

export function platformPanel(ctx, { go } = {}) {
  const gasUrl = ctx.config.GAS_WEB_APP_URL;
  const box = h('section', { class: 'card stack', 'aria-label': 'Platform', dataset: { testid: 'platform' } }, h('h3', { class: 'adm-h3' }, icon('settings', { size: 18 }), ' Platform'));
  const toggles = h('div', { class: 'adm-switches' }, h('p', { class: 'faint' }, 'Loading settings…'));
  const errorsBox = h('div', { class: 'stack' });
  const loadSettings = async () => {
    const r = await adminCall('getSettings', {}, { gasUrl });
    if (!r.ok) { toggles.replaceChildren(h('p', { class: 'faint' }, r.error)); return; }
    const s = r.data.settings || {};
    const put = (k) => async (v) => { const res = await adminCall('saveSettings', { settings: { [k]: v } }, { gasUrl }); toast(res.ok ? 'Saved' : res.error, { type: res.ok ? 'success' : 'error' }); };
    toggles.replaceChildren(
      switchEl({ label: 'Error reports', hint: 'Browsers send errors (never answers) to an Errors sheet so problems show up early. Rate-limited.', checked: s.errorReports, testid: 'setting-errorReports', onChange: put('errorReports') }),
      switchEl({ label: 'Release emails', hint: 'When grades are released, email each student "Your grade for … is ready" (no score). Needs the MailApp permission; Gmail quota ~100/day.', checked: s.releaseEmails, testid: 'setting-releaseEmails', onChange: put('releaseEmails') }),
      h('div', { class: 'adm-grid', dataset: { testid: 'retention' } }, [['liveDays', 'Keep live progress (days)'], ['logDays', 'Keep the activity log (days)'], ['errorDays', 'Keep error reports (days)'], ['streamDays', 'Keep class posts (days)']]
        .map(([k, label]) => { const inp = h('input', { class: 'input', type: 'number', min: '1', step: '1', value: s[k] ?? '', dataset: { testid: `setting-${k}` } }); inp.addEventListener('change', () => put(k)(Number(inp.value))); return h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), inp); })),
      h('p', { class: 'field__hint' }, 'A daily clean-up removes older rows. Class posts move to a Stream_archive sheet instead of being deleted.'));
  };
  const diagBox = h('div', { class: 'stack', dataset: { testid: 'diag' } });
  const showDiag = async () => {
    diagBox.replaceChildren(h('p', { class: 'faint' }, 'Measuring…'));
    const r = await getDiag({ gasUrl });
    if (!r.ok) { diagBox.replaceChildren(h('p', { class: 'field-error' }, r.error)); return; }
    const d = r.data;
    diagBox.replaceChildren(
      h('table', { class: 'adm-table' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Sheet'), h('th', { scope: 'col' }, 'Rows'))),
        h('tbody', {}, (d.sheets || []).map((x) => h('tr', {}, h('td', {}, x.name), h('td', { class: 'mono' }, String(x.rows)))))),
      h('p', { class: 'faint' }, `Read times: ${Object.entries(d.timings || {}).map(([k, v]) => `${k} ${v} ms`).join(' · ')}`));
  };
  // Deployment checklist: what is done for this copy of ChemistryWorks.
  const checklist = h('ul', { class: 'adm-checklist', dataset: { testid: 'deploy-checklist' } });
  const runChecklist = async () => {
    const item = (ok, text, hint) => h('li', { class: ok ? 'is-done' : 'is-todo' }, icon(ok ? 'check' : 'alert', { size: 14 }), h('span', {}, text, hint ? h('span', { class: 'faint' }, ` ${hint}`) : null));
    const rows = [];
    let version = '';
    try { const res = await fetch(`${gasUrl}?action=ping`); version = (await res.json()).version || ''; } catch { version = ''; }
    rows.push(item(version === BACKEND_VERSION, `Backend version ${version || 'unreachable'}`, version === BACKEND_VERSION ? '' : `(needs ${BACKEND_VERSION})`));
    rows.push(item(!!ctx.config.GOOGLE_CLIENT_ID, 'Google sign-in client ID set', ctx.config.GOOGLE_CLIENT_ID ? `(add ${location.origin} as an authorised origin)` : '(GOOGLE_CLIENT_ID)'));
    const me = confirmedAdminEmail();
    rows.push(item(!!me, me ? `Signed in as admin ${me}` : 'Admins sheet has your account', me ? '' : '(sign in with Google)'));
    const cr = await listClassroomCourses({ gasUrl });
    rows.push(item(cr.ok, cr.ok ? 'Google Classroom connected' : 'Google Classroom not connected', cr.data?.runsAs || cr.runsAs ? `(sync runs as ${cr.data?.runsAs || ''})` : '(optional: re-run setup to approve the Classroom scopes)'));
    checklist.replaceChildren(...rows);
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
    const bundle = makeBundle({ tests, bank: bank.ok ? bank.data.items : [], tags: localTags(teacherEmail()), site: location.origin });
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
      if (b.tags.length) restoreLocalTags(teacherEmail(), b.tags);
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
      gasUrl ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'diag-show' }, on: { click: showDiag } }, icon('clock', { size: 14 }), 'Sheet sizes and speed') : null,
      gasUrl ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'deploy-check' }, on: { click: runChecklist } }, icon('check', { size: 14 }), 'Check this deployment') : null,
      go ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => go('import') } }, icon('upload', { size: 14 }), 'Import & templates') : null),
    checklist, diagBox, errorsBox);
  if (gasUrl) loadSettings(); else toggles.replaceChildren(h('p', { class: 'faint' }, 'Set GAS_WEB_APP_URL to use platform settings.'));
  return box;
}
