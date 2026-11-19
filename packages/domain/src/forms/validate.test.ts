import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFormSchema } from './schema.ts';
import type { UploadRef } from './schema.ts';
import { OTHER_VALUE, gridFieldName, otherFieldName, validateAnswers } from './validate.ts';

const q = (extra: Record<string, unknown>) => ({ id: 'q1', label: 'Question', type: 'short_text', ...extra });
const form = (...questions: Record<string, unknown>[]) =>
  parseFormSchema({ sections: [{ id: 's1', title: 'Section', questions }] });

type Raw = Record<string, string | string[]>;
function run(schema: ReturnType<typeof form>, raw: Raw = {}, uploads: Record<string, UploadRef[]> = {}) {
  return validateAnswers(schema, raw, uploads);
}
function errorsOf(result: ReturnType<typeof run>) {
  assert.equal(result.ok, false, 'expected failure');
  return result.ok ? [] : result.errors;
}
function answersOf(result: ReturnType<typeof run>) {
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.errors));
  return result.ok ? result.answers : {};
}

test('short_text: regex uses the custom message and fails closed on unsafe patterns', () => {
  const f = form(
    q({ validation: { kind: 'regex', pattern: '^GW-\\d{4}$', message: 'Use the GW-1234 format.' } }),
  );
  assert.equal(run(f, { q1: 'GW-1234' }).ok, true);
  assert.deepEqual(errorsOf(run(f, { q1: 'x' })), [{ questionId: 'q1', message: 'Use the GW-1234 format.' }]);
  const unsafe = form(q({ validation: { kind: 'regex', pattern: '(a+)+$' } }));
  const started = Date.now();
  // would match if it were run; an unsafe pattern is never run and fails closed
  assert.equal(run(unsafe, { q1: 'aaaa' }).ok, false);
  assert.equal(run(unsafe, { q1: `${'a'.repeat(400)}!` }).ok, false);
  assert.ok(Date.now() - started < 500);
  const withMessage = form(q({ validation: { kind: 'regex', pattern: '(a+)+$', message: 'Nope.' } }));
  assert.deepEqual(errorsOf(run(withMessage, { q1: 'aaaa' })), [{ questionId: 'q1', message: 'Nope.' }]);
  const defaultMessage = errorsOf(run(unsafe, { q1: 'aaaa' }))[0]!.message;
  assert.equal(defaultMessage, 'This answer is not in the expected format.');
});

test('short_text: over-long answers are refused', () => {
  const f = form(q({}));
  assert.equal(run(f, { q1: 'x'.repeat(501) }).ok, false);
  assert.equal(run(f, { q1: 'x'.repeat(500) }).ok, true);
  const short = form(q({ maxLength: 10 }));
  assert.equal(run(short, { q1: 'x'.repeat(11) }).ok, false);
});

test('multiple_choice and dropdown: only listed options, Other needs text', () => {
  const mc = form(q({ type: 'multiple_choice', options: ['Piano', 'Drums'], other: true, required: true }));
  assert.deepEqual(answersOf(run(mc, { q1: 'Piano' })), { q1: 'Piano' });
  assert.equal(run(mc, { q1: 'Tuba' }).ok, false);
  assert.equal(run(mc, { q1: ['Piano', 'Drums'] }).ok, false);
  const noText = errorsOf(run(mc, { q1: OTHER_VALUE }));
  assert.equal(noText[0]!.questionId, 'q1');
  assert.equal(run(mc, { q1: OTHER_VALUE, [otherFieldName('q1')]: '   ' }).ok, false);
  assert.deepEqual(answersOf(run(mc, { q1: OTHER_VALUE, [otherFieldName('q1')]: ' Violin ' })), {
    q1: 'Violin',
  });
  // Other text without the Other choice is ignored
  assert.deepEqual(answersOf(run(mc, { q1: 'Drums', [otherFieldName('q1')]: 'Violin' })), { q1: 'Drums' });
  // Other not enabled
  const noOther = form(q({ type: 'multiple_choice', options: ['Piano'] }));
  assert.equal(run(noOther, { q1: OTHER_VALUE, [otherFieldName('q1')]: 'x' }).ok, false);

  const dd = form(q({ type: 'dropdown', options: ['A', 'B'] }));
  assert.equal(run(dd, { q1: 'B' }).ok, true);
  assert.equal(run(dd, { q1: 'C' }).ok, false);
  assert.equal(run(dd, { q1: OTHER_VALUE }).ok, false);
});

test('adversarial raw input never throws', () => {
  const f = form(
    q({ id: 'a', required: true }),
    q({ id: 'b', type: 'checkboxes', options: ['x', 'y'] }),
    q({ id: 'c', type: 'multiple_choice', options: ['x'], other: true }),
    q({ id: 'g', type: 'choice_grid', rows: ['__proto__', 'constructor'], columns: ['__proto__', 'c2'] }),
    q({ id: 'd', type: 'linear_scale', min: 1, max: 5 }),
    q({ id: 'e', type: 'date' }),
    q({ id: 'l', type: 'link' }),
    q({ id: 'f', type: 'file_upload', accept: ['image'] }),
  );
  const hostile: unknown[] = [
    null,
    undefined,
    'string',
    42,
    [],
    JSON.parse('{"__proto__":{"polluted":1},"a":"x","constructor":{"prototype":{"p":1}}}'),
    { a: 5, b: 'x', c: { toString: 1 }, d: [1, 2], e: {}, l: null, g: 'x' },
    { a: ['x'.repeat(100)], b: Array.from({ length: 1_000_000 }, () => 'x') },
    { b: Array.from({ length: 10_000 }, (_, i) => `v${i}`) },
    { a: 'x'.repeat(5_000_000) },
    { [gridFieldName('g', 0)]: '__proto__', [gridFieldName('g', 1)]: ['__proto__'] },
    { [gridFieldName('g', 0)]: '__proto__' },
    { 'a.other': 'x', [otherFieldName('c')]: 'y', c: OTHER_VALUE },
  ];
  for (const raw of hostile) {
    for (const uploads of [
      undefined,
      null,
      {},
      { f: 'nope' },
      { f: [null] },
      { f: Array.from({ length: 100_000 }, () => ({})) },
      JSON.parse('{"__proto__":[1]}'),
    ]) {
      const r = validateAnswers(f, raw as never, uploads as never);
      assert.equal(typeof r.ok, 'boolean');
    }
  }
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(({} as Record<string, unknown>).p, undefined);
  // __proto__ as a grid row/column is stored as an own property, not on the prototype chain
  const r = validateAnswers(f, { a: 'x', [gridFieldName('g', 0)]: '__proto__' } as never, {});
  assert.equal(r.ok, true);
  if (r.ok) {
    const grid = r.answers.g as Record<string, unknown>;
    assert.equal(Object.getPrototypeOf(grid), Object.prototype);
    assert.equal(Object.prototype.hasOwnProperty.call(grid, '__proto__'), true);
  }
});
