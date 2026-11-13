// Test schema: normalization, validation, templates. Pure functions, no DOM.

import { normalizeSymbol, valenceOf } from './lewis.js';
import { bondEnds, validateStructure } from './structure.js';
import { BLANK_KINDS, markerIds } from './blanks.js';
import { FORMAT_HELP_MODES } from './hints.js';
import { AUFBAU, ORBITAL_TYPES, DEFAULT_MAX_SUBLEVEL, DEFAULT_ORBITAL_TYPES, validateOrbital } from './orbital.js';
import { orderQuestions, REFERENCE_TYPES, safeImageUrl } from './sections.js';
import { ELEMENTS } from './elements.js';
import { parseConfig } from './qtypes/econfig.js';
import { typeDef, registeredTypes } from './qtypes/registry.js';
import { cleanGameOptions, validateGameOptions } from './games/options.js';

import './qtypes/v4-types.js'; // Registers the v4 question types

export const QUESTION_TYPES = ['mcq', 'multi', 'numeric', 'formula', 'truefalse', 'matching', 'ordering', 'fillblank', 'lewis', 'structure', 'orbital', 'short', 'open', 'balance', 'econfig', 'ptable', 'sigfigs', 'categorize', 'hotspot', 'graph'];
// Types a teacher always grades by hand in the admin Grading tab.
export const MANUAL_TYPES = ['short', 'open', 'orbital'];

/**
 * True when a teacher grades this question by hand: MANUAL_TYPES, plus Lewis structures where the student
 * also draws brackets and charges (`studentCharges: true`, V2-06). Use this instead of MANUAL_TYPES.includes().
 */
export function isManualQuestion(q) {
  if (q && typeDef(q.type)) return typeDef(q.type).manual === true;
  return !!q && (MANUAL_TYPES.includes(q.type) || (q.type === 'structure' && q.studentCharges === true));
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
// Registered types join the type list and labels (js/lib/qtypes/registry.js).
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

function normOptions(list) {
  if (!Array.isArray(list)) return [];
  return list.map((o) => {
    const src = isObj(o) ? o : { id: o, text: o };
    const out = { ...src, id: str(src.id).trim(), text: str(src.text) };
    // Optional picture for this choice / item: kept only with a url, so existing tests normalize unchanged.
    if (isObj(src.image) && str(src.image.url).trim()) out.image = { url: str(src.image.url).trim(), alt: str(src.image.alt) };
    else delete out.image;
    return out;
  });
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
  // Tags are IDs (tg_xxxxxx); names come from the teacher's local tags or the Tags sheet. Names are allowed on import.
  if (q.tags !== undefined) {
    const tags = Array.isArray(q.tags) ? [...new Set(q.tags.map((t) => str(t).trim()).filter(Boolean))] : [];
    if (tags.length) q.tags = tags; else delete q.tags;
  }
  switch (q.type) {
    case 'mcq':
      q.options = normOptions(q.options);
      break;
    case 'multi':
      q.options = normOptions(q.options);
      q.partialCredit = bool(q.partialCredit, false);
      break;
    case 'numeric':
      q.tolerance = q.tolerance === undefined || q.tolerance === null || q.tolerance === '' ? 0 : Number(q.tolerance);
      q.toleranceType = q.toleranceType === undefined || q.toleranceType === null ? 'absolute' : q.toleranceType;
      q.unit = str(q.unit);
      if (typeof q.correctAnswer === 'string' && q.correctAnswer.trim() !== '' && Number.isFinite(Number(q.correctAnswer))) {
        q.correctAnswer = Number(q.correctAnswer);
      }
      break;
    case 'formula':
      q.caseSensitive = bool(q.caseSensitive, true);
      break;
    case 'ordering':
      q.items = normOptions(q.items);
      q.partialCredit = bool(q.partialCredit, true);
      q.topLabel = str(q.topLabel);
      q.bottomLabel = str(q.bottomLabel);
      break;
    case 'fillblank':
      q.blanks = Array.isArray(q.blanks) ? q.blanks.map((b) => {
        const src = isObj(b) ? b : {};
        const answers = Array.isArray(src.answers) ? src.answers : src.answers === undefined || src.answers === null ? [] : [src.answers];
        const out = { ...src, id: str(src.id).trim(), answers: answers.map((a) => (typeof a === 'number' ? a : str(a))), kind: src.kind ? str(src.kind).trim() : 'text' };
        if (out.kind === 'number') {
          out.tolerance = src.tolerance === undefined || src.tolerance === null || src.tolerance === '' ? 0 : Number(src.tolerance);
          out.toleranceType = src.toleranceType || 'absolute';
          out.unit = str(src.unit);
        }
        return out;
      }) : [];
      q.partialCredit = bool(q.partialCredit, true);
      q.caseSensitive = bool(q.caseSensitive, false);
      q.wordBank = bool(q.wordBank, false);
      q.distractors = Array.isArray(q.distractors) ? q.distractors.map((d) => str(d)) : [];
      break;
    case 'structure':
      q.atoms = Array.isArray(q.atoms) ? q.atoms.map((a) => {
        const src = isObj(a) ? a : {};
        const sym = normalizeSymbol(src.symbol);
        return { ...src, id: str(src.id).trim(), symbol: sym || str(src.symbol).trim() };
      }) : [];
      q.bonds = Array.isArray(q.bonds) ? q.bonds.map((b) => bondEnds(b) || b) : [];
      q.charge = q.charge === undefined || q.charge === null || q.charge === '' ? 0 : Number(q.charge);
      q.partialCredit = bool(q.partialCredit, false);
      q.showElectronCount = bool(q.showElectronCount, false);
      q.studentCharges = bool(q.studentCharges, false);
      break;
    case 'orbital':
      q.maxSublevel = q.maxSublevel === undefined || q.maxSublevel === null || q.maxSublevel === '' ? DEFAULT_MAX_SUBLEVEL : str(q.maxSublevel).trim().toLowerCase();
      q.orbitalTypes = Array.isArray(q.orbitalTypes)
        ? ORBITAL_TYPES.filter((t) => q.orbitalTypes.map((x) => str(x).trim().toLowerCase()).includes(t))
        : DEFAULT_ORBITAL_TYPES.slice();
      if (q.sampleAnswer === undefined || q.sampleAnswer === '') q.sampleAnswer = null;
      break;
    case 'open':
      q.sampleAnswer = str(q.sampleAnswer);
      q.rubric = Array.isArray(q.rubric) ? q.rubric.map((r) => (isObj(r) ? { ...r, text: str(r.text), points: Number(r.points) } : { text: str(r), points: NaN })) : [];
      q.minWords = nullableNum(q.minWords);
      q.maxWords = nullableNum(q.maxWords);
      q.showRubric = bool(q.showRubric, true);
      break;
    case 'matching':
      q.left = normOptions(q.left);
      q.right = normOptions(q.right);
      q.partialCredit = bool(q.partialCredit, true);
      break;
    case 'lewis': {
      const sym = normalizeSymbol(q.element);
      q.element = sym || str(q.element).trim();
      q.checkPlacement = bool(q.checkPlacement, true);
      if (q.correctAnswer === undefined || q.correctAnswer === null || q.correctAnswer === '') {
        const v = valenceOf(sym);
        if (v !== null) q.correctAnswer = v;
      } else if (typeof q.correctAnswer === 'string' && Number.isFinite(Number(q.correctAnswer))) {
        q.correctAnswer = Number(q.correctAnswer);
      }
      break;
    }
    case 'short':
      q.sampleAnswer = str(q.sampleAnswer);
      break;
    case 'balance': {
      const list = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]).map((x) => str(x).trim());
      q.reactants = list(q.reactants);
      q.products = list(q.products);
      q.coefficients = Array.isArray(q.coefficients) ? q.coefficients.map((n) => (typeof n === 'string' && n.trim() !== '' ? Number(n) : n)) : [];
      q.allowMultiples = bool(q.allowMultiples, false);
      q.partialCredit = bool(q.partialCredit, false);
      break;
    }
    case 'econfig':
      q.answers = (Array.isArray(q.answers) ? q.answers : q.answers === undefined || q.answers === null || q.answers === '' ? [] : [q.answers]).map((a) => str(a).trim());
      break;
    case 'ptable': {
      const bySymbol = new Map(ELEMENTS.map((e) => [e.symbol.toLowerCase(), e.symbol]));
      q.answers = (Array.isArray(q.answers) ? q.answers : q.answers === undefined || q.answers === null || q.answers === '' ? [] : [q.answers])
        .map((a) => bySymbol.get(str(a).trim().toLowerCase()) || str(a).trim());
      q.multiple = bool(q.multiple, true);
      q.partialCredit = bool(q.partialCredit, false);
      break;
    }
    case 'sigfigs':
      if (typeof q.answer === 'string' && q.answer.trim() !== '' && Number.isFinite(Number(q.answer))) q.answer = Number(q.answer);
      if (typeof q.sigFigs === 'string' && q.sigFigs.trim() !== '' && Number.isFinite(Number(q.sigFigs))) q.sigFigs = Number(q.sigFigs);
      q.tolerance = q.tolerance === undefined || q.tolerance === null || q.tolerance === '' ? 0 : Number(q.tolerance);
      q.partialCredit = bool(q.partialCredit, true);
      break;
    case 'categorize':
      q.categories = (Array.isArray(q.categories) ? q.categories : []).map((c) => {
        const src = isObj(c) ? c : { id: c, label: c };
        return { ...src, id: str(src.id).trim(), label: str(src.label !== undefined ? src.label : src.text) };
      });
      q.items = (Array.isArray(q.items) ? q.items : []).map((it) => {
        const src = isObj(it) ? it : { id: it, text: it };
        return { ...src, id: str(src.id).trim(), text: str(src.text), category: str(src.category).trim() };
      });
      q.partialCredit = bool(q.partialCredit, true);
      break;
    case 'hotspot': {
      q.labels = (Array.isArray(q.labels) ? q.labels : []).map((l) => {
        const src = isObj(l) ? l : { id: l, text: l };
        const num = (v) => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v);
        return { ...src, id: str(src.id).trim(), text: str(src.text), x: num(src.x), y: num(src.y) };
      });
      q.radius = q.radius === undefined || q.radius === null || q.radius === '' ? 0.06 : Number(q.radius);
      q.partialCredit = bool(q.partialCredit, true);
      break;
    }
    case 'graph': {
      q.mode = str(q.mode).trim() === 'plot' ? 'plot' : 'read';
      const src = isObj(q.chart) ? q.chart : {};
      const num = (v) => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v);
      const pair = (p) => (Array.isArray(p) ? p.map(num) : p);
      q.chart = {
        ...src, xLabel: str(src.xLabel), yLabel: str(src.yLabel), xMin: num(src.xMin), xMax: num(src.xMax), yMin: num(src.yMin), yMax: num(src.yMax),
        series: (Array.isArray(src.series) ? src.series : []).map((s) => ({ ...(isObj(s) ? s : {}), points: (isObj(s) && Array.isArray(s.points) ? s.points : []).map(pair) })),
      };
      if (q.mode === 'read') {
        q.answer = num(q.answer);
        q.tolerance = q.tolerance === undefined || q.tolerance === null || q.tolerance === '' ? 0 : Number(q.tolerance);
        q.unit = str(q.unit);
      } else {
        q.targets = (Array.isArray(q.targets) ? q.targets : []).map(pair);
        q.toleranceX = q.toleranceX === undefined || q.toleranceX === null || q.toleranceX === '' ? 0 : Number(q.toleranceX);
        q.toleranceY = q.toleranceY === undefined || q.toleranceY === null || q.toleranceY === '' ? 0 : Number(q.toleranceY);
        q.partialCredit = bool(q.partialCredit, true);
      }
      break;
    }
    default:
      if (typeDef(q.type)?.normalize) typeDef(q.type).normalize(q, SCHEMA_HELPERS);
      break;
  }
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

function validateList(list, label, where, errors) {
  if (!Array.isArray(list) || list.length < 2) {
    errors.push(`${where}: ${label} needs at least 2 entries.`);
    return new Set();
  }
  const ids = new Set();
  list.forEach((o, i) => {
    const n = i + 1;
    if (!isObj(o)) { errors.push(`${where}: ${label} ${n} must be an object with id and text.`); return; }
    if (!nonEmptyStr(o.id) || !ID_RE.test(o.id)) errors.push(`${where}: ${label} ${n} has an invalid id (use letters, digits, "_" or "-").`);
    else if (ids.has(o.id)) errors.push(`${where}: duplicate ${label} id "${o.id}".`);
    else ids.add(o.id);
    const hasImage = isObj(o.image);
    if (hasImage) {
      if (!safeImageUrl(o.image.url)) errors.push(`${where}: ${label} ${n} image url must start with https:// or be a path on this site.`);
      if (!nonEmptyStr(o.image.alt)) errors.push(`${where}: ${label} ${n} image needs alt text describing the image.`);
    }
    if (!nonEmptyStr(o.text) && !(hasImage && safeImageUrl(o.image.url))) errors.push(`${where}: ${label} ${n} has empty text.`);
  });
  return ids;
}

function validateQuestion(q, index, seenIds, errors, sectionIdSet = new Set()) {
  const idLabel = isObj(q) && q.id !== undefined && q.id !== '' ? String(q.id) : '?';
  const where = `Question ${index + 1} (${idLabel})`;
  if (isObj(q) && isObj(q.image)) {
    if (!safeImageUrl(q.image.url)) errors.push(`${where}: image url must start with https://, be a path on this site, or be an uploaded picture.`);
    if (!nonEmptyStr(q.image.alt)) errors.push(`${where}: question images need alt text describing the image.`);
  }
  if (!isObj(q)) { errors.push(`${where}: must be an object.`); return; }
  if (q.tags !== undefined) {
    if (!Array.isArray(q.tags) || q.tags.some((t) => typeof t !== 'string')) errors.push(`${where}: tags must be a list of tag IDs.`);
    else if (q.tags.length > 10) errors.push(`${where}: at most 10 tags per question.`);
  }

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
  const a = q.correctAnswer;
  switch (q.type) {
    case 'mcq': {
      const ids = validateList(q.options, 'option', where, errors);
      if (typeof a !== 'string' || !ids.has(a)) errors.push(`${where}: correctAnswer must be the id of one of the options.`);
      break;
    }
    case 'multi': {
      const ids = validateList(q.options, 'option', where, errors);
      if (!Array.isArray(a) || a.length === 0) errors.push(`${where}: correctAnswer must be a non-empty array of option ids.`);
      else if (a.some((id) => typeof id !== 'string' || !ids.has(id))) errors.push(`${where}: correctAnswer contains an unknown option id.`);
      break;
    }
    case 'numeric':
      if (!isNum(a)) errors.push(`${where}: correctAnswer must be a number.`);
      if (q.tolerance !== undefined && (!isNum(q.tolerance) || q.tolerance < 0)) errors.push(`${where}: tolerance must be a number that is 0 or greater.`);
      if (q.toleranceType !== undefined && q.toleranceType !== 'absolute' && q.toleranceType !== 'percent') {
        errors.push(`${where}: toleranceType must be "absolute" or "percent".`);
      }
      break;
    case 'formula':
      if (Array.isArray(a)) {
        if (a.length === 0 || a.some((x) => !nonEmptyStr(x))) errors.push(`${where}: correctAnswer must list at least one non-empty formula.`);
      } else if (!nonEmptyStr(a)) errors.push(`${where}: correctAnswer must be a non-empty formula.`);
      break;
    case 'truefalse':
      if (typeof a !== 'boolean') errors.push(`${where}: correctAnswer must be true or false.`);
      break;
    case 'matching': {
      const leftIds = validateList(q.left, 'left item', where, errors);
      const rightIds = validateList(q.right, 'right item', where, errors);
      if (!isObj(a)) {
        errors.push(`${where}: correctAnswer must be an object mapping each left id to a right id.`);
      } else {
        for (const id of leftIds) {
          if (!(id in a)) errors.push(`${where}: correctAnswer is missing a match for left item "${id}".`);
        }
        for (const [l, r] of Object.entries(a)) {
          if (!leftIds.has(l)) errors.push(`${where}: correctAnswer refers to unknown left item "${l}".`);
          else if (typeof r !== 'string' || !rightIds.has(r)) errors.push(`${where}: correctAnswer for "${l}" points to unknown right item "${r}".`);
        }
      }
      break;
    }
    case 'lewis':
      if (!nonEmptyStr(q.element) || !normalizeSymbol(q.element)) errors.push(`${where}: element must be an element symbol such as "O" or "Cl".`);
      if (!Number.isInteger(a) || a < 1 || a > 8) errors.push(`${where}: correctAnswer must be the number of valence electrons (a whole number from 1 to 8).`);
      break;
    case 'short':
      if (q.sampleAnswer !== undefined && typeof q.sampleAnswer !== 'string') errors.push(`${where}: sampleAnswer must be text.`);
      break;
    case 'ordering': {
      const ids = validateList(q.items, 'item', where, errors);
      if (!Array.isArray(a) || a.length !== ids.size || new Set(a).size !== a.length || a.some((id) => !ids.has(id))) {
        errors.push(`${where}: correctAnswer must list every item id exactly once, in the correct order.`);
      }
      break;
    }
    case 'fillblank': {
      const blanks = Array.isArray(q.blanks) ? q.blanks : [];
      if (!blanks.length) { errors.push(`${where}: blanks needs at least 1 blank.`); break; }
      const ids = new Set();
      blanks.forEach((b, i) => {
        const n = i + 1;
        if (!isObj(b)) { errors.push(`${where}: blank ${n} must be an object with id and answers.`); return; }
        if (!nonEmptyStr(b.id) || !ID_RE.test(b.id)) errors.push(`${where}: blank ${n} has an invalid id (use letters, digits, "_" or "-").`);
        else if (ids.has(b.id)) errors.push(`${where}: duplicate blank id "${b.id}".`);
        else ids.add(b.id);
        const kind = b.kind === undefined ? 'text' : b.kind;
        if (!BLANK_KINDS.includes(kind)) errors.push(`${where}: blank ${n} kind must be "text", "number" or "formula".`);
        if (!Array.isArray(b.answers) || !b.answers.length || b.answers.some((x) => !(nonEmptyStr(x) || isNum(x)))) {
          errors.push(`${where}: blank ${n} needs answers: a list of accepted answers, e.g. ["H2O"].`);
        } else if (kind === 'number' && b.answers.some((x) => !isNum(x) && !Number.isFinite(Number(String(x).replace(/\s*[x×*]\s*10\s*\^\s*/i, 'e'))))) {
          errors.push(`${where}: blank ${n} is a number blank, so every answer must be a number.`);
        }
        if (kind === 'number' && b.tolerance !== undefined && (!isNum(b.tolerance) || b.tolerance < 0)) errors.push(`${where}: blank ${n} tolerance must be 0 or greater.`);
      });
      const marks = markerIds(q.text);
      for (const id of ids) {
        const c = marks.filter((m) => m === id).length;
        if (c === 0) errors.push(`${where}: text is missing the marker {{${id}}} for blank "${id}".`);
        else if (c > 1) errors.push(`${where}: marker {{${id}}} appears more than once in the text.`);
      }
      for (const m of new Set(marks)) if (!ids.has(m)) errors.push(`${where}: text has {{${m}}} but there is no blank with id "${m}".`);
      if (q.distractors !== undefined && (!Array.isArray(q.distractors) || q.distractors.some((d) => typeof d !== 'string'))) errors.push(`${where}: distractors must be a list of text.`);
      break;
    }
    case 'structure':
      validateStructure(q, where, errors);
      break;
    case 'orbital':
      validateOrbital(q, where, errors);
      break;
    case 'balance': {
      const names = (list, label) => {
        if (!Array.isArray(list) || list.length === 0 || list.some((f) => !nonEmptyStr(f))) { errors.push(`${where}: ${label} must be a non-empty list of formulas, e.g. ["H2", "O2"].`); return 0; }
        return list.length;
      };
      const n = names(q.reactants, 'reactants') + names(q.products, 'products');
      const c = q.coefficients;
      if (!Array.isArray(c) || c.some((x) => !Number.isInteger(x) || x < 1)) errors.push(`${where}: coefficients must be a list of positive whole numbers.`);
      else if (n && c.length !== n) errors.push(`${where}: coefficients needs ${n} numbers (one per reactant and product, in order) but has ${c.length}.`);
      break;
    }
    case 'econfig': {
      if (!Array.isArray(q.answers) || q.answers.length === 0) { errors.push(`${where}: answers must list at least one electron configuration, e.g. ["1s2 2s2 2p6 3s1", "[Ne] 3s1"].`); break; }
      q.answers.forEach((x, i) => {
        if (!nonEmptyStr(x) || !parseConfig(x)) errors.push(`${where}: answer ${i + 1} is not a readable electron configuration (use forms like "1s2 2s2 2p6" or "[Ne] 3s1").`);
      });
      break;
    }
    case 'ptable': {
      const symbols = new Set(ELEMENTS.map((e) => e.symbol));
      if (!Array.isArray(q.answers) || q.answers.length === 0) { errors.push(`${where}: answers must list at least one element symbol, e.g. ["Na"].`); break; }
      q.answers.forEach((x) => { if (typeof x !== 'string' || !symbols.has(x)) errors.push(`${where}: "${x}" is not an element symbol.`); });
      if (new Set(q.answers).size !== q.answers.length) errors.push(`${where}: answers lists the same element more than once.`);
      if (q.multiple !== undefined && typeof q.multiple !== 'boolean') errors.push(`${where}: multiple must be true or false.`);
      if (q.multiple === false && q.answers.length !== 1) errors.push(`${where}: a single-select question (multiple: false) needs exactly one answer.`);
      break;
    }
    case 'sigfigs':
      if (!isNum(q.answer)) errors.push(`${where}: answer must be a number.`);
      if (!Number.isInteger(q.sigFigs) || q.sigFigs < 1 || q.sigFigs > 15) errors.push(`${where}: sigFigs must be a whole number from 1 to 15.`);
      if (q.tolerance !== undefined && (!isNum(q.tolerance) || q.tolerance < 0)) errors.push(`${where}: tolerance must be a number that is 0 or greater.`);
      break;
    case 'categorize': {
      const cats = Array.isArray(q.categories) ? q.categories : [];
      const catIds = new Set();
      if (cats.length < 2) errors.push(`${where}: categorize needs at least 2 categories.`);
      cats.forEach((c, i) => {
        if (!isObj(c) || !nonEmptyStr(c.id)) { errors.push(`${where}: category ${i + 1} needs an id.`); return; }
        if (!nonEmptyStr(c.label)) errors.push(`${where}: category ${i + 1} needs a label.`);
        if (catIds.has(c.id)) errors.push(`${where}: duplicate category id "${c.id}".`);
        catIds.add(c.id);
      });
      const items = Array.isArray(q.items) ? q.items : [];
      if (items.length < 1) errors.push(`${where}: categorize needs at least 1 item.`);
      const itemIds = new Set();
      items.forEach((it, i) => {
        if (!isObj(it) || !nonEmptyStr(it.id)) { errors.push(`${where}: item ${i + 1} needs an id.`); return; }
        if (!nonEmptyStr(it.text)) errors.push(`${where}: item ${i + 1} has empty text.`);
        if (itemIds.has(it.id)) errors.push(`${where}: duplicate item id "${it.id}".`);
        itemIds.add(it.id);
        if (!catIds.has(it.category)) errors.push(`${where}: item ${i + 1} ("${it.id}") category "${it.category}" is not one of the categories.`);
      });
      break;
    }
    case 'hotspot': {
      if (!isObj(q.image) || !nonEmptyStr(q.image.url)) errors.push(`${where}: hotspot needs image: { "url": "...", "alt": "..." }.`);
      const labels = Array.isArray(q.labels) ? q.labels : [];
      if (labels.length < 1) errors.push(`${where}: hotspot needs at least 1 label.`);
      const seen = new Set();
      labels.forEach((l, i) => {
        if (!isObj(l) || !nonEmptyStr(l.id)) { errors.push(`${where}: label ${i + 1} needs an id.`); return; }
        if (!nonEmptyStr(l.text)) errors.push(`${where}: label ${i + 1} has empty text.`);
        if (seen.has(l.id)) errors.push(`${where}: duplicate label id "${l.id}".`);
        seen.add(l.id);
        if (!isNum(l.x) || l.x < 0 || l.x > 1 || !isNum(l.y) || l.y < 0 || l.y > 1) errors.push(`${where}: label ${i + 1} ("${l.id}") x and y must be numbers from 0 to 1 (fractions of the image).`);
      });
      if (!isNum(q.radius) || q.radius <= 0 || q.radius > 1) errors.push(`${where}: radius must be a number above 0 and at most 1 (a fraction of the image width).`);
      break;
    }
    case 'graph': {
      if (q.mode !== 'read' && q.mode !== 'plot') errors.push(`${where}: mode must be "read" or "plot".`);
      const c = q.chart;
      if (!isObj(c)) { errors.push(`${where}: chart is required.`); break; }
      for (const k of ['xMin', 'xMax', 'yMin', 'yMax']) if (!isNum(c[k])) errors.push(`${where}: chart.${k} must be a number.`);
      if (isNum(c.xMin) && isNum(c.xMax) && c.xMax <= c.xMin) errors.push(`${where}: chart.xMax must be larger than chart.xMin.`);
      if (isNum(c.yMin) && isNum(c.yMax) && c.yMax <= c.yMin) errors.push(`${where}: chart.yMax must be larger than chart.yMin.`);
      const isPair = (p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);
      if (!Array.isArray(c.series) || c.series.some((s) => !isObj(s) || !Array.isArray(s.points) || s.points.some((p) => !isPair(p)))) errors.push(`${where}: chart.series must be a list of { "points": [[x, y], …] }.`);
      else if (q.mode === 'read' && !c.series.some((s) => s.points.length)) errors.push(`${where}: a read-the-graph question needs at least one series with points.`);
      if (q.mode === 'read') {
        if (!isNum(q.answer)) errors.push(`${where}: answer must be a number.`);
        if (q.tolerance !== undefined && (!isNum(q.tolerance) || q.tolerance < 0)) errors.push(`${where}: tolerance must be a number that is 0 or greater.`);
      } else if (q.mode === 'plot') {
        if (!Array.isArray(q.targets) || q.targets.length < 1 || q.targets.some((p) => !isPair(p))) errors.push(`${where}: targets must be a list of [x, y] pairs, e.g. [[0, 0], [5, 10]].`);
        for (const k of ['toleranceX', 'toleranceY']) if (q[k] !== undefined && (!isNum(q[k]) || q[k] < 0)) errors.push(`${where}: ${k} must be a number that is 0 or greater.`);
      }
      break;
    }
    case 'open': {
      const rubric = q.rubric === undefined ? [] : q.rubric;
      if (!Array.isArray(rubric)) { errors.push(`${where}: rubric must be a list of { text, points }.`); break; }
      rubric.forEach((r, i) => {
        if (!isObj(r) || !nonEmptyStr(r.text)) errors.push(`${where}: rubric item ${i + 1} needs text.`);
        else if (!isNum(r.points) || r.points <= 0) errors.push(`${where}: rubric item ${i + 1} points must be a number greater than 0.`);
      });
      if (rubric.length && rubric.every((r) => isObj(r) && isNum(r.points)) && isNum(q.points)) {
        const sum = Math.round(rubric.reduce((s, r) => s + r.points, 0) * 100) / 100;
        if (sum !== q.points) errors.push(`${where}: rubric points add up to ${sum} but the question is worth ${q.points}.`);
      }
      for (const k of ['minWords', 'maxWords']) {
        const v = q[k];
        if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 0)) errors.push(`${where}: ${k} must be a whole number or empty.`);
      }
      if (Number.isInteger(q.minWords) && Number.isInteger(q.maxWords) && q.maxWords > 0 && q.maxWords < q.minWords) errors.push(`${where}: maxWords must be at least minWords.`);
      if (q.sampleAnswer !== undefined && typeof q.sampleAnswer !== 'string') errors.push(`${where}: sampleAnswer must be text.`);
      break;
    }
    default:
      if (typeDef(q.type)?.validate) typeDef(q.type).validate(q, where, errors, SCHEMA_HELPERS);
      break;
  }
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

const LETTERS = ['A', 'B', 'C', 'D'];

export function blankQuestion(type, id = 'q1') {
  const base = { id, type, text: 'New question', points: 1, explanation: '' };
  const opts = () => LETTERS.map((L) => ({ id: L.toLowerCase(), text: `Option ${L}` }));
  switch (type) {
    case 'mcq': return { ...base, options: opts(), correctAnswer: 'a' };
    case 'multi': return { ...base, options: opts(), partialCredit: false, correctAnswer: ['a', 'b'] };
    case 'numeric': return { ...base, correctAnswer: 0, tolerance: 0, toleranceType: 'absolute', unit: '', formatHelp: 'auto' };
    case 'formula': return { ...base, caseSensitive: true, correctAnswer: 'H2O', formatHelp: 'auto' };
    case 'truefalse': return { ...base, correctAnswer: true };
    case 'matching':
      return {
        ...base,
        partialCredit: true,
        left: [{ id: 'l1', text: 'Item 1' }, { id: 'l2', text: 'Item 2' }],
        right: [{ id: 'r1', text: 'Match 1' }, { id: 'r2', text: 'Match 2' }],
        correctAnswer: { l1: 'r1', l2: 'r2' },
      };
    case 'lewis': return { ...base, text: 'Draw the Lewis dot diagram for oxygen.', element: 'O', correctAnswer: 6, checkPlacement: true };
    case 'short': return { ...base, points: 2, sampleAnswer: '' };
    case 'ordering':
      return {
        ...base, text: 'Arrange these elements from lowest to highest electronegativity.', partialCredit: true, topLabel: 'Lowest', bottomLabel: 'Highest',
        items: [{ id: 'na', text: 'Na' }, { id: 'c', text: 'C' }, { id: 'o', text: 'O' }, { id: 'f', text: 'F' }],
        correctAnswer: ['na', 'c', 'o', 'f'],
      };
    case 'fillblank':
      return {
        ...base, points: 2, text: 'Water has the formula {{b1}} and contains {{b2}} hydrogen atoms per molecule.',
        blanks: [{ id: 'b1', answers: ['H2O'], kind: 'formula' }, { id: 'b2', answers: ['2', 'two'], kind: 'text' }],
        partialCredit: true, caseSensitive: false, wordBank: false, distractors: [], formatHelp: 'auto',
      };
    case 'structure':
      return {
        ...base, points: 3, text: 'Draw the Lewis structure of carbon dioxide, $\\ce{CO2}$.', partialCredit: false,
        atoms: [{ id: 'o1', symbol: 'O', x: 0, y: 0 }, { id: 'c', symbol: 'C', x: 1, y: 0 }, { id: 'o2', symbol: 'O', x: 2, y: 0 }],
        bonds: [['o1', 'c'], ['c', 'o2']], charge: 0, showElectronCount: false,
        correctAnswer: { bonds: [2, 2], lonePairs: { o1: 2, c: 0, o2: 2 } },
        studentCharges: false,
      };
    case 'orbital':
      return {
        ...base, points: 2, text: 'Draw the orbital diagram for a ground-state nitrogen atom.',
        element: 'N', maxSublevel: '2p', orbitalTypes: ['s', 'p'],
        sampleAnswer: { '1s': ['ud'], '2s': ['ud'], '2p': ['u', 'u', 'u'] },
      };
    case 'open':
      return {
        ...base, points: 4, text: 'Explain why ionic compounds have high melting points.', sampleAnswer: '', minWords: null, maxWords: null, showRubric: true,
        rubric: [{ text: 'Identifies strong electrostatic attraction between oppositely charged ions', points: 2 }, { text: 'Links it to the energy needed to break the lattice', points: 2 }],
      };
    case 'balance':
      return { ...base, text: 'Balance the equation for the formation of water.', reactants: ['H2', 'O2'], products: ['H2O'], coefficients: [2, 1, 2], allowMultiples: false, partialCredit: false };
    case 'econfig':
      return { ...base, text: 'Write the ground-state electron configuration of sodium.', answers: ['1s2 2s2 2p6 3s1', '[Ne] 3s1'] };
    case 'ptable':
      return { ...base, text: 'Click the alkali metal in period 3.', answers: ['Na'], multiple: true, partialCredit: false };
    case 'sigfigs':
      return { ...base, text: 'Write 0.00450 g in scientific notation with the correct number of significant figures.', answer: 0.0045, sigFigs: 3, tolerance: 0.000001, partialCredit: true };
    case 'categorize':
      return {
        ...base, text: 'Sort each compound into the type of bonding it has.', partialCredit: true,
        categories: [{ id: 'ionic', label: 'Ionic' }, { id: 'covalent', label: 'Covalent' }],
        items: [{ id: 'i1', text: 'NaCl', category: 'ionic' }, { id: 'i2', text: 'H2O', category: 'covalent' }],
      };
    case 'hotspot':
      return {
        ...base, text: 'Place each label on the diagram.', partialCredit: true, radius: 0.06,
        image: { url: 'data/tests/lab-bench.svg', alt: 'A lab bench with a beaker, a flask and a burner', position: 'right' }, labels: [{ id: 'a', text: 'Beaker', x: 0.25, y: 0.6 }],
      };
    case 'graph':
      return {
        ...base, text: 'Read the value from the graph.', mode: 'read', answer: 0, tolerance: 0, unit: '',
        chart: { xLabel: 'x', yLabel: 'y', xMin: 0, xMax: 10, yMin: 0, yMax: 10, series: [{ points: [[0, 0], [10, 10]] }] },
      };
    default:
      // v4 templates come out already normalized, so normalizing them again is a no-op (like the built-ins).
      if (typeDef(type)?.blank) return normalizeQuestion(typeDef(type).blank(base));
      throw new RangeError(`Unknown question type: ${type}`);
  }
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
