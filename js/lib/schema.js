// Test schema: normalization, validation, templates. Pure functions, no DOM.

export const QUESTION_TYPES = ['mcq', 'multi', 'numeric', 'formula', 'truefalse', 'matching'];
export const TYPE_LABELS = {
  mcq: 'Multiple choice',
  multi: 'Multiple select',
  numeric: 'Numeric',
  formula: 'Chemical formula',
  truefalse: 'True / False',
  matching: 'Matching',
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
    case 'matching':
      q.left = normOptions(q.left);
      q.right = normOptions(q.right);
      q.partialCredit = bool(q.partialCredit, true);
      break;
    default:
      break;
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
    default:
      break;
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
    case 'numeric': return { ...base, correctAnswer: 0, tolerance: 0, toleranceType: 'absolute', unit: '' };
    case 'formula': return { ...base, caseSensitive: true, correctAnswer: 'H2O' };
    case 'truefalse': return { ...base, correctAnswer: true };
    case 'matching':
      return {
        ...base,
        partialCredit: true,
        left: [{ id: 'l1', text: 'Item 1' }, { id: 'l2', text: 'Item 2' }],
        right: [{ id: 'r1', text: 'Match 1' }, { id: 'r2', text: 'Match 2' }],
        correctAnswer: { l1: 'r1', l2: 'r2' },
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
