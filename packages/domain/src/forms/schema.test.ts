import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BIND_KEYS,
  FORM_KINDS,
  FormSchemaError,
  QUESTION_TYPES,
  REQUIRED_BINDS,
  checkPublishable,
  FORM_LIMITS,
  isSafeRegexPattern,
  parseFormSchema,
} from './schema.ts';

const q = (extra: Record<string, unknown>) => ({ id: 'q1', label: 'Question', type: 'short_text', ...extra });
const form = (...questions: Record<string, unknown>[]) =>
  parseFormSchema({ sections: [{ id: 's1', title: 'Section', questions }] });
const errorsOf = (kind: Parameters<typeof checkPublishable>[0], schema: ReturnType<typeof form>) =>
  checkPublishable(kind, schema).errors;
const warningsOf = (kind: Parameters<typeof checkPublishable>[0], schema: ReturnType<typeof form>) =>
  checkPublishable(kind, schema).warnings;
const group = (...rules: Record<string, unknown>[]) => ({ join: 'all', rules });

test('constants list the approved types, binds and kinds', () => {
  assert.equal(QUESTION_TYPES.length, 14);
  assert.deepEqual([...FORM_KINDS].sort(), [
    'church_request',
    'contact',
    'musician_application',
    'partner_interest',
    'production_request',
    'technician_application',
  ]);
  assert.equal(BIND_KEYS.length, 11);
  for (const kind of FORM_KINDS) {
    assert.ok(REQUIRED_BINDS[kind].length >= 2);
    for (const b of REQUIRED_BINDS[kind]) assert.ok(BIND_KEYS.includes(b));
  }
});

test('parseFormSchema accepts every question type with defaults applied', () => {
  const schema = form(
    q({ id: 'a', type: 'short_text' }),
    q({ id: 'b', type: 'paragraph' }),
    q({ id: 'c', type: 'multiple_choice', options: ['x', 'y'], other: true, shuffle: true }),
    q({ id: 'd', type: 'checkboxes', options: ['x', 'y'], limit: { kind: 'at_least', n: 2 } }),
    q({ id: 'e', type: 'dropdown', options: ['x'] }),
    q({ id: 'f', type: 'file_upload', accept: ['image', 'pdf'], maxFiles: 3, maxMb: 10 }),
    q({ id: 'g', type: 'linear_scale', min: 1, max: 5, minLabel: 'Low', maxLabel: 'High' }),
    q({ id: 'h', type: 'rating', max: 5 }),
    q({ id: 'i', type: 'choice_grid', rows: ['r1'], columns: ['c1', 'c2'] }),
    q({ id: 'j', type: 'checkbox_grid', rows: ['r1'], columns: ['c1', 'c2'], onePerColumn: true }),
    q({ id: 'k', type: 'date', includeYear: false, includeTime: true }),
    q({ id: 'l', type: 'time', mode: 'duration' }),
    q({ id: 'm', type: 'link' }),
    q({ id: 'n', type: 'statement', label: 'Read this' }),
  );
  const questions = schema.sections[0]!.questions;
  assert.equal(questions.length, 14);
  assert.equal(questions[0]!.required, false);
  assert.deepEqual(
    questions.map((x) => x.type),
    [...QUESTION_TYPES],
  );
});

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

test('checkPublishable: missing required binds are listed', () => {
  const problems = errorsOf('musician_application', form(q({ id: 'name', bind: 'contact.name' })));
  assert.ok(problems.some((p) => p.includes('contact.email')));
  assert.ok(problems.some((p) => p.includes('roster.roles')));
  assert.ok(!problems.some((p) => p.includes('contact.name')));
});

test('checkPublishable: a complete contact form has no problems', () => {
  const ok = form(
    q({ id: 'name', label: 'Your name', bind: 'contact.name', required: true }),
    q({ id: 'email', label: 'Your email', bind: 'contact.email', required: true }),
    q({ id: 'msg', label: 'Message', type: 'paragraph' }),
  );
  assert.deepEqual(checkPublishable('contact', ok), { errors: [], warnings: [] });
});

test('checkPublishable: duplicate ids, bad showIf references, duplicate binds', () => {
  const base = [q({ id: 'name', bind: 'contact.name' }), q({ id: 'email', bind: 'contact.email' })];
  const dup = form(...base, q({ id: 'name' }));
  assert.ok(errorsOf('contact', dup).some((p) => /duplicate/i.test(p) && p.includes('name')));

  const unknown = form(...base, q({ id: 'x', showIf: group({ questionId: 'nope', op: 'eq', value: 'a' }) }));
  assert.ok(errorsOf('contact', unknown).some((p) => /unknown/i.test(p)));

  const later = form(
    ...base,
    q({ id: 'x', showIf: group({ questionId: 'y', op: 'eq', value: 'a' }) }),
    q({ id: 'y', type: 'dropdown', options: ['a'] }),
  );
  assert.ok(errorsOf('contact', later).some((p) => /earlier|later/i.test(p)));

  const self = form(...base, q({ id: 'x', showIf: group({ questionId: 'x', op: 'eq', value: 'a' }) }));
  assert.ok(errorsOf('contact', self).length > 0);

  const twice = form(...base, q({ id: 'again', label: 'Again', bind: 'contact.name' }));
  assert.ok(warningsOf('contact', twice).some((p) => /more than one/i.test(p)));
  assert.ok(!errorsOf('contact', twice).some((p) => /more than one/i.test(p)));

  const badOption = form(
    ...base,
    q({ id: 'c', type: 'dropdown', options: ['a', 'b'] }),
    q({ id: 'x', showIf: group({ questionId: 'c', op: 'eq', value: 'zzz' }) }),
  );
  assert.ok(errorsOf('contact', badOption).some((p) => /option/i.test(p)));
});

test('checkPublishable: binds on non-answerable types and bad ranges are flagged', () => {
  const base = [q({ id: 'name', bind: 'contact.name' }), q({ id: 'email', bind: 'contact.email' })];
  const onFile = form(...base, q({ id: 'f', type: 'file_upload', accept: ['video'], bind: 'roster.city' }));
  assert.ok(errorsOf('contact', onFile).some((p) => /bind/i.test(p)));
  const range = form(...base, q({ id: 'n', validation: { kind: 'number', min: 10, max: 1 } }));
  assert.ok(errorsOf('contact', range).some((p) => /min/i.test(p)));
  const dupOpts = form(...base, q({ id: 'd', type: 'dropdown', options: ['a', 'A ', 'b'] }));
  assert.ok(errorsOf('contact', dupOpts).some((p) => /duplicate option/i.test(p)));
});

test('checkPublishable: unsafe or long regex patterns are refused', () => {
  const base = [q({ id: 'name', bind: 'contact.name' }), q({ id: 'email', bind: 'contact.email' })];
  for (const pattern of [
    '(a+)+$',
    '(a|a)*b',
    '(\\w+\\s?)*$',
    '^(a*)*$',
    '(.*a){20}',
    '(a)\\1',
    '[',
    '(?=a)b',
    '(?<!a)b',
    'a(?!b)',
  ]) {
    const f = form(...base, q({ id: 'r', validation: { kind: 'regex', pattern } }));
    assert.ok(
      errorsOf('contact', f).some((p) => /pattern|regex/i.test(p)),
      pattern,
    );
  }
  for (const pattern of [
    '^[A-Z]{3}-\\d{4}$',
    '^\\d+-\\d+$',
    '^(\\d{3}-){2}\\d{4}$',
    '^(?:GW|GP)-\\d+$',
    '^[a-z ]+$',
  ]) {
    const f = form(...base, q({ id: 'r', validation: { kind: 'regex', pattern } }));
    assert.deepEqual(errorsOf('contact', f), [], pattern);
    assert.equal(isSafeRegexPattern(pattern), true, pattern);
  }
  assert.equal(isSafeRegexPattern('.*.*.*.*x'), false);
  assert.equal(isSafeRegexPattern('x'.repeat(100)), true);
  assert.equal(isSafeRegexPattern('x'.repeat(101)), false);
  assert.throws(
    () => form(q({ validation: { kind: 'regex', pattern: 'x'.repeat(101) } })),
    (e: unknown) => e instanceof FormSchemaError && /pattern/.test(e.path),
  );
});

test('checkPublishable: total question count is limited', () => {
  const sections = Array.from({ length: 11 }, (_, s) => ({
    id: `s${s}`,
    title: 'S',
    questions: Array.from({ length: 10 }, (_, i) => q({ id: `q${s}_${i}` })),
  }));
  assert.throws(() => parseFormSchema({ sections }), FormSchemaError);
});

test('FORM_LIMITS carry the agreed ceilings', () => {
  assert.equal(FORM_LIMITS.maxLabel, 200);
  assert.equal(FORM_LIMITS.maxHelp, 500);
  assert.equal(FORM_LIMITS.maxOptionLabel, 150);
  assert.equal(FORM_LIMITS.maxOptions, 100);
  assert.equal(FORM_LIMITS.maxGridAxis, 20);
  assert.equal(FORM_LIMITS.maxQuestions, 100);
  assert.equal(FORM_LIMITS.maxSections, 20);
  assert.equal(FORM_LIMITS.maxShowIfRules, 10);
  assert.equal(FORM_LIMITS.maxRegex, 100);
  assert.equal(FORM_LIMITS.maxRegexTested, 500);
  assert.equal(FORM_LIMITS.maxSchemaBytes, 256 * 1024);
});

test('limits reject at the edge and never truncate', () => {
  assert.doesNotThrow(() => form(q({ label: 'x'.repeat(200), help: 'h'.repeat(500) })));
  assert.throws(
    () => form(q({ help: 'h'.repeat(501) })),
    (e: unknown) => e instanceof FormSchemaError && /help/.test(e.path),
  );
  assert.doesNotThrow(() =>
    form(q({ type: 'dropdown', options: Array.from({ length: 100 }, (_, i) => `o${i}`) })),
  );
  assert.throws(() => form(q({ type: 'dropdown', options: ['x'.repeat(151)] })), FormSchemaError);
  assert.doesNotThrow(() => form(q({ type: 'dropdown', options: ['x'.repeat(150)] })));
  const axis = (n: number) => Array.from({ length: n }, (_, i) => `a${i}`);
  assert.doesNotThrow(() => form(q({ type: 'choice_grid', rows: axis(20), columns: axis(20) })));
  assert.throws(() => form(q({ type: 'choice_grid', rows: axis(21), columns: axis(2) })), FormSchemaError);
  assert.throws(() => form(q({ type: 'checkbox_grid', rows: axis(2), columns: axis(21) })), FormSchemaError);
  const sections = Array.from({ length: 21 }, (_, i) => ({ id: `s${i}`, title: 'S', questions: [] }));
  assert.throws(() => parseFormSchema({ sections }), FormSchemaError);
  assert.throws(() => form(q({ label: '' })), FormSchemaError);
});

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

test('showIf rule groups: shapes, ops and the 10-rule ceiling', () => {
  const parsed = form(
    q({
      id: 'a',
      showIf: {
        join: 'any',
        rules: [
          { questionId: 'b', op: 'in', value: ['x', 'y'] },
          { questionId: 'c', op: 'answered' },
        ],
      },
    }),
  );
  const cond = parsed.sections[0]!.questions[0]!.showIf!;
  assert.equal(cond.join, 'any');
  assert.equal(cond.rules.length, 2);
  // join defaults to all
  assert.equal(
    form(q({ showIf: { rules: [{ questionId: 'b', op: 'neq', value: 'x' }] } })).sections[0]!.questions[0]!
      .showIf!.join,
    'all',
  );
  const rules = (n: number) => Array.from({ length: n }, () => ({ questionId: 'b', op: 'answered' }));
  assert.doesNotThrow(() => form(q({ showIf: { join: 'all', rules: rules(10) } })));
  assert.throws(() => form(q({ showIf: { join: 'all', rules: rules(11) } })), FormSchemaError);
  assert.throws(() => form(q({ showIf: { join: 'all', rules: [] } })), FormSchemaError);
  assert.throws(() => form(q({ showIf: { join: 'maybe', rules: rules(1) } })), FormSchemaError);
  assert.throws(() => form(q({ showIf: { rules: [{ questionId: 'b', op: 'eq' }] } })), FormSchemaError);
  assert.throws(
    () => form(q({ showIf: { rules: [{ questionId: 'b', op: 'neq', value: ['x'] }] } })),
    FormSchemaError,
  );
  assert.throws(() => form(q({ showIf: { rules: [{ questionId: 'b', op: 'in' }] } })), FormSchemaError);
  assert.throws(
    () => form(q({ showIf: { rules: [{ questionId: 'b', op: 'like', value: 'x' }] } })),
    FormSchemaError,
  );
});

test('legacy showIf {questionId, equals|includes} converts to a rule group', () => {
  const eq = form(q({ showIf: { questionId: 'b', equals: 'x' } })).sections[0]!.questions[0]!.showIf;
  assert.deepEqual(eq, { join: 'all', rules: [{ questionId: 'b', op: 'eq', value: 'x' }] });
  const inc = form(q({ showIf: { questionId: 'b', includes: 'y' } })).sections[0]!.questions[0]!.showIf;
  assert.deepEqual(inc, { join: 'all', rules: [{ questionId: 'b', op: 'in', value: ['y'] }] });
});

test('sections may carry showIf', () => {
  const schema = parseFormSchema({
    sections: [
      { id: 's1', title: 'One', questions: [q({ id: 'a' })] },
      {
        id: 's2',
        title: 'Two',
        showIf: { join: 'all', rules: [{ questionId: 'a', op: 'answered' }] },
        questions: [q({ id: 'b', label: 'B' })],
      },
    ],
  });
  assert.equal(schema.sections[1]!.showIf!.rules[0]!.questionId, 'a');
  const legacy = parseFormSchema({
    sections: [{ id: 's1', title: 'One', showIf: { questionId: 'a', equals: 'x' }, questions: [] }],
  });
  assert.equal(legacy.sections[0]!.showIf!.rules[0]!.op, 'eq');
});

test('checkPublishable: showIf sources must be earlier (forward, self and cycles refused)', () => {
  const base = [q({ id: 'name', bind: 'contact.name' }), q({ id: 'email', bind: 'contact.email' })];
  const cycle = form(
    ...base,
    q({ id: 'a', label: 'A', showIf: group({ questionId: 'b', op: 'answered' }) }),
    q({ id: 'b', label: 'B', showIf: group({ questionId: 'a', op: 'answered' }) }),
  );
  assert.ok(errorsOf('contact', cycle).length >= 1);
  const multi = form(
    ...base,
    q({ id: 'x', label: 'X' }),
    q({
      id: 'a',
      label: 'A',
      showIf: {
        join: 'any',
        rules: [
          { questionId: 'x', op: 'answered' },
          { questionId: 'later', op: 'answered' },
        ],
      },
    }),
    q({ id: 'later', label: 'Later' }),
  );
  assert.ok(errorsOf('contact', multi).some((p) => /later/.test(p) && /earlier/.test(p)));
  const ok = form(
    ...base,
    q({ id: 'x', label: 'X' }),
    q({ id: 'a', label: 'A', showIf: group({ questionId: 'x', op: 'answered' }) }),
  );
  assert.deepEqual(errorsOf('contact', ok), []);
  // section showIf must point before the section
  const sectionAfter = parseFormSchema({
    sections: [
      {
        id: 's1',
        title: 'One',
        questions: [
          q({ id: 'name', label: 'N', bind: 'contact.name' }),
          q({ id: 'email', label: 'E', bind: 'contact.email' }),
        ],
      },
      {
        id: 's2',
        title: 'Two',
        showIf: group({ questionId: 'inside', op: 'answered' }),
        questions: [q({ id: 'inside', label: 'I' })],
      },
      { id: 's3', title: 'Three', showIf: group({ questionId: 'name', op: 'answered' }), questions: [] },
    ],
  });
  const problems = checkPublishable('contact', sectionAfter).errors;
  assert.equal(problems.filter((p) => /Section/.test(p)).length, 1);
  assert.ok(problems.some((p) => /Section "s2"/.test(p)));
});

test('checkPublishable: errors vs warnings are split', () => {
  const base = [
    q({ id: 'name', label: 'Name', bind: 'contact.name' }),
    q({ id: 'email', label: 'Email', bind: 'contact.email' }),
  ];
  // warnings only: publishable
  const f = form(
    ...base,
    q({ id: 'a', label: 'Same' }),
    q({ id: 'b', label: ' same ' }),
    q({ id: 'c', label: 'Pick', type: 'dropdown', options: ['only'] }),
    q({ id: 'd', label: 'Watch', type: 'link' }),
    q({ id: 'e', label: 'Click here!', type: 'link' }),
    q({ id: 'f', label: 'Another', bind: 'contact.name' }),
    q({ id: 'g', label: 'Mix', type: 'multiple_choice', options: ['a', 'b'], other: true, otherLabel: '  ' }),
  );
  const result = checkPublishable('contact', f);
  assert.deepEqual(result.errors, []);
  const w = result.warnings.join('\n');
  assert.match(w, /duplicate label/i);
  assert.match(w, /fewer than 2 options/i);
  assert.match(w, /"e".*generic/i);
  assert.doesNotMatch(w, /"d".*generic/i);
  assert.match(w, /more than one/i);
  assert.match(w, /Other/);
  // grids without labels (hand-built schema bypassing parse)
  const grid = form(...base, q({ id: 'h', label: 'Grid', type: 'choice_grid', rows: ['r'], columns: ['c'] }));
  const raw = structuredClone(grid);
  const gq = raw.sections[0]!.questions.find((x) => x.id === 'h')!;
  if (gq.type === 'choice_grid') {
    gq.rows = [];
    gq.columns = ['  ', 'ok'];
  }
  const gw = checkPublishable('contact', raw).warnings.join('\n');
  assert.match(gw, /row/i);
  assert.match(gw, /column/i);
  // empty label warning
  const empty = structuredClone(grid);
  empty.sections[0]!.questions[0]!.label = '';
  assert.ok(checkPublishable('contact', empty).warnings.some((p) => /empty label/i.test(p)));
  // limit problems are blocking errors on hand-built schemas
  const big = structuredClone(grid);
  big.sections[0]!.questions[0]!.label = 'x'.repeat(201);
  assert.ok(checkPublishable('contact', big).errors.some((p) => /label/i.test(p)));
});
