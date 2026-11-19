/**
 * ChemistryWorks backend (Google Apps Script, V8 runtime).
 *
 * Stores submissions and published tests in the bound Google Sheet and serves them to the app.
 * Run setup() once from the editor, set the ADMIN_KEY script property, then deploy as a Web App
 * (Execute as: Me, Who has access: Anyone). See DEPLOYMENT.md.
 *
 * v3: set the GOOGLE_CLIENT_ID script property (same OAuth client as js/config.js) so student identity is
 * verified from Google ID tokens (getStudentStatus, single-submission enforcement). Optional: ALLOWED_DOMAINS
 * (comma-separated, e.g. "myschool.org"), ALLOW_UNVERIFIED_EMAIL=true (local/demo only).
 *
 * v4: admins sign in with Google. Every admin request carries the admin's ID token (idToken); the verified email
 * must be on the Admins sheet (seeded from the ADMIN_EMAILS script property). ADMIN_KEY still works during the
 * upgrade period (adminKey in the request body). Every admin write is appended to the Log sheet.
 */

var VERSION = '5.0.0';

var SUBMISSIONS_SHEET = 'Submissions';
var TESTS_SHEET = 'Tests';
var ADMINS_SHEET = 'Admins';
var LOG_SHEET = 'Log';

var SUBMISSION_HEADERS = [
  'Timestamp', 'Submission ID', 'Student Name', 'Student Email', 'Test Code', 'Test Title',
  'Score Achieved', 'Total Score', 'Percentage (%)', 'Duration (s)', 'Tab Switches', 'Auto Submitted',
  'Detailed Responses (JSON)', 'Flags (JSON)',
  'Status', 'Final Score', 'Final Percentage (%)', 'Grades (JSON)', 'Graded At', 'Teacher Note',
  'Comments (JSON)', 'Released At', 'Graded By', 'Retake Allowed At', 'Seed',
  'Drawn Questions', 'Time Limit Applied', 'Late', 'Class', 'Assignment ID', 'Due At', 'Identity'
];
// 1-based columns of the grading fields (appended after the original 14 columns; v2 adds 21-22).
// Older sheets get the missing headers appended automatically by getSheet_ (empty cells = safe defaults:
// no comments, not released).
var COL = { EMAIL: 4, RESPONSES: 13, STATUS: 15, FINAL_SCORE: 16, FINAL_PCT: 17, GRADES: 18, GRADED_AT: 19, NOTE: 20, COMMENTS: 21, RELEASED_AT: 22, GRADED_BY: 23, RETAKE: 24, SEED: 25, DRAWN: 26, TIME_LIMIT: 27, LATE: 28, CLASS: 29, ASSIGNMENT: 30, DUE: 31, IDENTITY: 32 };
var MAX_COMMENT_CHARS = 2000;
var STATUS_NEEDS_GRADING = 'Needs grading';
var STATUS_AUTO = 'Auto-graded';
var STATUS_GRADED = 'Graded';
var STATUS_CLOSED = 'Closed (not counted)'; // v4 S12: arrived after the window (and late window) closed
var STATUS_NOT_ROSTER = 'Not on roster';      // v4 S11: roster-only test, student on no assigned class
var STATUS_EXTRA = 'Extra attempt'; // v3: a second submission to a single-submission test (stored, never counted)
var TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo?id_token=';
var TOKEN_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
var TEST_HEADERS = ['Code', 'Title', 'Updated At', 'Test JSON', 'Owner'];
var TAGS_SHEET = 'Tags';
var TAG_HEADERS = ['id', 'ownerEmail', 'name', 'color', 'description', 'firstTestCode', 'createdAt', 'updatedAt', 'deletedAt', 'mergedInto'];
var TAG_COLORS = ['blue', 'violet', 'teal', 'green', 'orange', 'rose', 'gray'];
var TAG_ID_RE = /^tg_[0-9a-z]{6}$/;
var TAG_NAME_MAX = 40;
var TAG_DESC_MAX = 200;
var TAG_USAGE_KEY = 'tags:usage';
var ADMIN_HEADERS = ['Email', 'Role', 'Added by', 'Added at'];
var LOG_HEADERS = ['Time', 'Admin', 'Action', 'Target', 'Details'];
var ROLE_OWNER = 'owner';
var ROLE_ADMIN = 'admin';
var EMAIL_RE = /^[A-Za-z0-9_][^\s@,;'"<>=]*@[^\s@,;'"<>=]+\.[^\s@,;'"<>=]+$/;
var LOG_DEFAULT_LIMIT = 100;
var LOG_MAX_LIMIT = 500;
var ADMIN_KEY_MAX_FAILS = 10;

var HEADER_BACKGROUND = '#E2E8F0';
var MAX_CELL_CHARS = 49000; // Sheets cells hold at most 50,000 characters.

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function doGet(e) {
  var action = '';
  resetRequest_();
  try {
    var p = (e && e.parameter) || {};
    action = String(p.action || '');
    if (p.action === 'ping') return json_({ result: 'success', version: VERSION });
    if (p.action === 'getTest') return json_(getTest_(p.code));
    return json_({ result: 'error', error: 'unknown_action' });
  } catch (err) {
    return serverError_(action, err);
  }
}

// Logs the full error to the Errors sheet and replies with a code plus a short reference. The error text never reaches the client.
function serverError_(action, err) {
  var ref = '';
  for (var i = 0; i < 6; i++) ref += Math.floor(Math.random() * 36).toString(36);
  try {
    var msg = String(err);
    var stack = err && err.stack ? String(err.stack) : '';
    getSheet_(ERRORS_SHEET, ERROR_HEADERS).appendRow([new Date(), text_('backend:' + String(action || '').slice(0, 60)), text_('[' + ref + '] ' + msg.slice(0, 480)),
      text_(stack.slice(0, 2000)), text_('apps-script')]);
  } catch (logErr) { /* logging must never throw */ }
  return json_({ result: 'error', error: 'server_error', ref: ref });
}

function doPost(e) {
  var action = '';
  resetRequest_();
  try {
    var raw = e && e.postData && e.postData.contents;
    var body;
    try {
      body = JSON.parse(raw);
    } catch (parseError) {
      return json_({ result: 'error', error: 'invalid_json' });
    }
    if (!body || typeof body !== 'object') return json_({ result: 'error', error: 'invalid_json' });
    action = String(body.action || '');

    switch (body.action) {
      case 'publishTest':
      case 'listTests':
      case 'deleteTest':
      case 'getResults':
      case 'saveGrade':
      case 'getSubmissionCounts':
      case 'releaseAll':
      case 'allowRetake':
      case 'whoami':
      case 'listAdmins':
      case 'saveAdmin':
      case 'removeAdmin':
      case 'getLog':
      case 'listClasses':
      case 'saveClass':
      case 'deleteClass':
      case 'listBank':
      case 'saveBankItem':
      case 'deleteBankItem':
      case 'getAccommodations':
      case 'saveAccommodation':
      case 'deleteAccommodation':
      case 'extendWindow':
      case 'applyRegrade':
      case 'getLive':
      case 'clearLeaderboard':
      case 'hideLeaderboardEntry':
      case 'getErrors':
      case 'getSettings':
      case 'saveSettings':
      case 'getStudentProfileAdmin':
      case 'diag':
      case 'saveAssignment':
      case 'deleteAssignment':
      case 'listAssignments':
      case 'listStream':
      case 'postStream':
      case 'deleteStreamPost':
      case 'getAssignmentStatus':
      case 'remindMissing':
      case 'listTags':
      case 'saveTag':
      case 'deleteTag':
      case 'mergeTags':
      case 'batch':
        return json_(handleAdmin_(body));
      case 'getTest':
        return json_(getTestFor_(body));
      case 'progressPing':
        return json_(progressPing_(body));
      case 'submitGameScore':
        return json_(submitGameScore_(body));
      case 'getLeaderboard':
        return json_(getLeaderboard_(body));
      case 'reportError':
        return json_(reportError_(body));
      case 'getFeedback':
        return json_(getFeedback_(body));
      case 'getStudentStatus':
        return json_(getStudentStatus_(body));
      case 'getStudentProfile':
        return json_(getStudentProfile_(body));
      case 'saveStudentProfile':
        return json_(saveStudentProfile_(body));
      case 'syncProgress':
        return json_(syncProgress_(body));
      case 'getClassHub':
        return json_(getClassHub_(body));
      case 'markNotificationsRead':
        return json_(markNotificationsRead_(body));
      case undefined:
      case null:
      case '':
      case 'submit':
        return json_(handleSubmission_(body));
      default:
        return json_({ result: 'error', error: 'unknown_action' });
    }
  } catch (err) {
    return serverError_(action, err);
  }
}

// ---------------------------------------------------------------------------
// One-time setup (run from the Apps Script editor)
// ---------------------------------------------------------------------------

// What a fresh deployment still needs. Each item: { id, label, ok, hint }. Classroom is listed only when the
// Classroom advanced service is enabled in the manifest.
function setupChecklist_() {
  var props = PropertiesService.getScriptProperties();
  var items = [];
  var add = function (id, label, ok, hint) { items.push({ id: id, label: label, ok: !!ok, hint: ok ? '' : hint }); };
  add('adminKey', 'ADMIN_KEY script property is set', props.getProperty('ADMIN_KEY'),
    'Optional. Project Settings > Script properties > ADMIN_KEY, if you still want the shared key.');
  add('clientId', 'GOOGLE_CLIENT_ID script property is set', props.getProperty('GOOGLE_CLIENT_ID'),
    'Project Settings > Script properties > GOOGLE_CLIENT_ID (same client ID as js/config.js).');
  var owner = false;
  try { owner = ensureAdmins_().some(function (a) { return a.role === ROLE_OWNER; }); } catch (e) { owner = false; }
  add('owner', 'Admins sheet has an owner', owner, 'Add a row to the Admins sheet (Email, Role = owner) and run setup again.');
  var have = {};
  try { ScriptApp.getProjectTriggers().forEach(function (t) { have[t.getHandlerFunction()] = true; }); } catch (e) { have = {}; }
  add('triggers', 'Daily cleanup trigger is installed', triggerList_().every(function (t) { return have[t.handler]; }),
    'Run setup() or setupTriggers() from the editor.');
  if (typeof Classroom !== 'undefined') {
    var granted = false;
    try { Classroom.Courses.list({ pageSize: 1 }); granted = true; } catch (e) { granted = false; }
    add('classroom', 'Google Classroom permissions are granted', granted, 'Run setup() from the editor and accept the Classroom permissions.');
  }
  return items;
}

function setup() {
  getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  getSheet_(TESTS_SHEET, TEST_HEADERS);
  var admins = ensureAdmins_();
  getSheet_(LOG_SHEET, LOG_HEADERS);
  getSheet_(STUDENTS_SHEET, STUDENT_HEADERS);
  getSheet_(ATTEMPTS_SHEET, ATTEMPT_HEADERS);
  getSheet_(ASSIGNMENTS_SHEET, ASSIGNMENT_HEADERS);
  getSheet_(STREAM_SHEET, STREAM_HEADERS);
  try { setupTriggers(); } catch (e) { Logger.log('Could not install the daily cleanup trigger: ' + e); }
  var hasKey = !!PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  Logger.log('Sheets "' + SUBMISSIONS_SHEET + '", "' + TESTS_SHEET + '", "' + ADMINS_SHEET + '" and "' + LOG_SHEET + '" are ready.');
  if (admins.length) {
    Logger.log(admins.length + ' admin(s) on the "' + ADMINS_SHEET + '" sheet. Add or remove rows there to change who can sign in as an admin.');
  } else {
    Logger.log('NEXT STEP: no admins yet. Add a row to the "' + ADMINS_SHEET + '" sheet (Email, Role = owner) or set the ADMIN_EMAILS script property ' +
      '(comma-separated, first = owner) and run setup again.');
  }
  if (hasKey) {
    Logger.log('ADMIN_KEY is set (still accepted during the upgrade to admin accounts; remove it once every admin is on the list).');
  } else {
    Logger.log('ADMIN_KEY is not set: only admins on the "' + ADMINS_SHEET + '" sheet (signed in with Google) can use the admin panel. ' +
      'To also allow the old shared key: Project Settings > Script properties > ADMIN_KEY.');
  }
  Logger.log('Then: Deploy > New deployment > Web app > Execute as "Me", Who has access "Anyone".');
  var checklist = setupChecklist_();
  checklist.forEach(function (c) { Logger.log((c.ok ? '[x] ' : '[ ] ') + c.label + (c.ok ? '' : ': ' + c.hint)); });
  return checklist;
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------

function getSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (id) ss = SpreadsheetApp.openById(id);
  }
  if (!ss) throw new Error('no_spreadsheet: create this script from the Sheet (Extensions > Apps Script) or set SPREADSHEET_ID.');
  return ss;
}

function getSheet_(name, headers) {
  if (REQ_['sheet:' + name]) return REQ_['sheet:' + name];
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground(HEADER_BACKGROUND);
    sheet.setFrozenRows(1);
  } else {
    // Sheets created by an older version have fewer columns: add any missing headers at the end.
    var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    for (var i = 0; i < headers.length; i++) {
      if (current[i] === '' || current[i] === null || current[i] === undefined) {
        sheet.getRange(1, i + 1, 1, headers.length - i).setValues([headers.slice(i)]).setFontWeight('bold').setBackground(HEADER_BACKGROUND);
        break;
      }
    }
  }
  REQ_['sheet:' + name] = sheet;
  return sheet;
}

// Returns the 1-based sheet row whose `col` cell equals `value` (data rows only), or 0.
function findRow_(sheet, col, value) {
  var last = sheet.getLastRow();
  if (last < 2 || value === undefined || value === null || value === '') return 0;
  var found = sheet.getRange(2, col, last - 1, 1).createTextFinder(String(value)).matchEntireCell(true).findNext();
  return found ? found.getRow() : 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function num_(v, fallback) {
  var n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
}

function parseJson_(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch (err) {
    return fallback;
  }
}

function iso_(v) {
  if (v instanceof Date) return v.toISOString();
  return v === undefined || v === null ? '' : String(v);
}

function normalizeCode_(code) {
  return String(code === undefined || code === null ? '' : code).trim().toUpperCase();
}

// Per-execution memo (sheet handles, header rows, accommodations, row indexes). Reset at the start of every request.
var REQ_ = {};
var LOCK_DEPTH_ = 0;
function resetRequest_() { REQ_ = {}; LOCK_DEPTH_ = 0; }

// The script lock is taken once per execution: a nested call just runs.
function withLock_(fn) {
  if (LOCK_DEPTH_ > 0) return fn();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  LOCK_DEPTH_ = 1;
  try {
    return fn();
  } finally {
    LOCK_DEPTH_ = 0;
    lock.releaseLock();
  }
}
// Like withLock_ but gives up after `ms` and returns { busy: true } without running fn.
function tryLockRun_(ms, fn) {
  if (LOCK_DEPTH_ > 0) return fn();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(ms)) return { busy: true };
  LOCK_DEPTH_ = 1;
  try {
    return fn();
  } finally {
    LOCK_DEPTH_ = 0;
    lock.releaseLock();
  }
}

// ---------- row-index cache and header cache ----------
var ROW_INDEX_TTL = 21600;
function sheetName_(sheet) { return String(sheet.getName()); }
function headerOf_(sheet) {
  var k = 'head:' + sheetName_(sheet);
  if (!REQ_[k]) REQ_[k] = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  return REQ_[k];
}
function rowKeyOf_(vals) { return vals.map(function (v) { return String(v === undefined || v === null ? '' : v).trim().toLowerCase(); }).join('|'); }
function rowIndexLoad_(ck) {
  if (REQ_[ck]) return REQ_[ck];
  try {
    var hit = CacheService.getScriptCache().get(ck);
    if (hit) return (REQ_[ck] = JSON.parse(hit));
  } catch (e) { /* miss */ }
  return null;
}
function rowIndexStore_(ck, map) {
  REQ_[ck] = map;
  try {
    var raw = JSON.stringify(map);
    if (raw.length < 90000) CacheService.getScriptCache().put(ck, raw, ROW_INDEX_TTL);
    else CacheService.getScriptCache().remove(ck);
  } catch (e) { /* no cache */ }
}
// Finds a row by key columns (header names) through a cached key -> row map. Reads one row when the cached row still holds
// the key; otherwise rebuilds the map from the key columns only. -> { row, vals } (row 0 when not found).
function indexedRow_(sheet, keyCols, keyVals) {
  var head = headerOf_(sheet);
  var key = rowKeyOf_(keyVals);
  var kidx = keyCols.map(function (c) { return head.indexOf(c); });
  var ck = 'rowidx:' + sheetName_(sheet) + ':' + keyCols.join('+');
  var has = function (m) { return Object.prototype.hasOwnProperty.call(m, key); };
  var map = rowIndexLoad_(ck);
  if (map && has(map)) {
    var v = sheet.getRange(map[key], 1, 1, head.length).getValues()[0];
    if (rowKeyOf_(kidx.map(function (i) { return v[i]; })) === key) return { row: map[key], vals: v };
  }
  var last = sheet.getLastRow();
  map = {};
  if (last >= 2) {
    var cols = kidx.map(function (i) { return sheet.getRange(2, i + 1, last - 1, 1).getValues(); });
    for (var r = 0; r < last - 1; r++) {
      var k = rowKeyOf_(cols.map(function (c) { return c[r][0]; }));
      if (!Object.prototype.hasOwnProperty.call(map, k)) map[k] = r + 2;
    }
  }
  rowIndexStore_(ck, map);
  if (!has(map)) return { row: 0, vals: null };
  return { row: map[key], vals: sheet.getRange(map[key], 1, 1, head.length).getValues()[0] };
}
// Records a row appended through indexedRow_'s sheet so the next lookup is a hit.
function indexedRowAdd_(sheet, keyCols, keyVals, row) {
  var ck = 'rowidx:' + sheetName_(sheet) + ':' + keyCols.join('+');
  var map = rowIndexLoad_(ck);
  if (!map) return;
  map[rowKeyOf_(keyVals)] = row;
  rowIndexStore_(ck, map);
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

// Accepts a direct payload or a Netlify outgoing-webhook body ({ data: { ...form fields } }).
function normalizeSubmission_(body) {
  var d = body && body.data && typeof body.data === 'object' ? body.data : body;
  return {
    submission_id: d.submission_id ? String(d.submission_id) : '',
    student_name: d.student_name || '',
    student_email: d.student_email || '',
    test_code: d.test_code || '',
    test_title: d.test_title || '',
    score_achieved: num_(d.score_achieved),
    score_total: num_(d.score_total),
    percentage: num_(d.percentage),
    duration_seconds: num_(d.duration_seconds),
    responses: parseJson_(d.responses_json !== undefined ? d.responses_json : d.responses, []),
    flags: parseJson_(d.flags_json !== undefined ? d.flags_json : d.flags, {}) || {},
    needs_grading: d.needs_grading === true || d.needs_grading === 'true',
    single_submission: d.single_submission === true || d.single_submission === 'true',
    submitted_at: d.submitted_at || '',
    seed: seedOf_(d),
    drawn: drawnOf_(d),
    time_limit_applied: d.time_limit_applied === undefined || d.time_limit_applied === null ? '' : d.time_limit_applied,
    id_token: d.idToken || d.id_token || ''
  };
}

// v4 (S10): the per-student instance seed (payload.instance.seed, or instance_json / instance_seed form fields). Text, max 200 chars.
function seedOf_(d) {
  var inst = d.instance;
  if (typeof d.instance_json === 'string' && d.instance_json) inst = parseJson_(d.instance_json, null);
  var seed = inst && typeof inst === 'object' && inst.seed !== undefined ? inst.seed : d.instance_seed;
  return seed === undefined || seed === null ? '' : String(seed).slice(0, 200);
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}

// Final score = teacher points where given (clamped to 0..possible), otherwise the auto-graded points.
function applyGrades_(responses, grades) {
  var earned = 0;
  var total = 0;
  var list = Array.isArray(responses) ? responses : [];
  for (var i = 0; i < list.length; i++) {
    var r = list[i] || {};
    var possible = Math.max(0, num_(r.pointsPossible));
    var pts = num_(r.pointsEarned);
    if (grades && r.questionId !== undefined && Object.prototype.hasOwnProperty.call(grades, r.questionId)) {
      pts = Math.min(possible, Math.max(0, num_(grades[r.questionId])));
    }
    earned += pts;
    total += possible;
  }
  earned = round2_(earned);
  total = round2_(total);
  return { score: earned, total: total, percentage: total > 0 ? round2_((earned / total) * 100) : 0 };
}

function needsGrading_(s) {
  if (s.needs_grading) return true;
  var list = Array.isArray(s.responses) ? s.responses : [];
  for (var i = 0; i < list.length; i++) if (list[i] && list[i].needsGrading) return true;
  return false;
}

// Sheets evaluates strings starting with = + - @ as formulas; prefix an apostrophe so student-supplied
// text is always stored as literal text (prevents formula injection into the teacher's sheet).
function text_(v) {
  var str = String(v == null ? '' : v);
  return /^[=+\-@]/.test(str) ? "'" + str : str;
}

// Who a submission belongs to -> { email, name?, verified } | { error }.
// With a valid ID token the email and name come from the token; any email in the body is ignored. Without a token the
// claimed email is accepted only when ALLOW_UNVERIFIED_EMAIL is 'true' (the row is then marked unverified).
function submissionIdentity_(s) {
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('GOOGLE_CLIENT_ID');
  if (s.id_token && clientId) {
    var who = verifyIdToken_(String(s.id_token), clientId);
    if (who.error || !who.email) return { error: 'invalid_token' };
    return { email: who.email, name: who.name || '', verified: true };
  }
  var claimed = normEmail_(s.student_email);
  if (props.getProperty('ALLOW_UNVERIFIED_EMAIL') === 'true' && /^[^\s@]+@[^\s@]+$/.test(claimed) && domainAllowed_(claimed, '')) {
    return { email: claimed, verified: false };
  }
  return { error: 'unauthorized' };
}

function handleSubmission_(body) {
  var s = normalizeSubmission_(body);
  if (!s.submission_id) return { result: 'error', error: 'missing_submission_id' };
  s.submission_id = text_(s.submission_id);
  if (!s.test_code) return { result: 'error', error: 'missing_test_code' };
  var responsesJson = JSON.stringify(s.responses);
  var flagsJson = JSON.stringify(s.flags);
  if (responsesJson.length > MAX_CELL_CHARS) return { result: 'error', error: 'submission_too_large' };
  var pending = needsGrading_(s);
  // A repeat of a stored submission is answered before the identity check, so retrying is always safe.
  if (findRow_(getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS), 2, s.submission_id)) return { result: 'success', duplicate: true };
  var ident = submissionIdentity_(s);
  if (ident.error) return { result: 'error', error: ident.error };
  s.student_email = ident.email;
  if (ident.name) s.student_name = ident.name;

  // appendRow is atomic, so this path takes no script lock.
  return (function () {
    var sheet = getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
    if (s.submission_id && indexedRow_(sheet, ['Submission ID'], [s.submission_id]).row) return { result: 'success', duplicate: true };
    // v3 backstop: a second submission to a single-submission test is stored (never lost) but marked Extra attempt.
    var extra = false;
    // v4 S11/S12: roster-only tests and the open/close window are enforced here too (the row is kept, never counted).
    var gate = submissionGate_(s, body);
    if (s.single_submission || testIsSingleSubmission_(s.test_code)) {
      var prior = findRowsByEmailCode_(sheet, s.student_email, s.test_code);
      for (var p = 0; p < prior.length; p++) if (!prior[p].retake_allowed_at) { extra = true; break; }
    }
    sheet.appendRow([
      new Date(),
      s.submission_id,
      text_(s.student_name),
      text_(s.student_email),
      text_(s.test_code),
      text_(s.test_title),
      s.score_achieved,
      s.score_total,
      s.percentage,
      s.duration_seconds,
      num_(s.flags.tab_switches),
      s.flags.auto_submitted === true || s.flags.auto_submitted === 'true',
      responsesJson,
      flagsJson,
      gate.status || (extra ? STATUS_EXTRA : (pending ? STATUS_NEEDS_GRADING : STATUS_AUTO)),
      pending || gate.status ? '' : gate.penalized ? gate.score : s.score_achieved,
      pending || gate.status ? '' : gate.penalized ? gate.percentage : s.percentage,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      text_(s.seed),
      text_(s.drawn),
      s.time_limit_applied === '' ? '' : num_(s.time_limit_applied),
      gate.late ? true : '',
      text_(gate.classId || ''),
      text_(gate.assignmentId || ''),
      text_(gate.dueAt || ''),
      ident.verified ? 'verified' : 'unverified'
    ]);
    if (s.submission_id) indexedRowAdd_(sheet, ['Submission ID'], [s.submission_id], sheet.getLastRow());
    emailCodeIndexAdd_(s.student_email, s.test_code, sheet.getLastRow());
    bust_('tests:list');
    if (gate.status) return { result: 'success', not_counted: gate.status };
    return extra ? { result: 'success', extra_attempt: true } : { result: 'success' };
  })();
}

// ---------------------------------------------------------------------------
// Tests (public read, admin write)
// ---------------------------------------------------------------------------

// The stored test JSON, whatever its window (server-side checks use this; students go through getTest_).
function readTest_(code) {
  var c = normalizeCode_(code);
  if (!c) return null;
  var sheet = getSheet_(TESTS_SHEET, TEST_HEADERS);
  var row = findRow_(sheet, 1, c);
  return row ? parseJson_(sheet.getRange(row, 4).getValue(), null) : null;
}

function getTest_(code) {
  var test = readTest_(code);
  if (!test) return { result: 'error', error: 'not_found' };
  // v4 S12: before it opens / after it closes (and after any late window) the test itself is not served.
  var w = windowState_(test, null, new Date());
  if (w.state === 'before') return { result: 'error', error: 'not_open', opensAt: test.opensAt, title: test.title || '' };
  if (w.state === 'closed') return { result: 'error', error: 'closed', closesAt: test.closesAt, title: test.title || '' };
  // Roster-only tests are served only through the POST path with a token (getTestFor_).
  if (test.rosterOnly === true) return { result: 'error', error: 'not_on_roster', title: test.title || '' };
  return { result: 'success', test: test, tagIndex: tagIndexFor_(test) };
}

// ---------------------------------------------------------------------------
// Admin operations
// ---------------------------------------------------------------------------

// -> { ok: true, email, role, via: 'google' | 'key' } | { ok: false, error }
// Google path (body.idToken present): the token is verified exactly like a student's (verifyIdToken_), then the
// verified, lower-cased email must be on the Admins sheet. Nothing else is accepted on this path: a bad token is
// 'invalid_token', an unlisted email is 'not_admin' (the key is NOT consulted as a fallback).
// Key path (no idToken): body.adminKey must equal the ADMIN_KEY script property (upgrade period). The key never
// reads the Admins sheet; it counts as owner for the admin-management actions only while no owner exists (isOwner_).
function requireAdmin_(body) {
  var token = body && body.idToken ? String(body.idToken) : '';
  if (token) {
    var clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
    if (!clientId) return { ok: false, error: 'identity_not_configured' };
    var who = verifyIdToken_(token, clientId);
    if (who.error || !who.email) return { ok: false, error: 'invalid_token' };
    var email = String(who.email).trim().toLowerCase();
    var admins = ensureAdmins_();
    for (var i = 0; i < admins.length; i++) {
      if (admins[i].email === email) return { ok: true, email: email, role: admins[i].role, via: 'google' };
    }
    return { ok: false, error: 'not_admin' };
  }
  var key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!key) return { ok: false, error: 'admin_key_not_configured' };
  var failKey = 'adminkey:fail:' + Math.floor(new Date().getTime() / 3600000);
  var fails = cacheCount_(failKey);
  if (fails >= ADMIN_KEY_MAX_FAILS) return { ok: false, error: 'locked' };
  if (!body || !body.adminKey || !safeEqual_(String(body.adminKey), key)) {
    cacheBump_(failKey, fails);
    return { ok: false, error: 'unauthorized' };
  }
  return { ok: true, email: '', role: ROLE_ADMIN, via: 'key' };
}

// Compares two strings without stopping at the first difference.
function safeEqual_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// Hourly counters in CacheService (no cache available -> 0, so callers fail open).
function cacheCount_(key) {
  try { return Number(CacheService.getScriptCache().get(key) || 0); } catch (e) { return 0; }
}
function cacheBump_(key, current) {
  try { CacheService.getScriptCache().put(key, String(current + 1), 3700); } catch (e) { /* no cache */ }
}

// Admins sheet rows: [{ row, email, role, added_by, added_at }]. Emails trimmed + lower-cased, blank and duplicate
// emails ignored (first row wins), any role other than 'owner' reads as 'admin'.
function readAdminRows_() {
  var sheet = getSheet_(ADMINS_SHEET, ADMIN_HEADERS);
  var last = sheet.getLastRow();
  var out = [];
  if (last < 2) return out;
  var values = sheet.getRange(2, 1, last - 1, 4).getValues();
  var seen = {};
  for (var i = 0; i < values.length; i++) {
    var email = String(values[i][0] == null ? '' : values[i][0]).trim().toLowerCase();
    if (!email || seen[email]) continue;
    seen[email] = true;
    var role = String(values[i][1] == null ? '' : values[i][1]).trim().toLowerCase() === ROLE_OWNER ? ROLE_OWNER : ROLE_ADMIN;
    out.push({ row: i + 2, email: email, role: role, added_by: String(values[i][2] == null ? '' : values[i][2]), added_at: iso_(values[i][3]) });
  }
  return out;
}

// Reads the Admins sheet; when it is missing or has no emails, creates it and seeds it from the ADMIN_EMAILS
// script property (comma list, first = owner). With no property either, returns [] (only ADMIN_KEY works).
function ensureAdmins_() {
  var rows = readAdminRows_();
  if (rows.length) return rows;
  var raw = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS');
  var emails = [];
  String(raw || '').split(',').forEach(function (e) {
    var v = e.trim().toLowerCase();
    if (v && EMAIL_RE.test(v) && emails.indexOf(v) < 0) emails.push(v);
  });
  if (!emails.length) return rows;
  return withLock_(function () {
    if (readAdminRows_().length) return readAdminRows_();
    var sheet = getSheet_(ADMINS_SHEET, ADMIN_HEADERS);
    for (var i = 0; i < emails.length; i++) sheet.appendRow([emails[i], i === 0 ? ROLE_OWNER : ROLE_ADMIN, 'ADMIN_EMAILS', new Date()]);
    return readAdminRows_();
  });
}

function hasOwner_(rows) {
  for (var i = 0; i < rows.length; i++) if (rows[i].role === ROLE_OWNER) return true;
  return false;
}

// Owner-only actions. A key caller is an owner only while the Admins sheet has no owner at all (bootstrap).
function isOwner_(auth, rows) {
  if (auth.role === ROLE_OWNER) return true;
  return auth.via === 'key' && !hasOwner_(rows);
}

function appendLog_(auth, action, target, details) {
  try {
    var who = auth.via === 'google' ? auth.email : 'ADMIN_KEY';
    getSheet_(LOG_SHEET, LOG_HEADERS).appendRow([new Date(), text_(who), text_(action), text_(target || ''), text_(details || '').slice(0, 500)]);
  } catch (err) { /* logging never blocks the action */ }
}

var LOGGED_ACTIONS_ = { publishTest: 1, deleteTest: 1, saveGrade: 1, releaseAll: 1, allowRetake: 1, saveAdmin: 1, removeAdmin: 1,
  saveClass: 1, deleteClass: 1, saveBankItem: 1, deleteBankItem: 1, saveAccommodation: 1, deleteAccommodation: 1, extendWindow: 1,
  applyRegrade: 1, clearLeaderboard: 1, hideLeaderboardEntry: 1, saveSettings: 1,
  saveAssignment: 1, deleteAssignment: 1, postStream: 1, deleteStreamPost: 1, remindMissing: 1,
  saveTag: 1, deleteTag: 1, mergeTags: 1 };

function logTarget_(body) {
  switch (body.action) {
    case 'publishTest': return body.test && body.test.code ? normalizeCode_(body.test.code) : '';
    case 'deleteTest': return normalizeCode_(body.code);
    case 'releaseAll': return normalizeCode_(body.testCode);
    case 'saveGrade':
    case 'allowRetake': return body.submissionId ? String(body.submissionId) : '';
    case 'saveAdmin':
    case 'removeAdmin': return body.email ? String(body.email).trim().toLowerCase() : '';
    case 'saveClass':
    case 'deleteClass': return String(body.id || (body.cls && body.cls.id) || '');
    case 'saveBankItem':
    case 'deleteBankItem': return String(body.id || (body.item && body.item.id) || '');
    case 'saveAccommodation':
    case 'deleteAccommodation':
    case 'extendWindow': return String(body.email || '').trim().toLowerCase() + (body.testCode ? ' · ' + normalizeCode_(body.testCode) : '');
    case 'applyRegrade':
    case 'clearLeaderboard': return normalizeCode_(body.testCode);
    case 'saveAssignment': return String((body.assignment && body.assignment.id) || body.id || '');
    case 'deleteAssignment':
    case 'deleteStreamPost':
    case 'remindMissing': return String(body.id || '');
    case 'postStream': return String(body.classId || '');
    case 'saveTag': return String((body.tag && body.tag.id) || '');
    case 'deleteTag': return String(body.id || '');
    case 'mergeTags': return String(body.from || '') + ' > ' + String(body.into || '');
  }
  return '';
}

function logDetails_(body, res) {
  switch (body.action) {
    case 'publishTest': return res.updated ? 'updated' : 'created';
    case 'releaseAll': return 'released ' + num_(res.released);
    case 'allowRetake': return body.allow === false ? 'revoked' : 'allowed';
    case 'saveAdmin': return 'role ' + (res.role || '');
    case 'saveGrade': return body.release === true ? 'released' : '';
  }
  return '';
}

function handleAdmin_(body) {
  var auth = requireAdmin_(body);
  if (!auth.ok) return { result: 'error', error: auth.error };
  var res = dispatchAdmin_(body, auth);
  if (res && res.result === 'success' && LOGGED_ACTIONS_[body.action]) appendLog_(auth, body.action, logTarget_(body), logDetails_(body, res));
  return res;
}

function dispatchAdmin_(body, auth) {
  var res = dispatchAdminRaw_(body, auth);
  if (res && res.result === 'success') {
    bustFor_(body);
    if (res.row === undefined) {
      try { var row = rowFor_(body, res); if (row !== undefined) res.row = row; } catch (e) { /* row is optional */ }
    }
  }
  return res;
}

function dispatchAdminRaw_(body, auth) {
  switch (body.action) {
    case 'publishTest': return publishTest_(body.test, body.tagDefs, auth);
    case 'listTests': return listTests_(body);
    case 'deleteTest': return deleteTest_(body.code);
    case 'getResults': return getResults_(body.testCode, body);
    case 'saveGrade':
      // "Graded by": a Google admin who sent no name is recorded by email.
      if (auth.via === 'google' && !String(body.gradedBy == null ? '' : body.gradedBy).trim()) body.gradedBy = auth.email;
      return saveGrade_(body);
    case 'getSubmissionCounts': return getSubmissionCounts_();
    case 'releaseAll': return releaseAll_(body.testCode);
    case 'allowRetake': return allowRetake_(body);
    case 'whoami': return whoami_(auth);
    case 'listAdmins': return listAdmins_();
    case 'saveAdmin': return saveAdmin_(body, auth);
    case 'removeAdmin': return removeAdmin_(body, auth);
    case 'getLog': return getLog_(body);
    case 'listClasses': return listClasses_();
    case 'saveClass': return saveClass_(body, auth);
    case 'deleteClass': return deleteClass_(body);
    case 'listBank': return listBank_();
    case 'saveBankItem': return saveBankItem_(body, auth);
    case 'deleteBankItem': return deleteBankItem_(body);
    case 'getAccommodations': return getAccommodations_(body);
    case 'saveAccommodation': return saveAccommodation_(body, auth);
    case 'deleteAccommodation': return deleteAccommodation_(body);
    case 'extendWindow': return saveAccommodation_({ email: body.email, testCode: body.testCode, extensionUntil: body.until, merge: true }, auth);
    case 'applyRegrade': return applyRegrade_(body);
    case 'getLive': return getLive_(body);
    case 'clearLeaderboard': return clearLeaderboard_(body);
    case 'hideLeaderboardEntry': return hideLeaderboardEntry_(body);
    case 'getErrors': return getErrors_(body);
    case 'getSettings': return { result: 'success', settings: readSettings_() };
    case 'saveSettings': return saveSettings_(body);
    case 'getStudentProfileAdmin': return getStudentProfileAdmin_(body);
    case 'diag': return diag_();
    case 'batch': return batch_(body, auth);
    case 'saveAssignment': return saveAssignment_(body, auth);
    case 'deleteAssignment': return deleteAssignment_(body);
    case 'listAssignments': return listAssignments_(body);
    case 'listStream': return listStream_(body);
    case 'postStream': return postStream_(body, auth);
    case 'deleteStreamPost': return deleteStreamPost_(body);
    case 'getAssignmentStatus': return getAssignmentStatus_(body);
    case 'remindMissing': return remindMissing_(body, auth);
    case 'listTags': return listTags_();
    case 'saveTag': return saveTag_(body, auth);
    case 'deleteTag': return deleteTag_(body, auth);
    case 'mergeTags': return mergeTags_(body, auth);
  }
  return { result: 'error', error: 'unknown_action' };
}

// Any admin. A key caller reports role 'owner' only while no owner exists (the bootstrap case), else 'admin'.
function whoami_(auth) {
  var role = auth.role;
  if (auth.via === 'key') role = isOwner_(auth, ensureAdmins_()) ? ROLE_OWNER : ROLE_ADMIN;
  return { result: 'success', email: auth.email, role: role, via: auth.via };
}

function listAdmins_() {
  var rows = ensureAdmins_();
  return {
    result: 'success',
    admins: rows.map(function (r) { return { email: r.email, role: r.role, added_by: r.added_by, added_at: r.added_at }; })
  };
}

// Owner only. body: { email, role: 'owner' | 'admin' } -> adds the admin or changes the role of an existing one.
// The last owner cannot be demoted.
function saveAdmin_(body, auth) {
  var email = String(body && body.email != null ? body.email : '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 200) return { result: 'error', error: 'invalid_email' };
  var role = String(body.role == null || body.role === '' ? ROLE_ADMIN : body.role).trim().toLowerCase();
  if (role !== ROLE_OWNER && role !== ROLE_ADMIN) return { result: 'error', error: 'invalid_role' };
  ensureAdmins_();
  return withLock_(function () {
    var rows = readAdminRows_();
    if (!isOwner_(auth, rows)) return { result: 'error', error: 'owner_only' };
    var existing = null;
    var owners = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].role === ROLE_OWNER) owners++;
      if (rows[i].email === email) existing = rows[i];
    }
    var sheet = getSheet_(ADMINS_SHEET, ADMIN_HEADERS);
    if (existing) {
      if (existing.role === ROLE_OWNER && role !== ROLE_OWNER && owners <= 1) return { result: 'error', error: 'last_owner' };
      sheet.getRange(existing.row, 2, 1, 1).setValues([[role]]);
      return { result: 'success', email: email, role: role, updated: true };
    }
    sheet.appendRow([email, role, auth.via === 'google' ? auth.email : 'ADMIN_KEY', new Date()]);
    return { result: 'success', email: email, role: role, updated: false };
  });
}

// Owner only. body: { email }. Refuses removing yourself and removing the last owner.
function removeAdmin_(body, auth) {
  var email = String(body && body.email != null ? body.email : '').trim().toLowerCase();
  if (!email) return { result: 'error', error: 'invalid_email' };
  if (auth.via === 'google' && email === auth.email) return { result: 'error', error: 'cannot_remove_self' };
  ensureAdmins_();
  return withLock_(function () {
    var rows = readAdminRows_();
    if (!isOwner_(auth, rows)) return { result: 'error', error: 'owner_only' };
    var target = null;
    var owners = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].role === ROLE_OWNER) owners++;
      if (rows[i].email === email) target = rows[i];
    }
    if (!target) return { result: 'error', error: 'not_found' };
    if (target.role === ROLE_OWNER && owners <= 1) return { result: 'error', error: 'last_owner' };
    var sheet = getSheet_(ADMINS_SHEET, ADMIN_HEADERS);
    // Also drop any duplicate rows for the same email (read as one admin, so all must go).
    var all = sheet.getLastRow() >= 2 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues() : [];
    for (var r = all.length - 1; r >= 0; r--) {
      if (String(all[r][0] == null ? '' : all[r][0]).trim().toLowerCase() === email) sheet.deleteRow(r + 2);
    }
    return { result: 'success', email: email };
  });
}

// Any admin. body: { limit } -> newest first (default 100, max 500).
function getLog_(body) {
  var limit = Math.floor(num_(body && body.limit, LOG_DEFAULT_LIMIT));
  if (limit < 1) limit = LOG_DEFAULT_LIMIT;
  if (limit > LOG_MAX_LIMIT) limit = LOG_MAX_LIMIT;
  var sheet = getSheet_(LOG_SHEET, LOG_HEADERS);
  var last = sheet.getLastRow();
  var rows = [];
  if (last >= 2) {
    var first = Math.max(2, last - limit + 1);
    var values = sheet.getRange(first, 1, last - first + 1, 5).getValues();
    for (var i = values.length - 1; i >= 0; i--) {
      rows.push({ time: iso_(values[i][0]), admin: String(values[i][1]), action: String(values[i][2]), target: String(values[i][3]), details: String(values[i][4]) });
    }
  }
  return { result: 'success', rows: rows };
}

function publishTest_(test, tagDefs, auth) {
  if (!test || typeof test !== 'object') return { result: 'error', error: 'invalid_test' };
  var code = normalizeCode_(test.code);
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) return { result: 'error', error: 'invalid_test: code must be 2-32 characters (A-Z, 0-9, _ or -)' };
  if (!test.title || !String(test.title).trim()) return { result: 'error', error: 'invalid_test: title is required' };
  if (!Array.isArray(test.questions) || test.questions.length === 0) return { result: 'error', error: 'invalid_test: questions must be a non-empty array' };
  test.code = code;
  var testJson = JSON.stringify(test);
  if (testJson.length > MAX_CELL_CHARS) return { result: 'error', error: 'test_too_large' };
  var who = tagOwner_(auth);
  var used = testTagIds_(test);

  return withLock_(function () {
    var tagResult = used.length ? upsertTagDefs_(used, tagDefs, who, code) : { tags: [] };
    if (tagResult.error) return tagResult;
    var sheet = getSheet_(TESTS_SHEET, TEST_HEADERS);
    var row = findRow_(sheet, 1, code);
    var values = [code, text_(String(test.title)), new Date(), testJson];
    if (row) {
      sheet.getRange(row, 1, 1, 4).setValues([values]);
      if (who && String(sheet.getRange(row, 5).getValue() || '') === '') sheet.getRange(row, 5).setValue(text_(who));
    } else {
      sheet.appendRow(values.concat([text_(who)]));
    }
    bust_(testShapeKey_(code, iso_(values[2])));
    return { result: 'success', code: code, updated: !!row, tags: tagResult.tags };
  });
}

// ---------------------------------------------------------------------------
// Tags: local in the browser until a published test uses them, then rows on the Tags sheet
// ---------------------------------------------------------------------------

// The caller's lower-cased email; '' for an ADMIN_KEY caller (who owns the rows with an empty owner).
function tagOwner_(auth) { return auth && auth.email ? String(auth.email).trim().toLowerCase() : ''; }

// Distinct tag ids used by a test's questions, in first-seen order.
function testTagIds_(test) {
  var seen = {};
  var out = [];
  var qs = test && Array.isArray(test.questions) ? test.questions : [];
  qs.forEach(function (q) {
    (q && Array.isArray(q.tags) ? q.tags : []).forEach(function (id) {
      id = String(id);
      if (!seen[id]) { seen[id] = 1; out.push(id); }
    });
  });
  return out;
}

function tagRowValues_(t) {
  return [t.id, text_(t.ownerEmail), text_(t.name), t.color, text_(t.description), text_(t.firstTestCode), t.createdAt, t.updatedAt, t.deletedAt, t.mergedInto];
}
function tagFromRow_(v, row) {
  return { row: row, id: String(v[0]), ownerEmail: String(v[1] || '').toLowerCase(), name: String(v[2] || ''), color: String(v[3] || 'gray'),
    description: String(v[4] || ''), firstTestCode: String(v[5] || ''), createdAt: iso_(v[6]), updatedAt: iso_(v[7]), deletedAt: iso_(v[8]), mergedInto: String(v[9] || '') };
}
// Every Tags row, deleted ones too. Reading never creates the sheet.
function readTagRows_() {
  var existing = getSpreadsheet_().getSheetByName(TAGS_SHEET);
  if (!existing || existing.getLastRow() < 2) return [];
  var sheet = getSheet_(TAGS_SHEET, TAG_HEADERS);
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, TAG_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) if (vals[i][0] !== '') out.push(tagFromRow_(vals[i], i + 2));
  return out;
}
function tagMap_(rows) {
  var m = {};
  rows.forEach(function (t) { m[t.id] = t; });
  return m;
}
function writeTagRow_(t) {
  getSheet_(TAGS_SHEET, TAG_HEADERS).getRange(t.row, 1, 1, TAG_HEADERS.length).setValues([tagRowValues_(t)]);
}
function cleanTagName_(v) { return String(v == null ? '' : v).trim().slice(0, TAG_NAME_MAX); }
function cleanTagDesc_(v) { return String(v == null ? '' : v).trim().slice(0, TAG_DESC_MAX); }
function cleanTagColor_(v, fallback) { v = String(v == null ? '' : v); return TAG_COLORS.indexOf(v) >= 0 ? v : fallback; }
function publicTag_(t) {
  return { id: t.id, ownerEmail: t.ownerEmail, name: t.name, color: t.color, description: t.description,
    firstTestCode: t.firstTestCode, createdAt: t.createdAt, updatedAt: t.updatedAt, mergedInto: t.mergedInto };
}
// Follows mergedInto to the live end of a chain (cycle-safe). null when the id is unknown.
function resolveTag_(map, id) {
  var cur = map[id];
  var hops = 0;
  while (cur && cur.mergedInto && map[cur.mergedInto] && hops < 20) { cur = map[cur.mergedInto]; hops++; }
  return cur || null;
}

// Runs inside the publish lock. -> { tags: [...] } or { result: 'error', error: 'unknown_tag', ids }
function upsertTagDefs_(used, tagDefs, who, testCode) {
  var defs = {};
  (Array.isArray(tagDefs) ? tagDefs : []).forEach(function (d) {
    if (d && typeof d === 'object' && TAG_ID_RE.test(String(d.id))) defs[String(d.id)] = d;
  });
  var rows = readTagRows_();
  var map = tagMap_(rows);
  var unknown = used.filter(function (id) { return !defs[id] && !map[id]; });
  if (unknown.length) return { result: 'error', error: 'unknown_tag', ids: unknown };
  var now = new Date();
  var nextRow = rows.reduce(function (m, t) { return Math.max(m, t.row); }, 1) + 1;
  var out = [];
  used.forEach(function (id) {
    var def = defs[id];
    var cur = map[id];
    var applied;
    if (!cur) {
      cur = { row: nextRow++, id: id, ownerEmail: who, name: cleanTagName_(def.name) || 'Tag', color: cleanTagColor_(def.color, 'gray'),
        description: cleanTagDesc_(def.description), firstTestCode: testCode, createdAt: now, updatedAt: now, deletedAt: '', mergedInto: '' };
      writeTagRow_(cur);
      map[id] = cur;
      applied = 'created';
    } else if (def && cur.ownerEmail === who) {
      var name = cleanTagName_(def.name) || cur.name;
      var color = cleanTagColor_(def.color, cur.color);
      var desc = def.description === undefined ? cur.description : cleanTagDesc_(def.description);
      if (name !== cur.name || color !== cur.color || desc !== cur.description) {
        cur.name = name; cur.color = color; cur.description = desc; cur.updatedAt = now;
        writeTagRow_(cur);
        applied = 'updated';
      } else applied = 'unchanged';
    } else if (def && cur.ownerEmail !== who && (cleanTagName_(def.name) !== cur.name || cleanTagColor_(def.color, cur.color) !== cur.color)) {
      applied = 'sheet_wins';
    } else applied = 'unchanged';
    var pub = publicTag_(cur);
    pub.applied = applied;
    out.push(pub);
  });
  return { tags: out };
}

// Counts over published tests, against the live end of any merge chain: { id: { questions, tests } }.
function tagUsage_(map) {
  var sheet = getSheet_(TESTS_SHEET, TEST_HEADERS);
  var usage = {};
  var last = sheet.getLastRow();
  if (last < 2) return usage;
  sheet.getRange(2, 4, last - 1, 1).getValues().forEach(function (r) {
    var t = parseJson_(r[0], null);
    if (!t || !Array.isArray(t.questions)) return;
    var inTest = {};
    t.questions.forEach(function (q) {
      var seen = {};
      (q && Array.isArray(q.tags) ? q.tags : []).forEach(function (raw) {
        var end = resolveTag_(map, String(raw));
        var id = end ? end.id : String(raw);
        if (seen[id]) return;
        seen[id] = 1;
        usage[id] = usage[id] || { questions: 0, tests: 0 };
        usage[id].questions++;
        if (!inTest[id]) { inTest[id] = 1; usage[id].tests++; }
      });
    });
  });
  return usage;
}

function listTags_() {
  var map = tagMap_(readTagRows_());
  var rows = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return a.row - b.row; });
  var usage = cached_(TAG_USAGE_KEY, CACHE_TTL, function () { return tagUsage_(map); });
  return {
    result: 'success',
    tags: rows.filter(function (t) { return !t.deletedAt; }).map(function (t) {
      var pub = publicTag_(t);
      pub.ownerName = t.ownerEmail ? t.ownerEmail.split('@')[0] : '';
      pub.usage = usage[t.id] || { questions: 0, tests: 0 };
      return pub;
    })
  };
}

// -> { tag } | { error: 'not_on_sheet' | 'owner_only' }
function ownedTag_(map, id, auth) {
  var t = map[String(id || '')];
  if (!t) return { error: 'not_on_sheet' };
  if (t.ownerEmail !== tagOwner_(auth)) return { error: 'owner_only' };
  return { tag: t };
}

function saveTag_(body, auth) {
  var d = body && body.tag;
  if (!d || typeof d !== 'object' || !TAG_ID_RE.test(String(d.id))) return { result: 'error', error: 'invalid_request' };
  return withLock_(function () {
    var map = tagMap_(readTagRows_());
    var o = ownedTag_(map, d.id, auth);
    if (o.error) return { result: 'error', error: o.error };
    var t = o.tag;
    if (d.name !== undefined) t.name = cleanTagName_(d.name) || t.name;
    if (d.color !== undefined) t.color = cleanTagColor_(d.color, t.color);
    if (d.description !== undefined) t.description = cleanTagDesc_(d.description);
    t.updatedAt = new Date();
    writeTagRow_(t);
    return { result: 'success', tag: publicTag_(t) };
  });
}

function deleteTag_(body, auth) {
  var id = String(body && body.id || '');
  return withLock_(function () {
    var map = tagMap_(readTagRows_());
    var o = ownedTag_(map, id, auth);
    if (o.error) return { result: 'error', error: o.error };
    var t = o.tag;
    if (!t.deletedAt) {
      t.deletedAt = new Date();
      t.updatedAt = t.deletedAt;
      writeTagRow_(t);
    }
    return { result: 'success', id: id };
  });
}

// Replaces `from` with `into` in the caller's own published tests (the Tests sheet's Owner column) and marks `from` merged.
function mergeTags_(body, auth) {
  var from = String(body && body.from || '');
  var into = String(body && body.into || '');
  if (!from || !into || from === into) return { result: 'error', error: 'invalid_request' };
  return withLock_(function () {
    var map = tagMap_(readTagRows_());
    var a = ownedTag_(map, from, auth);
    if (a.error) return { result: 'error', error: a.error };
    var b = ownedTag_(map, into, auth);
    if (b.error) return { result: 'error', error: b.error };
    if (a.tag.deletedAt || b.tag.deletedAt) return { result: 'error', error: 'not_on_sheet' };
    var end = resolveTag_(map, into);
    if (end && end.id === from) return { result: 'error', error: 'invalid_request' };
    var who = tagOwner_(auth);
    var sheet = getSheet_(TESTS_SHEET, TEST_HEADERS);
    var last = sheet.getLastRow();
    var rewrittenTests = 0;
    var rewrittenQuestions = 0;
    var now = new Date();
    if (last >= 2) {
      var vals = sheet.getRange(2, 1, last - 1, 5).getValues();
      for (var i = 0; i < vals.length; i++) {
        if (String(vals[i][4] || '').trim().toLowerCase() !== who) continue;
        var t = parseJson_(vals[i][3], null);
        if (!t || !Array.isArray(t.questions)) continue;
        var changed = 0;
        t.questions.forEach(function (q) {
          if (!q || !Array.isArray(q.tags) || q.tags.map(String).indexOf(from) < 0) return;
          var next = [];
          q.tags.forEach(function (x) {
            x = String(x) === from ? into : String(x);
            if (next.indexOf(x) < 0) next.push(x);
          });
          q.tags = next;
          changed++;
        });
        if (!changed) continue;
        var json = JSON.stringify(t);
        if (json.length > MAX_CELL_CHARS) continue;
        sheet.getRange(i + 2, 3, 1, 2).setValues([[now, json]]);
        rewrittenTests++;
        rewrittenQuestions += changed;
      }
    }
    a.tag.mergedInto = into;
    a.tag.deletedAt = now;
    a.tag.updatedAt = now;
    writeTagRow_(a.tag);
    return { result: 'success', into: publicTag_(b.tag), rewrittenTests: rewrittenTests, rewrittenQuestions: rewrittenQuestions };
  });
}

// { id: { name, color } } for the ids a test uses, keyed by the id as stored. Deleted tags keep their name, merged ids
// resolve to the live target, unknown ids are left out.
function tagIndexFor_(test) {
  var ids = testTagIds_(test);
  if (!ids.length) return {};
  var map = tagMap_(readTagRows_());
  var out = {};
  ids.forEach(function (id) {
    var t = resolveTag_(map, id);
    if (t) out[id] = { name: t.name, color: t.color };
  });
  return out;
}

function listTests_(body) {
  if (body && body.summary) return { result: 'success', tests: cached_('tests:list', CACHE_TTL, function () { return testSummaries_(''); }) };
  var sheet = getSheet_(TESTS_SHEET, TEST_HEADERS);
  var last = sheet.getLastRow();
  var tests = [];
  if (last >= 2) {
    var values = sheet.getRange(2, 1, last - 1, 3).getValues();
    for (var i = 0; i < values.length; i++) {
      tests.push({ code: String(values[i][0]), title: String(values[i][1]), updatedAt: iso_(values[i][2]) });
    }
  }
  return { result: 'success', tests: tests };
}

// v5 B2: one pass over Tests + Submissions (only the needed columns). onlyCode limits it to one test.
// status: scheduled (before opensAt) | open | closed (after closesAt, late window ignored).
function testShapeKey_(code, updatedAt) { return 'tshape:' + normalizeCode_(code) + ':' + updatedAt; }
function testSummaries_(onlyCode) {
  var only = normalizeCode_(onlyCode);
  var counts = {};
  var needs = {};
  readCols_(getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS), ['Submission ID', 'Test Code', 'Status']).forEach(function (r) {
    if (r['Submission ID'] === '' || r['Submission ID'] === null) return;
    var st = String(r.Status || '');
    if (st === STATUS_EXTRA || st === STATUS_CLOSED || st === STATUS_NOT_ROSTER) return;
    var c = normalizeCode_(r['Test Code']);
    if (!c || (only && c !== only)) return;
    counts[c] = (counts[c] || 0) + 1;
    if (st === STATUS_NEEDS_GRADING) needs[c] = (needs[c] || 0) + 1;
  });
  var now = new Date().getTime();
  var out = [];
  var testsSheet = getSheet_(TESTS_SHEET, TEST_HEADERS);
  readCols_(testsSheet, ['Code', 'Title', 'Updated At']).forEach(function (r, n) {
    var code = String(r.Code);
    if (!code || (only && normalizeCode_(code) !== only)) return;
    var updatedAt = iso_(r['Updated At']);
    // The parsed shape of a test only changes when its Updated At does, so it is cached under that key and the
    // Test JSON cell is read (and parsed) only on a miss.
    var shape = cached_(testShapeKey_(code, updatedAt), ROW_INDEX_TTL, function () {
      var t = parseJson_(testsSheet.getRange(n + 2, 4).getValue(), null) || {};
      var qs = Array.isArray(t.questions) ? t.questions : [];
      var points = 0;
      qs.forEach(function (q) { var p = q && q.points !== undefined && q.points !== null ? parseFloat(q.points) : 1; points += isFinite(p) ? p : 0; });
      return { questionCount: qs.length, points: round2_(points), opensAt: t.opensAt || '', closesAt: t.closesAt || '' };
    });
    var opens = shape.opensAt ? Date.parse(shape.opensAt) : NaN;
    var closes = shape.closesAt ? Date.parse(shape.closesAt) : NaN;
    var status = isFinite(opens) && now < opens ? 'scheduled' : (isFinite(closes) && now > closes ? 'closed' : 'open');
    out.push({ code: code, title: String(r.Title), updatedAt: updatedAt, status: status, questionCount: shape.questionCount,
      points: shape.points, needsGrading: needs[normalizeCode_(code)] || 0, submissionCount: counts[normalizeCode_(code)] || 0 });
  });
  return out;
}

function deleteTest_(code) {
  var c = normalizeCode_(code);
  return withLock_(function () {
    var sheet = getSheet_(TESTS_SHEET, TEST_HEADERS);
    var row = findRow_(sheet, 1, c);
    if (!row) return { result: 'error', error: 'not_found' };
    sheet.deleteRow(row);
    return { result: 'success' };
  });
}

function getResults_(testCode, opts) {
  var sheet = getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  var last = sheet.getLastRow();
  var rows = [];
  var filter = normalizeCode_(testCode);
  opts = opts || {};
  var statusFilter = opts.status ? String(opts.status).trim().toLowerCase() : '';
  var since = sinceMs_(opts.since);
  var now = new Date().getTime();
  if (last >= 2) {
    var width = SUBMISSION_HEADERS.length;
    var values;
    if (opts.includeAnswers === true) {
      values = sheet.getRange(2, 1, last - 1, width).getValues();
    } else {
      // The answers JSON is the widest column: read the columns on either side of it and leave it blank.
      var before = sheet.getRange(2, 1, last - 1, COL.RESPONSES - 1).getValues();
      var after = sheet.getRange(2, COL.RESPONSES + 1, last - 1, width - COL.RESPONSES).getValues();
      values = before.map(function (b, n) { return b.concat([''], after[n]); });
    }
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (filter && normalizeCode_(v[4]) !== filter) continue;
      if (statusFilter && String(v[COL.STATUS - 1] || '').toLowerCase() !== statusFilter) continue;
      if (since !== null && changedMs_(v) <= since) continue;
      rows.push(submissionRow_(v));
    }
  }
  return { result: 'success', rows: rows, now: now, answersIncluded: opts.includeAnswers === true };
}

// Latest time a submission row changed: submitted, graded, released or retake-allowed.
function changedMs_(v) {
  var best = 0;
  [v[0], v[COL.GRADED_AT - 1], v[COL.RELEASED_AT - 1], v[COL.RETAKE - 1]].forEach(function (d) {
    var t = d instanceof Date ? d.getTime() : (d === '' || d === null ? NaN : Date.parse(d));
    if (isFinite(t) && t > best) best = t;
  });
  return best;
}
// ms epoch (number or numeric string) or an ISO string -> ms; anything else -> null (no filter).
function sinceMs_(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  var t = Date.parse(s);
  return isFinite(t) ? t : null;
}

function submissionRow_(v) {
      var finalScore = v[COL.FINAL_SCORE - 1];
      var finalPct = v[COL.FINAL_PCT - 1];
      return ({
        timestamp: iso_(v[0]),
        submission_id: String(v[1]),
        student_name: String(v[2]),
        student_email: String(v[3]),
        test_code: String(v[4]),
        test_title: String(v[5]),
        score_achieved: num_(v[6]),
        score_total: num_(v[7]),
        percentage: num_(v[8]),
        duration_seconds: num_(v[9]),
        responses: parseJson_(v[12], []),
        flags: parseJson_(v[13], {}),
        status: String(v[COL.STATUS - 1] || ''),
        final_score: finalScore === '' || finalScore === null ? null : num_(finalScore),
        final_percentage: finalPct === '' || finalPct === null ? null : num_(finalPct),
        grades: parseJson_(v[COL.GRADES - 1], null),
        graded_at: iso_(v[COL.GRADED_AT - 1]),
        teacher_note: String(v[COL.NOTE - 1] || ''),
        comments: parseJson_(v[COL.COMMENTS - 1], {}) || {},
        released_at: iso_(v[COL.RELEASED_AT - 1]),
        graded_by: String(v[COL.GRADED_BY - 1] || ''),
        retake_allowed_at: iso_(v[COL.RETAKE - 1]),
        late: v[COL.LATE - 1] === true || v[COL.LATE - 1] === 'true',
        assignmentId: String(v[COL.ASSIGNMENT - 1] || ''),
        dueAt: iso_(v[COL.DUE - 1]),
        identity: String(v[COL.IDENTITY - 1] || '')
      });
}

// v5 B2: cache keys cleared by each write (reads cache tests:list, settings, classes:list, roster:<id>).
function bustFor_(body) {
  switch (body.action) {
    case 'publishTest': case 'deleteTest':
      return bust_('tests:list', TAG_USAGE_KEY);
    case 'saveGrade': case 'releaseAll': case 'allowRetake': case 'applyRegrade':
      return bust_('tests:list');
    case 'saveTag': case 'deleteTag': return bust_(TAG_USAGE_KEY);
    case 'mergeTags': return bust_(TAG_USAGE_KEY, 'tests:list');
    case 'saveClass': return bust_('classes:list', 'roster:' + String((body.cls && body.cls.id) || body.id || ''));
    case 'deleteClass': return bust_('classes:list', 'roster:' + String(body.id || ''));
    case 'saveSettings': return bust_('settings');
    case 'saveAssignment': case 'deleteAssignment': return bust_('assignments:list');
  }
}
// The changed row for a write: a test summary, or the submission row. Additive; old fields stay.
function rowFor_(body, res) {
  switch (body.action) {
    case 'publishTest': return testSummaries_(res.code)[0] || null;
    case 'deleteTest': return { code: normalizeCode_(body.code), deleted: true };
    case 'releaseAll': return testSummaries_(body.testCode)[0] || null;
    case 'saveGrade': case 'allowRetake': return submissionById_(body.submissionId);
  }
  return undefined;
}
function submissionById_(id) {
  var sheet = getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  var row = findRow_(sheet, 2, String(id));
  return row ? submissionRow_(sheet.getRange(row, 1, 1, SUBMISSION_HEADERS.length).getValues()[0]) : null;
}

// Non-empty comments only, each trimmed and capped. Formatting is a safe Markdown subset rendered client-side
// with textContent (js/lib/comments.js); the backend stores plain text.
function cleanComments_(map) {
  var out = {};
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  for (var k in map) {
    if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
    var c = String(map[k] == null ? '' : map[k]).replace(/\r\n?/g, '\n').replace(/^\s+|\s+$/g, '').slice(0, MAX_COMMENT_CHARS);
    if (c) out[k] = c;
  }
  return out;
}

// Completed submissions per test code. Every row in Submissions is a completed submission (in-progress
// answers only live in the student's browser; there are no drafts or soft-deleted rows in the sheet).
// Rows marked Extra attempt (v3) are skipped.
function getSubmissionCounts_() {
  var sheet = getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  var last = sheet.getLastRow();
  var counts = {};
  if (last >= 2) {
    var values = sheet.getRange(2, 1, last - 1, COL.STATUS).getValues();
    for (var i = 0; i < values.length; i++) {
      if (values[i][1] === '' || values[i][1] === null) continue; // no submission id
      if (String(values[i][COL.STATUS - 1]) === STATUS_EXTRA) continue; // v3: extra attempts are not counted
      var code = normalizeCode_(values[i][4]);
      if (!code) continue;
      counts[code] = (counts[code] || 0) + 1;
    }
  }
  return { result: 'success', counts: counts };
}

// Student-facing (no admin key). Needs a valid ID token whose email equals the row's email, and the submission id.
// Returns grades and comments only after the teacher released them; otherwise { released: false }.
// Errors: unauthorized (no token), invalid_token, not_found (unknown id), not_authorized (row belongs to someone else).
function getFeedback_(body) {
  var id = body && body.submissionId ? String(body.submissionId) : '';
  var token = body && body.idToken ? String(body.idToken) : '';
  if (!token) return { result: 'error', error: 'unauthorized' };
  var clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!clientId) return { result: 'error', error: 'identity_not_configured' };
  var who = verifyIdToken_(token, clientId);
  if (who.error || !who.email) return { result: 'error', error: 'invalid_token' };
  if (!id) return { result: 'error', error: 'not_found' };
  var sheet = getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  var row = findRow_(sheet, 2, id);
  if (!row) return { result: 'error', error: 'not_found' };
  var v = sheet.getRange(row, 1, 1, SUBMISSION_HEADERS.length).getValues()[0];
  if (String(v[COL.EMAIL - 1]).trim().toLowerCase() !== who.email) return { result: 'error', error: 'not_authorized' };
  var releasedAt = iso_(v[COL.RELEASED_AT - 1]);
  var idx = tagIndexFor_(publishedTest_(normalizeCode_(v[4])));
  if (!releasedAt) return { result: 'success', released: false, tagIndex: idx };
  var finalScore = v[COL.FINAL_SCORE - 1];
  var finalPct = v[COL.FINAL_PCT - 1];
  return {
    result: 'success',
    released: true,
    tagIndex: idx,
    released_at: releasedAt,
    status: String(v[COL.STATUS - 1] || ''),
    final_score: finalScore === '' || finalScore === null ? num_(v[6]) : num_(finalScore),
    score_total: num_(v[7]),
    final_percentage: finalPct === '' || finalPct === null ? num_(v[8]) : num_(finalPct),
    grades: parseJson_(v[COL.GRADES - 1], {}) || {},
    comments: parseJson_(v[COL.COMMENTS - 1], {}) || {},
    graded_by: String(v[COL.GRADED_BY - 1] || '')
  };
}

// body: { submissionId, grades: { [questionId]: points }, note, comments?: { [questionId]: text }, release?: boolean, gradedBy?: string }
// gradedBy omitted -> existing value kept.
// comments omitted -> existing comments kept. release: true -> set Released At (kept if already set),
// false -> clear it, omitted -> unchanged.
function saveGrade_(body) {
  var id = body && body.submissionId ? String(body.submissionId) : '';
  if (!id) return { result: 'error', error: 'missing_submission_id' };
  var grades = body.grades && typeof body.grades === 'object' && !Array.isArray(body.grades) ? body.grades : {};
  var clean = {};
  for (var k in grades) {
    if (Object.prototype.hasOwnProperty.call(grades, k) && grades[k] !== '' && grades[k] !== null && isFinite(parseFloat(grades[k]))) clean[k] = num_(grades[k]);
  }
  var note = String(body.note == null ? '' : body.note).slice(0, 5000);
  var hasGradedBy = body.gradedBy !== undefined && body.gradedBy !== null;
  var gradedBy = String(hasGradedBy ? body.gradedBy : '').trim().slice(0, 200);
  var hasComments = body.comments !== undefined && body.comments !== null;
  var comments = cleanComments_(body.comments);

  return withLock_(function () {
    var sheet = getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
    var row = findRow_(sheet, 2, id);
    if (!row) return { result: 'error', error: 'not_found' };
    var responses = parseJson_(sheet.getRange(row, COL.RESPONSES).getValue(), []);
    var final = applyGrades_(responses, clean);
    var gradedAt = new Date();
    var existing = sheet.getRange(row, COL.COMMENTS, 1, 3).getValues()[0];
    if (!hasGradedBy) gradedBy = String(existing[2] || '');
    if (!hasComments) comments = parseJson_(existing[0], {}) || {};
    var commentsJson = JSON.stringify(comments);
    if (commentsJson.length > MAX_CELL_CHARS) return { result: 'error', error: 'comments_too_large' };
    var releasedAt = existing[1] instanceof Date || (existing[1] !== '' && existing[1] !== null) ? existing[1] : '';
    if (body.release === true && !releasedAt) releasedAt = gradedAt;
    if (body.release === false) releasedAt = '';
    sheet.getRange(row, COL.STATUS, 1, 9).setValues([[
      STATUS_GRADED, final.score, final.percentage, JSON.stringify(clean), gradedAt, text_(note), commentsJson, releasedAt, text_(gradedBy)
    ]]);
    return {
      result: 'success',
      grade: { status: STATUS_GRADED, final_score: final.score, score_total: final.total, final_percentage: final.percentage, grades: clean, graded_at: gradedAt.toISOString(), teacher_note: note, comments: comments, released_at: iso_(releasedAt), graded_by: gradedBy }
    };
  });
}

// ---------------------------------------------------------------------------
// v3: verified student identity, student status, teacher tools
// ---------------------------------------------------------------------------

function hex_(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

function domainAllowed_(email, hd) {
  var raw = PropertiesService.getScriptProperties().getProperty('ALLOWED_DOMAINS');
  if (!raw) return true;
  var list = String(raw).split(',').map(function (d) { return d.trim().toLowerCase(); }).filter(function (d) { return d; });
  if (!list.length) return true;
  var domain = String(email).split('@')[1] || '';
  var h = String(hd || '').toLowerCase();
  return list.indexOf(domain.toLowerCase()) >= 0 || (h && list.indexOf(h) >= 0);
}

// -> { email, name } (lowercased, verified; name is '' when the token has none) | { error: 'unauthorized' | 'identity_not_configured' }
// Accepts a Google ID token only if aud = GOOGLE_CLIENT_ID, email_verified, not expired, issuer is Google.
// Dev fallback: ALLOW_UNVERIFIED_EMAIL=true accepts body.studentEmail without a token (off by default).
function verifyStudent_(body) {
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('GOOGLE_CLIENT_ID');
  var allowUnverified = props.getProperty('ALLOW_UNVERIFIED_EMAIL') === 'true';
  var token = body && body.idToken ? String(body.idToken) : '';
  var claimed = body && body.studentEmail ? String(body.studentEmail).trim().toLowerCase() : '';
  if (!token || !clientId) {
    if (allowUnverified && claimed && /^[^\s@]+@[^\s@]+$/.test(claimed)) {
      return domainAllowed_(claimed, '') ? { email: claimed, name: '' } : { error: 'unauthorized' };
    }
    return { error: clientId ? 'unauthorized' : 'identity_not_configured' };
  }
  return verifyIdToken_(token, clientId);
}

// Shared by students and admins. -> { email } (lowercased) | { error: 'unauthorized' }
// Accepts a Google ID token only if aud = clientId, email_verified, not expired, issuer is Google, domain allowed.
function verifyIdToken_(token, clientId) {
  var cache = null;
  var key = '';
  try {
    cache = CacheService.getScriptCache();
    key = 'tok:' + hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
    var hit = cache.get(key);
    if (hit) {
      if (hit.charAt(0) === '{') { var cachedWho = JSON.parse(hit); return { email: cachedWho.email, name: cachedWho.name || '' }; }
      return { email: hit, name: '' };
    }
  } catch (cacheErr) {
    cache = null;
  }
  var info;
  try {
    var res = UrlFetchApp.fetch(TOKENINFO_URL + encodeURIComponent(token), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return { error: 'unauthorized' };
    info = JSON.parse(res.getContentText());
  } catch (fetchErr) {
    return { error: 'unauthorized' };
  }
  var nowSec = Math.floor(Date.now() / 1000);
  var exp = num_(info && info.exp, 0);
  var email = String((info && info.email) || '').trim().toLowerCase();
  var name = String((info && info.name) || '').trim().slice(0, 120);
  if (!info || info.aud !== clientId) return { error: 'unauthorized' };
  if (!(info.email_verified === true || info.email_verified === 'true')) return { error: 'unauthorized' };
  if (!(exp > nowSec)) return { error: 'unauthorized' };
  if (TOKEN_ISSUERS.indexOf(String(info.iss)) < 0) return { error: 'unauthorized' };
  if (!email) return { error: 'unauthorized' };
  if (!domainAllowed_(email, info.hd)) return { error: 'unauthorized' };
  if (cache && key) {
    var ttl = Math.min(21600, exp - nowSec);
    try { if (ttl > 0) cache.put(key, JSON.stringify({ email: email, name: name }), ttl); } catch (putErr) { /* quota: ignore */ }
  }
  return { email: email, name: name };
}

// Published test settings (bundled tests are not in the sheet -> null).
function publishedTest_(code) {
  return readTest_(code);
}

function testIsSingleSubmission_(code) {
  var t = publishedTest_(code);
  return !!(t && t.singleSubmission === true);
}

// Counted (non-Extra) rows for one student + test, oldest first. One getValues() pass per column block.
// -> [{ row, submission_id, submitted_at, status, released_at, retake_allowed_at }]
var EMAIL_CODE_INDEX_ = 'rowidx:Submissions:email|code';
function emailCodeKey_(email, code) { return String(email).trim().toLowerCase() + '|' + normalizeCode_(code); }
// Cached map 'email|code' -> [sheet rows]. Rebuilt from the email and code columns only.
function rebuildEmailCodeIndex_(sheet) {
  var last = sheet.getLastRow();
  var map = {};
  if (last >= 2) {
    var ids = sheet.getRange(2, 2, last - 1, 1).getValues();
    var ec = sheet.getRange(2, 4, last - 1, 2).getValues();
    for (var i = 0; i < ec.length; i++) {
      if (ids[i][0] === '' || ids[i][0] === null) continue;
      var k = emailCodeKey_(ec[i][0], ec[i][1]);
      (map[k] = map[k] || []).push(i + 2);
    }
  }
  rowIndexStore_(EMAIL_CODE_INDEX_, map);
  return map;
}
function readSubmissionRow_(sheet, row) {
  var v = sheet.getRange(row, 1, 1, COL.RETAKE).getValues()[0];
  return { v: v, ok: v[1] !== '' && v[1] !== null };
}
function findRowsByEmailCode_(sheet, email, code) {
  var e = String(email || '').trim().toLowerCase();
  var c = normalizeCode_(code);
  var out = [];
  if (!e || !c || sheet.getLastRow() < 2) return out;
  var key = emailCodeKey_(e, c);
  var map = rowIndexLoad_(EMAIL_CODE_INDEX_);
  var rows = map && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
  var read = null;
  if (rows) {
    // Trust the cached rows only while every one still holds this student and test.
    read = rows.map(function (r) { return { row: r, d: readSubmissionRow_(sheet, r) }; });
    var good = read.every(function (x) { return x.d.ok && emailCodeKey_(x.d.v[3], x.d.v[4]) === key; });
    if (!good) rows = null;
  }
  if (!rows) {
    map = rebuildEmailCodeIndex_(sheet);
    rows = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : [];
    read = rows.map(function (r) { return { row: r, d: readSubmissionRow_(sheet, r) }; });
  }
  read.forEach(function (x) {
    var v = x.d.v;
    var status = String(v[COL.STATUS - 1] || '');
    if (status === STATUS_EXTRA) return;
    out.push({
      row: x.row,
      submission_id: String(v[1]),
      submitted_at: iso_(v[0]),
      status: status,
      released_at: iso_(v[COL.RELEASED_AT - 1]),
      retake_allowed_at: iso_(v[COL.RETAKE - 1])
    });
  });
  return out;
}
// Adds a freshly appended Submissions row to the email|code index.
function emailCodeIndexAdd_(email, code, row) {
  var map = rowIndexLoad_(EMAIL_CODE_INDEX_);
  if (!map) return;
  var k = emailCodeKey_(email, code);
  (map[k] = map[k] || []).push(row);
  rowIndexStore_(EMAIL_CODE_INDEX_, map);
}

function stripAnswers_(responses) {
  var list = Array.isArray(responses) ? responses : [];
  return list.map(function (r) {
    var c = {};
    for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k) && k !== 'correctAnswer' && k !== 'correctAnswerText') c[k] = r[k];
    return c;
  });
}

// Student-facing. body: { testCode, idToken } (or studentEmail under ALLOW_UNVERIFIED_EMAIL).
// -> { result, submitted, blocking, attempts, latest, others, feedback? } — feedback only for a released row;
// the teacher note is never returned.
function getStudentStatus_(body) {
  var who = verifyStudent_(body);
  if (who.error) return { result: 'error', error: who.error };
  var code = normalizeCode_(body && body.testCode);
  if (!code) return { result: 'error', error: 'missing_test_code' };
  var sheet = getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  var rows = findRowsByEmailCode_(sheet, who.email, code);
  rows.sort(function (a, b) { return String(a.submitted_at) < String(b.submitted_at) ? -1 : String(a.submitted_at) > String(b.submitted_at) ? 1 : a.row - b.row; });
  var blocking = false;
  for (var i = 0; i < rows.length; i++) if (!rows[i].retake_allowed_at) blocking = true;
  var summary = function (r) {
    return { submission_id: r.submission_id, submitted_at: r.submitted_at, status: r.status, released: !!r.released_at, retake_allowed: !!r.retake_allowed_at };
  };
  var out = { result: 'success', email: who.email, submitted: rows.length > 0, blocking: blocking, attempts: rows.length, latest: rows.length ? summary(rows[rows.length - 1]) : null, others: [] };
  // v4 S11/S12: accommodations, window (incl. this student's extension) and roster for the client to act on.
  var acc = accommodationFor_(who.email, code);
  var ptest = publishedTest_(code);
  out.accommodations = acc;
  if (ptest) {
    out.window = windowState_(ptest, acc, new Date());
    out.roster = { required: ptest.rosterOnly === true, ok: rosterOk_(ptest, who.email).ok };
    if (acc && acc.extraAttempts > 0 && blocking) {
      var counted = 0;
      for (var ca = 0; ca < rows.length; ca++) if (!rows[ca].retake_allowed_at) counted++;
      if (counted <= acc.extraAttempts) { out.blocking = false; out.extraAttemptsLeft = acc.extraAttempts - counted + 1; }
    }
  }
  var releasedRow = null;
  for (var j = rows.length - 1; j >= 0; j--) if (rows[j].released_at) { releasedRow = rows[j]; break; }
  for (var k = 0; k < rows.length; k++) if (!releasedRow || rows[k].row !== releasedRow.row) out.others.push(summary(rows[k]));
  if (releasedRow) {
    var v = sheet.getRange(releasedRow.row, 1, 1, SUBMISSION_HEADERS.length).getValues()[0];
    var test = publishedTest_(code);
    var responses = parseJson_(v[COL.RESPONSES - 1], []);
    if (test && test.showCorrectAnswers === false) responses = stripAnswers_(responses);
    var finalScore = v[COL.FINAL_SCORE - 1];
    var finalPct = v[COL.FINAL_PCT - 1];
    out.feedback = {
      submission_id: String(v[1]),
      test_code: String(v[4]),
      test_title: String(v[5]),
      student_name: String(v[2]),
      student_email: String(v[3]),
      submitted_at: iso_(v[0]),
      released_at: iso_(v[COL.RELEASED_AT - 1]),
      status: String(v[COL.STATUS - 1] || ''),
      score_achieved: num_(v[6]),
      final_score: finalScore === '' || finalScore === null ? num_(v[6]) : num_(finalScore),
      score_total: num_(v[7]),
      final_percentage: finalPct === '' || finalPct === null ? num_(v[8]) : num_(finalPct),
      duration_seconds: num_(v[9]),
      grades: parseJson_(v[COL.GRADES - 1], {}) || {},
      comments: parseJson_(v[COL.COMMENTS - 1], {}) || {},
      graded_by: String(v[COL.GRADED_BY - 1] || ''),
      responses: responses
    };
  }
  return out;
}

// Admin: set Released At on every Graded / Auto-graded, not-yet-released row of a test.
function releaseAll_(testCode) {
  var code = normalizeCode_(testCode);
  if (!code) return { result: 'error', error: 'missing_test_code' };
  return withLock_(function () {
    var sheet = getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
    var last = sheet.getLastRow();
    if (last < 2) return { result: 'success', released: 0 };
    var codes = sheet.getRange(2, 5, last - 1, 1).getValues();
    var statuses = sheet.getRange(2, COL.STATUS, last - 1, 1).getValues();
    var relRange = sheet.getRange(2, COL.RELEASED_AT, last - 1, 1);
    var rel = relRange.getValues();
    var who = sheet.getRange(2, 4, last - 1, 3).getValues(); // email, code, title (v4 release emails)
    var now = new Date();
    var n = 0;
    var mail = [];
    for (var i = 0; i < rel.length; i++) {
      if (normalizeCode_(codes[i][0]) !== code) continue;
      var st = String(statuses[i][0] || '');
      if (st !== STATUS_GRADED && st !== STATUS_AUTO) continue;
      if (rel[i][0] !== '' && rel[i][0] !== null) continue;
      rel[i][0] = now;
      n++;
      mail.push({ email: normEmail_(who[i][0]), code: code, title: String(who[i][2] || '') });
    }
    if (n) relRange.setValues(rel);
    var emailed = n ? sendReleaseEmails_(mail) : 0;
    return { result: 'success', released: n, emailed: emailed };
  });
}

// Admin: body { submissionId, allow } -> sets / clears Retake Allowed At on that row.
function allowRetake_(body) {
  var id = body && body.submissionId ? String(body.submissionId) : '';
  if (!id) return { result: 'error', error: 'missing_submission_id' };
  var allow = body.allow !== false;
  return withLock_(function () {
    var sheet = getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
    var row = findRow_(sheet, 2, id);
    if (!row) return { result: 'error', error: 'not_found' };
    var value = allow ? new Date() : '';
    sheet.getRange(row, COL.RETAKE).setValue(value);
    return { result: 'success', retake_allowed_at: iso_(value) };
  });
}


// ===========================================================================
// v4 S11–S13 (+ S15 leaderboard, S17 errors). New sheets are created on first use by getSheet_.
// ===========================================================================

var CLASSES_SHEET = 'Classes';
var CLASS_HEADERS = ['ID', 'Name', 'Period', 'Emails (JSON)', 'Updated By', 'Updated At'];
var BANK_SHEET = 'Bank';
var BANK_HEADERS = ['ID', 'Question (JSON)', 'Tags (JSON)', 'Added By', 'Added At', 'Edited By', 'Edited At'];
var ACC_SHEET = 'Accommodations';
var ACC_HEADERS = ['Email', 'Test Code', 'Extra Time', 'Extra Attempts', 'Reduced Choices', 'Read Aloud', 'Extension Until', 'Notes', 'Updated By', 'Updated At'];
var SETTINGS_SHEET = 'Settings';
var SETTINGS_HEADERS = ['Key', 'Value'];
var LIVE_SHEET = 'Live';
var LIVE_HEADERS = ['Test Code', 'Email', 'Name', 'Answered', 'Total', 'Time Left (s)', 'Started', 'Last Ping', 'Submitted'];
var BOARD_SHEET = 'Leaderboard';
var BOARD_HEADERS = ['Test Code', 'Game', 'Email', 'Name', 'Score', 'Updated', 'Hidden'];
var ERRORS_SHEET = 'Errors';
var ERROR_HEADERS = ['Time', 'Page', 'Message', 'Detail', 'Browser'];
var BOARD_MAX_SCORE = 100000;
var BOARD_TOP = 10;
var ERRORS_PER_SENDER_HOUR = 20;
var ERRORS_GLOBAL_HOUR = 500;
var ID_SAFE_RE = /^[A-Za-z0-9_-]{1,64}$/;

function actorOf_(auth) { return auth && auth.via === 'google' ? auth.email : 'ADMIN_KEY'; }
function normEmail_(e) { return String(e == null ? '' : e).trim().toLowerCase(); }
function newId_(prefix) { return prefix + '-' + new Date().getTime().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36); }
function sheetRows_(name, headers) {
  var sheet = getSheet_(name, headers);
  var last = sheet.getLastRow();
  return { sheet: sheet, values: last < 2 ? [] : sheet.getRange(2, 1, last - 1, headers.length).getValues() };
}
function cleanEmails_(list) {
  var out = [];
  var seen = {};
  (Array.isArray(list) ? list : String(list || '').split(/[\s,;]+/)).forEach(function (e) {
    var v = normEmail_(e);
    if (v && EMAIL_RE.test(v) && !seen[v]) { seen[v] = true; out.push(v); }
  });
  return out;
}

// ---------- drawn questions (pools) ----------
function drawnOf_(d) {
  var inst = d.instance;
  if (typeof d.instance_json === 'string' && d.instance_json) inst = parseJson_(d.instance_json, null);
  var drawn = inst && typeof inst === 'object' && Array.isArray(inst.drawn) ? inst.drawn : [];
  return drawn.length ? JSON.stringify(drawn.map(String)).slice(0, 5000) : '';
}

// ---------- classes / rosters (S11) ----------
function listClasses_() {
  return { result: 'success', classes: classesCached_() };
}
function classesCached_() {
  return cached_('classes:list', CACHE_TTL, function () {
    var r = sheetRows_(CLASSES_SHEET, CLASS_HEADERS);
    return r.values.filter(function (v) { return String(v[0]); }).map(function (v) {
      return { id: String(v[0]), name: String(v[1]), period: String(v[2]), emails: parseJson_(v[3], []) || [], updated_by: String(v[4]), updated_at: iso_(v[5]) };
    });
  });
}
// One class roster (lower-cased emails), cached per class. Unknown class -> [].
function rosterOf_(id) {
  return cached_('roster:' + id, CACHE_TTL, function () {
    var hit = classesCached_().filter(function (c) { return c.id === id; })[0];
    return hit ? hit.emails : [];
  });
}
function saveClass_(body, auth) {
  var c = body.cls && typeof body.cls === 'object' ? body.cls : body;
  var name = String(c.name || '').trim().slice(0, 120);
  if (!name) return { result: 'error', error: 'missing_name' };
  var id = c.id ? String(c.id) : newId_('class');
  if (!ID_SAFE_RE.test(id)) return { result: 'error', error: 'invalid_id' };
  var emails = cleanEmails_(c.emails);
  var json = JSON.stringify(emails);
  if (json.length > MAX_CELL_CHARS) return { result: 'error', error: 'class_too_large' };
  return withLock_(function () {
    var sheet = getSheet_(CLASSES_SHEET, CLASS_HEADERS);
    var row = findRow_(sheet, 1, id);
    var vals = [id, text_(name), text_(String(c.period || '').slice(0, 40)), json, text_(actorOf_(auth)), new Date()];
    if (row) sheet.getRange(row, 1, 1, vals.length).setValues([vals]); else sheet.appendRow(vals);
    var cls = { id: id, name: name, period: String(c.period || ''), emails: emails };
    return { result: 'success', cls: cls, row: cls };
  });
}
function deleteClass_(body) {
  var id = String(body.id || '');
  return withLock_(function () {
    var sheet = getSheet_(CLASSES_SHEET, CLASS_HEADERS);
    var row = findRow_(sheet, 1, id);
    if (!row) return { result: 'error', error: 'not_found' };
    sheet.deleteRow(row);
    return { result: 'success' };
  });
}
// -> { ok, classId } ; a test without rosterOnly is open to everyone (classId = first matching class, if any).
function rosterOk_(test, email) {
  var ids = Array.isArray(test && test.classes) ? test.classes.map(String) : [];
  var e = normEmail_(email);
  if (!ids.length) return { ok: test.rosterOnly !== true, classId: '' };
  for (var i = 0; i < ids.length; i++) if (rosterOf_(ids[i]).indexOf(e) >= 0) return { ok: true, classId: ids[i] };
  return { ok: test.rosterOnly !== true, classId: '' };
}

// ---------- question bank (S11), shared by all admins ----------
function listBank_() {
  var r = sheetRows_(BANK_SHEET, BANK_HEADERS);
  return { result: 'success', items: r.values.filter(function (v) { return String(v[0]); }).map(function (v) {
    return { id: String(v[0]), question: parseJson_(v[1], null), tags: parseJson_(v[2], {}) || {}, added_by: String(v[3]), added_at: iso_(v[4]), edited_by: String(v[5]), edited_at: iso_(v[6]) };
  }) };
}
function saveBankItem_(body, auth) {
  var it = body.item && typeof body.item === 'object' ? body.item : {};
  if (!it.question || typeof it.question !== 'object' || !it.question.type) return { result: 'error', error: 'missing_question' };
  var qJson = JSON.stringify(it.question);
  var tJson = JSON.stringify(it.tags && typeof it.tags === 'object' ? it.tags : {});
  if (qJson.length > MAX_CELL_CHARS || tJson.length > 5000) return { result: 'error', error: 'item_too_large' };
  var id = it.id ? String(it.id) : newId_('bank');
  if (!ID_SAFE_RE.test(id)) return { result: 'error', error: 'invalid_id' };
  return withLock_(function () {
    var sheet = getSheet_(BANK_SHEET, BANK_HEADERS);
    var row = findRow_(sheet, 1, id);
    var who = text_(actorOf_(auth));
    if (row) {
      var cur = sheet.getRange(row, 1, 1, BANK_HEADERS.length).getValues()[0];
      sheet.getRange(row, 1, 1, BANK_HEADERS.length).setValues([[id, qJson, tJson, cur[3], cur[4], who, new Date()]]);
    } else sheet.appendRow([id, qJson, tJson, who, new Date(), '', '']);
    return { result: 'success', id: id };
  });
}
function deleteBankItem_(body) {
  var id = String(body.id || '');
  return withLock_(function () {
    var sheet = getSheet_(BANK_SHEET, BANK_HEADERS);
    var row = findRow_(sheet, 1, id);
    if (!row) return { result: 'error', error: 'not_found' };
    sheet.deleteRow(row);
    return { result: 'success' };
  });
}

// ---------- accommodations + extensions (S12) ----------
function accRow_(v) {
  return {
    email: normEmail_(v[0]), testCode: normalizeCode_(v[1]) || '*', extraTime: num_(v[2], 1) || 1, extraAttempts: Math.max(0, Math.floor(num_(v[3], 0))),
    reducedChoices: v[4] === true || v[4] === 'true', readAloud: v[5] === true || v[5] === 'true', extensionUntil: iso_(v[6]), notes: String(v[7] || ''),
    updated_by: String(v[8] || ''), updated_at: iso_(v[9])
  };
}
function getAccommodations_(body) {
  var r = sheetRows_(ACC_SHEET, ACC_HEADERS);
  var code = body && body.testCode ? normalizeCode_(body.testCode) : '';
  var list = r.values.filter(function (v) { return String(v[0]); }).map(accRow_);
  if (code) list = list.filter(function (a) { return a.testCode === '*' || a.testCode === code; });
  return { result: 'success', accommodations: list };
}
// All accommodations, read once per request.
function accommodationsAll_() { return REQ_.acc || (REQ_.acc = getAccommodations_({}).accommodations); }
// Merged accommodation for a student on a test: test-specific values win over the '*' (all tests) row.
function accommodationFor_(email, code) {
  var e = normEmail_(email);
  if (!e) return null;
  var list = accommodationsAll_().filter(function (a) { return a.email === e && (a.testCode === '*' || a.testCode === normalizeCode_(code)); });
  if (!list.length) return null;
  list.sort(function (a, b) { return a.testCode === '*' ? -1 : b.testCode === '*' ? 1 : 0; });
  var out = { extraTime: 1, extraAttempts: 0, reducedChoices: false, readAloud: false, extensionUntil: '', notes: '' };
  list.forEach(function (a) {
    if (a.extraTime && a.extraTime !== 1) out.extraTime = a.extraTime;
    if (a.extraAttempts) out.extraAttempts = a.extraAttempts;
    if (a.reducedChoices) out.reducedChoices = true;
    if (a.readAloud) out.readAloud = true;
    if (a.extensionUntil) out.extensionUntil = a.extensionUntil;
    if (a.notes) out.notes = a.notes;
  });
  return out;
}
function saveAccommodation_(body, auth) {
  var email = normEmail_(body.email);
  if (!EMAIL_RE.test(email)) return { result: 'error', error: 'invalid_email' };
  var code = body.testCode ? normalizeCode_(body.testCode) : '*';
  return withLock_(function () {
    var sheet = getSheet_(ACC_SHEET, ACC_HEADERS);
    var last = sheet.getLastRow();
    var vals = last < 2 ? [] : sheet.getRange(2, 1, last - 1, ACC_HEADERS.length).getValues();
    var row = 0;
    for (var i = 0; i < vals.length; i++) if (normEmail_(vals[i][0]) === email && (normalizeCode_(vals[i][1]) || '*') === code) { row = i + 2; break; }
    var cur = row ? accRow_(vals[row - 2]) : { extraTime: 1, extraAttempts: 0, reducedChoices: false, readAloud: false, extensionUntil: '', notes: '' };
    var pick = function (k, d) { return body[k] === undefined ? (body.merge ? cur[k] : d) : body[k]; };
    var extraTime = Math.min(4, Math.max(1, num_(pick('extraTime', 1), 1)));
    var until = pick('extensionUntil', '');
    var untilDate = until ? new Date(until) : '';
    if (untilDate && isNaN(untilDate.getTime())) return { result: 'error', error: 'invalid_date' };
    var rowVals = [email, text_(code), extraTime, Math.max(0, Math.floor(num_(pick('extraAttempts', 0), 0))), pick('reducedChoices', false) === true,
      pick('readAloud', false) === true, untilDate, text_(String(pick('notes', '') || '').slice(0, 500)), text_(actorOf_(auth)), new Date()];
    if (row) sheet.getRange(row, 1, 1, rowVals.length).setValues([rowVals]); else sheet.appendRow(rowVals);
    REQ_.acc = null;
    return { result: 'success', accommodation: accRow_(rowVals) };
  });
}
function deleteAccommodation_(body) {
  var email = normEmail_(body.email);
  var code = body.testCode ? normalizeCode_(body.testCode) : '*';
  return withLock_(function () {
    var sheet = getSheet_(ACC_SHEET, ACC_HEADERS);
    var last = sheet.getLastRow();
    var vals = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 2).getValues();
    for (var i = 0; i < vals.length; i++) if (normEmail_(vals[i][0]) === email && (normalizeCode_(vals[i][1]) || '*') === code) { sheet.deleteRow(i + 2); REQ_.acc = null; return { result: 'success' }; }
    return { result: 'error', error: 'not_found' };
  });
}

// ---------- open / close window + late work (S12) ----------
// -> { state: 'open'|'before'|'late'|'closed', opensAt, closesAt, lateUntil, extensionUntil, penalty }
function windowState_(test, acc, now) {
  var t = now instanceof Date ? now.getTime() : Date.now();
  var d = function (v) { var x = v ? new Date(v) : null; return x && !isNaN(x.getTime()) ? x.getTime() : null; };
  var opens = d(test && test.opensAt);
  var closes = d(test && test.closesAt);
  var late = test && test.late && typeof test.late === 'object' ? test.late : null;
  var lateUntil = late ? d(late.until) : null;
  var ext = acc ? d(acc.extensionUntil) : null;
  var out = { state: 'open', opensAt: test && test.opensAt || '', closesAt: test && test.closesAt || '', lateUntil: late && late.until || '', extensionUntil: acc && acc.extensionUntil || '', penalty: late && late.penalty || null };
  if (opens !== null && t < opens) { out.state = 'before'; return out; }
  if (closes === null || t <= closes) return out;
  if (ext !== null && t <= ext) return out; // extension: on time
  if (lateUntil !== null && t <= lateUntil) { out.state = 'late'; return out; }
  out.state = 'closed';
  return out;
}
// Late penalty on a percentage: { type: 'percentPerDay'|'flat', value }.
function latePenalty_(penalty, closesAt, now) {
  if (!penalty || !closesAt) return 0;
  var v = Math.max(0, num_(penalty.value, 0));
  if (penalty.type === 'flat') return Math.min(100, v);
  var days = Math.ceil(Math.max(0, now.getTime() - new Date(closesAt).getTime()) / 86400000);
  return Math.min(100, v * days);
}
// Gate for a submission: { status?, late?, penalized?, score?, percentage?, classId? }.
function submissionGate_(s, body) {
  var test = publishedTest_(s.test_code);
  if (!test) return {};
  var email = normEmail_(s.student_email);
  var out = {};
  var r = rosterOk_(test, email);
  out.classId = r.classId;
  if (!r.ok) { out.status = STATUS_NOT_ROSTER; return out; }
  var now = new Date();
  var acc = accommodationFor_(email, s.test_code);
  var w = windowState_(test, acc, now);
  if (w.state === 'before' || w.state === 'closed') { out.status = STATUS_CLOSED; return out; }
  var asg = assignmentGate_(email, s.test_code, acc, now);
  if (asg) {
    out.assignmentId = asg.id; out.dueAt = asg.dueAt;
    if (asg.pastDue) { if (asg.lateAllowed) out.late = true; else { out.status = STATUS_CLOSED; return out; } }
  }
  if (w.state === 'late') {
    out.late = true;
    var pen = latePenalty_(w.penalty, test.closesAt, now);
    if (pen > 0) {
      out.penalized = true;
      out.score = round2_(s.score_achieved * (1 - pen / 100));
      out.percentage = round2_(num_(s.percentage) * (1 - pen / 100));
    }
  }
  return out;
}
// POST getTest with a verified token: applies the student's extension (and refuses roster-only tests for others).
function getTestFor_(body) {
  var c = normalizeCode_(body && body.code);
  if (!c) return { result: 'error', error: 'not_found' };
  var test = publishedTest_(c);
  if (!test) return { result: 'error', error: 'not_found' };
  var who = verifyStudent_(body);
  var acc = who.email ? accommodationFor_(who.email, c) : null;
  var w = windowState_(test, acc, new Date());
  if (w.state === 'before') return { result: 'error', error: 'not_open', opensAt: test.opensAt, title: test.title || '' };
  if (w.state === 'closed') return { result: 'error', error: 'closed', closesAt: test.closesAt, title: test.title || '' };
  if (test.rosterOnly === true && (!who.email || !rosterOk_(test, who.email).ok)) return { result: 'error', error: 'not_on_roster', title: test.title || '' };
  return { result: 'success', test: test, window: w, accommodations: acc, tagIndex: tagIndexFor_(test) };
}

// ---------- regrade (S12): the admin client re-grades stored answers with the fixed key and sends the new responses ----------
function applyRegrade_(body) {
  var code = normalizeCode_(body.testCode);
  var updates = Array.isArray(body.updates) ? body.updates : [];
  if (!code || !updates.length) return { result: 'error', error: 'nothing_to_regrade' };
  return withLock_(function () {
    var sheet = getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
    var changed = 0;
    updates.forEach(function (u) {
      var row = findRow_(sheet, 2, String(u.submissionId || ''));
      if (!row) return;
      var v = sheet.getRange(row, 1, 1, SUBMISSION_HEADERS.length).getValues()[0];
      if (normalizeCode_(v[4]) !== code) return;
      var responses = Array.isArray(u.responses) ? u.responses : null;
      if (!responses) return;
      var json = JSON.stringify(responses);
      if (json.length > MAX_CELL_CHARS) return;
      var grades = parseJson_(v[COL.GRADES - 1], {}) || {};
      var final = applyGrades_(responses, grades); // teacher overrides are kept
      sheet.getRange(row, 7, 1, 3).setValues([[num_(u.scoreAchieved), num_(u.scoreTotal), num_(u.percentage)]]);
      sheet.getRange(row, COL.RESPONSES, 1, 1).setValues([[json]]);
      var status = String(v[COL.STATUS - 1] || '');
      if (status === STATUS_AUTO || status === STATUS_GRADED) sheet.getRange(row, COL.FINAL_SCORE, 1, 2).setValues([[final.score, final.percentage]]);
      changed++;
    });
    return { result: 'success', regraded: changed };
  });
}

// ---------- settings (error reports, release emails) ----------
var RETENTION_DEFAULTS_ = { retainLiveDays: 1, retainLogDays: 180, retainErrorsDays: 180, archiveStreamDays: 300 };
// A whole number from 1 to 3650, or null.
function retentionValue_(v) {
  var n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d+$/.test(v.trim()) ? parseInt(v, 10) : NaN);
  return isFinite(n) && n === Math.floor(n) && n >= 1 && n <= 3650 ? n : null;
}
function readSettings_() {
  return cached_('settings', CACHE_TTL, function () {
    var r = sheetRows_(SETTINGS_SHEET, SETTINGS_HEADERS);
    var out = { errorReports: false, releaseEmails: false };
    for (var d in RETENTION_DEFAULTS_) out[d] = RETENTION_DEFAULTS_[d];
    r.values.forEach(function (v) {
      var k = String(v[0]);
      if (k === 'errorReports' || k === 'releaseEmails') out[k] = v[1] === true || v[1] === 'true';
      else if (RETENTION_DEFAULTS_.hasOwnProperty(k) && retentionValue_(v[1]) !== null) out[k] = retentionValue_(v[1]);
    });
    return out;
  });
}
function saveSettings_(body) {
  var incoming = body.settings && typeof body.settings === 'object' ? body.settings : {};
  return withLock_(function () {
    var sheet = getSheet_(SETTINGS_SHEET, SETTINGS_HEADERS);
    ['errorReports', 'releaseEmails'].concat(Object.keys(RETENTION_DEFAULTS_)).forEach(function (k) {
      if (incoming[k] === undefined) return;
      var isRetention = RETENTION_DEFAULTS_.hasOwnProperty(k);
      if (isRetention && retentionValue_(incoming[k]) === null) return;
      var row = findRow_(sheet, 1, k);
      var vals = [k, isRetention ? retentionValue_(incoming[k]) : incoming[k] === true];
      if (row) sheet.getRange(row, 1, 1, 2).setValues([vals]); else sheet.appendRow(vals);
    });
    bust_('settings');
    var fresh = readSettings_();
    return { result: 'success', settings: fresh, row: fresh };
  });
}
// Optional release email (Settings > releaseEmails). Needs the MailApp permission; no score in the email.
function sendReleaseEmails_(rows) {
  try {
    if (!readSettings_().releaseEmails || typeof MailApp === 'undefined') return 0;
    var site = PropertiesService.getScriptProperties().getProperty('SITE_URL') || '';
    var sent = 0;
    rows.forEach(function (r) {
      if (!r.email || !EMAIL_RE.test(r.email)) return;
      if (MailApp.getRemainingDailyQuota && MailApp.getRemainingDailyQuota() < 1) return;
      MailApp.sendEmail(r.email, 'Your grade for ' + (r.title || r.code) + ' is ready',
        'Your teacher has released your grade for ' + (r.title || r.code) + '.\n\n' + (site ? 'See it here: ' + site + '?code=' + encodeURIComponent(r.code) + '\n' : '') + '\n— ChemistryWorks');
      sent++;
    });
    return sent;
  } catch (err) { return 0; }
}

// ---------- live monitor (S13): one row per student per test, overwritten in place ----------
function progressPing_(body) {
  var who = verifyStudent_(body);
  if (who.error) return { result: 'error', error: who.error };
  var code = normalizeCode_(body.testCode);
  if (!code) return { result: 'error', error: 'missing_test_code' };
  return (function () {
    var sheet = getSheet_(LIVE_SHEET, LIVE_HEADERS);
    var last = sheet.getLastRow();
    var vals = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 2).getValues();
    var row = 0;
    for (var i = 0; i < vals.length; i++) if (normalizeCode_(vals[i][0]) === code && normEmail_(vals[i][1]) === who.email) { row = i + 2; break; }
    var now = new Date();
    var started = row ? sheet.getRange(row, 7).getValue() : now;
    var rowVals = [text_(code), who.email, text_(String(body.name || '').slice(0, 120)), Math.max(0, Math.floor(num_(body.answered, 0))), Math.max(0, Math.floor(num_(body.total, 0))),
      body.timeLeft === null || body.timeLeft === undefined ? '' : Math.max(0, Math.floor(num_(body.timeLeft, 0))), started || now, now, body.submitted === true];
    if (row) sheet.getRange(row, 1, 1, rowVals.length).setValues([rowVals]); else sheet.appendRow(rowVals);
    return { result: 'success' };
  })();
}
function getLive_(body) {
  var code = normalizeCode_(body.testCode);
  var r = sheetRows_(LIVE_SHEET, LIVE_HEADERS);
  var now = new Date().getTime();
  return { result: 'success', now: new Date().toISOString(), students: r.values.filter(function (v) { return !code || normalizeCode_(v[0]) === code; }).map(function (v) {
    var lastPing = v[7] instanceof Date ? v[7].getTime() : new Date(v[7]).getTime();
    return { testCode: String(v[0]), email: String(v[1]), name: String(v[2]), answered: num_(v[3], 0), total: num_(v[4], 0), timeLeft: v[5] === '' ? null : num_(v[5], 0),
      startedAt: iso_(v[6]), lastPing: iso_(v[7]), submitted: v[8] === true || v[8] === 'true', idle: !isNaN(lastPing) && now - lastPing > 180000 };
  }) };
}

// ---------- class leaderboard (S15): only for tests with gameMode and gameOptions.leaderboard ----------
function boardAllowed_(code) {
  var test = publishedTest_(code);
  return !!(test && test.gameMode === true && test.gameOptions && test.gameOptions.leaderboard === true);
}
// Highest score a mode can reach for a test: min(100000, perQuestion * questions + flat). Higher scores are clamped.
// `perQuestion` is a number or 'points' (100 x the test's highest question points + 50). Unknown modes get the lowest per-question rate.
var GAME_CAPS_ = {
  classic: [1500, 0], lightning: [150, 0], survival: ['points', 0], boss: ['points', 1000],
  tower: [100, 0], matchup: [100, 0], mistakes: [100, 0], bingo: [100, 2500], quizshow: [500, 0], race: [150, 0],
  study: [0, 0], flashcards: [0, 0]
};
function gameScoreCap_(test, mode) {
  var questions = test && Array.isArray(test.questions) ? test.questions : [];
  var maxPoints = 1;
  for (var i = 0; i < questions.length; i++) maxPoints = Math.max(maxPoints, num_(questions[i] && questions[i].points, 1));
  var rule = Object.prototype.hasOwnProperty.call(GAME_CAPS_, mode) ? GAME_CAPS_[mode] : [100, 0];
  var per = rule[0] === 'points' ? 100 * maxPoints + 50 : rule[0];
  return Math.min(BOARD_MAX_SCORE, per * questions.length + rule[1]);
}
function submitGameScore_(body) {
  var who = verifyStudent_(body);
  if (who.error) return { result: 'error', error: who.error };
  var code = normalizeCode_(body.testCode);
  var game = String(body.gameId || body.game || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  if (!code || !game) return { result: 'error', error: 'missing_fields' };
  if (!boardAllowed_(code)) return { result: 'error', error: 'leaderboard_off' };
  var score = Math.max(0, Math.min(gameScoreCap_(publishedTest_(code), game), Math.floor(num_(body.score, 0))));
  var name = String(body.name || body.displayName || '').trim().slice(0, 60);
  return withLock_(function () {
    var sheet = getSheet_(BOARD_SHEET, BOARD_HEADERS);
    var last = sheet.getLastRow();
    var vals = last < 2 ? [] : sheet.getRange(2, 1, last - 1, BOARD_HEADERS.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (normalizeCode_(vals[i][0]) === code && String(vals[i][1]) === game && normEmail_(vals[i][2]) === who.email) {
        if (score > num_(vals[i][4], 0)) sheet.getRange(i + 2, 4, 1, 3).setValues([[text_(name), score, new Date()]]);
        else if (name && name !== String(vals[i][3])) sheet.getRange(i + 2, 4, 1, 1).setValues([[text_(name)]]);
        return { result: 'success', best: Math.max(score, num_(vals[i][4], 0)) };
      }
    }
    sheet.appendRow([code, game, who.email, text_(name), score, new Date(), false]);
    return { result: 'success', best: score };
  });
}
function getLeaderboard_(body) {
  var who = verifyStudent_(body);
  if (who.error) return { result: 'error', error: who.error };
  var code = normalizeCode_(body.testCode);
  var game = String(body.gameId || body.game || '');
  if (!boardAllowed_(code)) return { result: 'error', error: 'leaderboard_off' };
  var r = sheetRows_(BOARD_SHEET, BOARD_HEADERS);
  var rows = r.values.filter(function (v) { return normalizeCode_(v[0]) === code && String(v[1]) === game && !(v[6] === true || v[6] === 'true'); })
    .map(function (v) { return { email: normEmail_(v[2]), name: String(v[3]), score: num_(v[4], 0) }; })
    .sort(function (a, b) { return b.score - a.score; });
  var rank = 0;
  for (var i = 0; i < rows.length; i++) if (rows[i].email === who.email) { rank = i + 1; break; }
  var own = rank ? { rank: rank, score: rows[rank - 1].score } : null;
  return { result: 'success', top: rows.slice(0, BOARD_TOP).map(function (x, k) { return { rank: k + 1, name: x.name, score: x.score, me: x.email === who.email, you: x.email === who.email }; }),
    me: own, own: own, total: rows.length };
}
// Writes `kept` rows from `firstRow` in one call and drops the leftover rows below them in one call.
function compactRows_(sheet, firstRow, kept, width, last) {
  if (kept.length) sheet.getRange(firstRow, 1, kept.length, width).setValues(kept);
  var left = last - (firstRow + kept.length) + 1;
  if (left > 0) sheet.deleteRows(firstRow + kept.length, left);
}
function clearLeaderboard_(body) {
  var code = normalizeCode_(body.testCode);
  return withLock_(function () {
    var sheet = getSheet_(BOARD_SHEET, BOARD_HEADERS);
    var last = sheet.getLastRow();
    if (last < 2) return { result: 'success', removed: 0 };
    var vals = sheet.getRange(2, 1, last - 1, BOARD_HEADERS.length).getValues();
    var kept = vals.filter(function (v) { return !(normalizeCode_(v[0]) === code && (!body.gameId || String(v[1]) === String(body.gameId))); });
    var removed = vals.length - kept.length;
    if (removed) compactRows_(sheet, 2, kept, BOARD_HEADERS.length, last);
    return { result: 'success', removed: removed };
  });
}
function hideLeaderboardEntry_(body) {
  var code = normalizeCode_(body.testCode);
  var email = normEmail_(body.email);
  return withLock_(function () {
    var r = sheetRows_(BOARD_SHEET, BOARD_HEADERS);
    var n = 0;
    r.values.forEach(function (v, i) { if (normalizeCode_(v[0]) === code && normEmail_(v[2]) === email) { r.sheet.getRange(i + 2, 7, 1, 1).setValues([[body.hidden !== false]]); n++; } });
    return n ? { result: 'success', changed: n } : { result: 'error', error: 'not_found' };
  });
}

// ---------- error reports (S17): off unless Settings > errorReports; rate-limited; never stores answers ----------
// Who an error report counts against: the verified token's email, else the client-supplied ID; always hashed.
function errorSender_(body) {
  var raw = '';
  var token = body && body.idToken ? String(body.idToken) : '';
  var clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (token && clientId) {
    var who = verifyIdToken_(token, clientId);
    if (who.email) raw = 'e:' + who.email;
  }
  if (!raw && body && body.clientId) raw = 'c:' + String(body.clientId).slice(0, 100);
  if (!raw) raw = 'anon';
  try { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw)).slice(0, 32); } catch (e) { return raw.replace(/[^A-Za-z0-9:@._-]/g, '').slice(0, 60); }
}
function reportError_(body) {
  if (!readSettings_().errorReports) return { result: 'error', error: 'error_reports_off' };
  var hour = Math.floor(new Date().getTime() / 3600000);
  var senderKey = 'errors:s:' + errorSender_(body) + ':' + hour;
  var globalKey = 'errors:g:' + hour;
  var senderN = cacheCount_(senderKey);
  var globalN = cacheCount_(globalKey);
  if (senderN >= ERRORS_PER_SENDER_HOUR || globalN >= ERRORS_GLOBAL_HOUR) return { result: 'error', error: 'rate_limited' };
  cacheBump_(senderKey, senderN);
  cacheBump_(globalKey, globalN);
  getSheet_(ERRORS_SHEET, ERROR_HEADERS).appendRow([new Date(), text_(String(body.page || '').slice(0, 200)), text_(String(body.message || '').slice(0, 500)),
    text_(String(body.detail || '').slice(0, 2000)), text_(String(body.browser || '').slice(0, 200))]);
  return { result: 'success' };
}
function getErrors_(body) {
  var r = sheetRows_(ERRORS_SHEET, ERROR_HEADERS);
  var limit = Math.min(500, Math.max(1, Math.floor(num_(body && body.limit, 100))));
  return { result: 'success', errors: r.values.slice(-limit).reverse().map(function (v) { return { time: iso_(v[0]), page: String(v[1]), message: String(v[2]), detail: String(v[3]), browser: String(v[4]) }; }) };
}


// ===========================================================================
// v5 B1: Students, Attempts, profile + sync, cache and batch base.
// ===========================================================================

var STUDENTS_SHEET = 'Students';
var STUDENT_HEADERS = ['email', 'name', 'picture', 'firstSeen', 'lastSeen', 'classIds', 'xp', 'level', 'streakDays', 'lastActiveDate', 'badgesJson', 'prefsJson', 'statsJson', 'updatedAt'];
var ATTEMPTS_SHEET = 'Attempts';
var ATTEMPT_HEADERS = ['email', 'code', 'mode', 'answeredCount', 'total', 'percentDone', 'updatedAt', 'answersJson'];
var XP_DAY_CAP = 600;
var PROFILE_WRITE_GAP_MS = 5000;
var ATTEMPT_ANSWERS_MAX = 40000;
var CACHE_TTL = 120;
var BATCH_MAX = 50;
var BATCH_ACTIONS_ = { publishTest: 1, deleteTest: 1, saveGrade: 1, releaseAll: 1, allowRetake: 1, saveClass: 1, deleteClass: 1,
  saveBankItem: 1, deleteBankItem: 1, saveAccommodation: 1, deleteAccommodation: 1, extendWindow: 1, applyRegrade: 1, saveSettings: 1,
  clearLeaderboard: 1, hideLeaderboardEntry: 1, saveAssignment: 1, deleteAssignment: 1, postStream: 1, deleteStreamPost: 1, remindMissing: 1 };
var PREF_KEYS = ['theme', 'accent', 'avatar', 'textSize', 'density', 'reduceMotion', 'dyslexia'];

// Reads only the named columns (header names) of a sheet: -> [{ name: value, ... }] (data rows, in order).
function readCols_(sheet, names) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var head = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  var cols = names.map(function (n) { return head.indexOf(n) + 1; });
  var n = last - 1;
  var data = cols.map(function (c) { return c > 0 ? sheet.getRange(2, c, n, 1).getValues() : null; });
  var out = [];
  for (var i = 0; i < n; i++) {
    var o = {};
    for (var j = 0; j < names.length; j++) o[names[j]] = data[j] ? data[j][i][0] : '';
    out.push(o);
  }
  return out;
}

// CacheService.getScriptCache() read-through. Only JSON-safe, non-personal data.
function cached_(key, ttl, fn) {
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) { cache = null; }
  if (cache) {
    try {
      var hit = cache.get(key);
      if (hit) return JSON.parse(hit);
    } catch (e2) { /* miss */ }
  }
  var value = fn();
  if (cache) {
    try {
      var raw = JSON.stringify(value);
      if (raw !== undefined && raw.length < 90000) cache.put(key, raw, ttl || CACHE_TTL);
    } catch (e3) { /* too big or quota: skip */ }
  }
  return value;
}
function bust_() {
  var keys = Array.prototype.slice.call(arguments).filter(function (k) { return k; });
  if (!keys.length) return;
  try { CacheService.getScriptCache().removeAll(keys); } catch (e) { /* ignore */ }
}

// Insert or merge one row by key columns (header names). `row` is { header: value }; only given fields change.
// The row is found through the cached row index (one row read). `mutate(existing | null)` may return more fields to merge,
// computed from the stored row. -> { row: sheetRowNumber, created: bool, values: { header: value } (the stored row) }
function upsertByKey_(sheet, keyCols, row, mutate) {
  return withLock_(function () {
    var head = headerOf_(sheet);
    var hit = indexedRow_(sheet, keyCols, keyCols.map(function (k) { return row[k]; }));
    var found = hit.row;
    var cur = found ? hit.vals.slice() : head.map(function () { return ''; });
    if (typeof mutate === 'function') {
      var existing = null;
      if (found) { existing = {}; for (var e = 0; e < head.length; e++) existing[head[e]] = hit.vals[e]; }
      var more = mutate(existing) || {};
      var merged = {};
      for (var mk in row) if (Object.prototype.hasOwnProperty.call(row, mk)) merged[mk] = row[mk];
      for (var nk in more) if (Object.prototype.hasOwnProperty.call(more, nk)) merged[nk] = more[nk];
      row = merged;
    }
    var safe = {};
    for (var rk in row) if (Object.prototype.hasOwnProperty.call(row, rk)) safe[rk] = typeof row[rk] === 'string' ? text_(row[rk]) : row[rk];
    row = safe;
    for (var h = 0; h < head.length; h++) if (Object.prototype.hasOwnProperty.call(row, head[h])) cur[h] = row[head[h]];
    var rowNo;
    if (found) {
      sheet.getRange(found, 1, 1, head.length).setValues([cur]);
      rowNo = found;
    } else {
      sheet.appendRow(cur);
      rowNo = sheet.getLastRow();
      indexedRowAdd_(sheet, keyCols, keyCols.map(function (k) { return row[k]; }), rowNo);
    }
    var stored = {};
    for (var s2 = 0; s2 < head.length; s2++) stored[head[s2]] = cur[s2];
    return { row: rowNo, created: !found, values: stored };
  });
}

// -> { email } | { error }. Only the verified token's email is ever used; any email field in the body is ignored.
function studentFromToken_(body) {
  var who = verifyStudent_(body);
  if (who.error || !who.email) return { error: who.error || 'unauthorized' };
  return { email: String(who.email).trim().toLowerCase(), name: who.name || '' };
}

function xpForLevel_(level) { return 25 * Math.max(0, Math.floor(level) - 1) * Math.max(1, Math.floor(level)); }
function levelForXp_(xp) { var l = 1; while (xpForLevel_(l + 1) <= xp) l++; return l; }
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

function studentRow_(email) {
  var sheet = getSheet_(STUDENTS_SHEET, STUDENT_HEADERS);
  var hit = indexedRow_(sheet, ['email'], [email]);
  if (!hit.row) return null;
  var v = hit.vals;
  var o = {};
  for (var i = 0; i < STUDENT_HEADERS.length; i++) o[STUDENT_HEADERS[i]] = v[i];
  return o;
}

function profileOf_(o) {
  var xp = Math.max(0, num_(o.xp, 0));
  var level = Math.max(1, Math.floor(num_(o.level, 1)));
  return {
    email: String(o.email), name: String(o.name || ''), picture: String(o.picture || ''), firstSeen: iso_(o.firstSeen), lastSeen: iso_(o.lastSeen),
    classIds: String(o.classIds || '').split(',').filter(function (c) { return c; }), xp: xp, level: Math.max(level, levelForXp_(xp)),
    streakDays: Math.max(0, Math.floor(num_(o.streakDays, 0))), lastActiveDate: dayOf_(o.lastActiveDate),
    badges: parseJson_(o.badgesJson, []) || [], prefs: parseJson_(o.prefsJson, {}) || {}, stats: parseJson_(o.statsJson, {}) || {}
  };
}

// Classes this email is on: [{ id, name, period }]. The class list is cached; membership is matched per call.
function classesOfEmail_(email) {
  var list = classesCached_();
  return list.filter(function (c) { return c.emails.indexOf(email) >= 0; }).map(function (c) { return { id: c.id, name: c.name, period: c.period }; });
}

// The fields a sign-in sets on a student row: lastSeen and classIds always, the starting values on first sight.
function studentBase_(existing, email, claims) {
  var now = new Date();
  var classes = classesOfEmail_(email).map(function (c) { return c.id; }).join(',');
  var patch = { email: email, lastSeen: now, classIds: classes };
  if (!existing) {
    patch.name = claims && claims.name ? String(claims.name).slice(0, 120) : '';
    patch.firstSeen = now; patch.xp = 0; patch.level = 1; patch.streakDays = 0; patch.lastActiveDate = '';
    patch.badgesJson = '[]'; patch.prefsJson = '{}'; patch.statsJson = '{}'; patch.updatedAt = now;
  } else if (!existing.name && claims && claims.name) patch.name = String(claims.name).slice(0, 120);
  return patch;
}
// Creates the row on first sight. Returns the stored row object.
function ensureStudent_(email, claims) {
  return upsertByKey_(getSheet_(STUDENTS_SHEET, STUDENT_HEADERS), ['email'], { email: email }, function (existing) {
    return studentBase_(existing, email, claims);
  }).values;
}

function attemptsOf_(email) {
  return readCols_(getSheet_(ATTEMPTS_SHEET, ATTEMPT_HEADERS), ['email', 'code', 'mode', 'answeredCount', 'total', 'percentDone', 'updatedAt'])
    .filter(function (r) { return normEmail_(r.email) === email; })
    .map(function (r) { return { code: String(r.code), mode: String(r.mode), answeredCount: num_(r.answeredCount), total: num_(r.total), percentDone: num_(r.percentDone), updatedAt: num_(r.updatedAt) }; });
}

// This student's submissions. Score fields only when released (student view); `all` adds scores for staff.
function submissionsOf_(email, all) {
  var rows = readCols_(getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS),
    ['Timestamp', 'Student Email', 'Test Code', 'Test Title', 'Score Achieved', 'Total Score', 'Percentage (%)', 'Status', 'Final Score', 'Final Percentage (%)', 'Released At']);
  var out = [];
  rows.forEach(function (r) {
    if (normEmail_(r['Student Email']) !== email) return;
    var st = String(r.Status || '');
    if (st === STATUS_EXTRA || st === STATUS_CLOSED || st === STATUS_NOT_ROSTER) return;
    var released = !!r['Released At'];
    var o = { testCode: normalizeCode_(r['Test Code']), title: String(r['Test Title'] || ''), submittedAt: iso_(r.Timestamp), status: st, released: released };
    if (released || all) {
      var fs = r['Final Score'], fp = r['Final Percentage (%)'];
      o.scoreAchieved = fs === '' || fs === null ? num_(r['Score Achieved']) : num_(fs);
      o.scoreTotal = num_(r['Total Score']);
      o.percentage = fp === '' || fp === null ? num_(r['Percentage (%)']) : num_(fp);
    }
    out.push(o);
  });
  return out;
}

// Published tests assigned to any of the student's classes: [{ testCode, title, opensAt, closesAt, status }].
function assignedTests_(email, classIds) {
  if (!classIds.length) return [];
  var rows = readCols_(getSheet_(TESTS_SHEET, TEST_HEADERS), ['Code', 'Title', 'Test JSON']);
  var out = [];
  var now = new Date();
  rows.forEach(function (r) {
    if (!String(r.Code)) return;
    var t = parseJson_(r['Test JSON'], null);
    if (!t || !Array.isArray(t.classes)) return;
    var hit = t.classes.some(function (c) { return classIds.indexOf(String(c)) >= 0; });
    if (!hit) return;
    var w = windowState_(t, accommodationFor_(email, r.Code), now);
    out.push({ testCode: normalizeCode_(r.Code), title: String(r.Title || t.title || ''), opensAt: w.opensAt, closesAt: w.closesAt, status: w.state });
  });
  return out;
}

function studentBundle_(email, row, admin) {
  var profile = profileOf_(row);
  var out = { result: 'success', profile: profile, results: submissionsOf_(email, admin), attempts: attemptsOf_(email), assigned: assignedTests_(email, profile.classIds) };
  if (!admin) {
    try { out.hub = buildHub_(email, new Date()); } catch (e) { out.hub = null; }
  }
  return out;
}

function getStudentProfile_(body) {
  var who = studentFromToken_(body);
  if (who.error) return { result: 'error', error: who.error };
  var row = ensureStudent_(who.email, { name: who.name || (body && body.name) });
  return studentBundle_(who.email, row, false);
}

function saveStudentProfile_(body) {
  var who = studentFromToken_(body);
  if (who.error) return { result: 'error', error: who.error };
  var incoming = body && body.prefs && typeof body.prefs === 'object' ? body.prefs : null;
  if (!incoming) return { result: 'error', error: 'invalid_request' };
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) { cache = null; }
  var gateKey = 'sp:' + who.email;
  if (cache) {
    try {
      var last = num_(cache.get(gateKey), 0);
      if (last && Date.now() - last < PROFILE_WRITE_GAP_MS) return { result: 'error', error: 'rate_limited' };
      cache.put(gateKey, String(Date.now()), 60);
    } catch (e2) { /* ignore */ }
  }
  var row = ensureStudent_(who.email, null);
  var prefs = parseJson_(row.prefsJson, {}) || {};
  PREF_KEYS.forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(incoming, k)) {
      var v = incoming[k];
      if (typeof v === 'string') prefs[k] = v.slice(0, 64);
      else if (typeof v === 'boolean' || typeof v === 'number') prefs[k] = v;
    }
  });
  var json = JSON.stringify(prefs);
  if (json.length > 4000) return { result: 'error', error: 'too_large' };
  var stored = upsertByKey_(getSheet_(STUDENTS_SHEET, STUDENT_HEADERS), ['email'], { email: who.email, prefsJson: json, updatedAt: new Date() }).values;
  return { result: 'success', profile: profileOf_(stored) };
}

// Badge ids a student can earn; kept equal to BADGES in js/lib/xp.js (a unit test compares the two).
var BADGE_IDS = ['first_round', 'ten_in_row', 'noble_gas_master', 'perfect_round', 'high_scorer', 'all_rounder', 'balance_pro',
  'boss_slayer', 'puzzle_solver', 'daily_3', 'daily_7', 'level_5'];

// 'yyyy-MM-dd' of a stored date cell (a Date or text), or ''.
function dayOf_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, scriptTz_(), 'yyyy-MM-dd');
  var m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v == null ? '' : v));
  return m ? m[1] : '';
}
function dayBefore_(ymd) {
  var p = ymd.split('-');
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) - 86400000).toISOString().slice(0, 10);
}
function syncProgress_(body) {
  var who = studentFromToken_(body);
  if (who.error) return { result: 'error', error: who.error };
  var res = tryLockRun_(1500, function () { return syncProgressFor_(who.email, body); });
  if (res && res.busy === true) return { result: 'error', error: 'busy', retryAfter: 30 };
  return res;
}
// The work of syncProgress for an already verified email: at most one attempt row and one student row are read and written.
function syncProgressFor_(email, body) {
  var att = body && body.attempt && typeof body.attempt === 'object' ? body.attempt : null;
  var xpIn = body && body.xp && typeof body.xp === 'object' ? body.xp : null;
  var out = { result: 'success' };
  if (att) {
    var code = normalizeCode_(att.code);
    if (!code) return { result: 'error', error: 'invalid_request' };
    var total = Math.max(0, Math.floor(num_(att.total, 0)));
    var answered = Math.max(0, Math.floor(num_(att.answeredCount, 0)));
    if (total) answered = Math.min(total, answered);
    var row = { email: email, code: code, mode: text_(String(att.mode || '').slice(0, 32)), answeredCount: answered, total: total,
      percentDone: total ? Math.round(1000 * answered / total) / 10 : 0, updatedAt: Date.now() };
    if (att.answers !== undefined && att.answers !== null) {
      var aj = JSON.stringify(att.answers);
      if (aj.length < ATTEMPT_ANSWERS_MAX) row.answersJson = aj;
    }
    upsertByKey_(getSheet_(ATTEMPTS_SHEET, ATTEMPT_HEADERS), ['email', 'code'], row);
    out.attempt = { code: code, mode: row.mode, answeredCount: answered, total: total, percentDone: row.percentDone, updatedAt: row.updatedAt };
  }
  var stored = upsertByKey_(getSheet_(STUDENTS_SHEET, STUDENT_HEADERS), ['email'], { email: email }, function (existing) {
    var patch = studentBase_(existing, email, null);
    patch.updatedAt = new Date();
    if (!xpIn) return patch;
    var cur = existing || patch;
    var stats = parseJson_(cur.statsJson, {}) || {};
    var day = today_();
    var gained = stats.xpDay === day ? num_(stats.xpToday, 0) : 0;
    var delta = Math.min(Math.max(num_(xpIn.delta, 0), 0), Math.max(0, XP_DAY_CAP - gained));
    var xp = Math.max(0, num_(cur.xp, 0)) + delta;
    stats.xpDay = day;
    stats.xpToday = gained + delta;
    var badges = parseJson_(cur.badgesJson, []) || [];
    (Array.isArray(xpIn.badges) ? xpIn.badges : []).forEach(function (b) {
      b = String(b).slice(0, 64);
      if (BADGE_IDS.indexOf(b) >= 0 && badges.indexOf(b) < 0) badges.push(b);
    });
    patch.xp = xp;
    patch.level = Math.max(num_(cur.level, 1), levelForXp_(xp));
    patch.badgesJson = JSON.stringify(badges);
    patch.statsJson = JSON.stringify(stats);
    // The streak comes from the server's own activity dates; streakDays / lastActiveDate in the body are ignored.
    if (delta > 0) {
      var last = dayOf_(cur.lastActiveDate);
      if (last !== day) {
        patch.streakDays = last && last === dayBefore_(day) ? Math.max(0, Math.floor(num_(cur.streakDays, 0))) + 1 : 1;
        patch.lastActiveDate = day;
      }
    }
    return patch;
  }).values;
  out.profile = profileOf_(stored);
  return out;
}

// Admin. Like getStudentProfile for any email, without xp / level / badges (Decision 6), with all scores + accommodations.
function getStudentProfileAdmin_(body) {
  var email = normEmail_(body && body.email);
  if (!EMAIL_RE.test(email)) return { result: 'error', error: 'invalid_request' };
  var classes = classesOfEmail_(email);
  var row = studentRow_(email) || { email: email, classIds: classes.map(function (c) { return c.id; }).join(',') };
  var out = studentBundle_(email, row, true);
  delete out.profile.xp; delete out.profile.level; delete out.profile.badges;
  out.classes = classes;
  out.accommodations = getAccommodations_({}).accommodations.filter(function (a) { return a.email === email; });
  return out;
}

// { action: 'batch', requests: [{ action, ... }] } (`ops` accepted as an alias). One admin check (done by handleAdmin_);
// each request is dispatched and logged on its own; one error does not stop the rest.
function batch_(body, auth) {
  var reqs = body && (body.requests || body.ops);
  if (!Array.isArray(reqs)) return { result: 'error', error: 'invalid_request' };
  if (reqs.length > BATCH_MAX) return { result: 'error', error: 'too_large' };
  var results = reqs.map(function (r) {
    try {
      if (!r || typeof r !== 'object' || !BATCH_ACTIONS_[r.action]) return { result: 'error', error: 'unknown_action' };
      var sub = {};
      for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) sub[k] = r[k];
      var res = dispatchAdmin_(sub, auth);
      if (res && res.result === 'success' && LOGGED_ACTIONS_[sub.action]) appendLog_(auth, sub.action, logTarget_(sub), logDetails_(sub, res));
      return res;
    } catch (err) {
      return { result: 'error', error: String(err) };
    }
  });
  return { result: 'success', results: results };
}


// ===========================================================================
// v5 B3: Class Hub (assignments, stream, status, derived notifications).
// ===========================================================================

var ASSIGNMENTS_SHEET = 'Assignments';
var ASSIGNMENT_HEADERS = ['id', 'classId', 'testCode', 'title', 'instructions', 'opensAt', 'dueAt', 'lateAllowed', 'required', 'modesJson', 'publishAt', 'createdBy', 'createdAt'];
var STREAM_SHEET = 'Stream';
var STREAM_ARCHIVE_SHEET = 'Stream_archive';
var STREAM_HEADERS = ['id', 'classId', 'type', 'body', 'pinned', 'createdBy', 'createdAt'];
var STREAM_BODY_MAX = 2000;
var HUB_STREAM_MAX = 100;
var DUE_SOON_MS = 24 * 3600 * 1000;
var NOTIF_READ_MAX = 200;
var MISSING_STATUSES_ = { not_started: 1, in_progress: 1, missing: 1 };
var DONE_STATUSES_ = { turned_in: 1, late: 1, graded: 1, released: 1 };

function scriptTz_() { try { return Session.getScriptTimeZone(); } catch (e) { return 'UTC'; } }

// Milliseconds for a Date, a number or ISO-like text. Text with an offset (Z, +01:00) is exact; text without one is wall-clock
// time in the script time zone; a bare date means the end of that day. Invalid -> null.
function parseWhen_(v, tz) {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) { var t = v.getTime(); return isNaN(t) ? null : t; }
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var str = String(v).trim();
  if (/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(:\d\d(\.\d+)?)?\s*(Z|[+-]\d\d:?\d\d)$/i.test(str)) {
    var ms = Date.parse(str.replace(' ', 'T').replace(/\s+/g, ''));
    return isNaN(ms) ? null : ms;
  }
  var m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?)?$/.exec(str);
  if (!m) { var d = Date.parse(str); return isNaN(d) ? null : d; }
  var hasTime = m[4] !== undefined;
  var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], hasTime ? +m[4] : 23, hasTime ? +m[5] : 59, hasTime ? +(m[6] || 0) : 59);
  var off = tzOffsetMs_(guess, tz);
  var ms2 = guess - off;
  var off2 = tzOffsetMs_(ms2, tz);
  return off2 === off ? ms2 : guess - off2;
}
function tzOffsetMs_(ms, tz) {
  try {
    var z = Utilities.formatDate(new Date(ms), tz || scriptTz_(), 'Z'); // +0200
    var m = /^([+-])(\d\d)(\d\d)$/.exec(z);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) * 60000;
  } catch (e) { return 0; }
}

// Student's due time: max(dueAt, accommodation.extensionUntil). null when the assignment has no due date.
function effectiveDue_(assignment, accommodation, tz) {
  var due = parseWhen_(assignment && assignment.dueAt, tz);
  var ext = accommodation ? parseWhen_(accommodation.extensionUntil, tz) : null;
  if (due === null) return null;
  return ext !== null && ext > due ? ext : due;
}

// Pure. submission: { submittedAt, status, released } | null; attempt: { percentDone, answeredCount, mode } | null.
// -> { status, dueAt (ms|null), canSubmit, percentDone?, lastMode?, submittedAt?, late? }
// Precedence: released > graded > late / turned_in > in_progress > missing > not_started.
// Turned in at exactly the due time is on time. `now`: Date or ms.
function assignmentStatus_(assignment, submission, attempt, accommodation, now) {
  var tz = scriptTz_();
  var nowMs = now instanceof Date ? now.getTime() : (typeof now === 'number' ? now : Date.now());
  var due = effectiveDue_(assignment, accommodation, tz);
  var lateAllowed = !assignment || assignment.lateAllowed !== false;
  var pastDue = due !== null && nowMs > due;
  var out = { status: 'not_started', dueAt: due, canSubmit: !(pastDue && !lateAllowed) };
  if (submission) {
    var at = parseWhen_(submission.submittedAt, tz);
    var late = due !== null && at !== null && at > due;
    out.submittedAt = iso_(submission.submittedAt);
    out.late = late;
    out.canSubmit = false;
    if (submission.released) out.status = 'released';
    else if (submission.status === STATUS_GRADED) out.status = 'graded';
    else out.status = late ? 'late' : 'turned_in';
    return out;
  }
  if (attempt && (num_(attempt.percentDone) > 0 || num_(attempt.answeredCount) > 0)) {
    out.status = 'in_progress';
    out.percentDone = num_(attempt.percentDone);
    out.lastMode = String(attempt.mode || '');
    return out;
  }
  out.status = pastDue ? 'missing' : 'not_started';
  return out;
}

function boolCell_(v) { return v === true || v === 'true' || v === 'TRUE'; }
function assignmentRow_(v) {
  return {
    id: String(v[0]), classId: String(v[1]), testCode: normalizeCode_(v[2]), title: String(v[3] || ''), instructions: String(v[4] || ''),
    opensAt: iso_(v[5]), dueAt: iso_(v[6]), lateAllowed: v[7] === '' ? true : boolCell_(v[7]), required: boolCell_(v[8]),
    modes: parseJson_(v[9], []) || [], publishAt: iso_(v[10]), createdBy: String(v[11] || ''), createdAt: iso_(v[12])
  };
}
// All assignments (cached 120 s, busted by saveAssignment / deleteAssignment). Not personal data.
function assignmentsCached_() {
  return cached_('assignments:list', CACHE_TTL, function () {
    return sheetRows_(ASSIGNMENTS_SHEET, ASSIGNMENT_HEADERS).values.filter(function (v) { return String(v[0]); }).map(assignmentRow_);
  });
}
function assignmentVisible_(a, nowMs) {
  var p = parseWhen_(a.publishAt, scriptTz_());
  return p === null || p <= nowMs;
}

// Stream posts. Body of assignment / reminder posts is JSON { text, assignmentId, testCode?, emails? }; plain text for posts.
function streamRow_(v) {
  var type = String(v[2] || 'post');
  var raw = String(v[3] || '');
  var meta = type === 'post' ? null : parseJson_(raw, null);
  return { id: String(v[0]), classId: String(v[1]), type: type, body: meta && typeof meta === 'object' ? String(meta.text || '') : raw,
    refId: meta && meta.assignmentId ? String(meta.assignmentId) : '', testCode: meta && meta.testCode ? String(meta.testCode) : '',
    emails: meta && Array.isArray(meta.emails) ? meta.emails : [], pinned: boolCell_(v[4]), createdBy: String(v[5] || ''), createdAt: iso_(v[6]) };
}
function streamAll_() {
  return sheetRows_(STREAM_SHEET, STREAM_HEADERS).values.filter(function (v) { return String(v[0]); }).map(streamRow_);
}
function appendStream_(classId, type, bodyText, pinned, by, meta) {
  var id = newId_('post');
  var body = type === 'post' ? bodyText : JSON.stringify({ text: bodyText, assignmentId: meta && meta.assignmentId || '', testCode: meta && meta.testCode || '', emails: meta && meta.emails || [] });
  var createdAt = new Date();
  withLock_(function () { getSheet_(STREAM_SHEET, STREAM_HEADERS).appendRow([id, text_(classId), text_(type), text_(body), !!pinned, text_(by), createdAt]); });
  return { id: id, classId: classId, type: type, body: bodyText, pinned: !!pinned, createdBy: by, createdAt: createdAt.toISOString() };
}
function publicPost_(p) { return { id: p.id, classId: p.classId, type: p.type, body: p.body, pinned: p.pinned, createdAt: p.createdAt, createdBy: p.createdBy }; }

function classExists_(id) { return classesCached_().some(function (c) { return c.id === id; }); }
function cleanWhen_(v) {
  // -> { ok, value } ; empty is allowed.
  if (v === undefined || v === null || String(v).trim() === '') return { ok: true, value: '' };
  var ms = parseWhen_(v, scriptTz_());
  return ms === null ? { ok: false } : { ok: true, value: String(v).trim() };
}

// ---------- admin ----------
function saveAssignment_(body, auth) {
  var a = body.assignment && typeof body.assignment === 'object' ? body.assignment : null;
  if (!a) return { result: 'error', error: 'invalid_request' };
  var classId = String(a.classId || '').trim();
  var code = normalizeCode_(a.testCode);
  if (!classId || !code) return { result: 'error', error: 'invalid_request' };
  if (!classExists_(classId)) return { result: 'error', error: 'not_found' };
  var opens = cleanWhen_(a.opensAt), due = cleanWhen_(a.dueAt), pub = cleanWhen_(a.publishAt);
  if (!opens.ok || !due.ok || !pub.ok) return { result: 'error', error: 'invalid_date' };
  var instructions = String(a.instructions || '').slice(0, STREAM_BODY_MAX);
  var modes = (Array.isArray(a.modes) ? a.modes : []).map(function (m) { return String(m).slice(0, 32); }).filter(function (m) { return m; }).slice(0, 16);
  var title = String(a.title || '').trim().slice(0, 160);
  if (!title) { var t = publishedTest_(code); title = (t && t.title) || code; }
  var existing = null;
  if (a.id) {
    existing = sheetRows_(ASSIGNMENTS_SHEET, ASSIGNMENT_HEADERS).values.filter(function (v) { return String(v[0]) === String(a.id); }).map(assignmentRow_)[0] || null;
    if (!existing) return { result: 'error', error: 'not_found' };
  }
  var id = existing ? existing.id : newId_('asg');
  var by = actorOf_(auth);
  var stored = upsertByKey_(getSheet_(ASSIGNMENTS_SHEET, ASSIGNMENT_HEADERS), ['id'], {
    id: text_(id), classId: text_(classId), testCode: code, title: text_(title), instructions: text_(instructions), opensAt: opens.value, dueAt: due.value,
    lateAllowed: a.lateAllowed !== false, required: a.required === true, modesJson: JSON.stringify(modes), publishAt: pub.value,
    createdBy: text_(existing ? existing.createdBy : by), createdAt: existing ? existing.createdAt : new Date()
  }).values;
  var row = assignmentRow_(ASSIGNMENT_HEADERS.map(function (h) { return stored[h]; }));
  var out = { result: 'success', assignment: row };
  if (!existing) out.post = appendStream_(classId, 'assignment', title, false, by, { assignmentId: id, testCode: code });
  return out;
}

function deleteAssignment_(body) {
  var id = String(body.id || '').trim();
  if (!id) return { result: 'error', error: 'invalid_request' };
  return withLock_(function () {
    var sheet = getSheet_(ASSIGNMENTS_SHEET, ASSIGNMENT_HEADERS);
    var vals = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    var at = -1;
    for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === id) { at = i + 2; break; }
    if (at < 0) return { result: 'error', error: 'not_found' };
    sheet.deleteRow(at);
    var ss = getSheet_(STREAM_SHEET, STREAM_HEADERS);
    var n = ss.getLastRow();
    var rows = n < 2 ? [] : ss.getRange(2, 1, n - 1, STREAM_HEADERS.length).getValues();
    for (var j = rows.length - 1; j >= 0; j--) {
      var p = streamRow_(rows[j]);
      if (p.type !== 'post' && p.refId === id) ss.deleteRow(j + 2);
    }
    return { result: 'success', id: id, deleted: true };
  });
}

function listAssignments_(body) {
  var classId = body && body.classId ? String(body.classId) : '';
  var list = assignmentsCached_().filter(function (a) { return !classId || a.classId === classId; });
  return { result: 'success', assignments: list };
}

// Teacher-side stream of one class: pinned first, then newest, max 100 (same post shape as getClassHub).
function listStream_(body) {
  var classId = String((body && body.classId) || '').trim();
  if (!classId) return { result: 'error', error: 'invalid_request' };
  var posts = streamAll_().filter(function (p) { return p.classId === classId; });
  posts.sort(function (x, y) { return (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0) || (parseWhen_(y.createdAt) || 0) - (parseWhen_(x.createdAt) || 0); });
  return { result: 'success', posts: posts.slice(0, 100).map(publicPost_) };
}

function postStream_(body, auth) {
  var by = actorOf_(auth);
  if (body.id) { // edit the pin / text of an existing post
    return withLock_(function () {
      var sheet = getSheet_(STREAM_SHEET, STREAM_HEADERS);
      var n = sheet.getLastRow();
      var rows = n < 2 ? [] : sheet.getRange(2, 1, n - 1, STREAM_HEADERS.length).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][0]) !== String(body.id)) continue;
        if (body.pinned !== undefined) rows[i][4] = body.pinned === true;
        if (body.body !== undefined && String(rows[i][2]) === 'post') rows[i][3] = text_(String(body.body).slice(0, STREAM_BODY_MAX));
        sheet.getRange(i + 2, 1, 1, STREAM_HEADERS.length).setValues([rows[i]]);
        return { result: 'success', post: publicPost_(streamRow_(rows[i])) };
      }
      return { result: 'error', error: 'not_found' };
    });
  }
  var classId = String(body.classId || '').trim();
  var text = String(body.body == null ? '' : body.body).trim();
  if (!classId || !text || (body.type && body.type !== 'post')) return { result: 'error', error: 'invalid_request' };
  if (text.length > STREAM_BODY_MAX) return { result: 'error', error: 'too_large' };
  if (!classExists_(classId)) return { result: 'error', error: 'not_found' };
  return { result: 'success', post: appendStream_(classId, 'post', text, body.pinned === true, by, null) };
}

function deleteStreamPost_(body) {
  var id = String(body.id || '').trim();
  if (!id) return { result: 'error', error: 'invalid_request' };
  return withLock_(function () {
    var sheet = getSheet_(STREAM_SHEET, STREAM_HEADERS);
    var vals = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === id) { sheet.deleteRow(i + 2); return { result: 'success', id: id, deleted: true }; }
    return { result: 'error', error: 'not_found' };
  });
}

// Latest counted submission per (email, test): { submittedAt, status, released, releasedAt, percentage, name }. testCode / email optional filters.
function latestSubmissions_(testCode, email) {
  var rows = readCols_(getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS),
    ['Timestamp', 'Student Name', 'Student Email', 'Test Code', 'Status', 'Percentage (%)', 'Final Percentage (%)', 'Released At']);
  var out = {};
  rows.forEach(function (r) {
    var e = normEmail_(r['Student Email']);
    var c = normalizeCode_(r['Test Code']);
    if ((email && e !== email) || (testCode && c !== testCode)) return;
    var st = String(r.Status || '');
    if (st === STATUS_EXTRA || st === STATUS_CLOSED || st === STATUS_NOT_ROSTER) return;
    var at = iso_(r.Timestamp);
    var key = e + '|' + c;
    if (out[key] && parseWhen_(out[key].submittedAt) > parseWhen_(at)) return;
    var fp = r['Final Percentage (%)'];
    out[key] = { email: e, testCode: c, name: String(r['Student Name'] || ''), submittedAt: at, status: st, released: !!r['Released At'], releasedAt: iso_(r['Released At']),
      percentage: fp === '' || fp === null ? num_(r['Percentage (%)']) : num_(fp) };
  });
  return out;
}
function attemptMap_(testCode, email) {
  var out = {};
  readCols_(getSheet_(ATTEMPTS_SHEET, ATTEMPT_HEADERS), ['email', 'code', 'mode', 'answeredCount', 'total', 'percentDone', 'updatedAt']).forEach(function (r) {
    var e = normEmail_(r.email), c = normalizeCode_(r.code);
    if ((email && e !== email) || (testCode && c !== testCode)) return;
    out[e + '|' + c] = { mode: String(r.mode), answeredCount: num_(r.answeredCount), total: num_(r.total), percentDone: num_(r.percentDone) };
  });
  return out;
}

function getAssignmentStatus_(body) {
  var id = String(body && body.id || '').trim();
  var a = assignmentsCached_().filter(function (x) { return x.id === id; })[0];
  if (!a) return { result: 'error', error: 'not_found' };
  return { result: 'success', assignment: a, rows: assignmentRows_(a) };
}
function assignmentRows_(a) {
  var now = Date.now();
  var subs = latestSubmissions_(a.testCode, '');
  var atts = attemptMap_(a.testCode, '');
  var names = {};
  readCols_(getSheet_(STUDENTS_SHEET, STUDENT_HEADERS), ['email', 'name']).forEach(function (r) { names[normEmail_(r.email)] = String(r.name || ''); });
  var accs = accommodationsAll_();
  return rosterOf_(a.classId).map(function (email) {
    var key = email + '|' + a.testCode;
    var sub = subs[key] || null;
    var acc = accs.filter(function (x) { return x.email === email && (x.testCode === '*' || x.testCode === a.testCode); })
      .reduce(function (m, x) { return x.extensionUntil ? x : m; }, null);
    var st = assignmentStatus_(a, sub, atts[key] || null, acc, now);
    var row = { email: email, name: names[email] || (sub && sub.name) || '', status: st.status };
    if (st.percentDone !== undefined) { row.percentDone = st.percentDone; row.lastMode = st.lastMode; }
    if (st.submittedAt) { row.submittedAt = st.submittedAt; row.late = st.late; }
    if (sub && (st.status === 'graded' || st.status === 'released')) row.score = sub.percentage;
    return row;
  });
}

function remindMissing_(body, auth) {
  var id = String(body && body.id || '').trim();
  var a = assignmentsCached_().filter(function (x) { return x.id === id; })[0];
  if (!a) return { result: 'error', error: 'not_found' };
  var emails = assignmentRows_(a).filter(function (r) { return MISSING_STATUSES_[r.status]; }).map(function (r) { return r.email; });
  if (!emails.length) return { result: 'success', reminded: 0 };
  var post = appendStream_(a.classId, 'reminder', 'Reminder: ' + a.title + (a.dueAt ? ' is due ' + a.dueAt.slice(0, 10) : ''), false, actorOf_(auth), { assignmentId: a.id, testCode: a.testCode, emails: emails });
  return { result: 'success', reminded: emails.length, post: post };
}

// ---------- student ----------
// getClassHub { idToken }. Identity comes only from the verified token; any client-supplied email is ignored.
// -> { classes, assignments, stream, notifications, reminders } (see docs/ARCHITECTURE.md Backend 5.0).
function getClassHub_(body) {
  var who = studentFromToken_(body);
  if (who.error) return { result: 'error', error: who.error };
  var res = buildHub_(who.email, new Date());
  res.result = 'success';
  return res;
}
function buildHub_(email, nowDate) {
  var nowMs = nowDate.getTime();
  var classes = classesOfEmail_(email);
  var ids = {};
  classes.forEach(function (c) { ids[c.id] = true; });
  if (!classes.length) return { classes: classes, assignments: [], stream: [], notifications: [], reminders: [] };
  var mine = assignmentsCached_().filter(function (a) { return ids[a.classId] && assignmentVisible_(a, nowMs); });
  var subs = latestSubmissions_('', email);
  var atts = attemptMap_('', email);
  var visible = {};
  var notifs = [];
  var readInfo = readState_(email);
  var assignments = mine.map(function (a) {
    visible[a.id] = a;
    var key = email + '|' + a.testCode;
    var sub = subs[key] || null;
    var st = assignmentStatus_(a, sub, atts[key] || null, accommodationFor_(email, a.testCode), nowMs);
    var o = { id: a.id, classId: a.classId, testCode: a.testCode, title: a.title, instructions: a.instructions, opensAt: a.opensAt, dueAt: a.dueAt,
      lateAllowed: a.lateAllowed, required: a.required, modes: a.modes, status: st.status, canSubmit: st.canSubmit };
    if (st.dueAt !== null) o.effectiveDueAt = new Date(st.dueAt).toISOString();
    if (st.percentDone !== undefined) { o.percentDone = st.percentDone; o.lastMode = st.lastMode; }
    if (st.submittedAt) { o.submittedAt = st.submittedAt; o.late = st.late; }
    notifs.push({ id: 'new:' + a.id, type: 'assignment', refId: a.id, title: a.title, createdAt: a.publishAt || a.createdAt });
    if (st.dueAt !== null && !DONE_STATUSES_[st.status] && st.dueAt > nowMs && st.dueAt - nowMs <= DUE_SOON_MS) {
      notifs.push({ id: 'due:' + a.id, type: 'due_soon', refId: a.id, title: a.title, createdAt: new Date(st.dueAt - DUE_SOON_MS).toISOString() });
    }
    if (st.status === 'released' && sub) notifs.push({ id: 'feedback:' + a.id, type: 'feedback', refId: a.id, title: a.title, createdAt: sub.releasedAt || sub.submittedAt });
    return o;
  });
  var reminders = [];
  var stream = [];
  streamAll_().forEach(function (p) {
    if (!ids[p.classId]) return;
    if (p.type === 'assignment' && !visible[p.refId]) return;
    if (p.type === 'reminder') {
      if (p.emails.indexOf(email) < 0) return;
      var a = visible[p.refId];
      if (!a) return;
      var s = assignmentStatus_(a, subs[email + '|' + a.testCode] || null, atts[email + '|' + a.testCode] || null, accommodationFor_(email, a.testCode), nowMs).status;
      if (!MISSING_STATUSES_[s]) return;
      if (reminders.indexOf(a.testCode) < 0) reminders.push(a.testCode);
      notifs.push({ id: 'reminder:' + p.id, type: 'reminder', refId: a.id, title: a.title, createdAt: p.createdAt });
    }
    stream.push(p);
  });
  stream.sort(function (x, y) { return (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0) || (parseWhen_(y.createdAt) || 0) - (parseWhen_(x.createdAt) || 0); });
  notifs.sort(function (x, y) { return (parseWhen_(y.createdAt) || 0) - (parseWhen_(x.createdAt) || 0); });
  notifs.forEach(function (n) {
    n.read = readInfo.ids.indexOf(n.id) >= 0 || (parseWhen_(n.createdAt) || 0) <= readInfo.at;
  });
  return { classes: classes, assignments: assignments, stream: stream.slice(0, HUB_STREAM_MAX).map(publicPost_), notifications: notifs, reminders: reminders };
}

function readState_(email) {
  var row = studentRow_(email);
  var prefs = row ? (parseJson_(row.prefsJson, {}) || {}) : {};
  return { at: num_(prefs.notifReadAt, 0), ids: Array.isArray(prefs.notifRead) ? prefs.notifRead : [] };
}

// { idToken, ids?: [id], all?: true } -> { readAt }. Stored in Students.prefsJson (notifReadAt, notifRead max 200).
function markNotificationsRead_(body) {
  var who = studentFromToken_(body);
  if (who.error) return { result: 'error', error: who.error };
  var all = body && body.all === true;
  var ids = body && Array.isArray(body.ids) ? body.ids.map(function (i) { return String(i).slice(0, 80); }) : null;
  if (!all && !ids) return { result: 'error', error: 'invalid_request' };
  var row = ensureStudent_(who.email, null);
  var prefs = parseJson_(row.prefsJson, {}) || {};
  var readAt = Date.now();
  if (all) { prefs.notifReadAt = readAt; prefs.notifRead = []; }
  else {
    var cur = Array.isArray(prefs.notifRead) ? prefs.notifRead : [];
    ids.forEach(function (i) { if (i && cur.indexOf(i) < 0) cur.push(i); });
    prefs.notifRead = cur.slice(-NOTIF_READ_MAX);
    prefs.notifReadAt = num_(prefs.notifReadAt, 0);
    readAt = prefs.notifReadAt || readAt;
  }
  upsertByKey_(getSheet_(STUDENTS_SHEET, STUDENT_HEADERS), ['email'], { email: who.email, prefsJson: JSON.stringify(prefs), updatedAt: new Date() });
  return { result: 'success', readAt: readAt };
}

// For submissions: the student's assignment for this test (latest due) -> { id, dueAt (ISO), pastDue, lateAllowed } | null.
function assignmentGate_(email, testCode, acc, now) {
  var ids = {};
  classesOfEmail_(email).forEach(function (c) { ids[c.id] = true; });
  var code = normalizeCode_(testCode);
  var best = null;
  var nowMs = now.getTime();
  assignmentsCached_().forEach(function (a) {
    if (!ids[a.classId] || a.testCode !== code || !assignmentVisible_(a, nowMs)) return;
    var due = effectiveDue_(a, acc, scriptTz_());
    if (due === null) return;
    if (!best || due > best.due) best = { a: a, due: due };
  });
  if (!best) return null;
  return { id: best.a.id, dueAt: new Date(best.due).toISOString(), pastDue: nowMs > best.due, lateAllowed: best.a.lateAllowed !== false };
}

// ---------------------------------------------------------------------------
// Housekeeping: triggers, pruning, diagnostics
// ---------------------------------------------------------------------------

// Every time-driven trigger the backend owns. setupTriggers() replaces them by handler name.
function triggerList_() {
  return [{ handler: 'pruneSheets', schedule: { everyDays: 1, atHour: 3 } }];
}
function setupTriggers() {
  var list = triggerList_();
  var names = {};
  list.forEach(function (t) { names[t.handler] = true; });
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (names[t.getHandlerFunction()]) ScriptApp.deleteTrigger(t);
  });
  list.forEach(function (t) {
    ScriptApp.newTrigger(t.handler).timeBased().everyDays(t.schedule.everyDays).atHour(t.schedule.atHour).create();
  });
  return list.map(function (t) { return t.handler; });
}

var PRUNE_CHUNK = 1000;
// Drops the rows of a sheet for which keep(rowValues) is false, reading in chunks and rewriting the range in place (one
// write per chunk, one delete at the end). `sink(rows)` receives the dropped rows. -> number dropped.
function pruneRows_(sheet, width, keep, sink) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var write = 2;
  var dropped = 0;
  for (var start = 2; start <= last; start += PRUNE_CHUNK) {
    var n = Math.min(PRUNE_CHUNK, last - start + 1);
    var vals = sheet.getRange(start, 1, n, width).getValues();
    var kept = [];
    var gone = [];
    vals.forEach(function (v) { (keep(v) ? kept : gone).push(v); });
    if (gone.length) {
      dropped += gone.length;
      if (sink) sink(gone);
    }
    if (kept.length && (gone.length || write !== start)) sheet.getRange(write, 1, kept.length, width).setValues(kept);
    write += kept.length;
  }
  if (dropped) sheet.deleteRows(write, last - write + 1);
  return dropped;
}
function cellMs_(v) {
  var t = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return isFinite(t) ? t : null;
}
// Daily trigger. Live, Log and Errors rows older than their retention are removed; unpinned Stream posts older than
// archiveStreamDays move to Stream_archive.
// Public so a time-driven trigger can call it (Apps Script cannot trigger functions ending in an underscore).
function pruneSheets() {
  resetRequest_();
  return pruneSheetsLocked_();
}
function pruneSheetsLocked_() {
  return withLock_(function () {
    var cfg = readSettings_();
    var now = new Date().getTime();
    var DAY = 86400000;
    var fresh = function (col, days) {
      var cutoff = now - days * DAY;
      return function (v) { var t = cellMs_(v[col]); return t === null || t >= cutoff; };
    };
    var removed = {};
    removed.Live = pruneRows_(getSheet_(LIVE_SHEET, LIVE_HEADERS), LIVE_HEADERS.length, fresh(7, cfg.retainLiveDays));
    removed.Log = pruneRows_(getSheet_(LOG_SHEET, LOG_HEADERS), LOG_HEADERS.length, fresh(0, cfg.retainLogDays));
    removed.Errors = pruneRows_(getSheet_(ERRORS_SHEET, ERROR_HEADERS), ERROR_HEADERS.length, fresh(0, cfg.retainErrorsDays));
    var archived = 0;
    var streamFresh = fresh(6, cfg.archiveStreamDays);
    pruneRows_(getSheet_(STREAM_SHEET, STREAM_HEADERS), STREAM_HEADERS.length, function (v) {
      return boolCell_(v[4]) || streamFresh(v);
    }, function (rows) {
      var arch = getSheet_(STREAM_ARCHIVE_SHEET, STREAM_HEADERS);
      arch.getRange(arch.getLastRow() + 1, 1, rows.length, STREAM_HEADERS.length).setValues(rows);
      archived += rows.length;
    });
    var result = { at: new Date().toISOString(), removed: removed, archived: archived };
    try { PropertiesService.getScriptProperties().setProperty('LAST_PRUNE', JSON.stringify(result)); } catch (e) { /* not recorded */ }
    return result;
  });
}

// Admin: row counts, timings with a throw-away student, and the last prune.
function diag_() {
  var sheets = getSpreadsheet_().getSheets().map(function (sh) { return { name: sh.getName(), rows: Math.max(0, sh.getLastRow() - 1) }; });
  var timings = {};
  var time = function (name, fn) {
    var t0 = Date.now();
    try { fn(); timings[name] = Date.now() - t0; } catch (e) { timings[name] = -1; }
  };
  var fake = 'diag@chemworks.invalid';
  time('listTests', function () { listTests_({}); });
  time('getResults', function () { getResults_('', {}); });
  time('getClassHub', function () { buildHub_(fake, new Date()); });
  try {
    time('syncProgress', function () {
      syncProgressFor_(fake, { attempt: { code: 'DIAG', mode: 'diag', answeredCount: 1, total: 2 }, xp: { delta: 1 } });
    });
  } finally {
    removeDiagRows_(fake);
  }
  var last = null;
  try { last = JSON.parse(PropertiesService.getScriptProperties().getProperty('LAST_PRUNE') || 'null'); } catch (e) { last = null; }
  return { result: 'success', version: VERSION, generatedAt: new Date().toISOString(), sheets: sheets, timings: timings, lastPrune: last, checklist: setupChecklist_() };
}
function removeDiagRows_(email) {
  withLock_(function () {
    [[STUDENTS_SHEET, STUDENT_HEADERS, 'email'], [ATTEMPTS_SHEET, ATTEMPT_HEADERS, 'email+code']].forEach(function (p) {
      var sheet = getSheet_(p[0], p[1]);
      var emails = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      for (var i = emails.length - 1; i >= 0; i--) if (normEmail_(emails[i][0]) === email) sheet.deleteRow(i + 2);
      rowIndexStore_('rowidx:' + p[0] + ':' + p[2], {});
    });
  });
}
