import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DynFormSchema, DynQuestion, DynSection } from './dynamic-form.ts';
import {
  buildScreens,
  isLightQuestion,
  nextVisibleScreen,
  type WizardScreen,
} from './dynamic-form-wizard.ts';

const base = (id: string) => ({ id, label: id, required: false });

const shortText = (id: string, validation?: { kind: 'email' }): DynQuestion => ({
  ...base(id),
  type: 'short_text',
  ...(validation ? { validation } : {}),
});
const paragraph = (id: string): DynQuestion => ({ ...base(id), type: 'paragraph' });
const dropdown = (id: string): DynQuestion => ({ ...base(id), type: 'dropdown', options: ['A', 'B'] });
const date = (id: string): DynQuestion => ({
  ...base(id),
  type: 'date',
  includeYear: true,
  includeTime: false,
});
const time = (id: string): DynQuestion => ({ ...base(id), type: 'time', mode: 'clock' });
const choice = (id: string, count: number, other = false): DynQuestion => ({
  ...base(id),
  type: 'multiple_choice',
  options: Array.from({ length: count }, (_, i) => `Option ${i + 1}`),
  other,
});
const statement = (id: string): DynQuestion => ({ ...base(id), type: 'statement', body: 'Note' });

const heavy: Record<string, DynQuestion> = {
  paragraph: paragraph('h'),
  file_upload: { ...base('h'), type: 'file_upload', accept: ['image'], maxFiles: 1, maxMb: 5 },
  choice_grid: {
    ...base('h'),
    type: 'choice_grid',
    rows: ['r'],
    columns: ['c'],
    requireEachRow: false,
    onePerColumn: false,
  },
  checkbox_grid: {
    ...base('h'),
    type: 'checkbox_grid',
    rows: ['r'],
    columns: ['c'],
    requireEachRow: false,
    onePerColumn: false,
  },
  checkboxes: { ...base('h'), type: 'checkboxes', options: ['A', 'B'], other: false },
  linear_scale: { ...base('h'), type: 'linear_scale', min: 1, max: 5 },
  rating: { ...base('h'), type: 'rating', max: 5 },
  link: { ...base('h'), type: 'link' },
};

const section = (id: string, questions: DynQuestion[]): DynSection => ({ id, title: id, questions });
const form = (...sections: DynSection[]): DynFormSchema => ({ sections });

test('contact trio shares one screen', () => {
  const screens = buildScreens(
    form(section('contact', [shortText('name'), shortText('email', { kind: 'email' }), shortText('phone')])),
  );
  assert.deepEqual(screens, [
    { id: 'contact-1', sectionId: 'contact', questionIds: ['name', 'email', 'phone'], statementIds: [] },
  ]);
});

test('four light questions split 3 + 1', () => {
  const screens = buildScreens(form(section('s', [shortText('a'), dropdown('b'), date('c'), time('d')])));
  assert.deepEqual(
    screens.map((s) => [s.id, s.questionIds]),
    [
      ['s-1', ['a', 'b', 'c']],
      ['s-2', ['d']],
    ],
  );
});

test('heavy questions stand alone', () => {
  for (const [type, question] of Object.entries(heavy)) {
    const h = { ...question, id: `heavy_${type}` } as DynQuestion;
    const screens = buildScreens(
      form(section('s', [shortText('a'), shortText('b'), h, shortText('c'), shortText('d')])),
    );
    assert.deepEqual(
      screens.map((s) => s.questionIds),
      [['a', 'b'], [`heavy_${type}`], ['c', 'd']],
      type,
    );
  }
});

test('light means dropdown, date, time, short_text and multiple_choice with at most 4 options and no other', () => {
  assert.equal(isLightQuestion(shortText('a')), true);
  assert.equal(isLightQuestion(dropdown('a')), true);
  assert.equal(isLightQuestion(date('a')), true);
  assert.equal(isLightQuestion(time('a')), true);
  assert.equal(isLightQuestion(choice('a', 1)), true);
  assert.equal(isLightQuestion(choice('a', 4)), true);
  assert.equal(isLightQuestion(choice('a', 5)), false);
  assert.equal(isLightQuestion(choice('a', 2, true)), false);
  assert.equal(isLightQuestion(statement('a')), false);
  for (const question of Object.values(heavy)) assert.equal(isLightQuestion(question), false, question.type);

  const screens = buildScreens(
    form(section('s', [shortText('a'), choice('five', 5), choice('other', 2, true), choice('four', 4)])),
  );
  assert.deepEqual(
    screens.map((s) => s.questionIds),
    [['a'], ['five'], ['other'], ['four']],
  );
});

test('never groups across sections', () => {
  const screens = buildScreens(
    form(section('one', [shortText('a'), shortText('b')]), section('two', [shortText('c'), shortText('d')])),
  );
  assert.deepEqual(
    screens.map((s) => [s.id, s.sectionId, s.questionIds]),
    [
      ['one-1', 'one', ['a', 'b']],
      ['two-1', 'two', ['c', 'd']],
    ],
  );
});

test("statement attaches to the next question's screen and is not counted", () => {
  const leading = buildScreens(
    form(section('s', [statement('intro'), shortText('a'), shortText('b'), shortText('c'), shortText('d')])),
  );
  assert.deepEqual(
    leading.map((s) => [s.id, s.questionIds, s.statementIds]),
    [
      ['s-1', ['a', 'b', 'c'], ['intro']],
      ['s-2', ['d'], []],
    ],
  );

  // A statement between two light questions does not split them and does not use up a slot.
  const middle = buildScreens(
    form(section('s', [shortText('a'), statement('note'), shortText('b'), shortText('c')])),
  );
  assert.deepEqual(
    middle.map((s) => [s.questionIds, s.statementIds]),
    [[['a', 'b', 'c'], ['note']]],
  );

  // Before a heavy question it rides with that question.
  const heavyNext = buildScreens(
    form(section('s', [shortText('a'), statement('note'), heavy.paragraph as DynQuestion])),
  );
  assert.deepEqual(
    heavyNext.map((s) => [s.questionIds, s.statementIds]),
    [
      [['a'], []],
      [['h'], ['note']],
    ],
  );

  // Trailing statement attaches to the previous screen of its section.
  const trailing = buildScreens(
    form(section('one', [shortText('a')]), section('two', [shortText('b'), statement('outro')])),
  );
  assert.deepEqual(
    trailing.map((s) => [s.id, s.questionIds, s.statementIds]),
    [
      ['one-1', ['a'], []],
      ['two-1', ['b'], ['outro']],
    ],
  );

  // A section with only statements yields one screen with no questions.
  const only = buildScreens(form(section('s', [statement('one'), statement('two')])));
  assert.deepEqual(only, [{ id: 's-1', sectionId: 's', questionIds: [], statementIds: ['one', 'two'] }]);
});

test('nextVisibleScreen skips hidden screens in both directions and returns null past either end', () => {
  const screens: WizardScreen[] = ['a', 'b', 'c', 'd'].map((id) => ({
    id,
    sectionId: 's',
    questionIds: [id],
    statementIds: [],
  }));
  const hidden = new Set(['b', 'c']);
  const isHidden = (screen: WizardScreen): boolean => hidden.has(screen.id);

  assert.equal(nextVisibleScreen(screens, 0, 1, isHidden), 3);
  assert.equal(nextVisibleScreen(screens, 3, -1, isHidden), 0);
  assert.equal(
    nextVisibleScreen(screens, 0, 1, () => false),
    1,
  );
  assert.equal(nextVisibleScreen(screens, 3, 1, isHidden), null);
  assert.equal(nextVisibleScreen(screens, 0, -1, isHidden), null);
  assert.equal(
    nextVisibleScreen(screens, 0, 1, () => true),
    null,
  );
});

test('single-screen form returns one screen', () => {
  const screens = buildScreens(form(section('only', [heavy.paragraph as DynQuestion])));
  assert.deepEqual(screens, [{ id: 'only-1', sectionId: 'only', questionIds: ['h'], statementIds: [] }]);
  assert.deepEqual(buildScreens({ sections: [] }), []);
});
