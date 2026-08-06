/**
 * mathexpr.js — a small, safe expression compiler.
 *
 * Parses arithmetic / comparison / logical expressions into a tree of closures.
 * There is deliberately no eval() and no new Function(): whatever a student
 * types can only ever produce a number, never code.
 *
 * Grammar (loosest to tightest):
 *   or   := and ('||' and)*
 *   and  := cmp ('&&' cmp)*
 *   cmp  := add (('<='|'>='|'<'|'>'|'=='|'='|'!=') add)*     chained: a<b<c => (a<b)&&(b<c)
 *   add  := mul (('+'|'-') mul)*
 *   mul  := unary (('*'|'/'|'%') unary | implicit-mul)*
 *   unary:= ('-'|'+'|'!') unary | power
 *   power:= atom ('^' unary)?                                 right associative
 *   atom := number | const | var | func '(' args ')' | '(' or ')' | '|' or '|'
 *
 * Booleans are carried as 1 / 0 so that they compose with arithmetic.
 */

const CONSTANTS = {
  pi: Math.PI, PI: Math.PI, Pi: Math.PI,
  e: Math.E, E: Math.E,
  tau: 2 * Math.PI,
  inf: Infinity, Inf: Infinity, infinity: Infinity,
};

const log10 = Math.log10 || ((v) => Math.log(v) / Math.LN10);
const log2 = Math.log2 || ((v) => Math.log(v) / Math.LN2);
const cbrt = Math.cbrt || ((v) => (v < 0 ? -Math.pow(-v, 1 / 3) : Math.pow(v, 1 / 3)));
const sinh = Math.sinh || ((v) => (Math.exp(v) - Math.exp(-v)) / 2);
const cosh = Math.cosh || ((v) => (Math.exp(v) + Math.exp(-v)) / 2);
const tanh = Math.tanh || ((v) => (Math.exp(2 * v) - 1) / (Math.exp(2 * v) + 1));

// name -> [minArgs, maxArgs, implementation]
const FUNCS = {
  sin: [1, 1, Math.sin], cos: [1, 1, Math.cos], tan: [1, 1, Math.tan],
  asin: [1, 1, Math.asin], acos: [1, 1, Math.acos], atan: [1, 1, Math.atan],
  atan2: [2, 2, Math.atan2],
  sinh: [1, 1, sinh], cosh: [1, 1, cosh], tanh: [1, 1, tanh],
  exp: [1, 1, Math.exp],
  ln: [1, 1, Math.log], log: [1, 1, Math.log], log10: [1, 1, log10], log2: [1, 1, log2],
  sqrt: [1, 1, Math.sqrt], cbrt: [1, 1, cbrt],
  abs: [1, 1, Math.abs], sign: [1, 1, (v) => (v > 0 ? 1 : v < 0 ? -1 : 0)],
  floor: [1, 1, Math.floor], ceil: [1, 1, Math.ceil], round: [1, 1, Math.round],
  min: [1, 8, Math.min], max: [1, 8, Math.max],
  pow: [2, 2, Math.pow], hypot: [2, 8, Math.hypot || ((a, b) => Math.sqrt(a * a + b * b))],
  mod: [2, 2, (a, b) => a - b * Math.floor(a / b)],
  clamp: [3, 3, (v, a, b) => Math.min(Math.max(v, a), b)],
  step: [2, 2, (edge, v) => (v < edge ? 0 : 1)],
  // Handy shapes for building test surfaces.
  gauss: [1, 3, (v, mu, s) => {
    const m = mu === undefined ? 0 : mu, sd = s === undefined ? 1 : s;
    const t = (v - m) / sd;
    return Math.exp(-0.5 * t * t);
  }],
};

export class MathExprError extends Error {
  constructor(message, position) {
    super(message);
    this.name = 'MathExprError';
    this.position = position;
  }
}

/* ------------------------------------------------------------------ lexer */

const OPERATORS = ['<=', '>=', '==', '!=', '&&', '||', '<', '>', '=', '+', '-', '*', '/', '%', '^', '!'];

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }

    if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      const start = i;
      while (i < src.length && src[i] >= '0' && src[i] <= '9') i++;
      if (src[i] === '.') { i++; while (i < src.length && src[i] >= '0' && src[i] <= '9') i++; }
      if (src[i] === 'e' || src[i] === 'E') {
        const save = i;
        i++;
        if (src[i] === '+' || src[i] === '-') i++;
        if (src[i] >= '0' && src[i] <= '9') { while (i < src.length && src[i] >= '0' && src[i] <= '9') i++; }
        else i = save; // "2e" is 2*e, not a malformed exponent
      }
      tokens.push({ type: 'num', value: parseFloat(src.slice(start, i)), pos: start });
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++;
      tokens.push({ type: 'name', value: src.slice(start, i), pos: start });
      continue;
    }

    // Operators are matched before punctuation, or "||" would lex as two
    // absolute-value bars. A lone "|" is not in the operator table, so it still
    // falls through to punctuation below.
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      tokens.push({ type: 'op', value: op, pos: i });
      i += op.length;
      continue;
    }

    if (c === '(' || c === ')' || c === ',' || c === '|') {
      tokens.push({ type: c, pos: i });
      i++;
      continue;
    }

    throw new MathExprError(`Unexpected character "${c}"`, i);
  }
  tokens.push({ type: 'end', pos: src.length });
  return tokens;
}

/* ----------------------------------------------------------------- parser */

const TRUE = 1, FALSE = 0;
const bool = (b) => (b ? TRUE : FALSE);

class Parser {
  constructor(tokens, varNames) {
    this.tokens = tokens;
    this.i = 0;
    this.vars = varNames;
    this.usesVar = Object.create(null);
  }

  peek() { return this.tokens[this.i]; }
  next() { return this.tokens[this.i++]; }
  isOp(value) { const t = this.peek(); return t.type === 'op' && t.value === value; }
  eatOp(value) { if (this.isOp(value)) { this.i++; return true; } return false; }

  expect(type, what) {
    const t = this.peek();
    if (t.type !== type) throw new MathExprError(`Expected ${what}`, t.pos);
    return this.next();
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.isOp('||')) {
      this.next();
      const right = this.parseAnd();
      const l = left;
      left = (x, y) => bool(l(x, y) > 0.5 || right(x, y) > 0.5);
    }
    return left;
  }

  parseAnd() {
    let left = this.parseCmp();
    while (this.isOp('&&')) {
      this.next();
      const right = this.parseCmp();
      const l = left;
      left = (x, y) => bool(l(x, y) > 0.5 && right(x, y) > 0.5);
    }
    return left;
  }

  parseCmp() {
    let left = this.parseAdd();
    // Chained comparisons (0 <= x <= 1) fold into a conjunction. `prev` keeps
    // the middle operand so the second link compares against the right value.
    let acc = null;
    let prev = left;
    for (;;) {
      const t = this.peek();
      if (t.type !== 'op' || !['<', '>', '<=', '>=', '==', '=', '!='].includes(t.value)) break;
      this.next();
      const right = this.parseAdd();
      const a = prev, b = right, op = t.value;
      let link;
      switch (op) {
        case '<': link = (x, y) => bool(a(x, y) < b(x, y)); break;
        case '>': link = (x, y) => bool(a(x, y) > b(x, y)); break;
        case '<=': link = (x, y) => bool(a(x, y) <= b(x, y)); break;
        case '>=': link = (x, y) => bool(a(x, y) >= b(x, y)); break;
        case '!=': link = (x, y) => bool(a(x, y) !== b(x, y)); break;
        default: link = (x, y) => bool(a(x, y) === b(x, y)); break;
      }
      acc = acc === null ? link : ((prevAcc) => (x, y) => bool(prevAcc(x, y) > 0.5 && link(x, y) > 0.5))(acc);
      prev = right;
    }
    return acc === null ? left : acc;
  }

  parseAdd() {
    let left = this.parseMul();
    for (;;) {
      if (this.eatOp('+')) { const r = this.parseMul(), l = left; left = (x, y) => l(x, y) + r(x, y); }
      else if (this.eatOp('-')) { const r = this.parseMul(), l = left; left = (x, y) => l(x, y) - r(x, y); }
      else break;
    }
    return left;
  }

  /** True when the upcoming token can begin an atom, i.e. "2x" style implicit multiplication. */
  startsAtom() {
    const t = this.peek();
    if (t.type === 'num' || t.type === 'name' || t.type === '(' || t.type === '|') return true;
    return false;
  }

  parseMul() {
    let left = this.parseUnary();
    for (;;) {
      if (this.eatOp('*')) { const r = this.parseUnary(), l = left; left = (x, y) => l(x, y) * r(x, y); }
      else if (this.eatOp('/')) { const r = this.parseUnary(), l = left; left = (x, y) => l(x, y) / r(x, y); }
      else if (this.eatOp('%')) {
        const r = this.parseUnary(), l = left;
        left = (x, y) => { const b = r(x, y); return l(x, y) - b * Math.floor(l(x, y) / b); };
      } else if (this.startsAtom()) {
        // Implicit multiplication: 2x, 3(x+y), x y. A bare '|' would be
        // ambiguous with the closing bar of |...|, so it is excluded here.
        if (this.peek().type === '|') break;
        const r = this.parseUnary(), l = left;
        left = (x, y) => l(x, y) * r(x, y);
      } else break;
    }
    return left;
  }

  parseUnary() {
    if (this.eatOp('-')) { const v = this.parseUnary(); return (x, y) => -v(x, y); }
    if (this.eatOp('+')) return this.parseUnary();
    if (this.eatOp('!')) { const v = this.parseUnary(); return (x, y) => bool(!(v(x, y) > 0.5)); }
    return this.parsePower();
  }

  parsePower() {
    const base = this.parseAtom();
    if (this.eatOp('^')) {
      const exp = this.parseUnary(); // right associative, and allows x^-1
      return (x, y) => Math.pow(base(x, y), exp(x, y));
    }
    return base;
  }

  parseAtom() {
    const t = this.next();

    if (t.type === 'num') { const v = t.value; return () => v; }

    if (t.type === '(') {
      const inner = this.parseOr();
      if (this.peek().type !== ')') throw new MathExprError('Missing ")"', this.peek().pos);
      this.next();
      return inner;
    }

    if (t.type === '|') { // |expr| absolute value
      const inner = this.parseOr();
      if (this.peek().type !== '|') throw new MathExprError('Missing closing "|"', this.peek().pos);
      this.next();
      return (x, y) => Math.abs(inner(x, y));
    }

    if (t.type === 'name') {
      const name = t.value;

      if (this.peek().type === '(') {
        const spec = FUNCS[name];
        if (!spec) throw new MathExprError(`Unknown function "${name}"`, t.pos);
        this.next();
        const args = [];
        if (this.peek().type !== ')') {
          args.push(this.parseOr());
          while (this.peek().type === ',') { this.next(); args.push(this.parseOr()); }
        }
        if (this.peek().type !== ')') throw new MathExprError(`Missing ")" after ${name}(`, this.peek().pos);
        this.next();

        const [minA, maxA, impl] = spec;
        if (args.length < minA || args.length > maxA) {
          const want = minA === maxA ? `${minA}` : `${minA} to ${maxA}`;
          throw new MathExprError(`${name}() takes ${want} argument(s), got ${args.length}`, t.pos);
        }
        if (args.length === 1) { const a = args[0]; return (x, y) => impl(a(x, y)); }
        if (args.length === 2) { const a = args[0], b = args[1]; return (x, y) => impl(a(x, y), b(x, y)); }
        if (args.length === 3) { const a = args[0], b = args[1], c = args[2]; return (x, y) => impl(a(x, y), b(x, y), c(x, y)); }
        return (x, y) => impl.apply(null, args.map((a) => a(x, y)));
      }

      const vi = this.vars.indexOf(name);
      if (vi === 0) { this.usesVar.x = true; return (x) => x; }
      if (vi === 1) { this.usesVar.y = true; return (x, y) => y; }

      if (name in CONSTANTS) { const v = CONSTANTS[name]; return () => v; }
      if (FUNCS[name]) throw new MathExprError(`"${name}" is a function — write ${name}(...)`, t.pos);
      throw new MathExprError(`Unknown name "${name}"`, t.pos);
    }

    if (t.type === 'op') throw new MathExprError(`Unexpected operator "${t.value}"`, t.pos);
    if (t.type === 'end') throw new MathExprError('Unexpected end of expression', t.pos);
    throw new MathExprError(`Unexpected "${t.type}"`, t.pos);
  }
}

/**
 * Compile `src` into a function of (x, y).
 * Throws MathExprError with a .position on bad input.
 */
export function compile(src, varNames = ['x', 'y']) {
  if (typeof src !== 'string' || src.trim() === '') throw new MathExprError('Expression is empty', 0);
  const parser = new Parser(tokenize(src), varNames);
  const fn = parser.parseOr();
  const t = parser.peek();
  if (t.type !== 'end') throw new MathExprError('Unexpected trailing input', t.pos);
  fn.usesX = !!parser.usesVar.x;
  fn.usesY = !!parser.usesVar.y;
  return fn;
}

/** Compile to a boolean-valued predicate; an empty/blank source means "everywhere". */
export function compilePredicate(src, varNames = ['x', 'y']) {
  if (typeof src !== 'string' || src.trim() === '') return () => true;
  const fn = compile(src, varNames);
  return (x, y) => fn(x, y) > 0.5;
}

/** Quick syntax check used by the input boxes. Returns null or an error message. */
export function checkSyntax(src, predicate = false) {
  try {
    const fn = predicate ? compilePredicate(src) : compile(src);
    const probe = fn(0.371, 0.529); // does it even produce a value?
    if (!predicate && typeof probe !== 'number') return 'Expression did not produce a number';
    return null;
  } catch (err) {
    if (err instanceof MathExprError) {
      return err.position === undefined ? err.message : `${err.message} (at character ${err.position + 1})`;
    }
    return String(err && err.message ? err.message : err);
  }
}

export const FUNCTION_NAMES = Object.keys(FUNCS).sort();
export const CONSTANT_NAMES = ['pi', 'e', 'tau'];
