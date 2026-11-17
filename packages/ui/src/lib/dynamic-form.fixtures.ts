/**
 * Shared show-if parity table. Used by `dynamic-form.test.ts` (browser-side semantics:
 * `visibilityForRaw`) and `scripts/audit/dynamic-form.test.ts` (the real server function,
 * `validateAnswers`), so the two can never drift apart.
 *
 * Every case builds a schema of answered "source" questions and required, unanswered "target" questions
 * (ids start with `t`). A target is visible exactly when the server reports a "required" error for it,
 * so `expectVisible` is observable on both sides. Sources always hold valid answers.
 */
import type { DynFormSchema, DynQuestion, DynShowIf, DynShowIfRule } from './dynamic-form.ts';

export interface ParityCase {
  name: string;
  schema: DynFormSchema;
  raw: Record<string, string | string[]>;
  uploads?: Record<string, { uploadId: string; kind: 'image' | 'video' | 'pdf' | 'other'; bytes: number }[]>;
  /** Visibility of each target question (and of nothing else). */
  expectVisible: Record<string, boolean>;
}

const base = { required: false } as const;

export const text = (id: string): DynQuestion => ({ ...base, id, label: `Text ${id}`, type: 'short_text' });
export const choice = (id: string, options: string[], other = false): DynQuestion => ({
  ...base,
  id,
  label: `Choice ${id}`,
  type: 'multiple_choice',
  options,
  other,
});
export const boxes = (id: string, options: string[], other = false): DynQuestion => ({
  ...base,
  id,
  label: `Boxes ${id}`,
  type: 'checkboxes',
  options,
  other,
});
export const dropdown = (id: string, options: string[]): DynQuestion => ({
  ...base,
  id,
  label: `Dropdown ${id}`,
  type: 'dropdown',
  options,
});
export const scale = (id: string): DynQuestion => ({
  ...base,
  id,
  label: `Scale ${id}`,
  type: 'linear_scale',
  min: 1,
  max: 5,
});
export const grid = (id: string, type: 'choice_grid' | 'checkbox_grid' = 'choice_grid'): DynQuestion => ({
  ...base,
  id,
  label: `Grid ${id}`,
  type,
  rows: ['Row A', 'Row B'],
  columns: ['Col 1', 'Col 2'],
  requireEachRow: false,
  onePerColumn: false,
});
export const file = (id: string): DynQuestion => ({
  ...base,
  id,
  label: `File ${id}`,
  type: 'file_upload',
  accept: ['pdf'],
  maxFiles: 2,
  maxMb: 10,
});
export const link = (id: string): DynQuestion => ({ ...base, id, label: `Link ${id}`, type: 'link' });
export const date = (id: string): DynQuestion => ({
  ...base,
  id,
  label: `Date ${id}`,
  type: 'date',
  includeYear: true,
  includeTime: false,
});
export const statement = (id: string): DynQuestion => ({
  ...base,
  id,
  label: `Statement ${id}`,
  type: 'statement',
  body: 'Read this.',
});
/** A required, unanswered question shown by `showIf` (visible exactly when the server reports it required). */
export const target = (id: string, showIf?: DynShowIf): DynQuestion => ({
  required: true,
  id,
  label: `Target ${id}`,
  type: 'short_text',
  showIf,
});

export const rule = (
  questionId: string,
  op: DynShowIfRule['op'],
  value?: string | string[],
): DynShowIfRule => ({
  questionId,
  op,
  value,
});
export const all = (...rules: DynShowIfRule[]): DynShowIf => ({ join: 'all', rules });
export const any = (...rules: DynShowIfRule[]): DynShowIf => ({ join: 'any', rules });

const one = (questions: DynQuestion[]): DynFormSchema => ({
  sections: [{ id: 's1', title: 'Section', questions }],
});

export const PARITY_CASES: ParityCase[] = [
  {
    name: 'eq on a multiple choice: matching answer shows the target',
    schema: one([choice('c', ['Yes', 'No']), target('t1', all(rule('c', 'eq', 'Yes')))]),
    raw: { c: 'Yes' },
    expectVisible: { t1: true },
  },
  {
    name: 'eq: a different answer hides the target',
    schema: one([choice('c', ['Yes', 'No']), target('t1', all(rule('c', 'eq', 'Yes')))]),
    raw: { c: 'No' },
    expectVisible: { t1: false },
  },
  {
    name: 'eq: an unanswered source hides the target',
    schema: one([choice('c', ['Yes', 'No']), target('t1', all(rule('c', 'eq', 'Yes')))]),
    raw: {},
    expectVisible: { t1: false },
  },
  {
    name: 'neq: an unanswered (but shown) source shows the target',
    schema: one([choice('c', ['Yes', 'No']), target('t1', all(rule('c', 'neq', 'Yes')))]),
    raw: {},
    expectVisible: { t1: true },
  },
  {
    name: 'neq: the excluded answer hides it, another answer shows it',
    schema: one([
      choice('c', ['Yes', 'No']),
      target('t1', all(rule('c', 'neq', 'Yes'))),
      target('t2', all(rule('c', 'neq', 'Maybe'))),
    ]),
    raw: { c: 'Yes' },
    expectVisible: { t1: false, t2: true },
  },
  {
    name: 'in: a listed answer shows the target, an unlisted one does not',
    schema: one([
      dropdown('d', ['Piano', 'Guitar', 'Drums']),
      target('t1', all(rule('d', 'in', ['Piano', 'Guitar']))),
      target('t2', all(rule('d', 'in', ['Drums']))),
      target('t3', all(rule('d', 'in', 'Piano'))),
    ]),
    raw: { d: 'Guitar' },
    expectVisible: { t1: true, t2: false, t3: false },
  },
  {
    name: 'answered / not answered',
    schema: one([
      text('a'),
      text('b'),
      target('t1', all(rule('a', 'answered'))),
      target('t2', all(rule('b', 'answered'))),
    ]),
    raw: { a: 'hello' },
    expectVisible: { t1: true, t2: false },
  },
  {
    name: 'whitespace-only text is unanswered; text is trimmed before comparing',
    schema: one([
      text('a'),
      text('b'),
      target('t1', all(rule('a', 'answered'))),
      target('t2', all(rule('b', 'eq', 'yes'))),
    ]),
    raw: { a: '   ', b: '  yes  ' },
    expectVisible: { t1: false, t2: true },
  },
  {
    name: 'short text newlines collapse to one space before comparing',
    schema: one([text('a'), target('t1', all(rule('a', 'eq', 'one two')))]),
    raw: { a: 'one\ntwo' },
    expectVisible: { t1: true },
  },
  {
    name: 'checkboxes: eq matches only a single pick; in matches any pick',
    schema: one([
      boxes('b', ['Piano', 'Guitar', 'Drums']),
      target('t1', all(rule('b', 'eq', 'Piano'))),
      target('t2', all(rule('b', 'in', ['Drums', 'Guitar']))),
      target('t3', all(rule('b', 'neq', 'Piano'))),
    ]),
    raw: { b: ['Piano', 'Guitar'] },
    expectVisible: { t1: false, t2: true, t3: true },
  },
  {
    name: 'checkboxes: a single pick equals its option',
    schema: one([boxes('b', ['Piano', 'Guitar']), target('t1', all(rule('b', 'eq', 'Piano')))]),
    raw: { b: 'Piano' },
    expectVisible: { t1: true },
  },
  {
    name: 'multiple choice "Other": the typed text is what rules compare',
    schema: one([
      choice('c', ['Piano', 'Guitar'], true),
      target('t1', all(rule('c', 'eq', 'Banjo'))),
      target('t2', all(rule('c', 'eq', '__other__'))),
    ]),
    raw: { c: '__other__', 'c.other': 'Banjo' },
    expectVisible: { t1: true, t2: false },
  },
  {
    name: 'checkboxes "Other" with typed text',
    schema: one([
      boxes('b', ['Piano'], true),
      target('t1', all(rule('b', 'in', ['Banjo']))),
      target('t2', all(rule('b', 'in', ['Piano']))),
    ]),
    raw: { b: ['Piano', '__other__'], 'b.other': 'Banjo' },
    expectVisible: { t1: true, t2: true },
  },
  {
    name: 'linear scale compares the number as text',
    schema: one([
      scale('n'),
      target('t1', all(rule('n', 'eq', '4'))),
      target('t2', all(rule('n', 'in', ['1', '2']))),
    ]),
    raw: { n: '4' },
    expectVisible: { t1: true, t2: false },
  },
  {
    name: 'grid: answered when any row is chosen; never equal to text',
    schema: one([
      grid('g'),
      grid('g2', 'checkbox_grid'),
      grid('g3'),
      target('t1', all(rule('g', 'answered'))),
      target('t2', all(rule('g', 'eq', 'Col 1'))),
      target('t3', all(rule('g', 'neq', 'Col 1'))),
      target('t4', all(rule('g2', 'answered'))),
      target('t5', all(rule('g3', 'answered'))),
    ]),
    raw: { 'g.1': 'Col 2', 'g2.0': ['Col 1', 'Col 2'] },
    expectVisible: { t1: true, t2: false, t3: true, t4: true, t5: false },
  },
  {
    name: 'file upload: answered once a finished upload is attached',
    schema: one([
      file('f'),
      file('f2'),
      target('t1', all(rule('f', 'answered'))),
      target('t2', all(rule('f2', 'answered'))),
      target('t3', all(rule('f', 'eq', 'anything'))),
    ]),
    raw: {},
    uploads: { f: [{ uploadId: 'u1', kind: 'pdf', bytes: 100 }] },
    expectVisible: { t1: true, t2: false, t3: false },
  },
  {
    name: 'link: answered, never equal to text',
    schema: one([
      link('l'),
      target('t1', all(rule('l', 'answered'))),
      target('t2', all(rule('l', 'eq', 'https://youtu.be/dQw4w9WgXcQ'))),
    ]),
    raw: { l: 'https://youtu.be/dQw4w9WgXcQ' },
    expectVisible: { t1: true, t2: false },
  },
  {
    name: 'date: answered',
    schema: one([date('d'), target('t1', all(rule('d', 'answered')))]),
    raw: { d: '2026-12-24' },
    expectVisible: { t1: true },
  },
  {
    name: 'join all needs every rule; join any needs one',
    schema: one([
      choice('c', ['Yes', 'No']),
      text('a'),
      target('t1', all(rule('c', 'eq', 'Yes'), rule('a', 'answered'))),
      target('t2', any(rule('c', 'eq', 'Yes'), rule('a', 'answered'))),
      target('t3', any(rule('c', 'eq', 'No'), rule('a', 'eq', 'nope'))),
    ]),
    raw: { c: 'Yes' },
    expectVisible: { t1: false, t2: true, t3: false },
  },
  {
    name: 'a hidden source fails closed, even for neq',
    schema: one([
      choice('c', ['Yes', 'No']),
      target('t1', all(rule('c', 'eq', 'Yes'))),
      target('t2', all(rule('t1', 'neq', 'x'))),
      target('t3', all(rule('t1', 'answered'))),
    ]),
    raw: { c: 'No' },
    expectVisible: { t1: false, t2: false, t3: false },
  },
  {
    name: 'a shown but unanswered source: neq holds, answered does not',
    schema: one([
      choice('c', ['Yes', 'No']),
      target('t1', all(rule('c', 'eq', 'Yes'))),
      target('t2', all(rule('t1', 'neq', 'x'))),
      target('t3', all(rule('t1', 'answered'))),
    ]),
    raw: { c: 'Yes' },
    expectVisible: { t1: true, t2: true, t3: false },
  },
  {
    name: 'a rule pointing forward or at an unknown question fails closed',
    schema: one([
      target('t1', all(rule('later', 'neq', 'x'))),
      target('t2', all(rule('nobody', 'neq', 'x'))),
      text('later'),
    ]),
    raw: { later: 'something' },
    expectVisible: { t1: false, t2: false },
  },
  {
    name: 'a statement is never a source',
    schema: one([
      statement('st'),
      target('t1', all(rule('st', 'neq', 'x'))),
      target('t2', all(rule('st', 'answered'))),
    ]),
    raw: {},
    expectVisible: { t1: false, t2: false },
  },
  {
    name: 'a hidden section hides every question in it, with or without their own rules',
    schema: {
      sections: [
        { id: 's1', title: 'One', questions: [choice('c', ['Yes', 'No'])] },
        {
          id: 's2',
          title: 'Two',
          showIf: all(rule('c', 'eq', 'Yes')),
          questions: [target('t1'), target('t2', all(rule('c', 'eq', 'Yes')))],
        },
        { id: 's3', title: 'Three', questions: [target('t3')] },
      ],
    },
    raw: { c: 'No' },
    expectVisible: { t1: false, t2: false, t3: true },
  },
  {
    name: 'a shown section keeps questions visible, and questions inside can use sources inside it',
    schema: {
      sections: [
        { id: 's1', title: 'One', questions: [choice('c', ['Yes', 'No'])] },
        {
          id: 's2',
          title: 'Two',
          showIf: all(rule('c', 'eq', 'Yes')),
          questions: [text('inner'), target('t1'), target('t2', all(rule('inner', 'answered')))],
        },
      ],
    },
    raw: { c: 'Yes', inner: 'hi' },
    expectVisible: { t1: true, t2: true },
  },
  {
    name: 'chained rules: each link needs the one before to be shown',
    schema: one([
      choice('c', ['Yes', 'No']),
      {
        ...(text('m') as Extract<DynQuestion, { type: 'short_text' }>),
        showIf: all(rule('c', 'eq', 'Yes')),
      },
      target('t1', all(rule('m', 'answered'))),
    ]),
    raw: { c: 'No', m: 'typed before the source was hidden' },
    expectVisible: { t1: false },
  },
];
