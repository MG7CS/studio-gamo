import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAFE_REGEX_LIMITS, compileSafePattern, matchesSafePattern } from './safe-regex.ts';

// The native RegExp engine is used ONLY here, as the oracle for the differential tests.
const oracle = (pattern: string, input: string): boolean => new RegExp(pattern).test(input);

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;

const LITERALS = ['a', 'b', '0', ' ', '-', '_', 'x', ':', '/'];
const ESCAPED = ['\\.', '\\-', '\\\\', '\\*', '\\$', '\\^', '\\+', '\\?', '\\(', '\\|', '\\{', '\\['];
const SHORTHANDS = ['\\d', '\\w', '\\s', '\\D', '\\W', '\\S'];
const CLASS_ITEMS = [
  'a',
  'b',
  '0',
  ' ',
  '.',
  '\\d',
  '\\w',
  '\\s',
  '\\D',
  '\\S',
  '\\.',
  '\\\\',
  '\\-',
  'a-b',
  '0-9',
  'a-x',
  '_',
  'x',
];
const QUANTIFIERS = ['?', '*', '+', '{2}', '{1,3}', '{0,2}', '{2,}', '{1}', '{0,1}', '{3,3}', '{0,}', '{1,}'];

function genClass(r: () => number): string {
  const items: string[] = [];
  const count = 1 + Math.floor(r() * 3);
  for (let i = 0; i < count; i += 1) items.push(pick(r, CLASS_ITEMS));
  let body = items.join('');
  if (r() < 0.15) body = `-${body}`;
  if (r() < 0.15) body = `${body}-`;
  return `[${r() < 0.3 ? '^' : ''}${body}]`;
}

function genPattern(r: () => number): string {
  const atoms: string[] = [];
  const count = Math.floor(r() * 6);
  for (let i = 0; i < count; i += 1) {
    const roll = r();
    const atom =
      roll < 0.35
        ? pick(r, LITERALS)
        : roll < 0.45
          ? pick(r, ESCAPED)
          : roll < 0.6
            ? '.'
            : roll < 0.75
              ? pick(r, SHORTHANDS)
              : genClass(r);
    atoms.push(atom + (r() < 0.5 ? pick(r, QUANTIFIERS) : ''));
  }
  const pattern = `${r() < 0.4 ? '^' : ''}${atoms.join('')}${r() < 0.4 ? '$' : ''}`;
  return pattern === '' ? 'a' : pattern;
}

const INPUT_SMALL = ['a', 'b', '0', ' ', '-'];
const INPUT_ODD = ['x', '_', '.', ':', '/', '\n', '\r', ' ', ' ', ' ', '\t', '﻿', '　', 'é', '\u{1F600}'];
function genInput(r: () => number): string {
  const length = Math.floor(r() * 13);
  let s = '';
  for (let i = 0; i < length; i += 1) s += r() < 0.75 ? pick(r, INPUT_SMALL) : pick(r, INPUT_ODD);
  return s;
}

test('differential: matcher agrees with RegExp.test on 6000 random in-grammar patterns', () => {
  const r = prng(20261116);
  let matches = 0;
  let total = 0;
  for (let n = 0; n < 6000; n += 1) {
    const pattern = genPattern(r);
    const compiled = compileSafePattern(pattern);
    assert.ok(compiled, `pattern should be accepted: ${pattern}`);
    for (let k = 0; k < 8; k += 1) {
      const input = genInput(r);
      const expected = oracle(pattern, input);
      assert.equal(
        compiled.test(input),
        expected,
        `pattern ${JSON.stringify(pattern)} input ${JSON.stringify(input)}`,
      );
      assert.equal(matchesSafePattern(pattern, input), expected);
      total += 1;
      if (expected) matches += 1;
    }
  }
  // the alphabet is small enough that both outcomes are well represented
  assert.ok(total >= 40000);
  assert.ok(matches > total * 0.1 && matches < total * 0.9, `match rate ${matches / total}`);
});

test('differential: hand-picked edge cases', () => {
  const nl = '\n';
  const cases: [string, string, boolean][] = [
    ['a$', 'a\n', false], // JS `$` does not match before a trailing newline (no m flag)
    ['a$', 'a', true],
    ['^a', '\na', false],
    ['^$', '', true],
    ['^$', '\n', false],
    ['$', '', true],
    ['^', 'anything', true],
    ['a', '', false],
    ['a*', '', true],
    ['a?', 'b', true],
    ['.', '', false],
    ['.', nl, false],
    ['.', '\r', false],
    ['.', ' ', false],
    ['.', ' ', false],
    ['.', '\u0085', true],
    ['a.b', 'a\nb', false],
    ['a.b', 'a b', true],
    ['^.$', '\u{1F600}', false], // two UTF-16 code units, like JS without the u flag
    ['^..$', '\u{1F600}', true],
    ['\\s', ' ', true],
    ['\\s', '﻿', true],
    ['\\s', '　', true],
    ['\\s', ' ', true],
    ['\\s', '᠎', false],
    ['\\S', ' ', false],
    ['\\S', 'a', true],
    ['\\d', '٣', false], // ASCII digits only
    ['\\w', 'é', false],
    ['\\W', 'é', true],
    ['\\D', '5', false],
    ['[^a]', nl, true],
    ['[^a]', 'a', false],
    ['[^\\d]', '5', false],
    ['[\\D]', '5', false],
    ['[\\D5]', '5', true],
    ['[a-c]', 'b', true],
    ['[a-c]', 'd', false],
    ['[-a]', '-', true],
    ['[a-]', '-', true],
    ['[\\s.]', '.', true],
    ['^[a-z]{2,3}$', 'a', false],
    ['^[a-z]{2,3}$', 'ab', true],
    ['^[a-z]{2,3}$', 'abc', true],
    ['^[a-z]{2,3}$', 'abcd', false],
    ['^a{3}$', 'aa', false],
    ['^a{3}$', 'aaa', true],
    ['^a{3}$', 'aaaa', false],
    ['^a{2,}$', 'a', false],
    ['^a{2,}$', 'aaaaaaaa', true],
    ['^a{0,1}b$', 'b', true],
    ['^a{0,1}b$', 'aab', false],
    ['A', 'a', false], // case sensitive
    ['\\.', 'a', false],
    ['\\.', '.', true],
    ['a\\$', 'a$', true],
    ['\\^a', '^a', true],
    ['^[A-Z]{2}\\d{4}$', 'AB1234', true],
    ['^[A-Z]{2}\\d{4}$', 'ab1234', false],
    ['^[a-z]+@[a-z]+\\.[a-z]{2,}$', 'ann@church.org', true],
    ['^[a-z]+@[a-z]+\\.[a-z]{2,}$', 'ann@church.o', false],
    ['worship', 'a worship night', true],
    ['a*a*b$', 'aaab', true],
    ['a*a*b$', 'aaabc', false],
  ];
  for (const [pattern, input, expected] of cases) {
    assert.equal(oracle(pattern, input), expected, `oracle sanity ${pattern} ${JSON.stringify(input)}`);
    assert.equal(matchesSafePattern(pattern, input), expected, `${pattern} ${JSON.stringify(input)}`);
  }
});

test('patterns outside the grammar do not compile and never match', () => {
  for (const pattern of ['(a)', 'a|b', '\\bfoo', '(?=a)a', 'a{', '[a-z', '']) {
    assert.equal(compileSafePattern(pattern), null, pattern);
    assert.equal(matchesSafePattern(pattern, 'a'), false, pattern);
  }
});

test('adversarial patterns run in linear time on 500-character hostile input', () => {
  const hostile = [
    'a'.repeat(500),
    `${'a'.repeat(499)}!`,
    `${'a'.repeat(499)}x`,
    `${'ab'.repeat(249)}!!`,
    `${'1'.repeat(499)}!`,
    ' '.repeat(500),
    `${'a '.repeat(249)}!!`,
    '\n'.repeat(500),
  ];
  const patterns = [
    'a*a*a*b$',
    '.*.*.*x',
    'a*a*a*a?a?a?a?a?b',
    '^a*a*a*a?a?a?a?a?b',
    'a*a*a?a?a?a?a?a?b$',
    'a?a?a?a?a?a?a?a?aaaaaaaa$',
    'a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?aaaaaaaaaaaaaaaa$',
    '^\\w*\\w*\\w*\\w*#$',
    '\\w*\\w*\\w*\\w*\\w*#$',
    '[a-z ]*[a-z ]*[a-z ]*[a-z ]*!$',
    'a*a*a*a*a*a*a*a*b',
    '^\\d{1,100}\\d{1,100}\\d{1,100}x',
    '[a-z]{1,100}[a-z]{1,100}[a-z]{1,100}[a-z]{1,100}[a-z]{1,100}!',
    '.{100}.{100}.{100}.{100}.{100}x',
  ];
  for (const pattern of patterns) {
    const compiled = compileSafePattern(pattern);
    assert.ok(compiled, pattern);
    for (const input of hostile) {
      const started = performance.now();
      compiled.test(input);
      const elapsed = performance.now() - started;
      assert.ok(elapsed < 50, `${pattern} took ${elapsed.toFixed(1)} ms`);
    }
  }
});

test('state budget: patterns that expand beyond the cap are rejected', () => {
  assert.equal(SAFE_REGEX_LIMITS.maxStates, 1000);
  assert.equal(SAFE_REGEX_LIMITS.maxLength, 100);
  const unit = 'a{100}';
  assert.ok(compileSafePattern(unit.repeat(10)), '1000 states are allowed');
  assert.equal(compileSafePattern(unit.repeat(11)), null, '1100 states are refused');
  assert.equal(compileSafePattern('[a-z]{100}'.repeat(11)), null);
  assert.equal(compileSafePattern('a{100,}'.repeat(10)), null, 'n + 1 states each: 1010');
  assert.ok(compileSafePattern('a{99,}'.repeat(10)), '100 states each: 1000');
});
