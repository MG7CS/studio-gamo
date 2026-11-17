import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptAttribute,
  acceptedTypesLabel,
  asValues,
  buildFieldId,
  checkboxLimitHint,
  computeVisibility,
  conditionValueFromRaw,
  decodeShowIfRules,
  effectiveMaxMb,
  encodeShowIfRules,
  errorsByQuestion,
  evaluateShowIf,
  fileInputName,
  gridFieldName,
  gridHint,
  linkAlternativeFor,
  linkHint,
  otherFieldName,
  providerNames,
  recordReader,
  showIfAttributes,
  showIfFromAttributes,
  splitParagraphs,
  summaryEntries,
  textInputConfig,
  turnstileActionFor,
  uploadFieldName,
  visibilityForRaw,
  type AnswerLookup,
  type DynFormSchema,
  type DynQuestion,
  type DynQuestionOf,
  type DynSection,
} from './dynamic-form.ts';
import { PARITY_CASES, choice, file, link, rule, all, any, target, text } from './dynamic-form.fixtures.ts';

test('field names follow the server conventions', () => {
  assert.equal(otherFieldName('instrument'), 'instrument.other');
  assert.equal(gridFieldName('days', 2), 'days.2');
  assert.equal(uploadFieldName('video'), 'video.upload');
  assert.equal(fileInputName('video'), 'video.file');
});

test('field ids never collide with ids the primitives derive', () => {
  const ids = new Set<string>();
  const derived = [
    '',
    '-hint',
    '-error',
    '-legend',
    '-0',
    '-1',
    '-other',
    '-other-text',
    '-ends',
    '-row-0',
    '-count',
  ];
  for (const q of ['x', 'x-hint', 'x-error', 'x-other', 'x_', 'x-0', 'x-row-0']) {
    for (const suffix of derived) {
      const id = `${buildFieldId('df', q)}${suffix}`;
      assert.ok(!ids.has(id), `duplicate id ${id}`);
      ids.add(id);
    }
  }
});

test('turnstile action is safe and at most 32 characters', () => {
  assert.equal(turnstileActionFor('worship-apply'), 'form_worship-apply');
  assert.match(turnstileActionFor('a'.repeat(60)), /^[A-Za-z0-9_-]{1,32}$/);
  assert.equal(turnstileActionFor('weird slug/é').length <= 32, true);
  assert.match(turnstileActionFor('weird slug/é'), /^[A-Za-z0-9_-]+$/);
});

test('asValues normalises string, list and absent values', () => {
  assert.deepEqual(asValues(undefined), []);
  assert.deepEqual(asValues('a'), ['a']);
  assert.deepEqual(asValues(['a', 'b']), ['a', 'b']);
});

// ---------------------------------------------------------------------------
// Show-if
// ---------------------------------------------------------------------------

test('evaluateShowIf: a missing group holds; unknown sources fail closed; null is "unanswered"', () => {
  const lookup: AnswerLookup = (id) => (id === 'shown-empty' ? null : id === 'text' ? 'yes' : undefined);
  assert.equal(evaluateShowIf(undefined, lookup), true);
  assert.equal(evaluateShowIf(all(rule('hidden', 'neq', 'x')), lookup), false);
  assert.equal(evaluateShowIf(all(rule('shown-empty', 'neq', 'x')), lookup), true);
  assert.equal(evaluateShowIf(all(rule('shown-empty', 'answered')), lookup), false);
  assert.equal(evaluateShowIf(all(rule('text', 'eq', 'yes')), lookup), true);
  assert.equal(evaluateShowIf(any(rule('text', 'eq', 'no'), rule('text', 'in', ['yes'])), lookup), true);
  assert.equal(evaluateShowIf(all(rule('text', 'eq', 'no'), rule('text', 'in', ['yes'])), lookup), false);
});

test('evaluateShowIf: list sources compare as the server does', () => {
  const lookup: AnswerLookup = (id) =>
    id === 'one' ? ['a'] : id === 'two' ? ['a', 'b'] : id === 'flag' ? true : undefined;
  assert.equal(evaluateShowIf(all(rule('one', 'eq', 'a')), lookup), true);
  assert.equal(evaluateShowIf(all(rule('two', 'eq', 'a')), lookup), false);
  assert.equal(evaluateShowIf(all(rule('two', 'neq', 'a')), lookup), true);
  assert.equal(evaluateShowIf(all(rule('two', 'in', ['b', 'z'])), lookup), true);
  assert.equal(evaluateShowIf(all(rule('flag', 'eq', 'true')), lookup), false);
  assert.equal(evaluateShowIf(all(rule('flag', 'neq', 'true')), lookup), true);
  assert.equal(evaluateShowIf(all(rule('flag', 'in', ['true'])), lookup), false);
  assert.equal(evaluateShowIf(all(rule('flag', 'answered')), lookup), true);
});

test('the shared parity table: browser-side visibility matches the expected outcome', () => {
  for (const c of PARITY_CASES) {
    const counts = Object.fromEntries(Object.entries(c.uploads ?? {}).map(([id, list]) => [id, list.length]));
    const visibility = visibilityForRaw(c.schema, c.raw, counts);
    for (const [id, expected] of Object.entries(c.expectVisible)) {
      assert.equal(visibility.shown.get(id), expected, `${c.name}: ${id}`);
      assert.equal(visibility.display.get(id), expected, `${c.name}: display ${id}`);
    }
  }
});

test('computeVisibility: statements are displayed by their rules but are never sources', () => {
  const schema: DynFormSchema = {
    sections: [
      {
        id: 's',
        title: 'S',
        questions: [
          choice('c', ['Yes', 'No']),
          {
            required: false,
            id: 'note',
            label: 'Note',
            type: 'statement',
            showIf: all(rule('c', 'eq', 'Yes')),
          },
          target('t1', all(rule('note', 'neq', 'x'))),
        ],
      },
    ],
  };
  const yes = visibilityForRaw(schema, { c: 'Yes' });
  assert.equal(yes.display.get('note'), true);
  assert.equal(yes.shown.has('note'), false);
  assert.equal(yes.shown.get('t1'), false);
  const no = visibilityForRaw(schema, { c: 'No' });
  assert.equal(no.display.get('note'), false);
});

test('computeVisibility: the first of two questions sharing an id decides', () => {
  const schema: DynFormSchema = {
    sections: [
      { id: 's', title: 'S', questions: [target('t1', all(rule('nobody', 'answered'))), target('t1')] },
    ],
  };
  assert.equal(visibilityForRaw(schema, {}).shown.get('t1'), false);
});

test('computeVisibility: a section with the same id is evaluated once', () => {
  const sections = [
    { id: 'a', showIf: all(rule('x', 'answered')), questions: [] },
    { id: 'a', questions: [] },
  ];
  const result = computeVisibility(sections, () => null);
  assert.equal(result.sections.get('a'), false);
});

// ---------------------------------------------------------------------------
// conditionValueFromRaw
// ---------------------------------------------------------------------------

const src = (id: string, type: DynQuestion['type'], rowCount?: number) => ({ id, type, rowCount });

test('conditionValueFromRaw: text kinds trim, strip control characters and treat blank as unanswered', () => {
  const reader = recordReader({
    a: '  hello\u0000 ',
    b: ' \n ',
    p: 'line one\nline two',
    d: '2026-12-24 18:30',
    t: '18:30',
  });
  assert.equal(conditionValueFromRaw(src('a', 'short_text'), reader), 'hello');
  assert.equal(conditionValueFromRaw(src('b', 'short_text'), reader), null);
  assert.equal(conditionValueFromRaw(src('missing', 'dropdown'), reader), null);
  assert.equal(conditionValueFromRaw(src('p', 'paragraph'), reader), 'line one\nline two');
  assert.equal(conditionValueFromRaw(src('d', 'date'), reader), '2026-12-24T18:30');
  assert.equal(conditionValueFromRaw(src('t', 'time'), reader), '18:30');
});

test('conditionValueFromRaw: choice "Other" resolves to the typed text', () => {
  const picked = recordReader({ c: '__other__', 'c.other': ' Banjo ' });
  assert.equal(conditionValueFromRaw(src('c', 'multiple_choice'), picked), 'Banjo');
  const blank = recordReader({ c: '__other__', 'c.other': '' });
  assert.equal(conditionValueFromRaw(src('c', 'multiple_choice'), blank), '__other__');
  const boxes = recordReader({ b: ['Piano', '__other__', 'Piano'], 'b.other': 'Banjo' });
  assert.deepEqual(conditionValueFromRaw(src('b', 'checkboxes'), boxes), ['Piano', 'Banjo']);
  assert.equal(conditionValueFromRaw(src('b', 'checkboxes'), recordReader({})), null);
  assert.equal(conditionValueFromRaw(src('b', 'checkboxes'), recordReader({ b: '__other__' })), '__other__');
  assert.equal(
    conditionValueFromRaw(src('b', 'checkboxes'), recordReader({ b: ['Piano', '__other__'] })),
    null,
  );
});

test('conditionValueFromRaw: grids, uploads and links are "answered" only', () => {
  const reader = recordReader({ 'g.1': 'Col 2', l: 'https://x.test' }, { f: 2 });
  assert.equal(conditionValueFromRaw(src('g', 'choice_grid', 3), reader), true);
  assert.equal(conditionValueFromRaw(src('g', 'choice_grid', 1), reader), null);
  assert.equal(conditionValueFromRaw(src('g2', 'checkbox_grid', 3), reader), null);
  assert.equal(conditionValueFromRaw(src('f', 'file_upload'), reader), true);
  assert.equal(conditionValueFromRaw(src('f2', 'file_upload'), reader), null);
  assert.equal(conditionValueFromRaw(src('l', 'link'), reader), true);
  assert.equal(conditionValueFromRaw(src('n', 'statement'), reader), null);
});

// ---------------------------------------------------------------------------
// Attribute encoding
// ---------------------------------------------------------------------------

test('show-if rules survive the attribute encoding, including awkward values', () => {
  const rules = [
    rule('a', 'eq', 'Yes, please; "now"'),
    rule('b', 'in', ['x,y', 'z;w', 'é ü', '100%']),
    rule('c', 'answered'),
    rule('d', 'neq', ''),
  ];
  const encoded = encodeShowIfRules(rules);
  assert.ok(!/[<>"']/.test(encoded), 'no markup characters in the attribute');
  assert.deepEqual(decodeShowIfRules(encoded), [
    { questionId: 'a', op: 'eq', value: 'Yes, please; "now"' },
    { questionId: 'b', op: 'in', value: ['x,y', 'z;w', 'é ü', '100%'] },
    { questionId: 'c', op: 'answered' },
    { questionId: 'd', op: 'neq', value: '' },
  ]);
});

test('unreadable show-if attributes decode to null (the question stays visible)', () => {
  for (const bad of [
    undefined,
    null,
    '',
    'a',
    'a,bogus,x',
    'a,eq',
    'a,eq,x,y',
    'a,in',
    '%E0%A4%A,eq,x',
    ';;',
  ]) {
    assert.equal(decodeShowIfRules(bad), null, String(bad));
  }
});

test('showIfAttributes and showIfFromAttributes round-trip a group', () => {
  assert.deepEqual(showIfAttributes(undefined), {});
  const group = any(rule('a', 'eq', 'x'), rule('b', 'answered'));
  const attrs = showIfAttributes(group);
  assert.equal(attrs['data-show-join'], 'any');
  assert.deepEqual(showIfFromAttributes(attrs['data-show-join'], attrs['data-show-rules']), {
    join: 'any',
    rules: [
      { questionId: 'a', op: 'eq', value: 'x' },
      { questionId: 'b', op: 'answered' },
    ],
  });
  assert.equal(showIfFromAttributes('all', null), undefined);
});

// ---------------------------------------------------------------------------
// Hints and configuration
// ---------------------------------------------------------------------------

const shortText = (extra: Partial<DynQuestionOf<'short_text'>> = {}): DynQuestionOf<'short_text'> => ({
  required: false,
  id: 'q',
  label: 'Q',
  type: 'short_text',
  ...extra,
});

test('text inputs get the right type, inputmode and autocomplete', () => {
  assert.deepEqual(textInputConfig(shortText({ validation: { kind: 'email' } })), {
    type: 'email',
    inputmode: 'email',
    autocomplete: 'email',
  });
  assert.equal(textInputConfig(shortText({ validation: { kind: 'phone' } })).type, 'tel');
  assert.equal(textInputConfig(shortText({ validation: { kind: 'url' } })).inputmode, 'url');
  assert.equal(
    textInputConfig(shortText({ validation: { kind: 'postal_code' } })).autocomplete,
    'postal-code',
  );
  const number = textInputConfig(
    shortText({ validation: { kind: 'number', min: 1, max: 9, integer: true } }),
  );
  assert.equal(number.inputmode, 'numeric');
  assert.match(number.hint ?? '', /whole number.*Between 1 and 9/);
  assert.equal(textInputConfig(shortText({ validation: { kind: 'number' } })).inputmode, 'decimal');
  assert.equal(textInputConfig(shortText({ bind: 'contact.name' })).autocomplete, 'name');
  assert.equal(textInputConfig(shortText({ bind: 'contact.phone' })).type, 'tel');
  assert.deepEqual(textInputConfig(shortText()), {
    type: 'text',
    inputmode: undefined,
    autocomplete: undefined,
  });
});

test('hints state what the server enforces', () => {
  assert.equal(checkboxLimitHint({ kind: 'exactly', n: 2 }), 'Choose exactly 2.');
  assert.equal(checkboxLimitHint({ kind: 'at_least', n: 2 }), 'Choose at least 2.');
  assert.equal(checkboxLimitHint({ kind: 'at_most', n: 3 }), 'Choose up to 3.');
  assert.equal(checkboxLimitHint(undefined), undefined);
  assert.equal(
    gridHint({ type: 'choice_grid', requireEachRow: true, onePerColumn: true }),
    'Choose one answer in each row. Answer every row. Choose each column only once.',
  );
  assert.equal(
    gridHint({ type: 'checkbox_grid', requireEachRow: false, onePerColumn: false }),
    'Choose any answers in each row.',
  );
  assert.equal(providerNames(), 'YouTube, Vimeo, Google Drive or Dropbox');
  assert.equal(providerNames(['vimeo']), 'Vimeo');
  assert.equal(linkHint(['youtube', 'vimeo']), 'A YouTube or Vimeo link that starts with https://.');
});

test('statement bodies split on blank lines and stay plain text', () => {
  assert.deepEqual(splitParagraphs('One.\n\nTwo\nstill two.\n \n\n  Three.  '), [
    'One.',
    'Two\nstill two.',
    'Three.',
  ]);
  assert.deepEqual(splitParagraphs('<b>x</b>'), ['<b>x</b>']);
  assert.deepEqual(splitParagraphs(undefined), []);
  assert.deepEqual(splitParagraphs('   '), []);
});

test('file questions state types, limits and a link alternative for video', () => {
  assert.equal(acceptedTypesLabel(['video', 'pdf', 'document']), 'video (MP4, MOV or WebM) or PDF');
  assert.match(acceptAttribute(['image', 'pdf']), /image\/jpeg.*\.heic.*application\/pdf,\.pdf$/);
  assert.equal(effectiveMaxMb({ accept: ['image'], maxMb: 50 }), 10);
  assert.equal(effectiveMaxMb({ accept: ['video'], maxMb: 200 }), 200);
  assert.equal(effectiveMaxMb({ accept: ['video'], maxMb: 500 }), 500);

  const video = { ...(file('v') as DynQuestionOf<'file_upload'>), accept: ['video' as const] };
  const pdf = file('p') as DynQuestionOf<'file_upload'>;
  const section: DynSection = {
    id: 's',
    title: 'S',
    questions: [link('before'), video, text('mid'), link('after'), pdf],
  };
  assert.equal(linkAlternativeFor(section, video)?.id, 'after');
  assert.equal(linkAlternativeFor(section, pdf), null);
  assert.equal(linkAlternativeFor({ ...section, questions: [video] }, video), null);
  assert.equal(linkAlternativeFor({ ...section, questions: [link('only'), video] }, video)?.id, 'only');
});

test('error helpers keep the first message and link each to its field', () => {
  const schema: DynFormSchema = {
    sections: [{ id: 's', title: 'S', questions: [text('name'), choice('c', ['a'])] }],
  };
  const errors = [
    { questionId: 'c', message: 'This question is required.' },
    { questionId: 'name', message: 'Enter a name.' },
    { questionId: 'name', message: 'second' },
    { questionId: 'gone', message: 'Unknown question problem.' },
  ];
  assert.deepEqual(errorsByQuestion(errors), {
    c: 'This question is required.',
    name: 'Enter a name.',
    gone: 'Unknown question problem.',
  });
  assert.deepEqual(summaryEntries(schema, errors, 'df'), [
    { message: 'Text name: Enter a name.', fieldId: 'df_name_' },
    { message: 'Choice c: This question is required.', fieldId: 'df_c_' },
    { message: 'Unknown question problem.' },
  ]);
});
