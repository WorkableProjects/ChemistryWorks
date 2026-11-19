// Test schema: normalization, validation, templates. Pure functions, no DOM.

import { FORMAT_HELP_MODES } from './hints.js';
import { orderQuestions, REFERENCE_TYPES, safeImageUrl } from './sections.js';
import { typeDef, registeredTypes } from './qtypes/registry.js';
import { cleanGameOptions, validateGameOptions } from './games/options.js';
import './qtypes/index.js'; // registers every question type definition

export const QUESTION_TYPES = ['mcq', 'multi', 'numeric', 'formula', 'truefalse', 'matching', 'ordering', 'fillblank', 'lewis', 'structure', 'orbital', 'short', 'open', 'balance', 'econfig', 'ptable', 'sigfigs', 'categorize', 'hotspot', 'graph'];
// Types a teacher always grades by hand in the admin Grading tab.
export const MANUAL_TYPES = ['short', 'open', 'orbital'];

/**
 * True when a teacher grades this question by hand: MANUAL_TYPES, plus Lewis structures where the student
 * also draws brackets and charges (`studentCharges: true`, V2-06). Use this instead of MANUAL_TYPES.includes().
 */
export function isManualQuestion(q) {
  const def = q && typeDef(q.type);
  if (!def) return false;
  return typeof def.isManual === 'function' ? def.isManual(q) === true : def.manual === true;
}
export const TYPE_LABELS = {
  mcq: 'Multiple choice',
  multi: 'Multiple select',
  numeric: 'Numeric',
  formula: 'Chemical formula',
  truefalse: 'True / False',
  matching: 'Matching',
  ordering: 'Ordering',
  fillblank: 'Fill in the blanks',
  lewis: 'Lewis dot diagram',
  structure: 'Lewis structure (bonding)',
  orbital: 'Orbital diagram (teacher graded)',
  short: 'Short answer (teacher graded)',
  open: 'Open response (teacher graded)',
  balance: 'Balance the equation',
  econfig: 'Electron configuration',
  ptable: 'Periodic-table pick',
  sigfigs: 'Significant figures',
  categorize: 'Sort into groups',
  hotspot: 'Label the diagram',
  graph: 'Read or plot a graph',
};
// V4-03: registered v4 types join the type list and labels (js/lib/qtypes/registry.js).
for (const t of registeredTypes()) {
  if (!QUESTION_TYPES.includes(t)) QUESTION_TYPES.push(t);
  TYPE_LABELS[t] = typeDef(t).label || t;
  if (typeDef(t).manual === true && !MANUAL_TYPES.includes(t)) MANUAL_TYPES.push(t);
}

/** Helpers handed to v4 type definitions (so they never import this module). */
const SCHEMA_HELPERS = {
  normalizeQuestion: (raw) => normalizeQuestion(raw),
  /** Validate a nested question (e.g. a multipart part); messages are prefixed with `where`. */
  validateQuestion: (q, where, errors) => {
    const errs = [];
    validateQuestion(q, 0, new Set(), errs);
    for (const e of errs) errors.push(e.replace(/^Question 1 \([^)]*\)/, where));
  },
};

const CODE_RE = /^[A-Z0-9_-]{2,32}$/;
const ID_RE = /^[A-Za-z0-9_-]+$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, d = '') => (v === undefined || v === null ? d : String(v));
const bool = (v, d) => (v === undefined || v === null ? d : Boolean(v));
const nullableNum = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

function clone(v) {
  try {
    return structuredClone(v);
  } catch {
    return JSON.parse(JSON.stringify(v));
  }
}

function normalizeQuestion(raw) {
  const q = isObj(raw) ? raw : {};
  q.id = str(q.id).trim();
  q.type = str(q.type).trim();
  q.text = str(q.text);
  q.points = q.points === undefined || q.points === null ? 1 : Number(q.points);
  q.explanation = str(q.explanation);
  if (q.required !== undefined) q.required = bool(q.required, false);
  if (isObj(q.image) && str(q.image.url).trim()) {
    const pos = str(q.image.position).trim().toLowerCase();
    q.image = { url: str(q.image.url).trim(), alt: str(q.image.alt), position: ['right', 'left', 'below'].includes(pos) ? pos : 'right' };
  } else delete q.image;
  if (q.section === undefined || q.section === null || str(q.section).trim() === '') delete q.section;
  else q.section = str(q.section).trim();
  // V4-03 per-question extras (all optional, off by default): confidence switch and a point-costing hint.
  if (q.confidence !== undefined) {
    if (bool(q.confidence, false)) q.confidence = true; else delete q.confidence;
  }
  if (q.hint !== undefined) {
    const src = typeof q.hint === 'string' ? { text: q.hint } : q.hint;
    if (isObj(src) && str(src.text).trim() !== '') {
      q.hint = { text: str(src.text), cost: src.cost === undefined || src.cost === null || src.cost === '' ? 0 : Number(src.cost) };
    } else delete q.hint;
  }
  if (typeDef(q.type)?.normalize) typeDef(q.type).normalize(q, SCHEMA_HELPERS);
  if (['formula', 'numeric', 'fillblank'].includes(q.type)) {
    q.formatHelp = q.formatHelp === undefined || q.formatHelp === null || q.formatHelp === '' ? 'auto'
      : q.formatHelp === true ? 'always' : q.formatHelp === false ? 'never' : q.formatHelp;
  }
  return q;
}

/** A question must be answered before submitting: the test-wide switch or the question's own `required`. */
export function isRequired(test, q) {
  return !!(test && test.requireAllQuestions) || !!(q && q.required);
}

export function normalizeTest(raw) {
  const t = isObj(raw) ? clone(raw) : {};
  t.code = str(t.code).trim().toUpperCase();
  t.title = str(t.title).trim();
  t.description = str(t.description);
  t.timeLimitMinutes = nullableNum(t.timeLimitMinutes);
  t.shuffleQuestions = bool(t.shuffleQuestions, false);
  t.shuffleOptions = bool(t.shuffleOptions, false);
  t.showResults = bool(t.showResults, true);
  t.showCorrectAnswers = bool(t.showCorrectAnswers, true);
  t.allowModeToggle = bool(t.allowModeToggle, true);
  t.singleSubmission = bool(t.singleSubmission, false);
  t.requireAllQuestions = bool(t.requireAllQuestions, false);
  if (t.games !== undefined) t.games = Array.isArray(t.games) ? t.games.map((g) => str(g).trim()).filter(Boolean) : undefined;
  if (t.gameOptions !== undefined) t.gameOptions = cleanGameOptions(t.gameOptions); // V4-04
  // V4-02 / V4-07 test settings (all optional): window, late work, announcement, classes / roster, tools, practice.
  for (const k of ['opensAt', 'closesAt']) { if (t[k] === '' || t[k] === null) delete t[k]; else if (t[k] !== undefined) t[k] = str(t[k]).trim(); }
  if (t.announcement !== undefined) { t.announcement = str(t.announcement).trim(); if (!t.announcement) delete t.announcement; }
  if (t.late !== undefined && t.late !== null && !isObj(t.late)) delete t.late;
  if (t.late === null || (isObj(t.late) && !str(t.late.until).trim())) delete t.late;
  if (t.classes !== undefined) t.classes = Array.isArray(t.classes) ? [...new Set(t.classes.map((x) => str(x).trim()).filter(Boolean))] : [];
  if (t.rosterOnly !== undefined) t.rosterOnly = t.rosterOnly === true;
  t.defaultMode = t.defaultMode === undefined || t.defaultMode === null || t.defaultMode === '' ? null : t.defaultMode;
  t.passingPercent = nullableNum(t.passingPercent);
  t.sections = Array.isArray(t.sections) ? t.sections.map((x) => {
    const src = isObj(x) ? x : {};
    return { ...src, id: str(src.id).trim(), title: str(src.title), instructions: str(src.instructions) };
  }) : [];
  t.references = Array.isArray(t.references) ? t.references.map((x) => {
    const src = isObj(x) ? x : {};
    const type = str(src.type).trim();
    const out = { ...src, id: str(src.id).trim(), type: type === 'constants' ? 'resources' : type, title: str(src.title) };
    if (out.type === 'text') out.content = str(src.content);
    if (out.type === 'image') { out.url = str(src.url).trim(); out.alt = str(src.alt); }
    if (out.type === 'resources') {
      out.items = (Array.isArray(src.items) ? src.items : []).map((it) => {
        const c = isObj(it) ? it : {};
        return { name: str(c.name), value: str(c.value), unit: str(c.unit) };
      });
    }
    return out;
  }) : [];
  t.questions = Array.isArray(t.questions) ? t.questions.map(normalizeQuestion) : [];
  // Canonical display order: unsectioned questions first, then each section in order (see sections.js).
  t.questions = orderQuestions(t);
  return t;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const nonEmptyStr = (v) => typeof v === 'string' && v.trim() !== '';

function validateQuestion(q, index, seenIds, errors, sectionIdSet = new Set()) {
  const idLabel = isObj(q) && q.id !== undefined && q.id !== '' ? String(q.id) : '?';
  const where = `Question ${index + 1} (${idLabel})`;
  if (isObj(q) && isObj(q.image)) {
    if (!safeImageUrl(q.image.url)) errors.push(`${where}: image url must start with https://, be a path on this site, or be an uploaded picture.`);
    if (!nonEmptyStr(q.image.alt)) errors.push(`${where}: question images need alt text describing the image.`);
  }
  if (!isObj(q)) { errors.push(`${where}: must be an object.`); return; }

  if (!nonEmptyStr(q.id)) errors.push(`${where}: id is required.`);
  else if (!ID_RE.test(q.id)) errors.push(`${where}: id may only contain letters, digits, "_" and "-".`);
  else if (seenIds.has(q.id)) errors.push(`${where}: duplicate question id "${q.id}".`);
  else seenIds.add(q.id);

  if (!nonEmptyStr(q.text)) errors.push(`${where}: text is required.`);
  if (!isNum(q.points) || q.points <= 0) errors.push(`${where}: points must be a number greater than 0.`);
  if (q.section !== undefined && q.section !== null && q.section !== '' && !sectionIdSet.has(q.section)) {
    errors.push(`${where}: section "${q.section}" does not exist. Add it under sections or remove the question's section.`);
  }

  if (q.confidence !== undefined && typeof q.confidence !== 'boolean') errors.push(`${where}: confidence must be true or false.`);
  if (q.hint !== undefined) {
    if (!isObj(q.hint)) errors.push(`${where}: hint must be an object with text and cost.`);
    else {
      if (!nonEmptyStr(q.hint.text)) errors.push(`${where}: hint text is required.`);
      if (!isNum(q.hint.cost) || q.hint.cost < 0) errors.push(`${where}: hint cost must be a number of points, 0 or more.`);
      else if (isNum(q.points) && q.points > 0 && q.hint.cost > q.points) errors.push(`${where}: hint cost (${q.hint.cost}) cannot be more than the question's points (${q.points}).`);
    }
  }

  if (!QUESTION_TYPES.includes(q.type)) {
    errors.push(`${where}: unknown type "${q.type}".`);
    return;
  }
  if (typeDef(q.type)?.validate) typeDef(q.type).validate(q, where, errors, SCHEMA_HELPERS);
  if (q.formatHelp !== undefined && ['formula', 'numeric', 'fillblank'].includes(q.type) && !FORMAT_HELP_MODES.includes(q.formatHelp)) {
    errors.push(`${where}: formatHelp must be "auto", "always" or "never".`);
  }
}

export function validateTest(test) {
  const errors = [];
  if (!isObj(test)) return { valid: false, errors: ['Test: must be an object.'] };

  if (!nonEmptyStr(test.code)) errors.push('Test: code is required.');
  else if (!CODE_RE.test(test.code)) errors.push('Test: code must be 2-32 characters: A-Z, 0-9, "_" or "-".');
  if (!nonEmptyStr(test.title)) errors.push('Test: title is required.');
  const tl = test.timeLimitMinutes;
  if (tl !== undefined && tl !== null && (!isNum(tl) || tl <= 0)) errors.push('Test: timeLimitMinutes must be a positive number or empty.');
  const pp = test.passingPercent;
  if (pp !== undefined && pp !== null && (!isNum(pp) || pp < 0 || pp > 100)) errors.push('Test: passingPercent must be a number between 0 and 100.');
  const dm = test.defaultMode;
  if (dm !== undefined && dm !== null && dm !== 'focus' && dm !== 'scroll') errors.push('Test: defaultMode must be "focus" or "scroll".');

  const sectionIdSet = new Set();
  if (test.sections !== undefined && !Array.isArray(test.sections)) errors.push('Test: sections must be a list of { id, title, instructions }.');
  (Array.isArray(test.sections) ? test.sections : []).forEach((sec, i) => {
    const where = `Section ${i + 1}`;
    if (!isObj(sec)) { errors.push(`${where}: must be an object with id and title.`); return; }
    if (!nonEmptyStr(sec.id) || !ID_RE.test(sec.id)) errors.push(`${where}: id is required (letters, digits, "_" or "-").`);
    else if (sectionIdSet.has(sec.id)) errors.push(`${where}: duplicate section id "${sec.id}".`);
    else sectionIdSet.add(sec.id);
    if (!nonEmptyStr(sec.title)) errors.push(`${where}: title is required.`);
    if (sec.instructions !== undefined && typeof sec.instructions !== 'string') errors.push(`${where}: instructions must be text.`);
  });
  if (test.references !== undefined && !Array.isArray(test.references)) errors.push('Test: references must be a list.');
  const refIds = new Set();
  (Array.isArray(test.references) ? test.references : []).forEach((ref, i) => {
    const where = `Reference ${i + 1}`;
    if (!isObj(ref)) { errors.push(`${where}: must be an object with id and type.`); return; }
    if (!nonEmptyStr(ref.id) || !ID_RE.test(ref.id)) errors.push(`${where}: id is required (letters, digits, "_" or "-").`);
    else if (refIds.has(ref.id)) errors.push(`${where}: duplicate reference id "${ref.id}".`);
    else refIds.add(ref.id);
    if (!REFERENCE_TYPES.includes(ref.type)) { errors.push(`${where}: type must be one of ${REFERENCE_TYPES.map((x) => `"${x}"`).join(', ')}.`); return; }
    if (ref.type === 'text' && !nonEmptyStr(ref.content)) errors.push(`${where}: text references need content.`);
    if (ref.type === 'resources') {
      if (!Array.isArray(ref.items) || !ref.items.length) errors.push(`${where}: resources need at least one row.`);
      else ref.items.forEach((it, k) => {
        if (!isObj(it) || !nonEmptyStr(it.name) || !nonEmptyStr(it.value)) errors.push(`${where}: resource ${k + 1} needs a name and a value.`);
      });
    }
    if (ref.type === 'image') {
      if (!safeImageUrl(ref.url)) errors.push(`${where}: image url must start with https://, be a path on this site, or be an uploaded picture.`);
      if (!nonEmptyStr(ref.alt)) errors.push(`${where}: image references need alt text describing the image.`);
    }
  });
  if ((Array.isArray(test.references) ? test.references : []).filter((r) => isObj(r) && r.type === 'periodic-table').length > 1) {
    errors.push('Test: add the periodic table reference only once.');
  }

  if (!Array.isArray(test.questions) || test.questions.length === 0) {
    errors.push('Test: add at least one question.');
  } else {
    const seen = new Set();
    test.questions.forEach((q, i) => validateQuestion(q, i, seen, errors, sectionIdSet));
  }
  errors.push(...validateGameOptions(test)); // V4-04
  const badDate = (v) => v !== undefined && v !== '' && !Number.isFinite(Date.parse(v));
  for (const k of ['opensAt', 'closesAt']) if (badDate(test[k])) errors.push(`Test: ${k} must be a date and time (e.g. 2026-11-10T08:00).`);
  if (test.opensAt && test.closesAt && Date.parse(test.closesAt) <= Date.parse(test.opensAt)) errors.push('Test: closesAt must be after opensAt.');
  if (isObj(test.late)) {
    if (badDate(test.late.until)) errors.push('Test: late.until must be a date and time.');
    if (!test.closesAt) errors.push('Test: late work needs a closesAt date.');
    else if (Date.parse(test.late.until) <= Date.parse(test.closesAt)) errors.push('Test: late.until must be after closesAt.');
    const p = test.late.penalty;
    if (p !== undefined && p !== null && (!isObj(p) || !['percentPerDay', 'flat'].includes(p.type) || !isNum(p.value) || p.value < 0 || p.value > 100)) {
      errors.push('Test: late.penalty must be { "type": "percentPerDay" | "flat", "value": 0-100 }.');
    }
  }
  if (test.rosterOnly === true && (!Array.isArray(test.classes) || !test.classes.length)) errors.push('Test: a roster-only test needs at least one class.');
  if (test.practice !== undefined && (!Array.isArray(test.practice) || test.practice.some((p) => !isObj(p) || !nonEmptyStr(p.game)))) errors.push('Test: practice must be a list of { "game", "target", "due" }.');
  for (const sec of Array.isArray(test.sections) ? test.sections : []) {
    if (!isObj(sec) || sec.pool === undefined) continue;
    const pool = sec.pool;
    const n = Array.isArray(test.questions) ? test.questions.filter((q) => q && q.section === sec.id).length : 0;
    if (!isObj(pool) || !Number.isInteger(pool.draw) || pool.draw < 1) errors.push(`Section "${sec.title || sec.id}": pool.draw must be a whole number of at least 1.`);
    else if (pool.draw > n) errors.push(`Section "${sec.title || sec.id}": pool draws ${pool.draw} but the section has only ${n} questions.`);
  }
  return { valid: errors.length === 0, errors };
}

export function blankQuestion(type, id = 'q1') {
  const base = { id, type, text: 'New question', points: 1, explanation: '' };
  // Templates come out already normalized, so normalizing them again is a no-op.
  if (typeDef(type)?.blank) return normalizeQuestion(typeDef(type).blank(base));
  throw new RangeError(`Unknown question type: ${type}`);
}

export function nextQuestionId(questions) {
  const used = new Set((Array.isArray(questions) ? questions : []).map((q) => q && q.id));
  let n = 1;
  while (used.has(`q${n}`)) n++;
  return `q${n}`;
}

export function blankTest() {
  return {
    code: '',
    title: '',
    description: '',
    timeLimitMinutes: null,
    shuffleQuestions: false,
    shuffleOptions: false,
    showResults: true,
    showCorrectAnswers: true,
    allowModeToggle: true,
    singleSubmission: false,
    requireAllQuestions: false,
    defaultMode: null,
    passingPercent: null,
    sections: [],
    references: [],
    questions: [],
  };
}
