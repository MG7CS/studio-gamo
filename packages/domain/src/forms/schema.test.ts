import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FormSchemaError, parseFormSchema } from './schema.ts';

const q = (extra: Record<string, unknown>) => ({ id: 'q1', label: 'Question', type: 'short_text', ...extra });
const form = (...questions: Record<string, unknown>[]) =>
  parseFormSchema({ sections: [{ id: 's1', title: 'Section', questions }] });
test('parseFormSchema throws FormSchemaError with a path', () => {
  assert.throws(
    () => form(q({ id: 'a', type: 'linear_scale', min: 1, max: 11 })),
    (e: unknown) => e instanceof FormSchemaError && e.path === 'sections.0.questions.0.max',
  );
  assert.throws(
    () => form(q({ id: 'a', type: 'rating', max: 2 })),
    (e: unknown) => e instanceof FormSchemaError && /max/.test(e.path),
  );
  assert.throws(
    () => form(q({ id: 'a', type: 'linear_scale', min: 2, max: 5 })),
    (e: unknown) => e instanceof FormSchemaError && /min/.test(e.path),
  );
  assert.throws(
    () => form(q({ id: 'a', type: 'no_such_type' })),
    (e: unknown) => e instanceof FormSchemaError,
  );
  assert.throws(
    () => form(q({ id: 'a', type: 'dropdown', options: [] })),
    (e: unknown) => e instanceof FormSchemaError && /options/.test(e.path),
  );
  assert.throws(
    () => form(q({ id: 'a', label: 'x'.repeat(201) })),
    (e: unknown) => e instanceof FormSchemaError && /label/.test(e.path),
  );
  assert.throws(
    () => form(q({ id: 'a', type: 'dropdown', options: Array.from({ length: 101 }, (_, i) => `o${i}`) })),
    FormSchemaError,
  );
  assert.throws(
    () => form(q({ id: 'a', showIf: { questionId: 'b' } })),
    (e: unknown) => e instanceof FormSchemaError && /showIf/.test(e.path),
  );
  assert.throws(
    () => form(q({ id: 'a', showIf: { questionId: 'b', equals: 'x', includes: 'y' } })),
    FormSchemaError,
  );
});

test('parseFormSchema rejects unsafe ids, too many questions and non-objects', () => {
  for (const id of ['__proto__', 'constructor', 'prototype', 'has.dot', '1abc', '', 'a b']) {
    assert.throws(() => form(q({ id })), FormSchemaError, id);
  }
  const many = Array.from({ length: 101 }, (_, i) => q({ id: `q${i}` }));
  assert.throws(() => form(...many), FormSchemaError);
  for (const bad of [null, undefined, 5, 'x', [], { sections: 'x' }, { sections: [] }]) {
    assert.throws(() => parseFormSchema(bad), FormSchemaError);
  }
  const huge = { sections: Array.from({ length: 100_000 }, () => ({})) };
  assert.throws(() => parseFormSchema(huge), FormSchemaError);
});

test('parseFormSchema does not let __proto__ keys pollute', () => {
  const parsed = parseFormSchema(
    JSON.parse(
      '{"__proto__":{"polluted":true},"sections":[{"id":"s","title":"T","__proto__":{"x":1},"questions":[{"id":"a","label":"A","type":"short_text","__proto__":{"y":1}}]}]}',
    ),
  );
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, '__proto__'), false);
});

// Budget-style limits (number of quantifiers, repeating quantifiers) were removed when custom regexes moved
// to the linear-time matcher in ./safe-regex.ts: cost is bounded by construction, so these are now accepted.
test('serialized schema over 256 KB is rejected', () => {
  const questions = Array.from({ length: 30 }, (_, i) =>
    q({
      id: `q${i}`,
      type: 'dropdown',
      options: Array.from({ length: 100 }, (_, j) => `${'x'.repeat(140)}${j}`),
    }),
  );
  assert.throws(
    () => form(...questions),
    (e: unknown) => e instanceof FormSchemaError && /256 KB/.test(e.message),
  );
  const circular: Record<string, unknown> = { sections: [] };
  circular.self = circular;
  assert.throws(() => parseFormSchema(circular), FormSchemaError);
});
