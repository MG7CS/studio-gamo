/**
 * Linear-time matcher for staff-authored "custom regex" form rules.
 *
 * Why not RegExp: JavaScript's engine backtracks, so the cost of nested or adjacent repetition multiplies
 * (`a*a*a*a?a?a?b` against a run of "a" is polynomial times exponential) and no budget on the number of
 * quantifiers can bound it. OWASP's ReDoS guidance (owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS)
 * recommends a non-backtracking engine for untrusted patterns. This module follows Russ Cox, "Regular
 * Expression Matching Can Be Simple And Fast" (swtch.com/~rsc/regexp/regexp1.html) and the design of RE2:
 * the pattern becomes a Thompson NFA and is simulated with a SET of states, advancing every state once
 * per input character. Cost is O(states x input length) by construction, with no backtracking, so there
 * is nothing to budget except the NFA size (SAFE_REGEX_LIMITS.maxStates).
 *
 * Only a small grammar is accepted (and that parser is the only gate, the native engine is never used):
 *
 *   pattern    = [ "^" ] { atom [ quantifier ] } [ "$" ]
 *   atom       = literal | "\" punctuation | "." | "\" ("d"|"w"|"s"|"D"|"W"|"S") | class
 *   literal    = letter | digit | space | one of  _ - : , ; / @ # % & ' " ! = ~ < > `
 *   punctuation= one of  . - / + ( ) [ ] { } \ ^ $ | * ?
 *   class      = "[" [ "^" ] item+ "]"    (at most 40 characters between the brackets)
 *   item       = literal | "." | "\" punctuation | "\" shorthand | literal "-" literal  (ascending range)
 *                ("-" is literal only as the first or last item; no nested "[", no "[:posix:]")
 *   quantifier = "?" | "*" | "+" | "{n}" | "{n,}" | "{n,m}"   (digit run of 1..3 digits, n <= m <= 100, m >= 1)
 *
 * Rejected: groups of any kind, alternation, backreferences, lookarounds, flags, `\b \B \u \x \p \k` and any
 * other escape, lazy/possessive/double quantifiers, a `{` that is not a strictly valid quantifier (never a
 * literal), unescaped `) ] }`, `^` or `$` anywhere except the very start/end, non-ASCII pattern text.
 *
 * Semantics equal `RegExp.prototype.test` (no flags, no `u`) for this subset, checked by a differential
 * test: matches anywhere unless anchored; `.` excludes \n \r U+2028 U+2029; `$` matches only at the very end
 * (not before a trailing newline); `\s` is the JS whitespace set; `\d \w` are ASCII; case-sensitive; input is
 * read as UTF-16 code units.
 */

export const SAFE_REGEX_LIMITS = {
  maxLength: 100,
  maxRepeat: 100,
  maxClass: 40,
  /** Expanded NFA states (each `a{n,m}` costs m states, `a{n,}` costs n + 1). */
  maxStates: 1000,
} as const;

/** A set of code-unit ranges `[lo, hi, lo, hi, ...]`, optionally negated. */
type Term = { ranges: readonly number[]; negated: boolean };
/** One position of input matches when any term hits, flipped by `negated` (for `[^...]` and `.`). */
type Atom = { terms: Term[]; negated: boolean };

const DIGITS: readonly number[] = [0x30, 0x39];
const WORD: readonly number[] = [0x30, 0x39, 0x41, 0x5a, 0x5f, 0x5f, 0x61, 0x7a];
// JS WhiteSpace + LineTerminator: TAB VT FF SP NBSP ZWNBSP, Zs, LF CR LS PS.
const SPACE: readonly number[] = [
  0x09, 0x0d, 0x20, 0x20, 0xa0, 0xa0, 0x1680, 0x1680, 0x2000, 0x200a, 0x2028, 0x2029, 0x202f, 0x202f, 0x205f,
  0x205f, 0x3000, 0x3000, 0xfeff, 0xfeff,
];
const LINE_TERMINATORS: readonly number[] = [0x0a, 0x0a, 0x0d, 0x0d, 0x2028, 0x2029];

const SHORTHAND: Record<string, Term> = {
  d: { ranges: DIGITS, negated: false },
  D: { ranges: DIGITS, negated: true },
  w: { ranges: WORD, negated: false },
  W: { ranges: WORD, negated: true },
  s: { ranges: SPACE, negated: false },
  S: { ranges: SPACE, negated: true },
};

const LITERAL_CHAR = /^[A-Za-z0-9 _\-:,;/@#%&'"!=~<>`]$/;
const ESCAPABLE = new Set('.-/+()[]{}\\^$|*?');

type Item = { atom: Atom; min: number; max: number };
type Parsed = { anchorStart: boolean; anchorEnd: boolean; items: Item[] };

const single = (code: number): Term => ({ ranges: [code, code], negated: false });
const charAtom = (code: number): Atom => ({ terms: [single(code)], negated: false });

function inRanges(ranges: readonly number[], code: number): boolean {
  for (let i = 0; i < ranges.length; i += 2) if (code >= ranges[i]! && code <= ranges[i + 1]!) return true;
  return false;
}
function atomMatches(atom: Atom, code: number): boolean {
  let hit = false;
  for (const term of atom.terms) {
    if (inRanges(term.ranges, code) !== term.negated) {
      hit = true;
      break;
    }
  }
  return hit !== atom.negated;
}

/** Strict parser: the grammar above, or `null`. */
function parse(pattern: string): Parsed | null {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > SAFE_REGEX_LIMITS.maxLength) {
    return null;
  }
  const n = pattern.length;
  let i = 0;
  const anchorStart = pattern[0] === '^';
  if (anchorStart) i = 1;
  let anchorEnd = false;
  const items: Item[] = [];

  /** Escape at `at` (pattern[at] === "\\"): the single-character term, or a shorthand term, or null. */
  const escapeAt = (at: number): Term | null => {
    const next = pattern[at + 1];
    if (next === undefined) return null;
    const shorthand = SHORTHAND[next];
    if (shorthand) return shorthand;
    return ESCAPABLE.has(next) ? single(next.charCodeAt(0)) : null;
  };

  /** Class starting at the "[" at `at`: its atom and the index after "]", or null. */
  const parseClass = (at: number): { atom: Atom; end: number } | null => {
    let j = at + 1;
    let negated = false;
    if (pattern[j] === '^') {
      negated = true;
      j += 1;
    }
    type Token = { kind: 'term'; term: Term; code: number | null } | { kind: 'dash' };
    const tokens: Token[] = [];
    const start = j;
    while (j < n && pattern[j] !== ']') {
      const c = pattern[j]!;
      if (c === '\\') {
        const term = escapeAt(j);
        if (!term) return null;
        const isShorthand = SHORTHAND[pattern[j + 1]!] !== undefined;
        tokens.push({ kind: 'term', term, code: isShorthand ? null : pattern.charCodeAt(j + 1) });
        j += 2;
      } else if (c === '-') {
        tokens.push({ kind: 'dash' });
        j += 1;
      } else if (LITERAL_CHAR.test(c) || c === '.') {
        tokens.push({ kind: 'term', term: single(c.charCodeAt(0)), code: c.charCodeAt(0) });
        j += 1;
      } else {
        return null; // nested "[", "[:posix:]", non-ASCII, controls, bare metacharacters
      }
      if (j - start > SAFE_REGEX_LIMITS.maxClass) return null;
    }
    if (j >= n || tokens.length === 0) return null; // unclosed or empty
    const terms: Term[] = [];
    for (let k = 0; k < tokens.length; k += 1) {
      const token = tokens[k]!;
      if (token.kind === 'dash') {
        if (k !== 0 && k !== tokens.length - 1) return null;
        terms.push(single(0x2d));
        continue;
      }
      const next = tokens[k + 1];
      if (next?.kind === 'dash' && k + 2 < tokens.length) {
        const to = tokens[k + 2]!;
        if (token.code === null || to.kind !== 'term' || to.code === null || to.code < token.code)
          return null;
        terms.push({ ranges: [token.code, to.code], negated: false });
        k += 2;
      } else {
        terms.push(token.term);
      }
    }
    return { atom: { terms, negated }, end: j + 1 };
  };

  while (i < n) {
    const c = pattern[i]!;
    if (c === '$') {
      if (i !== n - 1) return null;
      anchorEnd = true;
      break;
    }
    let atom: Atom;
    if (c === '\\') {
      const term = escapeAt(i);
      if (!term) return null;
      atom = { terms: [term], negated: false };
      i += 2;
    } else if (c === '[') {
      const parsed = parseClass(i);
      if (!parsed) return null;
      atom = parsed.atom;
      i = parsed.end;
    } else if (c === '.') {
      atom = { terms: [{ ranges: LINE_TERMINATORS, negated: false }], negated: true };
      i += 1;
    } else if (LITERAL_CHAR.test(c)) {
      atom = charAtom(c.charCodeAt(0));
      i += 1;
    } else {
      return null; // ( ) | ^ * + ? { } ] and everything non-ASCII
    }
    let min = 1;
    let max = 1;
    const q = pattern[i];
    if (q === '?') {
      min = 0;
      max = 1;
      i += 1;
    } else if (q === '*') {
      min = 0;
      max = Infinity;
      i += 1;
    } else if (q === '+') {
      min = 1;
      max = Infinity;
      i += 1;
    } else if (q === '{') {
      const m = /^\{(\d{1,3})(?:(,)(\d{0,3}))?\}/.exec(pattern.slice(i, i + 9));
      if (!m) return null;
      min = Number(m[1]);
      max = m[2] === undefined ? min : m[3] === '' ? Infinity : Number(m[3]);
      const cap = SAFE_REGEX_LIMITS.maxRepeat;
      if (min > cap || max < min || max < 1 || (max !== Infinity && max > cap)) return null;
      i += m[0].length;
    }
    items.push({ atom, min, max });
  }
  return { anchorStart, anchorEnd, items };
}

/** Thompson NFA over positions `0..L`; `elements[p]` is the atom consumed to move from position p. */
type Element = { atom: Atom; skip: boolean; loop: boolean };

function expand(items: Item[]): Element[] | null {
  const elements: Element[] = [];
  for (const { atom, min, max } of items) {
    for (let k = 0; k < min; k += 1) elements.push({ atom, skip: false, loop: false });
    if (max === Infinity) elements.push({ atom, skip: true, loop: true });
    else for (let k = min; k < max; k += 1) elements.push({ atom, skip: true, loop: false });
    if (elements.length > SAFE_REGEX_LIMITS.maxStates) return null;
  }
  return elements;
}

export type SafePattern = {
  /** `RegExp.prototype.test` semantics for the accepted subset, in time O(states x value.length). */
  test(value: string): boolean;
  readonly states: number;
};

/** Parse and compile a pattern, or `null` when it is outside the grammar or too large. */
export function compileSafePattern(pattern: string): SafePattern | null {
  const parsed = parse(pattern);
  if (!parsed) return null;
  const elements = expand(parsed.items);
  if (!elements) return null;
  const accept = elements.length;
  const { anchorStart, anchorEnd } = parsed;

  const test = (value: string): boolean => {
    if (typeof value !== 'string') return false;
    let current = new Uint8Array(accept + 1);
    let next = new Uint8Array(accept + 1);
    let active: number[] = [];
    let nextActive: number[] = [];

    const add = (set: Uint8Array, list: number[], position: number): void => {
      let p = position;
      for (;;) {
        if (set[p]) return;
        set[p] = 1;
        list.push(p);
        if (p < accept && elements[p]!.skip) p += 1;
        else return;
      }
    };

    add(current, active, 0);
    if (!anchorEnd && current[accept]) return true;
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      for (const p of active) {
        if (p === accept) continue;
        const element = elements[p]!;
        if (atomMatches(element.atom, code)) add(next, nextActive, element.loop ? p : p + 1);
      }
      if (!anchorStart) add(next, nextActive, 0);
      for (const p of active) current[p] = 0;
      [current, next] = [next, current];
      [active, nextActive] = [nextActive, active];
      nextActive.length = 0;
      if (!anchorEnd && current[accept]) return true;
      if (active.length === 0) return false;
    }
    return current[accept] === 1;
  };
  return { test, states: elements.length };
}

/** Convenience: `false` when the pattern is not in the grammar. */
export function matchesSafePattern(pattern: string, value: string): boolean {
  const compiled = compileSafePattern(pattern);
  return compiled ? compiled.test(value) : false;
}
