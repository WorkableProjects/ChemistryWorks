/**
 * ChemistryWorks backend (Google Apps Script, V8 runtime).
 *
 * Stores submissions and published tests in the bound Google Sheet and serves them to the app.
 * Run setup() once from the editor, set the ADMIN_KEY script property, then deploy as a Web App
 * (Execute as: Me, Who has access: Anyone). See DEPLOYMENT.md.
 */

var VERSION = '2.0.0';

var SUBMISSIONS_SHEET = 'Submissions';
var TESTS_SHEET = 'Tests';

var SUBMISSION_HEADERS = [
  'Timestamp', 'Submission ID', 'Student Name', 'Student Email', 'Test Code', 'Test Title',
  'Score Achieved', 'Total Score', 'Percentage (%)', 'Duration (s)', 'Tab Switches', 'Auto Submitted',
  'Detailed Responses (JSON)', 'Flags (JSON)',
  'Status', 'Final Score', 'Final Percentage (%)', 'Grades (JSON)', 'Graded At', 'Teacher Note',
  'Comments (JSON)', 'Released At', 'Graded By'
];
// 1-based columns of the grading fields (appended after the original 14 columns; v2 adds 21-22).
// Older sheets get the missing headers appended automatically by getSheet_ (empty cells = safe defaults:
// no comments, not released).
var COL = { EMAIL: 4, RESPONSES: 13, STATUS: 15, FINAL_SCORE: 16, FINAL_PCT: 17, GRADES: 18, GRADED_AT: 19, NOTE: 20, COMMENTS: 21, RELEASED_AT: 22, GRADED_BY: 23 };
var MAX_COMMENT_CHARS = 2000;
var STATUS_NEEDS_GRADING = 'Needs grading';
var STATUS_AUTO = 'Auto-graded';
var STATUS_GRADED = 'Graded';
var TEST_HEADERS = ['Code', 'Title', 'Updated At', 'Test JSON'];

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
        return json_(handleAdmin_(body));
      case 'getFeedback':
        return json_(getFeedback_(body));
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
  var hasKey = !!PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  Logger.log('Sheets "' + SUBMISSIONS_SHEET + '" and "' + TESTS_SHEET + '" are ready.');
  if (hasKey) {
    Logger.log('ADMIN_KEY is set.');
  } else {
    Logger.log('NEXT STEP: set the admin key. Open Project Settings (gear icon) > Script properties > ' +
      'Add script property: name ADMIN_KEY, value = a long random passphrase. ' +
      'Without it, publishing tests and reading results are disabled.');
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
    submitted_at: d.submitted_at || ''
  };
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
      pending ? STATUS_NEEDS_GRADING : STATUS_AUTO,
      pending ? '' : s.score_achieved,
      pending ? '' : s.percentage,
      '',
      '',
      '',
      '',
      ''
    ]);
    return { result: 'success' };
  });
}

// ---------------------------------------------------------------------------
// Tests (public read, admin write)
// ---------------------------------------------------------------------------

function getTest_(code) {
  var c = normalizeCode_(code);
  if (!c) return { result: 'error', error: 'not_found' };
  var sheet = getSheet_(TESTS_SHEET, TEST_HEADERS);
  var row = findRow_(sheet, 1, c);
  if (!row) return { result: 'error', error: 'not_found' };
  var test = parseJson_(sheet.getRange(row, 4).getValue(), null);
  return test ? { result: 'success', test: test } : { result: 'error', error: 'not_found' };
}

// ---------------------------------------------------------------------------
// Admin operations
// ---------------------------------------------------------------------------

function checkAdmin_(body) {
  var key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!key) return 'admin_key_not_configured';
  if (!body.adminKey || String(body.adminKey) !== key) return 'unauthorized';
  return null;
}

function handleAdmin_(body) {
  var authError = checkAdmin_(body);
  if (authError) return { result: 'error', error: authError };
  switch (body.action) {
    case 'publishTest': return publishTest_(body.test);
    case 'listTests': return listTests_();
    case 'deleteTest': return deleteTest_(body.code);
    case 'getResults': return getResults_(body.testCode);
    case 'saveGrade': return saveGrade_(body);
    case 'getSubmissionCounts': return getSubmissionCounts_();
  }
  return { result: 'error', error: 'unknown_action' };
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
        graded_by: String(v[COL.GRADED_BY - 1] || '')
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
function getSubmissionCounts_() {
  var sheet = getSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  var last = sheet.getLastRow();
  var counts = {};
  if (last >= 2) {
    var values = sheet.getRange(2, 1, last - 1, 5).getValues();
    for (var i = 0; i < values.length; i++) {
      if (values[i][1] === '' || values[i][1] === null) continue; // no submission id
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
