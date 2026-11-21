// Scientific calculator expression parser. Hand-written recursive descent: no eval, no Function.
//
//   evaluate('2*(3+4)^2', { angle: 'rad', ans: 0 }) -> { ok: true, value: 98 } | { ok: false, error: 'message' }
//   formatResult(1234.5678) -> '1234.5678';  formatResult(6.022e23) -> '6.022e+23'
//
// Grammar (lowest to highest precedence):
//   expr    := term (('+' | '-') term)*
//   term    := unary (('*' | '/') unary | implicit-multiplication unary)*
//   unary   := ('-' | '+') unary | power
//   power   := postfix ('^' unary)?            (right-associative; -2^2 = -4, 2^-3 = 0.125)
//   postfix := primary ('!' | '%')*
//   primary := number | constant | function '(' expr ')' | function primary | '(' expr ')'
// Numbers accept scientific notation (1.5e-3, 6.02E23). Unicode × ÷ − and "EE" are accepted.

const FUNCS = {
  sin: (x, c) => Math.sin(c.toRad(x)),
  cos: (x, c) => Math.cos(c.toRad(x)),
  tan: (x, c) => Math.tan(c.toRad(x)),
  asin: (x, c) => c.fromRad(Math.asin(x)),
  acos: (x, c) => c.fromRad(Math.acos(x)),
  atan: (x, c) => c.fromRad(Math.atan(x)),
  log: (x) => Math.log10(x),
  ln: (x) => Math.log(x),
  exp: (x) => Math.exp(x),
  sqrt: (x) => Math.sqrt(x),
  cbrt: (x) => Math.cbrt(x),
  abs: (x) => Math.abs(x),
};
export const FUNCTION_NAMES = Object.keys(FUNCS);
const CONSTS = { pi: Math.PI, e: Math.E };

class CalcError extends Error {}
const fail = (m) => { throw new CalcError(m); };

/** Split the text into tokens: { t: 'num'|'id'|'op'|'(' |')', v }. */
export function tokenize(src) {
  const s = String(src ?? '')
    .replace(/[×·⋅]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt')
    .replace(/\bEE\b/g, 'e');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
      if (!m) fail('Bad number');
      i += m[0].length;
      if (s[i] === '.') fail('Bad number');
      out.push({ t: 'num', v: Number(m[0]) });
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      const m = /^[a-zA-Z]+/.exec(s.slice(i));
      out.push({ t: 'id', v: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    if ('+-*/^!%'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue; }
    if (ch === '(' || ch === ')') { out.push({ t: ch, v: ch }); i++; continue; }
    fail(`Unexpected "${ch}"`);
  }
  return out;
}

function factorial(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170) fail('Factorial needs a whole number from 0 to 170');
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

export function evaluate(src, { angle = 'rad', ans = 0 } = {}) {
  try {
    const toks = tokenize(src);
    if (!toks.length) return { ok: false, error: 'Enter an expression' };
    const c = {
      toRad: (x) => (angle === 'deg' ? (x * Math.PI) / 180 : x),
      fromRad: (x) => (angle === 'deg' ? (x * 180) / Math.PI : x),
    };
    let p = 0;
    const peek = () => toks[p];
    const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;

    function expr() {
      let v = term();
      while (isOp('+') || isOp('-')) { const op = toks[p++].v; const r = term(); v = op === '+' ? v + r : v - r; }
      return v;
    }
    const startsOperand = () => { const k = peek(); return k && (k.t === 'num' || k.t === 'id' || k.t === '('); };
    function term() {
      let v = unary();
      for (;;) {
        if (isOp('*') || isOp('/')) {
          const op = toks[p++].v;
          const r = unary();
          if (op === '/' && r === 0) fail('Cannot divide by zero');
          v = op === '*' ? v * r : v / r;
        } else if (startsOperand() && !(toks[p - 1].t === 'num' && peek().t === 'num')) v *= unary(); // implicit multiplication: 2(3), 2pi, (1+2)(3+4)
        else return v;
      }
    }
    function unary() {
      if (isOp('-')) { p++; return -unary(); }
      if (isOp('+')) { p++; return unary(); }
      return power();
    }
    function power() {
      const base = postfix();
      if (isOp('^')) { p++; return base ** unary(); }
      return base;
    }
    function postfix() {
      let v = primary();
      for (;;) {
        if (isOp('!')) { p++; v = factorial(v); } else if (isOp('%')) { p++; v /= 100; } else return v;
      }
    }
    function primary() {
      const k = toks[p++];
      if (!k) return fail('Expression is incomplete');
      if (k.t === 'num') return k.v;
      if (k.t === '(') {
        const v = expr();
        if (!peek() || peek().t !== ')') fail('Missing )');
        p++;
        return v;
      }
      if (k.t === 'id') {
        if (k.v === 'ans') return Number(ans) || 0;
        if (Object.prototype.hasOwnProperty.call(CONSTS, k.v)) return CONSTS[k.v];
        if (Object.prototype.hasOwnProperty.call(FUNCS, k.v)) {
          let arg;
          if (peek() && peek().t === '(') arg = primary();
          else if (startsOperand()) arg = power();
          else fail(`${k.v} needs a value`);
          return FUNCS[k.v](arg, c);
        }
        return fail(`Unknown name "${k.v}"`);
      }
      return fail(`Unexpected "${k.v}"`);
    }

    const value = expr();
    if (p < toks.length) fail(`Unexpected "${toks[p].v}"`);
    if (Number.isNaN(value)) return { ok: false, error: 'Not a number (check the domain)' };
    if (!Number.isFinite(value)) return { ok: false, error: 'Result is too large' };
    return { ok: true, value };
  } catch (e) {
    if (e instanceof CalcError) return { ok: false, error: e.message };
    return { ok: false, error: 'Could not calculate that' };
  }
}

/** Display text: up to 10 significant digits; scientific notation for very large or small values. */
export function formatResult(n, digits = 10) {
  if (!Number.isFinite(n)) return '';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e10 || abs < 1e-4) {
    const [m, e] = n.toExponential(digits - 1).split('e');
    const mant = m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m;
    return `${mant}e${e}`;
  }
  return String(Number(n.toPrecision(digits)));
}
