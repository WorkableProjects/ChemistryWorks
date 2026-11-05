// V4-09 algorithmic (randomized) questions — S10. Pure, no DOM, no eval / Function.
//
// A question (numeric, sigfigs, dimensional or multipart) may carry
//   variables: {
//     m:        { min: 1, max: 10, step: 0.5, sigFigs: 3 },     random number (step optional; default 3 significant figures)
//     compound: { pick: ['NaCl', 'KCl'] },                      random choice (text or numbers)
//     n:        { formula: 'm / molarMass(compound)', sigFigs: 3 }   derived from the ones above
//   },
//   answerFormula: '= m / molarMass(compound)'
// {name} placeholders in the question's text fields (text, stem, explanation, unit, option text, ...) are replaced by the
// drawn values. The answer formula sets the type's key: numeric.correctAnswer, sigfigs.answer, dimensional.answer.value.
// A multipart question declares the variables once; each part may have its own answerFormula (and extra variables).
// dimensional: `givenVariable: 'm'` makes given.value the drawn value of m.
// q.drawn = { m: 2.5, compound: 'NaCl', ... } stores the student's numbers; once present the question is not drawn again.
//
// The formula language: numbers (also 6.02e23), "text" literals, variables, constants (pi NA R Kw), + - * / ^ and the
// symbols × ÷ −, parentheses, unary minus and calls to the whitelisted functions in js/lib/chemfuncs.js (CHEM_FUNCS).
import { addInstantiateStep } from './instantiate-steps.js';
import { CHEM_FUNCS, CHEM_CONSTANTS } from './chemfuncs.js';

export const ALGORITHMIC_TYPES = ['numeric', 'sigfigs', 'dimensional', 'multipart'];
export const MAX_FORMULA_CHARS = 400;
const MAX_DEPTH = 40;
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Names a variable may not use (functions and constants of the formula language). */
export const RESERVED_NAMES = Object.freeze([...Object.keys(CHEM_FUNCS), ...Object.keys(CHEM_CONSTANTS)]);

// ---------------------------------------------------------------------------------------------------------
// Tokenizer + recursive-descent parser -> AST. Evaluation walks the AST; nothing is ever executed as code.
// ---------------------------------------------------------------------------------------------------------
function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    let m = /^(\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (m) { out.push({ t: 'num', v: Number(m[0]), at: i }); i += m[0].length; continue; }
    m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (m) { out.push({ t: 'id', v: m[0], at: i }); i += m[0].length; continue; }
    if (ch === '"' || ch === "'") {
      const end = src.indexOf(ch, i + 1);
      if (end < 0) throw new Error('unterminated text in the formula');
      out.push({ t: 'str', v: src.slice(i + 1, end), at: i });
      i = end + 1;
      continue;
    }
    if (src.startsWith('**', i)) { out.push({ t: 'op', v: '^', at: i }); i += 2; continue; }
    const map = { '×': '*', '·': '*', '÷': '/', '−': '-', '–': '-' };
    const op = map[ch] || ch;
    if ('+-*/^(),'.includes(op)) { out.push({ t: 'op', v: op, at: i }); i++; continue; }
    throw new Error(`unexpected "${ch}" in the formula`);
  }
  return out;
}

/** Parse an answer formula (a leading "=" is optional) into an AST. Throws Error('readable message') on bad syntax. */
export function parseExpression(source) {
  const src = String(source ?? '').trim().replace(/^=/, '').trim();
  if (!src) throw new Error('the formula is empty');
  if (src.length > MAX_FORMULA_CHARS) throw new Error(`the formula is longer than ${MAX_FORMULA_CHARS} characters`);
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const expect = (v) => { if (!isOp(v)) throw new Error(`expected "${v}" in the formula`); p++; };

  function expr(depth) {
    if (depth > MAX_DEPTH) throw new Error('the formula is nested too deeply');
    let left = term(depth);
    while (isOp('+') || isOp('-')) { const op = toks[p++].v; left = { t: 'bin', op, l: left, r: term(depth) }; }
    return left;
  }
  function term(depth) {
    let left = unary(depth);
    while (isOp('*') || isOp('/')) { const op = toks[p++].v; left = { t: 'bin', op, l: left, r: unary(depth) }; }
    return left;
  }
  function unary(depth) {
    if (depth > MAX_DEPTH) throw new Error('the formula is nested too deeply');
    if (isOp('-')) { p++; return { t: 'neg', e: unary(depth + 1) }; }
    if (isOp('+')) { p++; return unary(depth + 1); }
    return power(depth);
  }
  function power(depth) {
    const base = primary(depth);
    if (isOp('^')) { p++; return { t: 'bin', op: '^', l: base, r: unary(depth + 1) }; }
    return base;
  }
  function primary(depth) {
    const tok = toks[p];
    if (!tok) throw new Error('the formula ends too early');
    if (tok.t === 'num') { p++; return { t: 'num', v: tok.v }; }
    if (tok.t === 'str') { p++; return { t: 'str', v: tok.v }; }
    if (tok.t === 'id') {
      p++;
      if (isOp('(')) {
        p++;
        const args = [];
        if (!isOp(')')) {
          args.push(expr(depth + 1));
          while (isOp(',')) { p++; args.push(expr(depth + 1)); }
        }
        expect(')');
        if (!own(CHEM_FUNCS, tok.v)) throw new Error(`unknown function ${tok.v}()`);
        return { t: 'call', name: tok.v, args };
      }
      return { t: 'var', name: tok.v };
    }
    if (tok.t === 'op' && tok.v === '(') { p++; const e = expr(depth + 1); expect(')'); return e; }
    throw new Error(`unexpected "${tok.v}" in the formula`);
  }

  const ast = expr(0);
  if (p < toks.length) throw new Error(`unexpected "${toks[p].v}" in the formula`);
  return ast;
}

/** Variable names the AST reads (constants excluded), without duplicates. */
export function astVariables(ast, found = new Set()) {
  if (!ast) return found;
  if (ast.t === 'var') { if (!own(CHEM_CONSTANTS, ast.name)) found.add(ast.name); }
  else if (ast.t === 'bin') { astVariables(ast.l, found); astVariables(ast.r, found); }
  else if (ast.t === 'neg') astVariables(ast.e, found);
  else if (ast.t === 'call') ast.args.forEach((a) => astVariables(a, found));
  return found;
}

function needNumber(v, what) {
  if (typeof v !== 'number') throw new Error(`${what} needs a number`);
  return v;
}

/** Evaluate an AST against `scope` ({ name: number | text }). Returns a number or text; throws Error on a bad value. */
export function evaluateAst(ast, scope = {}) {
  switch (ast.t) {
    case 'num': case 'str': return ast.v;
    case 'var':
      if (own(scope, ast.name)) return scope[ast.name];
      if (own(CHEM_CONSTANTS, ast.name)) return CHEM_CONSTANTS[ast.name];
      throw new Error(`unknown variable ${ast.name}`);
    case 'neg': return -needNumber(evaluateAst(ast.e, scope), 'minus');
    case 'call': {
      const args = ast.args.map((a) => evaluateAst(a, scope));
      const out = CHEM_FUNCS[ast.name](...args);
      if (typeof out !== 'number' || !Number.isFinite(out)) throw new Error(`${ast.name}() gave no number`);
      return out;
    }
    case 'bin': {
      const a = needNumber(evaluateAst(ast.l, scope), ast.op);
      const b = needNumber(evaluateAst(ast.r, scope), ast.op);
      const out = ast.op === '+' ? a + b : ast.op === '-' ? a - b : ast.op === '*' ? a * b : ast.op === '/' ? a / b : a ** b;
      if (!Number.isFinite(out)) throw new Error('the formula did not give a finite number');
      return out;
    }
    default: throw new Error('bad formula');
  }
}

/** Parse + evaluate in one go; always returns a finite number or throws. */
export function evalFormula(source, scope = {}) {
  const out = evaluateAst(parseExpression(source), scope);
  if (typeof out !== 'number' || !Number.isFinite(out)) throw new Error('the formula did not give a number');
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Drawing variables
// ---------------------------------------------------------------------------------------------------------
function decimalsOf(x) {
  const s = String(x);
  if (/e-/i.test(s)) return Math.min(12, Number(s.split(/e-/i)[1]) + (s.split(/e-/i)[0].split('.')[1] || '').length);
  return (s.split('.')[1] || '').length;
}

/** Number as shown to students: `sigFigs` significant figures (keeps trailing zeros), else fixed `decimals` places. */
function numberText(x, sigFigs, decimals) {
  if (sigFigs) {
    const p = x.toPrecision(sigFigs);
    return /e/i.test(p) ? String(x) : p;
  }
  return x.toFixed(Math.min(12, Math.max(0, decimals)));
}

const roundSig = (x, sf) => Number(x.toPrecision(sf));

/** A seeded PRNG (0..1) from a string, local to this module so it never imports js/lib/instantiate.js. */
export function seededRand(seedString) {
  let seed = 2166136261;
  for (const ch of String(seedString)) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    return ((seed ^= seed >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Draw every variable of `variables` in declaration order with `rand`; `base` holds values already drawn (a multipart
 * parent's). Returns { values: { name: number|text }, texts: { name: displayText } }. Throws Error on a bad definition.
 */
export function drawVariables(variables, rand, base = {}) {
  const values = {};
  const texts = {};
  for (const [name, def] of Object.entries(isObj(variables) ? variables : {})) {
    const scope = { ...base, ...values };
    if (isObj(def) && Array.isArray(def.pick)) {
      if (!def.pick.length) throw new Error(`variable ${name}: pick needs at least one value`);
      const v = def.pick[Math.min(def.pick.length - 1, Math.floor(rand() * def.pick.length))];
      values[name] = v;
      texts[name] = String(v);
    } else if (isObj(def) && typeof def.formula === 'string') {
      let v = evalFormula(def.formula, scope);
      const sf = Number(def.sigFigs);
      if (Number.isInteger(sf) && sf >= 1) { v = roundSig(v, sf); texts[name] = numberText(v, sf, 0); } else texts[name] = String(Number(v.toPrecision(12)));
      values[name] = v;
    } else if (isObj(def) && isNum(Number(def.min)) && isNum(Number(def.max))) {
      const min = Number(def.min);
      const max = Number(def.max);
      const step = Number(def.step);
      const sf = Number.isInteger(Number(def.sigFigs)) && Number(def.sigFigs) >= 1 ? Number(def.sigFigs) : 0;
      let v;
      let decimals;
      if (step > 0) {
        const n = Math.floor((max - min) / step + 1e-9);
        v = min + Math.min(n, Math.floor(rand() * (n + 1))) * step;
        decimals = Math.max(decimalsOf(min), decimalsOf(step));
        v = Number(v.toFixed(Math.min(12, decimals)));
      } else {
        v = min + rand() * (max - min);
        decimals = 0;
      }
      const useSf = sf || (step > 0 ? 0 : 3);
      if (useSf) v = roundSig(v, useSf);
      values[name] = v;
      texts[name] = numberText(v, useSf, decimals);
    } else {
      throw new Error(`variable ${name}: use { min, max, step?, sigFigs? }, { pick: [...] } or { formula }`);
    }
  }
  return { values, texts };
}

/** Replace {name} (only for names in `texts`) inside a string; other braces (LaTeX) are left alone. */
export function substitute(str, texts) {
  return String(str).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (all, name) => (own(texts, name) ? texts[name] : all));
}

const SKIP_KEYS = new Set(['variables', 'answerFormula', 'drawn', 'id', 'type', 'givenVariable', 'image']);

function substituteDeep(node, texts) {
  if (typeof node === 'string') return substitute(node, texts);
  if (Array.isArray(node)) return node.map((n) => substituteDeep(n, texts));
  if (isObj(node)) {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = SKIP_KEYS.has(k) ? v : substituteDeep(v, texts);
    return out;
  }
  return node;
}

/** Key value for a formula result: sigfigs rounds to its sigFigs, `answerSigFigs` rounds anything, else float noise only. */
function keyValue(q, x) {
  const sf = q.type === 'sigfigs' && Number.isInteger(Number(q.sigFigs)) && Number(q.sigFigs) >= 1 ? Number(q.sigFigs)
    : Number.isInteger(Number(q.answerSigFigs)) && Number(q.answerSigFigs) >= 1 ? Number(q.answerSigFigs) : 12;
  return roundSig(x, Math.min(15, sf));
}

function setKey(q, x) {
  const v = keyValue(q, x);
  if (q.type === 'numeric') q.correctAnswer = v;
  else if (q.type === 'sigfigs') q.answer = v;
  else if (q.type === 'dimensional') q.answer = { ...(isObj(q.answer) ? q.answer : {}), value: v };
}

/**
 * Draw a question's variables with `rand`, substitute the placeholders and set the answer key in place.
 * Returns false (and changes nothing) when the question has no variables or was already drawn.
 * Throws on a bad definition (the instantiate step catches it and leaves the question as written).
 */
export function applyAlgorithmic(target, rand) {
  if (!isObj(target) || !isObj(target.variables) || !Object.keys(target.variables).length || isObj(target.drawn)) return false;
  const q = JSON.parse(JSON.stringify(target)); // all or nothing: `target` changes only when everything below succeeded
  const { values, texts } = drawVariables(q.variables, rand);
  const all = { ...values };
  const allTexts = { ...texts };
  if (q.type === 'multipart' && Array.isArray(q.parts)) {
    q.parts = q.parts.map((part) => {
      if (!isObj(part)) return part;
      const own2 = isObj(part.variables) ? drawVariables(part.variables, rand, values) : { values: {}, texts: {} };
      const scope = { ...values, ...own2.values };
      const tx = { ...texts, ...own2.texts };
      Object.assign(all, own2.values);
      Object.assign(allTexts, own2.texts);
      const next = substituteDeep(part, tx);
      next.drawn = { ...own2.values };
      if (typeof part.answerFormula === 'string' && part.answerFormula.trim()) setKey(next, evalFormula(part.answerFormula, scope));
      return next;
    });
  }
  const next = substituteDeep(q, allTexts);
  Object.assign(q, next);
  if (q.type === 'dimensional' && typeof q.givenVariable === 'string' && own(values, q.givenVariable) && typeof values[q.givenVariable] === 'number') {
    q.given = { ...(isObj(q.given) ? q.given : {}), value: values[q.givenVariable] };
  }
  if (typeof q.answerFormula === 'string' && q.answerFormula.trim() && q.type !== 'multipart') setKey(q, evalFormula(q.answerFormula, values));
  q.drawn = all;
  Object.assign(target, q);
  return true;
}

/** The instantiate step: every question of the (copied) test gets its own stream seeded by seed + question id. */
function algorithmicStep(test, { seed }) {
  for (const q of Array.isArray(test.questions) ? test.questions : []) {
    if (!isObj(q) || !isObj(q.variables)) continue;
    try { applyAlgorithmic(q, seededRand(`${seed}#alg#${q.id}`)); } catch (e) { console.error(`[algorithmic:${q.id}]`, e); }
  }
}
addInstantiateStep('algorithmic', algorithmicStep);

// ---------------------------------------------------------------------------------------------------------
// Validation (hook for js/lib/schema.js validateQuestion) and the builder's live sample
// ---------------------------------------------------------------------------------------------------------
function validateVariableDefs(variables, where, errors) {
  if (!isObj(variables)) { errors.push(`${where}: variables must be an object like { "m": { "min": 1, "max": 10 } }.`); return false; }
  let ok = true;
  for (const [name, def] of Object.entries(variables)) {
    const w = `${where}: variable "${name}"`;
    if (!NAME_RE.test(name)) { errors.push(`${w} needs a name of letters, digits and "_" that does not start with a digit.`); ok = false; continue; }
    if (RESERVED_NAMES.includes(name)) { errors.push(`${w} uses a reserved name (functions and constants such as molarMass, pi, NA, R cannot be variables).`); ok = false; continue; }
    if (!isObj(def)) { errors.push(`${w} must be an object.`); ok = false; continue; }
    if (def.pick !== undefined) {
      if (!Array.isArray(def.pick) || !def.pick.length) { errors.push(`${w}: pick needs a list with at least one value.`); ok = false; }
      else if (def.pick.some((v) => !(typeof v === 'string' && v.trim() !== '') && !isNum(v))) { errors.push(`${w}: pick values must be non-empty text or numbers.`); ok = false; }
    } else if (def.formula !== undefined) {
      if (typeof def.formula !== 'string') { errors.push(`${w}: formula must be text.`); ok = false; }
    } else {
      if (!isNum(def.min) || !isNum(def.max)) { errors.push(`${w} needs numeric min and max (or pick / formula).`); ok = false; }
      else if (def.min > def.max) { errors.push(`${w}: min must not be above max.`); ok = false; }
      if (def.step !== undefined && (!isNum(def.step) || def.step <= 0)) { errors.push(`${w}: step must be a number above 0.`); ok = false; }
    }
    if (def.sigFigs !== undefined && (!Number.isInteger(def.sigFigs) || def.sigFigs < 1 || def.sigFigs > 15)) { errors.push(`${w}: sigFigs must be a whole number from 1 to 15.`); ok = false; }
  }
  return ok;
}

/** True when the question or one of its multipart parts uses algorithmic fields. */
export const isAlgorithmic = (q) => isObj(q) && (isObj(q.variables) || (typeof q.answerFormula === 'string' && q.answerFormula.trim() !== '')
  || (Array.isArray(q.parts) && q.parts.some((p) => isObj(p) && (isObj(p.variables) || typeof p.answerFormula === 'string'))));

/**
 * Validate `variables` / `answerFormula` / `givenVariable` of one question. Push human-readable strings to `errors`.
 * The formulas are dry-run with a sample draw, so a typo or an unknown variable is reported while the teacher edits.
 * Hook for schema.js validateQuestion: `validateVariables(q, where, errors)` (does nothing when the question has none).
 */
export function validateVariables(q, where, errors) {
  if (!isAlgorithmic(q)) return;
  if (!ALGORITHMIC_TYPES.includes(q.type)) {
    errors.push(`${where}: variables and answerFormula work on numeric, sigfigs, dimensional and multipart questions only.`);
    return;
  }
  const vars = isObj(q.variables) ? q.variables : {};
  let drawn = null;
  if (q.variables !== undefined && validateVariableDefs(q.variables, where, errors)) {
    try { drawn = drawVariables(q.variables, seededRand('validate')); } catch (e) { errors.push(`${where}: ${e.message}.`); }
  }
  const checkFormula = (formula, scopeValues, w, label) => {
    let ast;
    try { ast = parseExpression(formula); } catch (e) { errors.push(`${w}: ${label} — ${e.message}.`); return; }
    const missing = [...astVariables(ast)].filter((name) => !own(scopeValues, name));
    missing.forEach((name) => errors.push(`${w}: ${label} uses "${name}", which is not a variable of this question.`));
    if (!missing.length) { try { evaluateAst(ast, scopeValues); } catch (e) { errors.push(`${w}: ${label} — ${e.message}.`); } }
  };
  const baseValues = drawn ? drawn.values : {};
  if (q.answerFormula !== undefined) {
    if (q.type === 'multipart') errors.push(`${where}: put answerFormula on the parts of a multipart question, not on the question itself.`);
    else if (typeof q.answerFormula !== 'string' || !q.answerFormula.trim()) errors.push(`${where}: answerFormula must be text like "= m / molarMass(compound)".`);
    else if (q.variables === undefined || drawn) checkFormula(q.answerFormula, baseValues, where, 'answerFormula');
  } else if (q.type !== 'multipart' && isObj(q.variables) && Object.keys(q.variables).length) {
    errors.push(`${where}: variables need an answerFormula that gives the correct answer.`);
  }
  if (isObj(q.variables)) {
    for (const [name, def] of Object.entries(q.variables)) {
      if (isObj(def) && typeof def.formula === 'string') {
        let ast;
        try { ast = parseExpression(def.formula); } catch (e) { errors.push(`${where}: variable "${name}" formula — ${e.message}.`); continue; }
        for (const n of astVariables(ast)) if (!own(q.variables, n) || n === name) errors.push(`${where}: variable "${name}" formula uses "${n}", which is not another variable.`);
      }
    }
  }
  if (q.givenVariable !== undefined) {
    if (q.type !== 'dimensional') errors.push(`${where}: givenVariable is only for dimensional questions.`);
    else if (!own(vars, q.givenVariable) || !(isObj(vars[q.givenVariable]) && vars[q.givenVariable].pick === undefined)) errors.push(`${where}: givenVariable must name a numeric variable.`);
  }
  if (q.answerSigFigs !== undefined && (!Number.isInteger(q.answerSigFigs) || q.answerSigFigs < 1 || q.answerSigFigs > 15)) errors.push(`${where}: answerSigFigs must be a whole number from 1 to 15.`);
  if (q.type === 'multipart' && Array.isArray(q.parts)) {
    q.parts.forEach((p, i) => {
      if (!isObj(p)) return;
      const pw = `${where} part (${p.id || i + 1})`;
      let partDrawn = drawn;
      let scope = baseValues;
      if (p.variables !== undefined) {
        if (validateVariableDefs(p.variables, pw, errors)) {
          try { partDrawn = { values: { ...baseValues, ...drawVariables(p.variables, seededRand('validate'), baseValues).values } }; scope = partDrawn.values; } catch (e) { errors.push(`${pw}: ${e.message}.`); }
        }
      }
      if (p.answerFormula !== undefined) {
        if (!ALGORITHMIC_TYPES.includes(p.type) || p.type === 'multipart') errors.push(`${pw}: answerFormula works on numeric, sigfigs and dimensional parts.`);
        else if (typeof p.answerFormula !== 'string' || !p.answerFormula.trim()) errors.push(`${pw}: answerFormula must be text.`);
        else {
          let ast;
          try { ast = parseExpression(p.answerFormula); } catch (e) { errors.push(`${pw}: answerFormula — ${e.message}.`); return; }
          const missing = [...astVariables(ast)].filter((n) => !own(scope, n));
          missing.forEach((n) => errors.push(`${pw}: answerFormula uses "${n}", which is not a variable of this question.`));
          if (!missing.length) { try { evaluateAst(ast, scope); } catch (e) { errors.push(`${pw}: answerFormula — ${e.message}.`); } }
        }
      }
    });
  }
}

/**
 * Builder preview: draw once with `seed` and evaluate the answer formula(s). Never throws.
 * Returns { ok, values: [[name, text]...], answers: [{ label, value }], error }.
 */
export function sampleDraw(q, seed = 'sample') {
  try {
    const copy = JSON.parse(JSON.stringify(q));
    delete copy.drawn;
    if (!applyAlgorithmic(copy, seededRand(`${seed}`))) return { ok: false, values: [], answers: [], error: 'Add a variable and an answer formula.' };
    const answers = [];
    if (copy.type === 'multipart') (copy.parts || []).forEach((p, i) => { if (typeof p.answerFormula === 'string' && p.answerFormula.trim()) answers.push({ label: `(${p.id || i + 1})`, value: p.correctAnswer ?? p.answer?.value ?? p.answer }); });
    else answers.push({ label: 'Answer', value: copy.type === 'numeric' ? copy.correctAnswer : copy.type === 'sigfigs' ? copy.answer : copy.answer?.value });
    return { ok: true, values: Object.entries(copy.drawn).map(([k, v]) => [k, String(v)]), answers, text: copy.text, error: '' };
  } catch (e) {
    return { ok: false, values: [], answers: [], error: e.message };
  }
}
