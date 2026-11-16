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

test('short_text: plain, required and trimming', () => {
  const f = form(q({ required: true }));
  assert.deepEqual(answersOf(run(f, { q1: '  hello  ' })), { q1: 'hello' });
  assert.deepEqual(errorsOf(run(f, { q1: '   ' })), [
    { questionId: 'q1', message: 'This question is required.' },
  ]);
  assert.equal(errorsOf(run(f, {}))[0]!.questionId, 'q1');
  assert.deepEqual(answersOf(run(form(q({})), {})), {});
});

test('short_text: email, url, number between, length, text contains', () => {
  const email = form(q({ validation: { kind: 'email' } }));
  assert.equal(run(email, { q1: 'a@b.org' }).ok, true);
  assert.equal(run(email, { q1: 'nope' }).ok, false);
  assert.equal(run(email, { q1: 'a@b' }).ok, false);

  const url = form(q({ validation: { kind: 'url' } }));
  assert.equal(run(url, { q1: 'https://example.org/x' }).ok, true);
  assert.equal(run(url, { q1: 'javascript:alert(1)' }).ok, false);
  assert.equal(run(url, { q1: 'example.org' }).ok, false);

  const num = form(q({ validation: { kind: 'number', min: 1, max: 10 } }));
  assert.deepEqual(answersOf(run(num, { q1: '7' })), { q1: '7' });
  assert.equal(run(num, { q1: '11' }).ok, false);
  assert.equal(run(num, { q1: '0' }).ok, false);
  assert.equal(run(num, { q1: 'abc' }).ok, false);
  assert.equal(run(num, { q1: '1e3' }).ok, false);
  const int = form(q({ validation: { kind: 'number', integer: true } }));
  assert.equal(run(int, { q1: '2.5' }).ok, false);

  const len = form(q({ validation: { kind: 'length', min: 3, max: 5 } }));
  assert.equal(run(len, { q1: 'ab' }).ok, false);
  assert.equal(run(len, { q1: 'abcdef' }).ok, false);
  assert.equal(run(len, { q1: 'abcd' }).ok, true);

  const contains = form(q({ validation: { kind: 'text_contains', value: 'Amen' } }));
  assert.equal(run(contains, { q1: 'we say amen' }).ok, true);
  assert.equal(run(contains, { q1: 'we say hello' }).ok, false);
  const notContains = form(q({ validation: { kind: 'text_not_contains', value: 'spam' } }));
  assert.equal(run(notContains, { q1: 'SPAM here' }).ok, false);
});

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

test('paragraph: length and regex rules, max length', () => {
  const f = form(q({ type: 'paragraph', validation: { kind: 'length', min: 10 } }));
  assert.equal(run(f, { q1: 'short' }).ok, false);
  assert.equal(run(f, { q1: 'long enough text\nwith lines' }).ok, true);
  assert.equal(run(form(q({ type: 'paragraph' })), { q1: 'x'.repeat(5001) }).ok, false);
  const re = form(
    q({ type: 'paragraph', validation: { kind: 'regex', pattern: 'worship', message: 'Mention worship.' } }),
  );
  assert.equal(errorsOf(run(re, { q1: 'nothing' }))[0]!.message, 'Mention worship.');
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

test('checkboxes: at least / at most / exactly N, Other, dedupe', () => {
  const opts = ['Piano', 'Drums', 'Bass', 'Vocals'];
  const atLeast = form(q({ type: 'checkboxes', options: opts, limit: { kind: 'at_least', n: 2 } }));
  assert.equal(run(atLeast, { q1: ['Piano'] }).ok, false);
  assert.equal(run(atLeast, { q1: 'Piano' }).ok, false);
  assert.deepEqual(answersOf(run(atLeast, { q1: ['Piano', 'Drums'] })), { q1: ['Piano', 'Drums'] });
  assert.equal(run(atLeast, { q1: ['Piano', 'Piano'] }).ok, false, 'duplicates do not count twice');
  assert.equal(run(atLeast, { q1: ['Piano', 'Tuba'] }).ok, false);

  const atMost = form(q({ type: 'checkboxes', options: opts, limit: { kind: 'at_most', n: 1 } }));
  assert.equal(run(atMost, { q1: ['Piano', 'Drums'] }).ok, false);
  assert.equal(run(atMost, { q1: 'Piano' }).ok, true);
  assert.equal(run(atMost, {}).ok, true);

  const exactly = form(q({ type: 'checkboxes', options: opts, limit: { kind: 'exactly', n: 2 } }));
  assert.equal(run(exactly, { q1: ['Piano', 'Drums', 'Bass'] }).ok, false);
  assert.equal(run(exactly, { q1: ['Piano', 'Drums'] }).ok, true);

  const other = form(q({ type: 'checkboxes', options: opts, other: true }));
  assert.equal(run(other, { q1: ['Piano', OTHER_VALUE] }).ok, false);
  assert.deepEqual(answersOf(run(other, { q1: ['Piano', OTHER_VALUE], [otherFieldName('q1')]: 'Cello' })), {
    q1: ['Piano', 'Cello'],
  });
  assert.equal(run(form(q({ type: 'checkboxes', options: opts, required: true })), {}).ok, false);
});

test('linear_scale: range min..max, rejects 6 on 1..5, stores a number', () => {
  const f = form(q({ type: 'linear_scale', min: 1, max: 5, required: true }));
  assert.deepEqual(answersOf(run(f, { q1: '5' })), { q1: 5 });
  assert.equal(run(f, { q1: '6' }).ok, false);
  assert.equal(run(f, { q1: '0' }).ok, false);
  assert.equal(run(f, { q1: '2.5' }).ok, false);
  assert.equal(run(f, { q1: 'abc' }).ok, false);
  const zero = form(q({ type: 'linear_scale', min: 0, max: 10 }));
  assert.deepEqual(answersOf(run(zero, { q1: '0' })), { q1: 0 });
});

test('rating: 1..max', () => {
  const f = form(q({ type: 'rating', max: 5 }));
  assert.deepEqual(answersOf(run(f, { q1: '3' })), { q1: 3 });
  assert.equal(run(f, { q1: '6' }).ok, false);
  assert.equal(run(f, { q1: '0' }).ok, false);
});

test('choice_grid: require each row and one per column', () => {
  const f = form(
    q({
      type: 'choice_grid',
      rows: ['Sunday', 'Wednesday'],
      columns: ['Yes', 'No', 'Maybe'],
      requireEachRow: true,
      onePerColumn: true,
    }),
  );
  const good = answersOf(run(f, { [gridFieldName('q1', 0)]: 'Yes', [gridFieldName('q1', 1)]: 'No' }));
  assert.deepEqual(good, { q1: { Sunday: 'Yes', Wednesday: 'No' } });
  assert.equal(run(f, { [gridFieldName('q1', 0)]: 'Yes' }).ok, false, 'missing row');
  assert.equal(
    run(f, { [gridFieldName('q1', 0)]: 'Yes', [gridFieldName('q1', 1)]: 'Yes' }).ok,
    false,
    'same column twice',
  );
  assert.equal(
    run(f, { [gridFieldName('q1', 0)]: 'Nope', [gridFieldName('q1', 1)]: 'No' }).ok,
    false,
    'unknown column',
  );
  // flags off: partial and repeated answers pass; required wants at least one row
  const loose = form(q({ type: 'choice_grid', rows: ['A', 'B'], columns: ['x', 'y'], required: true }));
  assert.equal(run(loose, { [gridFieldName('q1', 0)]: 'x' }).ok, true);
  assert.equal(run(loose, { [gridFieldName('q1', 0)]: 'x', [gridFieldName('q1', 1)]: 'x' }).ok, true);
  assert.equal(run(loose, {}).ok, false);
  // row index out of range is ignored
  assert.equal(run(loose, { [gridFieldName('q1', 0)]: 'x', [gridFieldName('q1', 9)]: 'x' }).ok, true);
});

test('checkbox_grid: multiple per row, one per column, require each row', () => {
  const f = form(
    q({
      type: 'checkbox_grid',
      rows: ['Mon', 'Tue'],
      columns: ['AM', 'PM'],
      requireEachRow: true,
      onePerColumn: true,
    }),
  );
  const row = (i: number) => gridFieldName('q1', i);
  assert.deepEqual(answersOf(run(f, { [row(0)]: ['AM'], [row(1)]: 'PM' })), {
    q1: { Mon: ['AM'], Tue: ['PM'] },
  });
  assert.equal(run(f, { [row(0)]: ['AM'] }).ok, false, 'missing row');
  assert.equal(run(f, { [row(0)]: ['AM'], [row(1)]: ['AM'] }).ok, false, 'same column twice');
  assert.equal(run(f, { [row(0)]: ['AM', 'Noon'], [row(1)]: ['PM'] }).ok, false, 'unknown column');
  const loose = form(q({ type: 'checkbox_grid', rows: ['Mon', 'Tue'], columns: ['AM', 'PM'] }));
  assert.deepEqual(answersOf(run(loose, { [row(0)]: ['AM', 'PM'], [row(1)]: ['AM'] })), {
    q1: { Mon: ['AM', 'PM'], Tue: ['AM'] },
  });
  assert.deepEqual(answersOf(run(loose, {})), {});
});

test('date: year and time toggles, calendar validity', () => {
  const withYear = form(q({ type: 'date' }));
  assert.deepEqual(answersOf(run(withYear, { q1: '2026-12-25' })), { q1: '2026-12-25' });
  assert.equal(run(withYear, { q1: '12-25' }).ok, false);
  assert.equal(run(withYear, { q1: '2026-02-30' }).ok, false);
  assert.equal(run(withYear, { q1: '2026-13-01' }).ok, false);
  assert.equal(run(withYear, { q1: '2026-12-25T10:00' }).ok, false);
  const noYear = form(q({ type: 'date', includeYear: false }));
  assert.deepEqual(answersOf(run(noYear, { q1: '12-25' })), { q1: '12-25' });
  assert.equal(run(noYear, { q1: '02-29' }).ok, true);
  assert.equal(run(noYear, { q1: '02-30' }).ok, false);
  assert.equal(run(noYear, { q1: '2026-12-25' }).ok, false);
  const withTime = form(q({ type: 'date', includeTime: true }));
  assert.deepEqual(answersOf(run(withTime, { q1: '2026-12-25 18:30' })), { q1: '2026-12-25T18:30' });
  assert.equal(run(withTime, { q1: '2026-12-25' }).ok, false);
  assert.equal(run(withTime, { q1: '2026-12-25T25:00' }).ok, false);
});

test('time: clock and duration', () => {
  const clock = form(q({ type: 'time' }));
  assert.equal(run(clock, { q1: '09:30' }).ok, true);
  assert.equal(run(clock, { q1: '24:00' }).ok, false);
  assert.equal(run(clock, { q1: '9:5' }).ok, false);
  const dur = form(q({ type: 'time', mode: 'duration' }));
  assert.deepEqual(answersOf(run(dur, { q1: '01:30:00' })), { q1: '01:30:00' });
  assert.equal(run(dur, { q1: '1:75:00' }).ok, false);
  assert.equal(run(dur, { q1: '09:30' }).ok, false);
});

test('link: normalized and provider-restricted', () => {
  const f = form(q({ type: 'link', required: true }));
  assert.deepEqual(answersOf(run(f, { q1: 'https://youtu.be/dQw4w9WgXcQ' })), {
    q1: { provider: 'youtube', id: 'dQw4w9WgXcQ', canonical: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  });
  assert.equal(run(f, { q1: 'http://youtube.com/watch?v=dQw4w9WgXcQ' }).ok, false);
  assert.equal(run(f, { q1: 'https://evil.com/youtube.com' }).ok, false);
  const onlyVimeo = form(q({ type: 'link', providers: ['vimeo'] }));
  assert.equal(run(onlyVimeo, { q1: 'https://youtu.be/dQw4w9WgXcQ' }).ok, false);
  assert.equal(run(onlyVimeo, { q1: 'https://vimeo.com/123456789' }).ok, true);
});

const vid = (over: Partial<UploadRef> = {}): UploadRef => ({
  uploadId: 'u1',
  kind: 'video',
  bytes: 1000,
  ...over,
});

test('file_upload: required, kind must match accept, counts and sizes', () => {
  const f = form(
    q({ type: 'file_upload', accept: ['video', 'image'], maxFiles: 2, maxMb: 1, required: true }),
  );
  assert.equal(run(f, {}, {}).ok, false);
  assert.equal(run(f, {}, { q1: [] }).ok, false);
  assert.deepEqual(answersOf(run(f, {}, { q1: [vid()] })), { q1: [vid()] });
  assert.equal(run(f, {}, { q1: [vid({ kind: 'pdf' })] }).ok, false);
  assert.equal(run(f, {}, { q1: [vid(), vid({ uploadId: 'u2' }), vid({ uploadId: 'u3' })] }).ok, false);
  assert.equal(run(f, {}, { q1: [vid({ bytes: 2 * 1024 * 1024 })] }).ok, false);
  assert.equal(run(f, {}, { q1: [vid(), vid()] }).ok, false, 'duplicate upload id');
  assert.equal(run(f, {}, { q1: ['x'] as never }).ok, false);
  assert.equal(run(f, {}, { q1: [{ uploadId: 5, kind: 'video', bytes: 1 }] as never }).ok, false);
  const optional = form(q({ type: 'file_upload', accept: ['pdf'] }));
  assert.deepEqual(answersOf(run(optional, {}, {})), {});
  const docs = form(q({ type: 'file_upload', accept: ['document'] }));
  assert.equal(run(docs, {}, { q1: [vid({ kind: 'pdf' })] }).ok, true);
  assert.equal(run(docs, {}, { q1: [vid({ kind: 'other' })] }).ok, true);
  assert.equal(run(docs, {}, { q1: [vid({ kind: 'video' })] }).ok, false);
  // a raw string for a file question is not an upload
  assert.deepEqual(answersOf(run(optional, { q1: 'C:\\fake.pdf' }, {})), {});
});

test('showIf: hidden questions are dropped and not required', () => {
  const f = form(
    q({ id: 'role', type: 'dropdown', options: ['Teacher', 'Player'], required: true }),
    q({ id: 'grades', label: 'Grades', required: true, showIf: { questionId: 'role', equals: 'Teacher' } }),
    q({ id: 'extra', label: 'Extra', showIf: { questionId: 'grades', equals: 'x' } }),
  );
  assert.deepEqual(answersOf(run(f, { role: 'Player', grades: 'secret', extra: 'secret2' })), {
    role: 'Player',
  });
  assert.deepEqual(errorsOf(run(f, { role: 'Teacher' })), [
    { questionId: 'grades', message: 'This question is required.' },
  ]);
  assert.deepEqual(answersOf(run(f, { role: 'Teacher', grades: 'x', extra: 'yes' })), {
    role: 'Teacher',
    grades: 'x',
    extra: 'yes',
  });
  const inc = form(
    q({ id: 'inst', type: 'checkboxes', options: ['Piano', 'Drums'] }),
    q({ id: 'level', required: true, showIf: { questionId: 'inst', includes: 'Drums' } }),
  );
  assert.equal(run(inc, { inst: ['Piano'] }).ok, true);
  assert.equal(run(inc, { inst: ['Piano', 'Drums'] }).ok, false);
  assert.equal(run(inc, { inst: 'Drums', level: 'adv' }).ok, true);
});

test('showIf referencing missing or later questions hides the question (fail closed)', () => {
  const f = form(
    q({ id: 'a', required: true, showIf: { questionId: 'zzz', equals: '1' } }),
    q({ id: 'b', required: true, showIf: { questionId: 'c', equals: '1' } }),
    q({ id: 'c' }),
  );
  assert.deepEqual(answersOf(run(f, { c: '1', a: 'leak', b: 'leak' })), { c: '1' });
});

test('unknown question ids and statements are ignored', () => {
  const f = form(q({ id: 'a' }), q({ id: 'note', type: 'statement', label: 'Hello' }));
  assert.deepEqual(answersOf(run(f, { a: 'x', note: 'tamper', ghost: 'boo' })), { a: 'x' });
});

test('binds: collected from visible answers, email normalized', () => {
  const f = form(
    q({ id: 'name', bind: 'contact.name', required: true }),
    q({ id: 'email', bind: 'contact.email', required: true }),
    q({ id: 'roles', type: 'checkboxes', options: ['Piano', 'Drums'], bind: 'roster.roles' }),
    q({ id: 'city', bind: 'roster.city', showIf: { questionId: 'roles', includes: 'Piano' } }),
  );
  const result = run(f, { name: 'Ada', email: ' Ada@Example.ORG ', roles: ['Drums'], city: 'Boston' });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.binds, {
      'contact.name': 'Ada',
      'contact.email': 'ada@example.org',
      'roster.roles': ['Drums'],
    });
  }
  assert.equal(run(f, { name: 'Ada', email: 'bad', roles: [] }).ok, false);
  const phone = form(q({ id: 'p', bind: 'contact.phone' }));
  assert.equal(run(phone, { p: 'call me' }).ok, false);
  assert.equal(run(phone, { p: '+1 (555) 010-2000' }).ok, true);
});

test('errors are collected across questions in order', () => {
  const f = form(q({ id: 'a', required: true }), q({ id: 'b', required: true }));
  assert.deepEqual(
    errorsOf(run(f, {})).map((e) => e.questionId),
    ['a', 'b'],
  );
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

const group = (join: 'all' | 'any', ...rules: Record<string, unknown>[]) => ({ join, rules });

test('showIf groups: eq, neq, in, answered with all/any joins', () => {
  const f = form(
    q({ id: 'role', type: 'dropdown', options: ['Teacher', 'Player', 'Tech'] }),
    q({ id: 'inst', type: 'checkboxes', options: ['Piano', 'Drums', 'Bass'] }),
    q({ id: 'name', label: 'Name' }),
    q({
      id: 'all',
      label: 'All',
      required: true,
      showIf: group(
        'all',
        { questionId: 'role', op: 'eq', value: 'Teacher' },
        { questionId: 'name', op: 'answered' },
      ),
    }),
    q({
      id: 'any',
      label: 'Any',
      required: true,
      showIf: group(
        'any',
        { questionId: 'role', op: 'neq', value: 'Teacher' },
        { questionId: 'inst', op: 'in', value: ['Drums', 'Bass'] },
      ),
    }),
  );
  // role Teacher, no name: "all" hidden, "any" hidden (neq false, no drums)
  assert.deepEqual(answersOf(run(f, { role: 'Teacher', all: 'x', any: 'y' })), { role: 'Teacher' });
  // Teacher + name -> all required; any still hidden
  assert.deepEqual(
    errorsOf(run(f, { role: 'Teacher', name: 'Ada' })).map((e) => e.questionId),
    ['all'],
  );
  // neq: Player shows "any"; unanswered role also satisfies neq
  assert.deepEqual(
    errorsOf(run(f, { role: 'Player' })).map((e) => e.questionId),
    ['any'],
  );
  assert.deepEqual(
    errorsOf(run(f, {})).map((e) => e.questionId),
    ['any'],
  );
  // in: Teacher + Drums shows "any"
  assert.deepEqual(
    errorsOf(run(f, { role: 'Teacher', inst: ['Drums'] })).map((e) => e.questionId),
    ['any'],
  );
  assert.equal(run(f, { role: 'Teacher', inst: ['Piano'] }).ok, true);
});

test('showIf group with a hidden, unknown or later source is false (fail closed)', () => {
  const f = form(
    q({ id: 'gate', type: 'dropdown', options: ['yes', 'no'] }),
    q({ id: 'a', showIf: group('all', { questionId: 'gate', op: 'eq', value: 'yes' }) }),
    q({ id: 'b', required: true, showIf: group('all', { questionId: 'a', op: 'answered' }) }),
    q({ id: 'c', required: true, showIf: group('any', { questionId: 'a', op: 'neq', value: 'z' }) }),
    q({ id: 'd', required: true, showIf: group('all', { questionId: 'nope', op: 'neq', value: 'z' }) }),
    q({ id: 'e', required: true, showIf: group('all', { questionId: 'f', op: 'answered' }) }),
    q({ id: 'f' }),
  );
  assert.deepEqual(answersOf(run(f, { gate: 'no', a: 'x', b: 'x', c: 'x', d: 'x', e: 'x', f: 'x' })), {
    gate: 'no',
    f: 'x',
  });
});

test('answered also counts non-text answers (grid, upload, scale)', () => {
  const f = form(
    q({ id: 'g', type: 'choice_grid', rows: ['r'], columns: ['c'] }),
    q({ id: 'file', type: 'file_upload', accept: ['video'] }),
    q({ id: 'n', type: 'linear_scale', min: 1, max: 5 }),
    q({
      id: 'x',
      required: true,
      showIf: group(
        'all',
        { questionId: 'g', op: 'answered' },
        { questionId: 'file', op: 'answered' },
        { questionId: 'n', op: 'answered' },
      ),
    }),
  );
  assert.equal(run(f, {}).ok, true);
  const raw = { [gridFieldName('g', 0)]: 'c', n: '3' };
  assert.equal(run(f, raw, { file: [vid()] }).ok, false);
  assert.equal(run(f, { ...raw, x: 'ok' }, { file: [vid()] }).ok, true);
});

test('hidden section hides all its questions: dropped and not required', () => {
  const schema = parseFormSchema({
    sections: [
      {
        id: 's1',
        title: 'One',
        questions: [q({ id: 'role', type: 'dropdown', options: ['Teacher', 'Player'] })],
      },
      {
        id: 's2',
        title: 'Teaching',
        showIf: group('all', { questionId: 'role', op: 'eq', value: 'Teacher' }),
        questions: [
          q({ id: 'grades', label: 'Grades', required: true }),
          q({
            id: 'plain',
            label: 'Plain',
            required: true,
            showIf: group('all', { questionId: 'role', op: 'answered' }),
          }),
        ],
      },
      {
        id: 's3',
        title: 'Follow-up',
        questions: [
          q({
            id: 'after',
            label: 'After',
            required: true,
            showIf: group('all', { questionId: 'grades', op: 'answered' }),
          }),
        ],
      },
    ],
  });
  assert.deepEqual(answersOf(run(schema, { role: 'Player', grades: 'leak', plain: 'leak', after: 'leak' })), {
    role: 'Player',
  });
  assert.deepEqual(
    errorsOf(run(schema, { role: 'Teacher' })).map((e) => e.questionId),
    ['grades', 'plain'],
  );
  assert.deepEqual(answersOf(run(schema, { role: 'Teacher', grades: 'k', plain: 'p', after: 'a' })), {
    role: 'Teacher',
    grades: 'k',
    plain: 'p',
    after: 'a',
  });
  // legacy section showIf shape still works
  const legacy = parseFormSchema({
    sections: [
      { id: 's1', title: 'One', questions: [q({ id: 'role', type: 'dropdown', options: ['A', 'B'] })] },
      {
        id: 's2',
        title: 'Two',
        showIf: { questionId: 'role', equals: 'A' },
        questions: [q({ id: 'x', label: 'X', required: true })],
      },
    ],
  });
  assert.equal(run(legacy, { role: 'B' }).ok, true);
  assert.equal(run(legacy, { role: 'A' }).ok, false);
});

test('short_text presets: phone and US postal code', () => {
  const phone = form(q({ validation: { kind: 'phone' } }));
  assert.equal(run(phone, { q1: '+1 (555) 010-2000' }).ok, true);
  assert.equal(run(phone, { q1: '555-1234' }).ok, true);
  assert.equal(run(phone, { q1: 'call me' }).ok, false);
  assert.equal(run(phone, { q1: '12345' }).ok, false);
  const zip = form(q({ validation: { kind: 'postal_code', message: 'ZIP please.' } }));
  assert.equal(run(zip, { q1: '02134' }).ok, true);
  assert.equal(run(zip, { q1: '02134-1234' }).ok, true);
  assert.deepEqual(errorsOf(run(zip, { q1: '0213' })), [{ questionId: 'q1', message: 'ZIP please.' }]);
  assert.equal(run(zip, { q1: '02134-12' }).ok, false);
  assert.equal(run(zip, { q1: 'ABCDE' }).ok, false);
});

test('regex rule fails closed above 500 characters and never tests a prefix', () => {
  // `tail$` would match the full 600-character value, so a pass or a fail on a prefix would both be wrong:
  // the value must be refused without running the pattern.
  const f = form(q({ type: 'paragraph', validation: { kind: 'regex', pattern: 'tail$' } }));
  const long = `${'x'.repeat(596)}tail`;
  assert.equal(long.length, 600);
  assert.deepEqual(errorsOf(run(f, { q1: long })), [
    { questionId: 'q1', message: 'This answer is not in the expected format.' },
  ]);
  const exactly500 = `${'x'.repeat(496)}tail`;
  assert.equal(exactly500.length, 500);
  assert.equal(run(f, { q1: exactly500 }).ok, true);
  assert.equal(run(f, { q1: `${exactly500}x` }).ok, false);
  const g = form(
    q({ type: 'paragraph', validation: { kind: 'regex', pattern: 'worship', message: 'Too long or off.' } }),
  );
  assert.deepEqual(errorsOf(run(g, { q1: `${'x'.repeat(900)}worship` })), [
    { questionId: 'q1', message: 'Too long or off.' },
  ]);
  assert.equal(run(g, { q1: `worship ${'x'.repeat(400)}` }).ok, true);
  // a regex that would not match a prefix but matches the whole is also refused (not accepted by truncation)
  const h = form(q({ type: 'paragraph', validation: { kind: 'regex', pattern: '^x+$' } }));
  assert.equal(run(h, { q1: 'x'.repeat(501) }).ok, false);
  assert.equal(run(h, { q1: 'x'.repeat(500) }).ok, true);
});
