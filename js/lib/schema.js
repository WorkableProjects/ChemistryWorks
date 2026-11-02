// Test schema: normalization, validation, templates. Pure functions, no DOM.

import { normalizeSymbol, valenceOf } from './lewis.js';
import { bondEnds, validateStructure } from './structure.js';
import { BLANK_KINDS, markerIds } from './blanks.js';
import { FORMAT_HELP_MODES } from './hints.js';

export const QUESTION_TYPES = ['mcq', 'multi', 'numeric', 'formula', 'truefalse', 'matching', 'ordering', 'fillblank', 'lewis', 'structure', 'short', 'open'];
// Types a teacher grades by hand in the admin Grading tab (everything else is auto-graded).
export const MANUAL_TYPES = ['short', 'open'];
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
  short: 'Short answer (teacher graded)',
  open: 'Open response (teacher graded)',
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
    return { ...src, id: str(src.id).trim(), text: str(src.text) };
  });
}

function normalizeQuestion(raw) {
  const q = isObj(raw) ? raw : {};
  q.id = str(q.id).trim();
  q.type = str(q.type).trim();
  q.text = str(q.text);
  q.points = q.points === undefined || q.points === null ? 1 : Number(q.points);
  q.explanation = str(q.explanation);
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
    default:
      break;
  }
  if (['formula', 'numeric', 'fillblank'].includes(q.type)) {
    q.formatHelp = q.formatHelp === undefined || q.formatHelp === null || q.formatHelp === '' ? 'auto'
      : q.formatHelp === true ? 'always' : q.formatHelp === false ? 'never' : q.formatHelp;
  }
  return q;
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
  t.defaultMode = t.defaultMode === undefined || t.defaultMode === null || t.defaultMode === '' ? null : t.defaultMode;
  t.passingPercent = nullableNum(t.passingPercent);
  t.questions = Array.isArray(t.questions) ? t.questions.map(normalizeQuestion) : [];
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
    if (!nonEmptyStr(o.text)) errors.push(`${where}: ${label} ${n} has empty text.`);
  });
  return ids;
}

function validateQuestion(q, index, seenIds, errors) {
  const idLabel = isObj(q) && q.id !== undefined && q.id !== '' ? String(q.id) : '?';
  const where = `Question ${index + 1} (${idLabel})`;
  if (!isObj(q)) { errors.push(`${where}: must be an object.`); return; }

  if (!nonEmptyStr(q.id)) errors.push(`${where}: id is required.`);
  else if (!ID_RE.test(q.id)) errors.push(`${where}: id may only contain letters, digits, "_" and "-".`);
  else if (seenIds.has(q.id)) errors.push(`${where}: duplicate question id "${q.id}".`);
  else seenIds.add(q.id);

  if (!nonEmptyStr(q.text)) errors.push(`${where}: text is required.`);
  if (!isNum(q.points) || q.points <= 0) errors.push(`${where}: points must be a number greater than 0.`);

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

  if (!Array.isArray(test.questions) || test.questions.length === 0) {
    errors.push('Test: add at least one question.');
  } else {
    const seen = new Set();
    test.questions.forEach((q, i) => validateQuestion(q, i, seen, errors));
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
      };
    case 'open':
      return {
        ...base, points: 4, text: 'Explain why ionic compounds have high melting points.', sampleAnswer: '', minWords: null, maxWords: null, showRubric: true,
        rubric: [{ text: 'Identifies strong electrostatic attraction between oppositely charged ions', points: 2 }, { text: 'Links it to the energy needed to break the lattice', points: 2 }],
      };
    default:
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
    defaultMode: null,
    passingPercent: null,
    questions: [],
  };
}
