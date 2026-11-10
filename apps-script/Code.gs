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
  'Drawn Questions', 'Time Limit Applied', 'Late', 'Class'
];
// 1-based columns of the grading fields (appended after the original 14 columns; v2 adds 21-22).
// Older sheets get the missing headers appended automatically by getSheet_ (empty cells = safe defaults:
// no comments, not released).
var COL = { EMAIL: 4, RESPONSES: 13, STATUS: 15, FINAL_SCORE: 16, FINAL_PCT: 17, GRADES: 18, GRADED_AT: 19, NOTE: 20, COMMENTS: 21, RELEASED_AT: 22, GRADED_BY: 23, RETAKE: 24, SEED: 25, DRAWN: 26, TIME_LIMIT: 27, LATE: 28, CLASS: 29 };
var MAX_COMMENT_CHARS = 2000;
var STATUS_NEEDS_GRADING = 'Needs grading';
var STATUS_AUTO = 'Auto-graded';
var STATUS_GRADED = 'Graded';
var STATUS_CLOSED = 'Closed (not counted)'; // v4 S12: arrived after the window (and late window) closed
var STATUS_NOT_ROSTER = 'Not on roster';      // v4 S11: roster-only test, student on no assigned class
var STATUS_EXTRA = 'Extra attempt'; // v3: a second submission to a single-submission test (stored, never counted)
var TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo?id_token=';
var TOKEN_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
var TEST_HEADERS = ['Code', 'Title', 'Updated At', 'Test JSON'];
var ADMIN_HEADERS = ['Email', 'Role', 'Added by', 'Added at'];
var LOG_HEADERS = ['Time', 'Admin', 'Action', 'Target', 'Details'];
var ROLE_OWNER = 'owner';
var ROLE_ADMIN = 'admin';
var EMAIL_RE = /^[A-Za-z0-9_][^\s@,;'"<>=]*@[^\s@,;'"<>=]+\.[^\s@,;'"<>=]+$/;
var LOG_DEFAULT_LIMIT = 100;
var LOG_MAX_LIMIT = 500;

var HEADER_BACKGROUND = '#E2E8F0';
var MAX_CELL_CHARS = 49000; // Sheets cells hold at most 50,000 characters.

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'ping') return json_({ result: 'success', version: VERSION });
    if (p.action === 'getTest') return json_(getTest_(p.code));
    return json_({ result: 'error', error: 'unknown_action' });
  } catch (err) {
    return json_({ result: 'error', error: String(err) });
  }
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    var body;
    try {
      body = JSON.parse(raw);
    } catch (parseError) {
      return json_({ result: 'error', error: 'invalid_json' });
    }
    if (!body || typeof body !== 'object') return json_({ result: 'error', error: 'invalid_json' });

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
      case undefined:
      case null:
      case '':
      case 'submit':
        return json_(handleSubmission_(body));
      default:
        return json_({ result: 'error', error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ result: 'error', error: String(err) });
  }
}

// ---------------------------------------------------------------------------
// One-time setup (run from the Apps Script editor)
// ---------------------------------------------------------------------------

function setup() {
  getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  getSheet_(TESTS_SHEET, TEST_HEADERS);
  var admins = ensureAdmins_();
  getSheet_(LOG_SHEET, LOG_HEADERS);
  getSheet_(STUDENTS_SHEET, STUDENT_HEADERS);
  getSheet_(ATTEMPTS_SHEET, ATTEMPT_HEADERS);
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

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
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

function handleSubmission_(body) {
  var s = normalizeSubmission_(body);
  if (!s.submission_id) return { result: 'error', error: 'missing_submission_id' };
  if (!s.test_code) return { result: 'error', error: 'missing_test_code' };
  var responsesJson = JSON.stringify(s.responses);
  var flagsJson = JSON.stringify(s.flags);
  if (responsesJson.length > MAX_CELL_CHARS) return { result: 'error', error: 'submission_too_large' };
  var pending = needsGrading_(s);

  return withLock_(function () {
    var sheet = getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
    if (findRow_(sheet, 2, s.submission_id)) return { result: 'success', duplicate: true };
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
      text_(gate.classId || '')
    ]);
    if (gate.status) return { result: 'success', not_counted: gate.status };
    return extra ? { result: 'success', extra_attempt: true } : { result: 'success' };
  });
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
  return { result: 'success', test: test };
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
  if (!body || !body.adminKey || String(body.adminKey) !== key) return { ok: false, error: 'unauthorized' };
  return { ok: true, email: '', role: ROLE_ADMIN, via: 'key' };
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
    withLock_(function () {
      getSheet_(LOG_SHEET, LOG_HEADERS).appendRow([new Date(), text_(who), text_(action), text_(target || ''), text_(details || '').slice(0, 500)]);
    });
  } catch (err) { /* logging never blocks the action */ }
}

var LOGGED_ACTIONS_ = { publishTest: 1, deleteTest: 1, saveGrade: 1, releaseAll: 1, allowRetake: 1, saveAdmin: 1, removeAdmin: 1,
  saveClass: 1, deleteClass: 1, saveBankItem: 1, deleteBankItem: 1, saveAccommodation: 1, deleteAccommodation: 1, extendWindow: 1,
  applyRegrade: 1, clearLeaderboard: 1, hideLeaderboardEntry: 1, saveSettings: 1 };

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
  switch (body.action) {
    case 'publishTest': return publishTest_(body.test);
    case 'listTests': return listTests_();
    case 'deleteTest': return deleteTest_(body.code);
    case 'getResults': return getResults_(body.testCode);
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
    case 'batch': return batch_(body, auth);
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

function publishTest_(test) {
  if (!test || typeof test !== 'object') return { result: 'error', error: 'invalid_test' };
  var code = normalizeCode_(test.code);
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) return { result: 'error', error: 'invalid_test: code must be 2-32 characters (A-Z, 0-9, _ or -)' };
  if (!test.title || !String(test.title).trim()) return { result: 'error', error: 'invalid_test: title is required' };
  if (!Array.isArray(test.questions) || test.questions.length === 0) return { result: 'error', error: 'invalid_test: questions must be a non-empty array' };
  test.code = code;
  var testJson = JSON.stringify(test);
  if (testJson.length > MAX_CELL_CHARS) return { result: 'error', error: 'test_too_large' };

  return withLock_(function () {
    var sheet = getSheet_(TESTS_SHEET, TEST_HEADERS);
    var row = findRow_(sheet, 1, code);
    var values = [code, String(test.title), new Date(), testJson];
    if (row) sheet.getRange(row, 1, 1, 4).setValues([values]);
    else sheet.appendRow(values);
    return { result: 'success', code: code, updated: !!row };
  });
}

function listTests_() {
  var sheet = getSheet_(TESTS_SHEET, TEST_HEADERS);
  var last = sheet.getLastRow();
  var tests = [];
  if (last >= 2) {
    var values = sheet.getRange(2, 1, last - 1, 4).getValues();
    for (var i = 0; i < values.length; i++) {
      tests.push({ code: String(values[i][0]), title: String(values[i][1]), updatedAt: iso_(values[i][2]) });
    }
  }
  return { result: 'success', tests: tests };
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

function getResults_(testCode) {
  var sheet = getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  var last = sheet.getLastRow();
  var rows = [];
  var filter = normalizeCode_(testCode);
  if (last >= 2) {
    var values = sheet.getRange(2, 1, last - 1, SUBMISSION_HEADERS.length).getValues();
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (filter && normalizeCode_(v[4]) !== filter) continue;
      var finalScore = v[COL.FINAL_SCORE - 1];
      var finalPct = v[COL.FINAL_PCT - 1];
      rows.push({
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
        retake_allowed_at: iso_(v[COL.RETAKE - 1])
      });
    }
  }
  return { result: 'success', rows: rows };
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

// Student-facing (no admin key). The caller must know the submission id (a random UUID that only the
// student's device received) AND the email it was submitted with. Returns grades and comments only after
// the teacher released them; otherwise { released: false }. Unknown id / wrong email -> not_found.
function getFeedback_(body) {
  var id = body && body.submissionId ? String(body.submissionId) : '';
  var email = body && body.studentEmail ? String(body.studentEmail).trim().toLowerCase() : '';
  if (!id || !email) return { result: 'error', error: 'not_found' };
  var sheet = getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  var row = findRow_(sheet, 2, id);
  if (!row) return { result: 'error', error: 'not_found' };
  var v = sheet.getRange(row, 1, 1, SUBMISSION_HEADERS.length).getValues()[0];
  if (String(v[COL.EMAIL - 1]).trim().toLowerCase() !== email) return { result: 'error', error: 'not_found' };
  var releasedAt = iso_(v[COL.RELEASED_AT - 1]);
  if (!releasedAt) return { result: 'success', released: false };
  var finalScore = v[COL.FINAL_SCORE - 1];
  var finalPct = v[COL.FINAL_PCT - 1];
  return {
    result: 'success',
    released: true,
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

// -> { email } (lowercased, verified) | { error: 'unauthorized' | 'identity_not_configured' }
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
      return domainAllowed_(claimed, '') ? { email: claimed } : { error: 'unauthorized' };
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
    if (hit) return { email: hit };
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
  if (!info || info.aud !== clientId) return { error: 'unauthorized' };
  if (!(info.email_verified === true || info.email_verified === 'true')) return { error: 'unauthorized' };
  if (!(exp > nowSec)) return { error: 'unauthorized' };
  if (TOKEN_ISSUERS.indexOf(String(info.iss)) < 0) return { error: 'unauthorized' };
  if (!email) return { error: 'unauthorized' };
  if (!domainAllowed_(email, info.hd)) return { error: 'unauthorized' };
  if (cache && key) {
    var ttl = Math.min(21600, exp - nowSec);
    try { if (ttl > 0) cache.put(key, email, ttl); } catch (putErr) { /* quota: ignore */ }
  }
  return { email: email };
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
function findRowsByEmailCode_(sheet, email, code) {
  var e = String(email || '').trim().toLowerCase();
  var c = normalizeCode_(code);
  var last = sheet.getLastRow();
  var out = [];
  if (!e || !c || last < 2) return out;
  var head = sheet.getRange(2, 1, last - 1, 5).getValues();
  var tail = sheet.getRange(2, COL.STATUS, last - 1, COL.RETAKE - COL.STATUS + 1).getValues();
  for (var i = 0; i < head.length; i++) {
    if (head[i][1] === '' || head[i][1] === null) continue;
    if (String(head[i][3]).trim().toLowerCase() !== e) continue;
    if (normalizeCode_(head[i][4]) !== c) continue;
    var status = String(tail[i][0] || '');
    if (status === STATUS_EXTRA) continue;
    out.push({
      row: i + 2,
      submission_id: String(head[i][1]),
      submitted_at: iso_(head[i][0]),
      status: status,
      released_at: iso_(tail[i][COL.RELEASED_AT - COL.STATUS]),
      retake_allowed_at: iso_(tail[i][COL.RETAKE - COL.STATUS])
    });
  }
  return out;
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
var ERRORS_PER_HOUR = 60;
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
  var r = sheetRows_(CLASSES_SHEET, CLASS_HEADERS);
  return { result: 'success', classes: r.values.filter(function (v) { return String(v[0]); }).map(function (v) {
    return { id: String(v[0]), name: String(v[1]), period: String(v[2]), emails: parseJson_(v[3], []) || [], updated_by: String(v[4]), updated_at: iso_(v[5]) };
  }) };
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
    return { result: 'success', cls: { id: id, name: name, period: String(c.period || ''), emails: emails } };
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
  var all = listClasses_().classes;
  for (var i = 0; i < all.length; i++) if (ids.indexOf(all[i].id) >= 0 && all[i].emails.indexOf(e) >= 0) return { ok: true, classId: all[i].id };
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
// Merged accommodation for a student on a test: test-specific values win over the '*' (all tests) row.
function accommodationFor_(email, code) {
  var e = normEmail_(email);
  if (!e) return null;
  var list = getAccommodations_({}).accommodations.filter(function (a) { return a.email === e && (a.testCode === '*' || a.testCode === normalizeCode_(code)); });
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
    var rowVals = [email, code, extraTime, Math.max(0, Math.floor(num_(pick('extraAttempts', 0), 0))), pick('reducedChoices', false) === true,
      pick('readAloud', false) === true, untilDate, text_(String(pick('notes', '') || '').slice(0, 500)), text_(actorOf_(auth)), new Date()];
    if (row) sheet.getRange(row, 1, 1, rowVals.length).setValues([rowVals]); else sheet.appendRow(rowVals);
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
    for (var i = 0; i < vals.length; i++) if (normEmail_(vals[i][0]) === email && (normalizeCode_(vals[i][1]) || '*') === code) { sheet.deleteRow(i + 2); return { result: 'success' }; }
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
  if (s.id_token) {
    var props = PropertiesService.getScriptProperties();
    var clientId = props.getProperty('GOOGLE_CLIENT_ID');
    if (clientId) { var who = verifyIdToken_(s.id_token, clientId); if (who.email) email = who.email; }
  }
  var out = {};
  var r = rosterOk_(test, email);
  out.classId = r.classId;
  if (!r.ok) { out.status = STATUS_NOT_ROSTER; return out; }
  var now = new Date();
  var w = windowState_(test, accommodationFor_(email, s.test_code), now);
  if (w.state === 'before' || w.state === 'closed') { out.status = STATUS_CLOSED; return out; }
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
  return { result: 'success', test: test, window: w, accommodations: acc };
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
function readSettings_() {
  var r = sheetRows_(SETTINGS_SHEET, SETTINGS_HEADERS);
  var out = { errorReports: false, releaseEmails: false };
  r.values.forEach(function (v) { var k = String(v[0]); if (k === 'errorReports' || k === 'releaseEmails') out[k] = v[1] === true || v[1] === 'true'; });
  return out;
}
function saveSettings_(body) {
  var incoming = body.settings && typeof body.settings === 'object' ? body.settings : {};
  return withLock_(function () {
    var sheet = getSheet_(SETTINGS_SHEET, SETTINGS_HEADERS);
    ['errorReports', 'releaseEmails'].forEach(function (k) {
      if (incoming[k] === undefined) return;
      var row = findRow_(sheet, 1, k);
      var vals = [k, incoming[k] === true];
      if (row) sheet.getRange(row, 1, 1, 2).setValues([vals]); else sheet.appendRow(vals);
    });
    return { result: 'success', settings: readSettings_() };
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
  return withLock_(function () {
    var sheet = getSheet_(LIVE_SHEET, LIVE_HEADERS);
    var last = sheet.getLastRow();
    var vals = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 2).getValues();
    var row = 0;
    for (var i = 0; i < vals.length; i++) if (normalizeCode_(vals[i][0]) === code && normEmail_(vals[i][1]) === who.email) { row = i + 2; break; }
    var now = new Date();
    var started = row ? sheet.getRange(row, 7).getValue() : now;
    var rowVals = [code, who.email, text_(String(body.name || '').slice(0, 120)), Math.max(0, Math.floor(num_(body.answered, 0))), Math.max(0, Math.floor(num_(body.total, 0))),
      body.timeLeft === null || body.timeLeft === undefined ? '' : Math.max(0, Math.floor(num_(body.timeLeft, 0))), started || now, now, body.submitted === true];
    if (row) sheet.getRange(row, 1, 1, rowVals.length).setValues([rowVals]); else sheet.appendRow(rowVals);
    return { result: 'success' };
  });
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
function submitGameScore_(body) {
  var who = verifyStudent_(body);
  if (who.error) return { result: 'error', error: who.error };
  var code = normalizeCode_(body.testCode);
  var game = String(body.gameId || body.game || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  if (!code || !game) return { result: 'error', error: 'missing_fields' };
  if (!boardAllowed_(code)) return { result: 'error', error: 'leaderboard_off' };
  var score = Math.max(0, Math.min(BOARD_MAX_SCORE, Math.floor(num_(body.score, 0))));
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
function clearLeaderboard_(body) {
  var code = normalizeCode_(body.testCode);
  return withLock_(function () {
    var sheet = getSheet_(BOARD_SHEET, BOARD_HEADERS);
    var removed = 0;
    for (var row = sheet.getLastRow(); row >= 2; row--) {
      var v = sheet.getRange(row, 1, 1, 2).getValues()[0];
      if (normalizeCode_(v[0]) === code && (!body.gameId || String(v[1]) === String(body.gameId))) { sheet.deleteRow(row); removed++; }
    }
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
function reportError_(body) {
  if (!readSettings_().errorReports) return { result: 'error', error: 'error_reports_off' };
  try {
    var cache = CacheService.getScriptCache();
    var key = 'errors:' + Math.floor(new Date().getTime() / 3600000);
    var n = Number(cache.get(key) || 0);
    if (n >= ERRORS_PER_HOUR) return { result: 'error', error: 'rate_limited' };
    cache.put(key, String(n + 1), 3700);
  } catch (e) { /* no cache: still accept */ }
  return withLock_(function () {
    getSheet_(ERRORS_SHEET, ERROR_HEADERS).appendRow([new Date(), text_(String(body.page || '').slice(0, 200)), text_(String(body.message || '').slice(0, 500)),
      text_(String(body.detail || '').slice(0, 2000)), text_(String(body.browser || '').slice(0, 200))]);
    return { result: 'success' };
  });
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
// -> { row: sheetRowNumber, created: bool, values: { header: value } (the stored row) }
function upsertByKey_(sheet, keyCols, row) {
  return withLock_(function () {
    var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var last = sheet.getLastRow();
    var vals = last < 2 ? [] : sheet.getRange(2, 1, last - 1, head.length).getValues();
    var kidx = keyCols.map(function (k) { return head.indexOf(k); });
    var found = -1;
    for (var i = 0; i < vals.length && found < 0; i++) {
      var ok = true;
      for (var k = 0; k < kidx.length; k++) {
        var a = String(vals[i][kidx[k]]).trim().toLowerCase();
        var b = String(row[keyCols[k]]).trim().toLowerCase();
        if (a !== b) { ok = false; break; }
      }
      if (ok) found = i;
    }
    var cur = found >= 0 ? vals[found].slice() : head.map(function () { return ''; });
    for (var h = 0; h < head.length; h++) if (Object.prototype.hasOwnProperty.call(row, head[h])) cur[h] = row[head[h]];
    if (found >= 0) sheet.getRange(found + 2, 1, 1, head.length).setValues([cur]);
    else sheet.appendRow(cur);
    var stored = {};
    for (var s = 0; s < head.length; s++) stored[head[s]] = cur[s];
    return { row: found >= 0 ? found + 2 : sheet.getLastRow(), created: found < 0, values: stored };
  });
}

// -> { email } | { error }. Only the verified token's email is ever used; any email field in the body is ignored.
function studentFromToken_(body) {
  var who = verifyStudent_(body);
  if (who.error || !who.email) return { error: who.error || 'unauthorized' };
  return { email: String(who.email).trim().toLowerCase() };
}

function xpForLevel_(level) { return 25 * Math.max(0, Math.floor(level) - 1) * Math.max(1, Math.floor(level)); }
function levelForXp_(xp) { var l = 1; while (xpForLevel_(l + 1) <= xp) l++; return l; }
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

function studentRow_(email) {
  var sheet = getSheet_(STUDENTS_SHEET, STUDENT_HEADERS);
  var row = findRow_(sheet, 1, email);
  if (!row) return null;
  var v = sheet.getRange(row, 1, 1, STUDENT_HEADERS.length).getValues()[0];
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
    streakDays: Math.max(0, Math.floor(num_(o.streakDays, 0))), lastActiveDate: String(o.lastActiveDate || ''),
    badges: parseJson_(o.badgesJson, []) || [], prefs: parseJson_(o.prefsJson, {}) || {}, stats: parseJson_(o.statsJson, {}) || {}
  };
}

// Classes this email is on: [{ id, name, period }]. The class list is cached; membership is matched per call.
function classesOfEmail_(email) {
  var list = cached_('classes:list', CACHE_TTL, function () {
    return readCols_(getSheet_(CLASSES_SHEET, CLASS_HEADERS), ['ID', 'Name', 'Period', 'Emails (JSON)']).filter(function (r) { return String(r.ID); })
      .map(function (r) { return { id: String(r.ID), name: String(r.Name), period: String(r.Period), emails: parseJson_(r['Emails (JSON)'], []) || [] }; });
  });
  return list.filter(function (c) { return c.emails.indexOf(email) >= 0; }).map(function (c) { return { id: c.id, name: c.name, period: c.period }; });
}

// Creates the row on first sight. Returns the stored row object.
function ensureStudent_(email, claims) {
  var existing = studentRow_(email);
  var now = new Date();
  var classes = classesOfEmail_(email).map(function (c) { return c.id; }).join(',');
  var patch = { email: email, lastSeen: now, classIds: classes };
  if (!existing) {
    patch.name = claims && claims.name ? String(claims.name).slice(0, 120) : '';
    patch.firstSeen = now; patch.xp = 0; patch.level = 1; patch.streakDays = 0; patch.lastActiveDate = '';
    patch.badgesJson = '[]'; patch.prefsJson = '{}'; patch.statsJson = '{}'; patch.updatedAt = now;
  } else if (!existing.name && claims && claims.name) patch.name = String(claims.name).slice(0, 120);
  return upsertByKey_(getSheet_(STUDENTS_SHEET, STUDENT_HEADERS), ['email'], patch).values;
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
  // B3 supplies getClassHub_({ _email }) (already-verified email); until then hub is absent.
  if (!admin && typeof getClassHub_ === 'function') {
    try { out.hub = getClassHub_({ _email: email }); } catch (e) { out.hub = null; }
  }
  return out;
}

function getStudentProfile_(body) {
  var who = studentFromToken_(body);
  if (who.error) return { result: 'error', error: who.error };
  var row = ensureStudent_(who.email, { name: body && body.name });
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

function syncProgress_(body) {
  var who = studentFromToken_(body);
  if (who.error) return { result: 'error', error: who.error };
  var att = body && body.attempt && typeof body.attempt === 'object' ? body.attempt : null;
  var xpIn = body && body.xp && typeof body.xp === 'object' ? body.xp : null;
  var out = { result: 'success' };
  if (att) {
    var code = normalizeCode_(att.code);
    if (!code) return { result: 'error', error: 'invalid_request' };
    var total = Math.max(0, Math.floor(num_(att.total, 0)));
    var answered = Math.max(0, Math.floor(num_(att.answeredCount, 0)));
    if (total) answered = Math.min(total, answered);
    var row = { email: who.email, code: code, mode: String(att.mode || '').slice(0, 32), answeredCount: answered, total: total,
      percentDone: total ? Math.round(1000 * answered / total) / 10 : 0, updatedAt: Date.now() };
    if (att.answers !== undefined && att.answers !== null) {
      var aj = JSON.stringify(att.answers);
      if (aj.length < ATTEMPT_ANSWERS_MAX) row.answersJson = aj;
    }
    upsertByKey_(getSheet_(ATTEMPTS_SHEET, ATTEMPT_HEADERS), ['email', 'code'], row);
    out.attempt = { code: code, mode: row.mode, answeredCount: answered, total: total, percentDone: row.percentDone, updatedAt: row.updatedAt };
  }
  var cur = ensureStudent_(who.email, null);
  var patch = { email: who.email, updatedAt: new Date() };
  if (xpIn) {
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
      if (b && badges.indexOf(b) < 0 && badges.length < 200) badges.push(b);
    });
    patch.xp = xp;
    patch.level = Math.max(num_(cur.level, 1), levelForXp_(xp));
    patch.badgesJson = JSON.stringify(badges);
    patch.statsJson = JSON.stringify(stats);
    if (xpIn.streakDays !== undefined) patch.streakDays = Math.max(num_(cur.streakDays, 0), Math.min(3650, Math.floor(num_(xpIn.streakDays, 0))));
    if (xpIn.lastActiveDate) patch.lastActiveDate = String(xpIn.lastActiveDate).slice(0, 10);
  }
  var stored = upsertByKey_(getSheet_(STUDENTS_SHEET, STUDENT_HEADERS), ['email'], patch).values;
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
