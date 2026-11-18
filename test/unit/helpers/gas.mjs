// Shared vm harness for apps-script/Code.gs: in-memory SpreadsheetApp, CacheService, LockService, UrlFetchApp (token lookup),
// a controllable clock and a time-zone-aware Utilities.formatDate.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const source = fs.readFileSync(path.join(here, '../../../apps-script/Code.gs'), 'utf8');

export const plain = (v) => JSON.parse(JSON.stringify(v)); // vm-realm values -> this realm

export function makeSheet(name) {
  const rows = [];
  const sheet = {
    name, rows,
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(0, ...rows.map((r) => r.length)),
    appendRow(arr) { rows.push(arr.slice()); return sheet; },
    setFrozenRows() {},
    deleteRow(n) { rows.splice(n - 1, 1); },
    getRange: (r, c, nr = 1, nc = 1) => makeRange(r, c, nr, nc),
  };
  function makeRange(r, c, nr, nc) {
    const range = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
      getValue: () => (rows[r - 1] || [])[c - 1] ?? '',
      setValue(v) { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = v; return range; },
      setValues(vals) {
        vals.forEach((rv, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; rv.forEach((v, j) => { rows[r - 1 + i][c - 1 + j] = v; }); });
        return range;
      },
      setFontWeight: () => range, setBackground: () => range, getRow: () => r,
      createTextFinder(text) {
        let entire = false;
        const f = {
          matchEntireCell(b) { entire = b; return f; },
          findNext() {
            for (let i = 0; i < nr; i++) {
              const v = (rows[r - 1 + i] || [])[c - 1];
              if (v !== undefined && (entire ? String(v) === text : String(v).includes(text))) return makeRange(r + i, c, 1, 1);
            }
            return null;
          },
        };
        return f;
      },
    };
    return range;
  }
  return sheet;
}

// UTC offset in ms of a zone at an instant (Intl based).
function zoneOffsetMs(ms, tz) {
  if (!tz || tz === 'UTC') return 0;
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName').value;
  const m = /GMT([+-])(\d\d):(\d\d)/.exec(part);
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) * 60000 : 0;
}

export function makeGas(initialProps = {}, { clock: startClock = Date.UTC(2026, 10, 18, 9, 30), tz = 'UTC' } = {}) {
  const g = { sheets: new Map(), tokens: {}, cacheStore: new Map(), clock: startClock, tz };
  g.props = { ADMIN_KEY: 'secret', GOOGLE_CLIENT_ID: 'client-1', ...initialProps };
  const spreadsheet = { getSheetByName: (n) => g.sheets.get(n) || null, insertSheet(n) { const s = makeSheet(n); g.sheets.set(n, s); return s; } };
  class FakeDate extends Date {
    constructor(...a) { super(...(a.length ? a : [g.clock])); }
    static now() { return g.clock; }
  }
  g.ctx = vm.createContext({
    Date: FakeDate,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in g.props && g.props[k] !== undefined ? g.props[k] : null) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 1 },
      computeDigest: (_a, s) => Array.from(Buffer.from(String(s))).slice(0, 16),
      formatDate(d, zone, fmt) {
        const z = zone || g.tz;
        if (fmt === 'Z') {
          const off = zoneOffsetMs(d.getTime(), z);
          const a = Math.abs(off) / 60000;
          return (off < 0 ? '-' : '+') + String(Math.floor(a / 60)).padStart(2, '0') + String(a % 60).padStart(2, '0');
        }
        return new Date(d.getTime() + zoneOffsetMs(d.getTime(), z)).toISOString().slice(0, 10);
      },
    },
    Session: { getScriptTimeZone: () => g.tz },
    CacheService: { getScriptCache: () => ({
      get: (k) => (g.cacheStore.has(k) ? g.cacheStore.get(k) : null),
      put: (k, v) => { g.cacheStore.set(k, String(v)); },
      removeAll: (ks) => ks.forEach((k) => g.cacheStore.delete(k)),
    }) },
    UrlFetchApp: { fetch(url) {
      const info = g.tokens[decodeURIComponent(url.split('id_token=')[1])];
      return { getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info || {}) };
    } },
    Logger: { log() {} }, console,
  });
  vm.runInContext(source, g.ctx, { filename: 'Code.gs' });

  g.post = (body) => JSON.parse(g.ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  g.A = (body) => g.post({ adminKey: 'secret', ...body });
  g.login = (email, extra = {}) => {
    g.tokens[`t-${email}`] = { aud: 'client-1', iss: 'accounts.google.com', email, email_verified: 'true', exp: Math.floor(g.clock / 1000) + 36000, ...extra };
    return `t-${email}`;
  };
  g.rows = (name) => plain((g.sheets.get(name)?.rows || []).slice(1));
  g.setClock = (ms) => { g.clock = ms; };
  g.tick = (ms) => { g.clock += ms; };
  g.setTz = (z) => { g.tz = z; };
  g.run = (code) => vm.runInContext(code, g.ctx);
  // Appends a Submissions row from { 'Header name': value }.
  g.addSubmission = (vals) => {
    const heads = plain(g.run('SUBMISSION_HEADERS'));
    g.ctx.getSheet_('Submissions', g.run('SUBMISSION_HEADERS')).appendRow(heads.map((h) => (h in vals ? vals[h] : '')));
  };
  return g;
}
