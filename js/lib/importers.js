// V4-09 import (S11): turn pasted text, CSV or a Google Forms export into a draft test, and roster CSVs into email lists.
// Pure, no DOM. Every parser returns { test, warnings } (or { emails, warnings }) and never throws.
//
// Plain text format (numbered questions; options a)-d); "*" marks the right option; "Answer:" for numeric/short):
//   1. Which particle has a negative charge?
//   a) proton
//   *b) electron
//   c) neutron
//   2. How many moles are in 18.0 g of water?
//   Answer: 1.00 mol
//   3. Water is a compound. (True/False)
//   Answer: true

const LETTERS = 'abcdefghij';
const strip = (s) => String(s ?? '').replace(/\r/g, '');

function blankTest(title) {
  return { code: '', title: title || 'Imported test', description: '', timeLimitMinutes: null, questions: [], sections: [] };
}

function finishQuestion(cur, out, warnings) {
  if (!cur) return;
  const id = `q${out.length + 1}`;
  const base = { id, text: cur.text.trim(), points: 1, explanation: '' };
  if (cur.options.length >= 2) {
    const correct = cur.options.filter((o) => o.correct).map((o) => o.id);
    if (!correct.length) warnings.push(`Question ${out.length + 1}: no option marked with * — the first option was used as the answer.`);
    out.push(correct.length > 1
      ? { ...base, type: 'multi', options: cur.options.map(({ id: oid, text }) => ({ id: oid, text })), correctAnswer: correct, partialCredit: false }
      : { ...base, type: 'mcq', options: cur.options.map(({ id: oid, text }) => ({ id: oid, text })), correctAnswer: correct[0] || cur.options[0].id });
    return;
  }
  const ans = (cur.answer || '').trim();
  if (/^(true|false)$/i.test(ans)) { out.push({ ...base, type: 'truefalse', correctAnswer: /^true$/i.test(ans) }); return; }
  const num = ans.match(/^(-?\d+(?:\.\d+)?(?:e-?\d+)?)\s*([A-Za-z/%°·^0-9-]*)$/i);
  if (num) { out.push({ ...base, type: 'numeric', correctAnswer: Number(num[1]), tolerance: 0, toleranceType: 'absolute', unit: num[2] || '', formatHelp: 'auto' }); return; }
  out.push({ ...base, type: 'short', sampleAnswer: ans });
  if (!ans) warnings.push(`Question ${out.length}: no answer given — imported as a teacher-graded short answer.`);
}

export function parsePlainText(text, { title } = {}) {
  const warnings = [];
  const out = [];
  let cur = null;
  for (const raw of strip(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const q = line.match(/^(\d+)[.)]\s+(.*)$/);
    const o = line.match(/^(\*?)\s*([a-j])[.)]\s+(.*)$/i);
    const a = line.match(/^answer\s*:\s*(.*)$/i);
    if (q) { finishQuestion(cur, out, warnings); cur = { text: q[2], options: [], answer: '' }; }
    else if (o && cur) cur.options.push({ id: o[2].toLowerCase(), text: o[3].replace(/\s*\*$/, ''), correct: o[1] === '*' || /\*$/.test(o[3]) });
    else if (a && cur) cur.answer = a[1];
    else if (cur) cur.text += ` ${line}`;
  }
  finishQuestion(cur, out, warnings);
  const test = blankTest(title);
  test.questions = out;
  if (!out.length) warnings.push('No numbered questions were found. Start each question with "1.", "2.", …');
  return { test, warnings };
}

/** Minimal RFC-4180 CSV parser (quotes, doubled quotes, commas and newlines inside quotes). */
export function parseCsv(text) {
  const rows = [];
  let row = []; let field = ''; let q = false;
  const s = strip(text);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

/**
 * CSV with a header row: Question, Type (mcq|multi|truefalse|numeric|short), Option A..F, Answer, Points, Explanation.
 * Answer: the option letter(s) ("b" or "a;c"), true/false, a number, or sample text.
 */
export function parseQuestionCsv(text, { title } = {}) {
  const warnings = [];
  const rows = parseCsv(text);
  const test = blankTest(title);
  if (rows.length < 2) return { test, warnings: ['The CSV needs a header row and at least one question.'] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => head.findIndex((h) => h === name || h.startsWith(name));
  const ci = { q: col('question'), type: col('type'), ans: col('answer'), pts: col('points'), ex: col('explanation') };
  const optCols = head.map((h, i) => (/^option\s*[a-j]$/.test(h) ? i : -1)).filter((i) => i >= 0);
  rows.slice(1).forEach((r, n) => {
    const text2 = String(r[ci.q] ?? '').trim();
    if (!text2) return;
    const opts = optCols.map((i, k) => ({ id: LETTERS[k], text: String(r[i] ?? '').trim() })).filter((o) => o.text);
    const ans = String(r[ci.ans] ?? '').trim();
    const type = String(r[ci.type] ?? '').trim().toLowerCase() || (opts.length ? (ans.includes(';') ? 'multi' : 'mcq') : '');
    const base = { id: `q${test.questions.length + 1}`, text: text2, points: Number(r[ci.pts]) > 0 ? Number(r[ci.pts]) : 1, explanation: String(r[ci.ex] ?? '') };
    if (type === 'mcq' || type === 'multi') {
      const letters = ans.toLowerCase().split(/[;,\s]+/).filter((x) => opts.some((o) => o.id === x));
      if (!letters.length) warnings.push(`Row ${n + 2}: answer "${ans}" is not one of the option letters.`);
      test.questions.push(type === 'multi' ? { ...base, type, options: opts, correctAnswer: letters, partialCredit: false } : { ...base, type, options: opts, correctAnswer: letters[0] || 'a' });
    } else if (type === 'truefalse') test.questions.push({ ...base, type, correctAnswer: /^t/i.test(ans) });
    else if (type === 'numeric') test.questions.push({ ...base, type, correctAnswer: Number(ans) || 0, tolerance: 0, toleranceType: 'absolute', unit: '', formatHelp: 'auto' });
    else test.questions.push({ ...base, type: 'short', sampleAnswer: ans });
  });
  return { test, warnings };
}

/**
 * Google Forms "quiz" export as CSV (File → Download responses is NOT the quiz; use a sheet with columns
 * Question, Choices (one per line or separated by |), Correct). Choices marked or listed as Correct become the key.
 */
export function parseFormsCsv(text, { title } = {}) {
  const rows = parseCsv(text);
  const warnings = [];
  const test = blankTest(title || 'Imported from Google Forms');
  if (rows.length < 2) return { test, warnings: ['The export needs a header row and at least one question.'] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const qi = head.findIndex((h) => h.includes('question') || h.includes('title'));
  const chi = head.findIndex((h) => h.includes('choice') || h.includes('option'));
  const ki = head.findIndex((h) => h.includes('correct') || h.includes('answer'));
  rows.slice(1).forEach((r) => {
    const q = String(r[qi] ?? '').trim();
    if (!q) return;
    const choices = String(r[chi] ?? '').split(/\n|\|/).map((c) => c.trim()).filter(Boolean);
    const keys = String(r[ki] ?? '').split(/\n|\|/).map((c) => c.trim().toLowerCase()).filter(Boolean);
    const id = `q${test.questions.length + 1}`;
    if (choices.length >= 2) {
      const opts = choices.map((c, k) => ({ id: LETTERS[k], text: c }));
      const correct = opts.filter((o) => keys.includes(o.text.toLowerCase())).map((o) => o.id);
      if (!correct.length) warnings.push(`"${q.slice(0, 40)}": no correct choice found — first choice used.`);
      test.questions.push(correct.length > 1
        ? { id, type: 'multi', text: q, points: 1, explanation: '', options: opts, correctAnswer: correct, partialCredit: false }
        : { id, type: 'mcq', text: q, points: 1, explanation: '', options: opts, correctAnswer: correct[0] || 'a' });
    } else test.questions.push({ id, type: 'short', text: q, points: 1, explanation: '', sampleAnswer: keys[0] || '' });
  });
  return { test, warnings };
}

/** Roster CSV (Google Classroom / Aeries exports, or one email per line): every email-looking cell, de-duplicated. */
export function parseRoster(text) {
  const emails = [];
  const seen = new Set();
  for (const m of strip(text).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    const e = m[0].toLowerCase();
    if (!seen.has(e)) { seen.add(e); emails.push(e); }
  }
  return { emails, warnings: emails.length ? [] : ['No email addresses were found.'] };
}
