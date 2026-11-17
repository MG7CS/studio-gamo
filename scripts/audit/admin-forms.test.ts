/**
 * Admin form builder (design 2026-11-16-form-builder-ux-design.md): pure schema-editing helpers, the
 * question edit form parser, show-if sentences, the builder actions on a real (in-memory) D1 and the
 * route handlers behind the staff gate.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFormSchema,
  FORM_LIMITS,
  type FormSchema,
  type Question,
} from '../../packages/domain/src/forms/all.ts';
import {
  addQuestion,
  addSection,
  changeQuestionType,
  defaultQuestion,
  deleteQuestion,
  duplicateQuestion,
  findQuestion,
  flattenQuestions,
  moveQuestion,
  moveQuestionToPosition,
  orderingProblems,
  removeSection,
  updateSection,
  BuilderError,
} from '../../apps/admin/src/lib/forms-builder/schema-edit.ts';
import { describeShowIf } from '../../apps/admin/src/lib/forms-builder/show-if.ts';

type Raw = Record<string, unknown>;
const txt = (id: string, label: string, extra: Raw = {}): Raw => ({
  id,
  type: 'short_text',
  label,
  required: false,
  ...extra,
});
const base = (): FormSchema =>
  parseFormSchema({
    sections: [
      {
        id: 's1',
        title: 'About you',
        questions: [
          txt('name', 'Your name', { bind: 'contact.name', required: true }),
          txt('email', 'Your email', { bind: 'contact.email', validation: { kind: 'email' } }),
          {
            id: 'role',
            type: 'multiple_choice',
            label: 'Main role',
            options: ['Keys', 'Drums'],
          },
        ],
      },
      {
        id: 's2',
        title: 'More',
        questions: [
          txt('why', 'Why Gamo?', {
            showIf: { join: 'all', rules: [{ questionId: 'role', op: 'eq', value: 'Keys' }] },
          }),
          txt('city', 'City'),
        ],
      },
    ],
  });
const ids = (schema: FormSchema) => flattenQuestions(schema).map((f) => f.question.id);

describe('flattenQuestions and findQuestion', () => {
  test('lists questions in reading order with 1-based positions and section info', () => {
    const flat = flattenQuestions(base());
    assert.deepEqual(
      flat.map((f) => [f.question.id, f.position, f.sectionId, f.indexInSection]),
      [
        ['name', 1, 's1', 0],
        ['email', 2, 's1', 1],
        ['role', 3, 's1', 2],
        ['why', 4, 's2', 0],
        ['city', 5, 's2', 1],
      ],
    );
    assert.equal(findQuestion(base(), 'why')?.sectionId, 's2');
    assert.equal(findQuestion(base(), 'nope'), null);
  });
});

describe('addQuestion', () => {
  test('appends a valid default question of every type to a section', () => {
    const types = [
      'short_text',
      'paragraph',
      'multiple_choice',
      'checkboxes',
      'dropdown',
      'file_upload',
      'linear_scale',
      'rating',
      'choice_grid',
      'checkbox_grid',
      'date',
      'time',
      'link',
      'statement',
    ] as const;
    for (const type of types) {
      const { schema, question } = addQuestion(base(), 's2', type, { newId: () => 'fresh' });
      assert.equal(question.id, 'fresh');
      assert.equal(question.type, type);
      assert.equal(ids(schema).at(-1), 'fresh');
      // The result must survive the server's authoritative parser unchanged in shape.
      assert.doesNotThrow(() => parseFormSchema(schema), type);
    }
  });

  test('inserts after a given question when asked and never mutates the input', () => {
    const before = base();
    const snapshot = JSON.stringify(before);
    const { schema } = addQuestion(before, 's1', 'date', { newId: () => 'd1', afterQuestionId: 'name' });
    assert.deepEqual(ids(schema).slice(0, 3), ['name', 'd1', 'email']);
    assert.equal(JSON.stringify(before), snapshot);
  });

  test('picks an unused id by default and refuses unknown sections and the question limit', () => {
    const { question } = addQuestion(base(), 's1', 'short_text');
    assert.match(question.id, /^[A-Za-z][A-Za-z0-9_-]{0,39}$/);
    assert.ok(!['name', 'email', 'role', 'why', 'city'].includes(question.id));
    assert.throws(() => addQuestion(base(), 'zzz', 'short_text'), BuilderError);
    let full = base();
    while (flattenQuestions(full).length < FORM_LIMITS.maxQuestions) {
      full = addQuestion(full, 's2', 'short_text').schema;
    }
    assert.throws(
      () => addQuestion(full, 's2', 'short_text'),
      (e: unknown) => e instanceof BuilderError && /100 questions/.test(e.message),
    );
  });

  test('defaultQuestion gives choice types two options and grids rows and columns', () => {
    const mc = defaultQuestion('multiple_choice', 'x') as Extract<Question, { type: 'multiple_choice' }>;
    assert.equal(mc.options.length, 2);
    const grid = defaultQuestion('choice_grid', 'g') as Extract<Question, { type: 'choice_grid' }>;
    assert.ok(grid.rows.length >= 1 && grid.columns.length >= 2);
    assert.ok(defaultQuestion('short_text', 'a').label.length > 0);
  });
});

describe('moveQuestion and moveQuestionToPosition', () => {
  test('moves up and down by one and across the section boundary', () => {
    const up = moveQuestion(base(), 'email', 'up');
    assert.ok(up.moved);
    assert.deepEqual(ids(up.schema).slice(0, 2), ['email', 'name']);
    const down = moveQuestion(base(), 'name', 'down');
    assert.deepEqual(ids(down.schema).slice(0, 2), ['email', 'name']);
    assert.equal(down.position, 2);
  });

  test('first question up and last question down are no-ops', () => {
    assert.equal(moveQuestion(base(), 'name', 'up').moved, false);
    assert.equal(moveQuestion(base(), 'city', 'down').moved, false);
  });

  test('crossing a section boundary changes the question section but keeps reading order', () => {
    const afterRole = moveQuestion(base(), 'city', 'up'); // city above why, still in section 2
    assert.deepEqual(ids(afterRole.schema), ['name', 'email', 'role', 'city', 'why']);
    const roleDown = moveQuestionToPosition(base(), 'role', 4);
    // role now sits at position 4 which is inside section 2; why (depends on role) is now earlier: blocked.
    assert.equal(roleDown.moved, false);
    assert.match(roleDown.blocked ?? '', /Why Gamo\?/);
  });

  test('moveQuestionToPosition moves to any 1-based position and clamps nothing silently', () => {
    const r = moveQuestionToPosition(base(), 'city', 1);
    assert.deepEqual(ids(r.schema), ['city', 'name', 'email', 'role', 'why']);
    assert.equal(r.position, 1);
    assert.equal(findQuestion(r.schema, 'city')?.sectionId, 's1');
    const same = moveQuestionToPosition(base(), 'name', 1);
    assert.equal(same.moved, false);
    assert.throws(() => moveQuestionToPosition(base(), 'name', 0), BuilderError);
    assert.throws(() => moveQuestionToPosition(base(), 'name', 6), BuilderError);
    assert.throws(() => moveQuestionToPosition(base(), 'name', 1.5), BuilderError);
    assert.throws(() => moveQuestionToPosition(base(), 'ghost', 2), BuilderError);
  });

  test('moving a source question below its dependent is blocked, moving it elsewhere is not', () => {
    const blocked = moveQuestion(
      parseFormSchema({
        sections: [
          {
            id: 's1',
            title: 'A',
            questions: [
              txt('a', 'A'),
              txt('b', 'B', { showIf: { join: 'all', rules: [{ questionId: 'a', op: 'answered' }] } }),
            ],
          },
        ],
      }),
      'a',
      'down',
    );
    assert.equal(blocked.moved, false);
    assert.match(blocked.blocked ?? '', /"B"/);
    assert.equal(moveQuestion(base(), 'name', 'down').moved, true);
  });

  test('a draft that is already out of order can still be reordered elsewhere', () => {
    const broken = parseFormSchema({
      sections: [
        {
          id: 's1',
          title: 'A',
          questions: [
            txt('a', 'A', { showIf: { join: 'all', rules: [{ questionId: 'b', op: 'answered' }] } }),
            txt('b', 'B'),
            txt('c', 'C'),
          ],
        },
      ],
    });
    assert.equal(orderingProblems(broken).length, 1);
    assert.equal(moveQuestion(broken, 'c', 'up').moved, true);
  });
});

describe('deleteQuestion', () => {
  test('removes an unreferenced question', () => {
    const r = deleteQuestion(base(), 'city');
    assert.ok(r.ok);
    assert.deepEqual(ids(r.schema), ['name', 'email', 'role', 'why']);
  });

  test('is blocked while other questions or sections use it, and lists the dependents', () => {
    const r = deleteQuestion(base(), 'role');
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.deepEqual(
      r.dependents.map((d) => [d.kind, d.id, d.label]),
      [['question', 'why', 'Why Gamo?']],
    );
    const withSection = parseFormSchema({
      sections: [
        { id: 's1', title: 'A', questions: [txt('a', 'A')] },
        {
          id: 's2',
          title: 'Follow-up',
          showIf: { join: 'all', rules: [{ questionId: 'a', op: 'answered' }] },
          questions: [txt('b', 'B')],
        },
      ],
    });
    const blocked = deleteQuestion(withSection, 'a');
    assert.equal(blocked.ok, false);
    if (!blocked.ok)
      assert.deepEqual(
        blocked.dependents.map((d) => [d.kind, d.id]),
        [['section', 's2']],
      );
  });

  test('unknown question is a BuilderError', () => {
    assert.throws(() => deleteQuestion(base(), 'ghost'), BuilderError);
  });
});

describe('duplicateQuestion', () => {
  test('copies after the original with a new id, a copy label and no bind key', () => {
    const { schema, question } = duplicateQuestion(base(), 'name', () => 'name2');
    assert.deepEqual(ids(schema).slice(0, 3), ['name', 'name2', 'email']);
    assert.equal(question.label, 'Your name (copy)');
    assert.equal(question.bind, undefined);
    assert.equal(findQuestion(schema, 'name')?.question.bind, 'contact.name');
  });

  test('keeps show-if, truncates the label to the limit, and respects the question limit', () => {
    const long = 'x'.repeat(FORM_LIMITS.maxLabel);
    const s = parseFormSchema({
      sections: [{ id: 's1', title: 'A', questions: [txt('a', long)] }],
    });
    const { question } = duplicateQuestion(s, 'a', () => 'a2');
    assert.ok(question.label.length <= FORM_LIMITS.maxLabel);
    const withIf = duplicateQuestion(base(), 'why', () => 'why2');
    assert.ok(withIf.question.showIf);
    let full = base();
    while (flattenQuestions(full).length < FORM_LIMITS.maxQuestions) {
      full = addQuestion(full, 's2', 'short_text').schema;
    }
    assert.throws(() => duplicateQuestion(full, 'name', () => 'zz'), BuilderError);
  });
});

describe('sections', () => {
  test('addSection appends a section with a title and respects the limit', () => {
    const { schema, section } = addSection(base(), 'Practical', () => 'sec3');
    assert.equal(schema.sections.at(-1)?.id, 'sec3');
    assert.equal(section.title, 'Practical');
    assert.throws(() => addSection(base(), '   '), BuilderError);
    let full = base();
    while (full.sections.length < FORM_LIMITS.maxSections) full = addSection(full, 'More').schema;
    assert.throws(() => addSection(full, 'One too many'), BuilderError);
  });

  test('updateSection renames and describes; removeSection only removes empty sections', () => {
    const renamed = updateSection(base(), 's1', { title: 'Hello', description: 'Intro' });
    assert.equal(renamed.sections[0]?.title, 'Hello');
    assert.equal(renamed.sections[0]?.description, 'Intro');
    assert.throws(() => updateSection(base(), 's1', { title: '' }), BuilderError);
    assert.throws(() => removeSection(base(), 's1'), BuilderError);
    const withEmpty = addSection(base(), 'Empty', () => 'e1').schema;
    assert.equal(removeSection(withEmpty, 'e1').sections.length, 2);
    const only = parseFormSchema({ sections: [{ id: 's1', title: 'A', questions: [] }] });
    assert.throws(() => removeSection(only, 's1'), BuilderError);
  });
});

describe('changeQuestionType', () => {
  test('keeps label, help, required, show-if and carries options between choice types', () => {
    const r = changeQuestionType(base(), 'role', 'checkboxes');
    const q = findQuestion(r.schema, 'role')!.question;
    assert.equal(q.type, 'checkboxes');
    assert.equal(q.label, 'Main role');
    assert.deepEqual((q as Extract<Question, { type: 'checkboxes' }>).options, ['Keys', 'Drums']);
    assert.deepEqual(r.lost, []);
    assert.doesNotThrow(() => parseFormSchema(r.schema));
  });

  test('reports what is discarded when the new type cannot hold it', () => {
    const r = changeQuestionType(base(), 'role', 'short_text');
    assert.ok(r.lost.some((l) => /option/i.test(l)));
    const email = changeQuestionType(base(), 'email', 'link');
    assert.ok(email.lost.some((l) => /validation/i.test(l)));
    assert.equal(findQuestion(email.schema, 'email')?.question.bind, 'contact.email');
    const toStatement = changeQuestionType(base(), 'email', 'statement');
    assert.ok(toStatement.lost.some((l) => /contact\.email|bound|system field/i.test(l)));
    assert.equal(findQuestion(toStatement.schema, 'email')?.question.bind, undefined);
  });

  test('same type is a no-op and dependents are mentioned', () => {
    const same = changeQuestionType(base(), 'role', 'multiple_choice');
    assert.deepEqual(same.lost, []);
    assert.equal(same.changed, false);
    const r = changeQuestionType(base(), 'role', 'short_text');
    assert.ok(r.dependents.some((d) => d.id === 'why'));
  });

  test('moves rows and columns between grid types and loses them for others', () => {
    const grid = addQuestion(base(), 's2', 'choice_grid', { newId: () => 'g' }).schema;
    const cg = changeQuestionType(grid, 'g', 'checkbox_grid');
    assert.deepEqual(cg.lost, []);
    const gone = changeQuestionType(grid, 'g', 'paragraph');
    assert.ok(gone.lost.some((l) => /row/i.test(l)));
  });
});

describe('describeShowIf', () => {
  const schema = base();
  test('one rule reads as a plain sentence', () => {
    assert.equal(
      describeShowIf({ join: 'all', rules: [{ questionId: 'role', op: 'eq', value: 'Keys' }] }, schema),
      'Shown only if "Main role" is "Keys".',
    );
  });
  test('all, any, not, in and answered', () => {
    assert.equal(
      describeShowIf(
        {
          join: 'all',
          rules: [
            { questionId: 'role', op: 'neq', value: 'Drums' },
            { questionId: 'name', op: 'answered' },
          ],
        },
        schema,
      ),
      'Shown only if "Main role" is not "Drums" and "Your name" is answered.',
    );
    assert.equal(
      describeShowIf(
        {
          join: 'any',
          rules: [
            { questionId: 'role', op: 'in', value: ['Keys', 'Drums'] },
            { questionId: 'email', op: 'answered' },
          ],
        },
        schema,
      ),
      'Shown if any of these apply: "Main role" is one of "Keys", "Drums"; "Your email" is answered.',
    );
  });
  test('unknown source and long labels are handled without throwing', () => {
    assert.match(
      describeShowIf({ join: 'all', rules: [{ questionId: 'gone', op: 'answered' }] }, schema),
      /a question that no longer exists/,
    );
    const long = parseFormSchema({
      sections: [{ id: 's', title: 'T', questions: [txt('a', 'y'.repeat(150))] }],
    });
    const out = describeShowIf({ join: 'all', rules: [{ questionId: 'a', op: 'answered' }] }, long);
    assert.ok(out.length < 120);
    assert.match(out, /…/);
  });
});

// ---------------------------------------------------------------------------------------------
// The question edit form
// ---------------------------------------------------------------------------------------------

import { canonicalJson, defaultFormSeeds, BIND_KEYS } from '../../packages/domain/src/forms/all.ts';
import {
  toFormValues,
  validateQuestionEdit,
  parseLines,
} from '../../apps/admin/src/lib/forms-builder/question-form.ts';

describe('question edit form', () => {
  const edit = (id: string, fields: Record<string, string | string[]>, schema = base()) =>
    validateQuestionEdit(schema, id, fields);

  test('every question of every seeded form round-trips through the edit form unchanged', () => {
    let checked = 0;
    for (const seed of defaultFormSeeds()) {
      for (const section of seed.schema.sections) {
        for (const question of section.questions) {
          const result = edit(question.id, toFormValues(question), seed.schema);
          assert.ok(result.ok, `${seed.slug}/${question.id}: ${JSON.stringify(!result.ok && result.errors)}`);
          if (result.ok) {
            assert.equal(
              canonicalJson(result.question),
              canonicalJson(question),
              `${seed.slug}/${question.id}`,
            );
          }
          checked += 1;
        }
      }
    }
    assert.ok(checked >= 30, `only ${checked} seeded questions were checked`);
  });

  test('saves label, help, required and bind and leaves id and type alone', () => {
    const r = edit('city', {
      label: '  Home city ',
      help: 'Where you live',
      required: 'on',
      bind: 'roster.city',
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.question.label, 'Home city');
    assert.equal(r.question.help, 'Where you live');
    assert.equal(r.question.required, true);
    assert.equal(r.question.bind, 'roster.city');
    assert.equal(r.question.id, 'city');
    assert.equal(r.question.type, 'short_text');
    assert.equal(findQuestion(r.schema, 'city')?.question.label, 'Home city');
  });

  test('requires a label and limits its length; errors name the field', () => {
    const empty = edit('city', { label: '   ' });
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.errors[0]?.field, 'label');
    const long = edit('city', { label: 'x'.repeat(FORM_LIMITS.maxLabel + 1) });
    assert.equal(long.ok, false);
    const help = edit('city', { label: 'City', help: 'h'.repeat(FORM_LIMITS.maxHelp + 1) });
    assert.equal(help.ok, false);
    if (!help.ok) assert.equal(help.errors[0]?.field, 'help');
  });

  test('options: one per line, blanks dropped, duplicates and limits rejected', () => {
    assert.deepEqual(parseLines(' Keys \n\n Drums\r\nBass '), ['Keys', 'Drums', 'Bass']);
    const ok = edit('role', {
      label: 'Main role',
      options: 'Keys\nDrums\nBass',
      other: 'on',
      other_label: 'Something else',
      shuffle: 'on',
    });
    assert.ok(ok.ok);
    if (ok.ok && ok.question.type === 'multiple_choice') {
      assert.deepEqual(ok.question.options, ['Keys', 'Drums', 'Bass']);
      assert.equal(ok.question.other, true);
      assert.equal(ok.question.otherLabel, 'Something else');
      assert.equal(ok.question.shuffle, true);
    }
    for (const options of [
      '',
      'Keys\nkeys',
      Array.from({ length: 101 }, (_, i) => `o${i}`).join('\n'),
      'x'.repeat(151),
    ]) {
      const bad = edit('role', { label: 'Main role', options });
      assert.equal(bad.ok, false, options.slice(0, 20));
      if (!bad.ok) assert.equal(bad.errors[0]?.field, 'options');
    }
  });

  test('validation presets and a constrained pattern with the allowed-subset hint', () => {
    const email = edit('city', {
      label: 'Email',
      validation_kind: 'email',
      validation_message: 'Use a real address',
    });
    assert.ok(email.ok);
    if (email.ok && email.question.type === 'short_text') {
      assert.deepEqual(email.question.validation, { kind: 'email', message: 'Use a real address' });
    }
    const range = edit('city', {
      label: 'Age',
      validation_kind: 'number',
      v_min: '18',
      v_max: '99',
      v_integer: 'on',
    });
    assert.ok(range.ok);
    if (range.ok && range.question.type === 'short_text') {
      assert.deepEqual(range.question.validation, { kind: 'number', min: 18, max: 99, integer: true });
    }
    const swapped = edit('city', { label: 'Age', validation_kind: 'number', v_min: '50', v_max: '10' });
    assert.equal(swapped.ok, false);
    const regexOk = edit('city', { label: 'Code', validation_kind: 'regex', v_pattern: '^[A-Z]{3}\\d{2}$' });
    assert.ok(regexOk.ok);
    const regexBad = edit('city', { label: 'Code', validation_kind: 'regex', v_pattern: '(a+)+$' });
    assert.equal(regexBad.ok, false);
    if (!regexBad.ok) {
      assert.equal(regexBad.errors[0]?.field, 'v_pattern');
      assert.match(regexBad.errors[0]?.message ?? '', /groups|alternation|lookarounds/);
    }
    const unknown = edit('city', { label: 'X', validation_kind: 'sql' });
    assert.equal(unknown.ok, false);
  });

  test('show-if: sentence rules from earlier questions only, all or any', () => {
    const ok = edit('city', {
      label: 'City',
      si_join: 'any',
      si_q_0: 'role',
      si_op_0: 'in',
      si_val_0: 'Keys\nDrums',
      si_q_1: 'name',
      si_op_1: 'answered',
      si_val_1: '',
    });
    assert.ok(ok.ok);
    if (ok.ok) {
      assert.deepEqual(ok.question.showIf, {
        join: 'any',
        rules: [
          { questionId: 'role', op: 'in', value: ['Keys', 'Drums'] },
          { questionId: 'name', op: 'answered' },
        ],
      });
    }
    // 'is' takes the first line; an empty source removes the rule; no rules means no show-if.
    const eq = edit('city', {
      label: 'City',
      si_join: 'all',
      si_q_0: 'role',
      si_op_0: 'eq',
      si_val_0: 'Drums\nKeys',
    });
    assert.ok(eq.ok);
    if (eq.ok)
      assert.deepEqual(eq.question.showIf?.rules[0], { questionId: 'role', op: 'eq', value: 'Drums' });
    const none = edit('why', { label: 'Why Gamo?', si_join: 'all', si_q_0: '', si_op_0: 'eq', si_val_0: '' });
    assert.ok(none.ok);
    if (none.ok) assert.equal(none.question.showIf, undefined);
    // Later question, itself, unknown, wrong value, missing value, bad op.
    const later = edit('role', {
      label: 'Main role',
      options: 'Keys\nDrums',
      si_q_0: 'city',
      si_op_0: 'answered',
    });
    assert.equal(later.ok, false);
    if (!later.ok) assert.equal(later.errors[0]?.field, 'si_q_0');
    assert.equal(edit('city', { label: 'City', si_q_0: 'city', si_op_0: 'answered' }).ok, false);
    assert.equal(edit('city', { label: 'City', si_q_0: 'ghost', si_op_0: 'answered' }).ok, false);
    assert.equal(
      edit('city', { label: 'City', si_q_0: 'role', si_op_0: 'eq', si_val_0: 'Trumpet' }).ok,
      false,
    );
    assert.equal(edit('city', { label: 'City', si_q_0: 'role', si_op_0: 'eq', si_val_0: '' }).ok, false);
    assert.equal(
      edit('city', { label: 'City', si_q_0: 'role', si_op_0: 'matches', si_val_0: 'x' }).ok,
      false,
    );
  });

  test('bind: only bindable types and known keys', () => {
    assert.equal(edit('city', { label: 'City', bind: 'roster.city' }).ok, true);
    assert.equal(edit('city', { label: 'City', bind: 'made.up' }).ok, false);
    const statement = addQuestion(base(), 's2', 'statement', { newId: () => 'st' }).schema;
    assert.equal(validateQuestionEdit(statement, 'st', { label: 'Note', bind: 'contact.name' }).ok, false);
    assert.ok(BIND_KEYS.length > 5);
  });

  test('type specific fields: scale, grid, upload, checkbox limit', () => {
    const grid = addQuestion(base(), 's2', 'choice_grid', { newId: () => 'g' }).schema;
    const g = validateQuestionEdit(grid, 'g', {
      label: 'Availability',
      rows: 'Mon\nTue',
      columns: 'Yes\nNo',
      require_each_row: 'on',
    });
    assert.ok(g.ok);
    if (g.ok && g.question.type === 'choice_grid') {
      assert.deepEqual(g.question.rows, ['Mon', 'Tue']);
      assert.equal(g.question.requireEachRow, true);
    }
    assert.equal(validateQuestionEdit(grid, 'g', { label: 'A', rows: '', columns: 'Yes' }).ok, false);
    const scale = addQuestion(base(), 's2', 'linear_scale', { newId: () => 'sc' }).schema;
    const s = validateQuestionEdit(scale, 'sc', {
      label: 'Rate',
      scale_min: '0',
      scale_max: '7',
      min_label: 'Low',
      max_label: 'High',
    });
    assert.ok(s.ok);
    assert.equal(
      validateQuestionEdit(scale, 'sc', { label: 'Rate', scale_min: '1', scale_max: '11' }).ok,
      false,
    );
    assert.equal(
      validateQuestionEdit(scale, 'sc', { label: 'Rate', scale_min: '1', scale_max: 'abc' }).ok,
      false,
    );
    const upload = addQuestion(base(), 's2', 'file_upload', { newId: () => 'up' }).schema;
    const u = validateQuestionEdit(upload, 'up', {
      label: 'Recording',
      accept: ['video', 'pdf'],
      max_files: '2',
      max_mb: '200',
    });
    assert.ok(u.ok);
    assert.equal(
      validateQuestionEdit(upload, 'up', { label: 'R', accept: [], max_files: '1', max_mb: '10' }).ok,
      false,
    );
    assert.equal(
      validateQuestionEdit(upload, 'up', { label: 'R', accept: 'image', max_files: '99', max_mb: '10' }).ok,
      false,
    );
    const boxes = addQuestion(base(), 's2', 'checkboxes', { newId: () => 'cb' }).schema;
    const c = validateQuestionEdit(boxes, 'cb', {
      label: 'Pick',
      options: 'A\nB\nC',
      limit_kind: 'at_most',
      limit_n: '2',
    });
    assert.ok(c.ok);
    assert.equal(
      validateQuestionEdit(boxes, 'cb', {
        label: 'Pick',
        options: 'A\nB',
        limit_kind: 'at_most',
        limit_n: '',
      }).ok,
      false,
    );
  });

  test('prototype-pollution style field names are ignored and unknown questions throw', () => {
    const r = edit('city', { label: 'City', __proto__: 'x', constructor: 'y' } as never);
    assert.ok(r.ok);
    assert.throws(() => edit('ghost', { label: 'x' }), BuilderError);
  });
});

// ---------------------------------------------------------------------------------------------
// Builder actions on a real (in-memory) D1
// ---------------------------------------------------------------------------------------------

import { createMigratedD1, type SqliteD1 } from '../../packages/db/testing.ts';
import { FormsService } from '../../packages/domain/src/forms/all.ts';
import { runBuilderAction, type Body, type Outcome } from '../../apps/admin/src/lib/forms-builder/actions.ts';

const T0 = Date.UTC(2026, 10, 16, 9, 0, 0) / 1000;
const STAFF_A = 'usr_a';
const STAFF_B = 'usr_b';

async function builder(schema: Raw = base() as unknown as Raw) {
  const d1: SqliteD1 = await createMigratedD1();
  d1.sqlite
    .prepare('INSERT INTO users (id, email, status, created_at, display_name) VALUES (?, ?, ?, ?, ?)')
    .run(STAFF_B, 'bea@example.invalid', 'active', T0, 'Bea Sample');
  const forms = new FormsService(d1, { now: T0 });
  const form = await forms.create({
    slug: 'contact',
    program: 'web',
    kind: 'contact',
    title: 'Contact',
    staffId: STAFF_A,
  });
  const saved = await forms.saveDraft({ formId: form.id, schema, expectedRevision: 1, staffId: STAFF_A });
  let opCounter = 0;
  const act = (action: string, fields: Body = {}, as = STAFF_A, revision?: number) =>
    runBuilderAction({ db: d1, staff: { userId: as }, now: T0 }, form.id, action, {
      revision: String(revision ?? saved.revision),
      op_id: `op-${action}-${++opCounter}`,
      ...fields,
    });
  const draft = async () => (await forms.getForEdit(form.id)).draft;
  const revision = async () => (await forms.getForEdit(form.id)).revision;
  return { d1, forms, form, act, draft, revision, saved: saved.revision };
}
const okOf = (o: Outcome) => {
  assert.ok(o.ok, !o.ok ? `${o.code}: ${o.message}` : '');
  return o as Extract<Outcome, { ok: true }>;
};
const failOf = (o: Outcome) => {
  assert.equal(o.ok, false);
  return o as Extract<Outcome, { ok: false }>;
};

describe('builder actions', () => {
  test('question.add saves a new question, answers with its editor URL, and a repeated op_id is a no-op', async () => {
    const t = await builder();
    const first = okOf(await t.act('question.add', { section: 's2', type: 'date', op_id: 'op-add-1' }));
    const id = String(first.data.questionId);
    assert.equal(first.location, `/forms/${t.form.id}/edit?q=${id}#q-${id}`);
    assert.equal(first.notice, 'added');
    assert.equal(findQuestion(await t.draft(), id)?.question.type, 'date');
    const rev = await t.revision();
    const replay = okOf(await t.act('question.add', { section: 's2', type: 'date', op_id: 'op-add-1' }));
    assert.equal(flattenQuestions(await t.draft()).length, 6);
    assert.equal(await t.revision(), rev);
    assert.ok(replay.ok);
    assert.equal(failOf(await t.act('question.add', { section: 's2', type: 'nope' })).code, 'INVALID_INPUT');
    assert.equal(failOf(await t.act('question.add', { section: 'ghost', type: 'date' })).status, 400);
  });

  test('a stale revision is a 409 conflict that names who saved first and keeps the submitted values', async () => {
    const t = await builder();
    okOf(await t.act('question.move', { qid: 'city', dir: 'up' }, STAFF_B));
    const before = JSON.stringify(await t.draft());
    const lost = failOf(await t.act('question.save', { qid: 'city', label: 'My new label', help: 'kept' }));
    assert.equal(lost.status, 409);
    assert.equal(lost.code, 'REVISION_CONFLICT');
    assert.equal(lost.notice, 'conflict');
    assert.equal(lost.values?.label, 'My new label');
    assert.equal(lost.values?.help, 'kept');
    assert.equal(lost.conflict?.by, 'Bea Sample');
    assert.equal(lost.conflict?.currentRevision, await t.revision());
    assert.equal(lost.conflict?.at, T0);
    assert.equal(JSON.stringify(await t.draft()), before, 'nothing overwritten');
    // The same edit with the current revision applies on top of their version.
    okOf(await t.act('question.save', { qid: 'city', label: 'My new label' }, STAFF_A, await t.revision()));
    assert.equal(findQuestion(await t.draft(), 'city')?.question.label, 'My new label');
  });

  test('conflict by an unknown or system user falls back to a generic phrase', async () => {
    const t = await builder();
    okOf(await t.act('question.move', { qid: 'city', dir: 'up' }, 'system:seed'));
    const lost = failOf(await t.act('question.move', { qid: 'city', dir: 'up' }));
    assert.equal(lost.conflict?.by, 'another staff member');
  });

  test('question.save: validation errors are 400 with field errors and values, valid saves persist', async () => {
    const t = await builder();
    const bad = failOf(
      await t.act('question.save', { qid: 'city', label: '', validation_kind: 'regex', v_pattern: '(a|b)' }),
    );
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.fieldErrors?.map((e) => e.field).sort(), ['label', 'v_pattern']);
    assert.equal(bad.values?.validation_kind, 'regex');
    assert.equal(findQuestion(await t.draft(), 'city')?.question.label, 'City');
    const good = okOf(
      await t.act('question.save', {
        qid: 'city',
        label: 'Home city',
        required: 'on',
        bind: 'roster.city',
        op_id: 'op-save-1',
      }),
    );
    assert.equal(good.notice, 'saved');
    const saved = findQuestion(await t.draft(), 'city')?.question;
    assert.equal(saved?.label, 'Home city');
    assert.equal(saved?.required, true);
    const rev = await t.revision();
    okOf(await t.act('question.save', { qid: 'city', label: 'Changed again', op_id: 'op-save-1' }));
    assert.equal(await t.revision(), rev, 'a replayed op_id changes nothing');
    assert.equal(findQuestion(await t.draft(), 'city')?.question.label, 'Home city');
  });

  test('question.save accepts a whole question as JSON for API clients', async () => {
    const t = await builder();
    const q = JSON.stringify({ type: 'short_text', label: 'JSON label', required: false });
    okOf(await t.act('question.save', { qid: 'city', question: q }));
    assert.equal(findQuestion(await t.draft(), 'city')?.question.label, 'JSON label');
    assert.equal(failOf(await t.act('question.save', { qid: 'city', question: '{nope' })).status, 400);
    assert.equal(
      failOf(
        await t.act('question.save', {
          qid: 'city',
          question: JSON.stringify({ type: 'short_text', label: '' }),
        }),
      ).status,
      400,
    );
  });

  test('question.move: up, down, to a position, no-op, blocked by a show-if, and bad input', async () => {
    const t = await builder();
    const up = okOf(await t.act('question.move', { qid: 'email', dir: 'up', open: 'city' }));
    assert.equal(up.notice, 'moved');
    assert.equal(up.location, `/forms/${t.form.id}/edit?q=city#q-email`);
    assert.deepEqual(ids(await t.draft()).slice(0, 2), ['email', 'name']);
    const rev = await t.revision();
    const none = okOf(await t.act('question.move', { qid: 'email', dir: 'up' }, STAFF_A, rev));
    assert.equal(none.notice, 'move-none');
    assert.equal(await t.revision(), rev);
    okOf(await t.act('question.move', { qid: 'city', to: '1' }, STAFF_A, rev));
    assert.equal(ids(await t.draft())[0], 'city');
    const blocked = failOf(
      await t.act('question.move', { qid: 'role', to: '5' }, STAFF_A, await t.revision()),
    );
    assert.equal(blocked.status, 409);
    assert.equal(blocked.notice, 'move-blocked');
    assert.match(blocked.message, /Why Gamo\?/);
    assert.equal(
      failOf(await t.act('question.move', { qid: 'name', to: '99' }, STAFF_A, await t.revision())).status,
      400,
    );
    assert.equal(
      failOf(await t.act('question.move', { qid: 'name' }, STAFF_A, await t.revision())).status,
      400,
    );
    // A hostile "open" value never reaches the redirect.
    const hostile = okOf(
      await t.act(
        'question.move',
        { qid: 'name', dir: 'down', open: '"><script>' },
        STAFF_A,
        await t.revision(),
      ),
    );
    assert.ok(!hostile.location.includes('script'));
  });

  test('question.duplicate adds a copy once even if posted twice', async () => {
    const t = await builder();
    const r = okOf(await t.act('question.duplicate', { qid: 'name', op_id: 'op-dup' }));
    const id = String(r.data.questionId);
    assert.equal(findQuestion(await t.draft(), id)?.question.bind, undefined);
    okOf(await t.act('question.duplicate', { qid: 'name', op_id: 'op-dup' }));
    assert.equal(flattenQuestions(await t.draft()).length, 6);
  });

  test('question.delete: confirmation step first, blocked with dependents, then deleted', async () => {
    const t = await builder();
    const ask = okOf(await t.act('question.delete', { qid: 'city' }));
    assert.match(ask.location, /confirm=delete#delete-confirm$/);
    assert.equal(flattenQuestions(await t.draft()).length, 5);
    const blocked = failOf(await t.act('question.delete', { qid: 'role', confirm: '1' }));
    assert.equal(blocked.status, 409);
    assert.deepEqual(
      blocked.dependents?.map((d) => d.id),
      ['why'],
    );
    assert.equal(flattenQuestions(await t.draft()).length, 5);
    const done = okOf(await t.act('question.delete', { qid: 'city', confirm: '1' }));
    assert.equal(done.notice, 'deleted');
    assert.equal(findQuestion(await t.draft(), 'city'), null);
  });

  test('question.type asks for confirmation when something would be lost, then applies it', async () => {
    const t = await builder();
    const ask = okOf(await t.act('question.type', { qid: 'role', type: 'short_text' }));
    assert.match(ask.location, /type=short_text#type-confirm$/);
    assert.equal(findQuestion(await t.draft(), 'role')?.question.type, 'multiple_choice');
    const done = okOf(await t.act('question.type', { qid: 'role', type: 'short_text', confirm: '1' }));
    assert.equal(done.notice, 'type-changed');
    assert.equal(findQuestion(await t.draft(), 'role')?.question.type, 'short_text');
    // Lossless change needs no confirmation.
    const lossless = okOf(
      await t.act('question.type', { qid: 'city', type: 'paragraph' }, STAFF_A, await t.revision()),
    );
    assert.equal(lossless.notice, 'type-changed');
    assert.equal(
      failOf(await t.act('question.type', { qid: 'city', type: 'xx' }, STAFF_A, await t.revision())).status,
      400,
    );
  });

  test('sections: add, rename and delete an empty one', async () => {
    const t = await builder();
    const added = okOf(await t.act('section.add', { title: 'Practical' }));
    const sid = String(added.data.sectionId);
    assert.match(added.location, new RegExp(`#section-${sid}$`));
    okOf(
      await t.act(
        'section.update',
        { sid, title: 'Practical details', description: 'Dates and places' },
        STAFF_A,
        await t.revision(),
      ),
    );
    assert.equal((await t.draft()).sections.at(-1)?.title, 'Practical details');
    assert.equal(
      failOf(await t.act('section.delete', { sid: 's1' }, STAFF_A, await t.revision())).status,
      400,
    );
    okOf(await t.act('section.delete', { sid }, STAFF_A, await t.revision()));
    assert.equal((await t.draft()).sections.length, 2);
    assert.equal(failOf(await t.act('section.add', { title: ' ' }, STAFF_A, await t.revision())).status, 400);
  });

  test('settings.save changes title, description, confirmation message and retention; rejects bad input', async () => {
    const t = await builder();
    const ok = okOf(
      await t.act('settings.save', {
        title: 'Write to us',
        description: 'Hello',
        confirmation_message: 'Thanks!',
        retention_months: '18',
      }),
    );
    assert.equal(ok.notice, 'settings-saved');
    const form = await t.forms.getForm(t.form.id);
    assert.equal(form?.title, 'Write to us');
    assert.equal(form?.confirmationMessage, 'Thanks!');
    assert.equal(form?.retentionMonths, 18);
    assert.equal(failOf(await t.act('settings.save', { title: '' })).status, 400);
    assert.equal(failOf(await t.act('settings.save', { title: 'x', retention_months: '0' })).status, 400);
    const text = failOf(await t.act('settings.save', { title: 'x', retention_months: 'abc' }));
    assert.equal(text.fieldErrors?.[0]?.field, 'retention_months');
  });

  test('publish is refused with a checklist while errors remain, shows warnings, and succeeds once fixed', async () => {
    const t = await builder(
      parseFormSchema({
        sections: [{ id: 's1', title: 'A', questions: [txt('a', 'Same'), txt('b', 'Same')] }],
      }) as unknown as Raw,
    );
    const refused = failOf(
      await t.act('publish', { expected_revision: String(await t.revision()), change_note: 'first' }),
    );
    assert.equal(refused.status, 422);
    assert.ok(refused.publish?.errors.some((e) => /contact\.name/.test(e)));
    assert.ok(refused.publish?.warnings.some((w) => /Duplicate label/.test(w)));
    assert.equal(await t.forms.listVersions(t.form.id).then((v) => v.length), 0);
    await t.act('question.save', { qid: 'a', label: 'Name', bind: 'contact.name', required: 'on' });
    await t.act(
      'question.save',
      { qid: 'b', label: 'Email', bind: 'contact.email', validation_kind: 'email' },
      STAFF_A,
      await t.revision(),
    );
    const published = okOf(
      await t.act('publish', { expected_revision: String(await t.revision()), change_note: 'first' }),
    );
    assert.equal(published.notice, 'published');
    assert.equal(published.data.version, 1);
    const again = okOf(await t.act('publish', { revision: String(await t.revision()) }));
    assert.equal(again.notice, 'publish-same');
    const stale = failOf(await t.act('publish', { expected_revision: '1' }));
    assert.equal(stale.status, 409);
  });

  test('version.restore creates a new draft from an old version and ignores a replayed op_id', async () => {
    const t = await builder(
      parseFormSchema({
        sections: [
          {
            id: 's1',
            title: 'A',
            questions: [
              txt('name', 'Name', { bind: 'contact.name' }),
              txt('email', 'Email', { bind: 'contact.email' }),
            ],
          },
        ],
      }) as unknown as Raw,
    );
    okOf(await t.act('publish', { revision: String(await t.revision()) }));
    okOf(
      await t.act(
        'question.save',
        { qid: 'name', label: 'Full name', bind: 'contact.name' },
        STAFF_A,
        await t.revision(),
      ),
    );
    assert.equal(findQuestion(await t.draft(), 'name')?.question.label, 'Full name');
    okOf(await t.act('version.restore', { version: '1', op_id: 'op-restore' }, STAFF_A, await t.revision()));
    assert.equal(findQuestion(await t.draft(), 'name')?.question.label, 'Name');
    const rev = await t.revision();
    okOf(await t.act('version.restore', { version: '1', op_id: 'op-restore' }, STAFF_A, rev));
    assert.equal(await t.revision(), rev);
    assert.equal(
      failOf(await t.act('version.restore', { version: '9' }, STAFF_A, await t.revision())).status,
      404,
    );
    assert.equal(
      failOf(await t.act('version.restore', { version: 'x' }, STAFF_A, await t.revision())).status,
      400,
    );
  });

  test('form.create, close and reopen', async () => {
    const t = await builder();
    const created = okOf(
      await runBuilderAction({ db: t.d1, staff: { userId: STAFF_A }, now: T0 }, null, 'form.create', {
        slug: 'volunteer-form',
        program: 'web',
        kind: 'contact',
        title: 'Volunteer',
      }),
    );
    assert.match(created.location, /^\/forms\/frm_[^/]+\/edit$/);
    const dup = failOf(
      await runBuilderAction({ db: t.d1, staff: { userId: STAFF_A }, now: T0 }, null, 'form.create', {
        slug: 'volunteer-form',
        program: 'web',
        kind: 'contact',
        title: 'Volunteer',
      }),
    );
    assert.equal(dup.status, 409);
    assert.equal(dup.notice, 'conflict');
    assert.equal(dup.values?.slug, 'volunteer-form');
    const badKind = failOf(
      await runBuilderAction({ db: t.d1, staff: { userId: STAFF_A }, now: T0 }, null, 'form.create', {
        slug: 'x',
        program: 'web',
        kind: 'nope',
        title: 'X',
      }),
    );
    assert.equal(badKind.status, 400);
    const draftClose = failOf(await t.act('form.close'));
    assert.equal(draftClose.status, 409);
  });

  test('unknown actions, forms and missing revisions are refused cleanly', async () => {
    const t = await builder();
    assert.equal(failOf(await t.act('wipe.everything')).status, 400);
    const ghost = failOf(
      await runBuilderAction({ db: t.d1, staff: { userId: STAFF_A } }, 'frm_missing', 'question.add', {
        revision: '1',
        section: 's1',
        type: 'date',
      }),
    );
    assert.equal(ghost.status, 404);
    const noRevision = failOf(
      await runBuilderAction({ db: t.d1, staff: { userId: STAFF_A } }, t.form.id, 'question.add', {
        section: 's1',
        type: 'date',
      }),
    );
    assert.equal(noRevision.status, 400);
    assert.equal(
      failOf(
        await runBuilderAction({ db: t.d1, staff: { userId: STAFF_A } }, null, 'question.add', {
          revision: '1',
        }),
      ).status,
      404,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Pure view helpers
// ---------------------------------------------------------------------------------------------

import { checkLine, formatUtc, statusChip } from '../../apps/admin/src/lib/forms-builder/view.ts';
import { FORM_NOTICES } from '../../apps/admin/src/lib/forms-builder/notices.ts';
import { noticeFrom } from '../../apps/admin/src/lib/flash.ts';

describe('view helpers', () => {
  test('status chips say draft only, published vN or draft changes pending in words', () => {
    assert.equal(
      statusChip({ status: 'draft', publishedVersion: null, hasUnpublishedChanges: true }).label,
      'Draft only',
    );
    assert.equal(
      statusChip({ status: 'published', publishedVersion: 3, hasUnpublishedChanges: false }).label,
      'Published v3',
    );
    assert.match(
      statusChip({ status: 'published', publishedVersion: 3, hasUnpublishedChanges: true }).label,
      /Published v3, draft changes pending/,
    );
    assert.equal(
      statusChip({ status: 'closed', publishedVersion: 2, hasUnpublishedChanges: false }).label,
      'Closed',
    );
  });

  test('times are UTC and say so', () => {
    assert.equal(formatUtc(Date.UTC(2026, 10, 16, 14, 5) / 1000), '16 Nov 2026, 14:05 UTC');
  });

  test('publish checklist lines link to the offending question or section', () => {
    const s = base();
    const dup = checkLine('frm_1', s, 'Question "city" has a duplicate option "A".');
    assert.equal(dup.href, '/forms/frm_1/edit?q=city#editor');
    assert.match(dup.text, /^Question 5 \(“City”\)/);
    const section = checkLine('frm_1', s, 'Section "s2" needs a title of 1 to 200 characters.');
    assert.equal(section.href, '/forms/frm_1/edit#section-s2');
    const whole = checkLine('frm_1', s, 'A contact form needs a question bound to "contact.name".');
    assert.equal(whole.href, null);
    assert.equal(checkLine('frm_1', s, 'Question "ghost" is odd.').href, null);
  });

  test('notice keys are well formed, texts are fixed, and a crafted notice query never shows text', () => {
    for (const [key, notice] of Object.entries(FORM_NOTICES)) {
      assert.match(key, /^[a-z0-9-]{1,40}$/);
      assert.ok(notice.text.length > 5 && !notice.text.includes('<'), key);
    }
    for (const crafted of [
      '<script>alert(1)</script>',
      '__proto__',
      'toString',
      'constructor',
      'Your%20account%20is%20locked',
    ]) {
      assert.equal(
        noticeFrom(new URL(`https://admin.example/forms?notice=${crafted}`), FORM_NOTICES),
        null,
        crafted,
      );
    }
    assert.equal(noticeFrom(new URL('https://admin.example/forms?notice=saved'), FORM_NOTICES)?.kind, 'ok');
  });
});

// ---------------------------------------------------------------------------------------------
// Route handlers behind the real staff gate (session, Access identity, same origin)
// ---------------------------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createDb } from '../../packages/db/index.ts';
import { createSession } from '../../packages/auth/index.ts';
import { StaffIdentityService } from '../../packages/domain/src/services/staff-identity.ts';

const SECRET = 'admin-forms-route-test-session-secret-0123456789';
const ORIGIN = 'http://localhost';

type Handler = (context: never) => Response | Promise<Response>;
type RouteModule = Record<string, Handler | unknown>;
const route = (path: string): Promise<RouteModule> =>
  import(`../../apps/admin/src/pages/api/forms/${path}.ts`);

async function apiFixture() {
  const d1: SqliteD1 = await createMigratedD1();
  const db = createDb(d1 as never);
  const env = { ENVIRONMENT: 'local', DB: d1, SESSION_SECRET: SECRET };
  const identity = new StaffIdentityService(db);
  const staff = await identity.findOrCreateUser('editor@example.invalid', 'Sample Editor');
  await identity.assignSystemRole(staff.id, 'staff_reviewer');
  const plain = await identity.findOrCreateUser('plain@example.invalid', 'Sample Visitor');
  const cookieOf = async (userId: string) =>
    `__session=${encodeURIComponent((await createSession(db, userId, SECRET)).cookieValue)}`;
  const staffCookie = await cookieOf(staff.id);
  const plainCookie = await cookieOf(plain.id);

  async function call(
    path: string,
    method: string,
    options: {
      params?: Record<string, string>;
      fields?: Record<string, string>;
      json?: unknown;
      as?: 'staff' | 'plain' | 'anonymous';
      origin?: string | null;
    } = {},
  ): Promise<Response> {
    const mod = await route(path);
    const handler = mod[method] as Handler | undefined;
    assert.equal(typeof handler, 'function', `${path} exports ${method}`);
    const headers: Record<string, string> = {};
    const as = options.as ?? 'staff';
    if (as === 'staff') headers.cookie = staffCookie;
    if (as === 'plain') headers.cookie = plainCookie;
    if (options.origin !== null) headers.origin = options.origin ?? ORIGIN;
    let body: string | undefined;
    if (options.json !== undefined) {
      headers['content-type'] = 'application/json';
      headers.accept = 'application/json';
      body = JSON.stringify(options.json);
    } else if (options.fields) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(options.fields).toString();
    }
    const request = new Request(`${ORIGIN}/api/forms`, { method, headers, body });
    return (handler as (c: unknown) => Promise<Response>)({
      request,
      params: options.params ?? {},
      locals: { runtime: { env } },
    });
  }

  const forms = new FormsService(d1, { now: T0 });
  async function newForm(schema: Raw = base() as unknown as Raw, slug = 'contact') {
    const form = await forms.create({
      slug,
      program: 'web',
      kind: 'contact',
      title: 'Contact',
      staffId: staff.id,
    });
    const saved = await forms.saveDraft({ formId: form.id, schema, expectedRevision: 1, staffId: staff.id });
    return { form, revision: saved.revision };
  }
  return { d1, call, forms, newForm, staff };
}

const bodyOf = async (response: Response) =>
  (await response.json()) as { success: boolean; data?: any; error?: any };

describe('API routes: the staff gate', () => {
  // Every state-changing route of the builder: [module path, method, params]
  const mutations: [string, string, Record<string, string>][] = [
    ['index', 'POST', {}],
    ['[id]/index', 'PUT', { id: 'frm_x' }],
    ['[id]/index', 'POST', { id: 'frm_x' }],
    ['[id]/publish', 'POST', { id: 'frm_x' }],
    ['[id]/settings', 'POST', { id: 'frm_x' }],
    ['[id]/settings', 'PUT', { id: 'frm_x' }],
    ['[id]/close', 'POST', { id: 'frm_x' }],
    ['[id]/reopen', 'POST', { id: 'frm_x' }],
    ['[id]/restore', 'POST', { id: 'frm_x' }],
    ['[id]/questions/index', 'POST', { id: 'frm_x' }],
    ['[id]/questions/[qid]/index', 'POST', { id: 'frm_x', qid: 'q' }],
    ['[id]/questions/[qid]/index', 'PUT', { id: 'frm_x', qid: 'q' }],
    ['[id]/questions/[qid]/move', 'POST', { id: 'frm_x', qid: 'q' }],
    ['[id]/questions/[qid]/duplicate', 'POST', { id: 'frm_x', qid: 'q' }],
    ['[id]/questions/[qid]/delete', 'POST', { id: 'frm_x', qid: 'q' }],
    ['[id]/questions/[qid]/type', 'POST', { id: 'frm_x', qid: 'q' }],
    ['[id]/sections/index', 'POST', { id: 'frm_x' }],
    ['[id]/sections/[sid]/index', 'POST', { id: 'frm_x', sid: 's' }],
    ['[id]/sections/[sid]/index', 'PUT', { id: 'frm_x', sid: 's' }],
    ['[id]/sections/[sid]/delete', 'POST', { id: 'frm_x', sid: 's' }],
  ];

  test('every mutation needs a staff session: anonymous 401, signed-in non-staff 403, cross-origin 403', async () => {
    const t = await apiFixture();
    const { form } = await t.newForm();
    const before = JSON.stringify(await t.forms.getForEdit(form.id));
    for (const [path, method, params] of mutations) {
      const real = { ...params, ...(params.id ? { id: form.id } : {}) };
      const fields = {
        revision: '1',
        title: 'Hacked',
        slug: 'hacked',
        program: 'web',
        kind: 'contact',
        section: 's1',
        type: 'date',
        qid: 'name',
        dir: 'up',
      };
      assert.equal(
        (await t.call(path, method, { params: real, fields, as: 'anonymous' })).status,
        401,
        `${method} ${path} anonymous`,
      );
      assert.equal(
        (await t.call(path, method, { params: real, fields, as: 'plain' })).status,
        403,
        `${method} ${path} non-staff`,
      );
      assert.equal(
        (await t.call(path, method, { params: real, fields, origin: 'https://evil.example' })).status,
        403,
        `${method} ${path} cross-origin`,
      );
    }
    assert.equal(JSON.stringify(await t.forms.getForEdit(form.id)), before, 'nothing changed');
    assert.equal((await t.forms.listForms()).length, 1, 'no form was created');
    // Reads need staff too.
    assert.equal((await t.call('index', 'GET', { as: 'anonymous' })).status, 401);
    assert.equal((await t.call('[id]/index', 'GET', { params: { id: form.id }, as: 'plain' })).status, 403);
  });

  test('every route file is gated: it calls builderRoute or adminApi and exports no ungated handler', () => {
    const root = 'apps/admin/src/pages/api/forms';
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name.endsWith('.ts')) files.push(full);
      }
    };
    walk(root);
    assert.ok(files.length >= 16, `found ${files.length} route files`);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      assert.match(source, /builderRoute\(|adminApi\(/, `${file} must run the staff gate`);
      assert.match(source, /export const prerender = false/, `${file} is on-demand`);
      assert.ok(!/\bsetHeader|new Response\(/.test(source), `${file} answers through the shared helpers`);
    }
    // A GET handler never mutates.
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (/export const GET/.test(source))
        assert.ok(
          !/builderRoute\(context, '/.test(source.split('export const GET')[1]!.split('export const')[0]!),
          file,
        );
    }
  });

  test('every builder page runs adminPage first and posts only the actions it lists', () => {
    const pages = ['index', 'new', '[id]/edit', '[id]/publish', '[id]/versions', '[id]/preview'];
    for (const page of pages) {
      const source = readFileSync(`apps/admin/src/pages/forms/${page}.astro`, 'utf8');
      assert.match(source, /await adminPage\(Astro\)/, page);
      assert.ok(
        source.indexOf('adminPage(Astro)') <
          (source.indexOf('handleBuilderPost(') === -1 ? Infinity : source.indexOf('handleBuilderPost(')),
        page,
      );
      assert.match(source, /export const prerender = false/, page);
      assert.ok(!/set:html|innerHTML/.test(source), `${page} never injects raw HTML`);
    }
  });
});

describe('API routes: JSON and form-post variants', () => {
  test('createForm: JSON answers 200 with the new form; a browser form post answers 303 to the builder', async () => {
    const t = await apiFixture();
    const json = await t.call('index', 'POST', {
      json: { slug: 'json-form', program: 'worship', kind: 'contact', title: 'From JSON' },
    });
    assert.equal(json.status, 200);
    const created = await bodyOf(json);
    assert.equal(created.success, true);
    assert.match(created.data.id, /^frm_/);
    const form = await t.call('index', 'POST', {
      fields: { slug: 'html-form', program: 'web', kind: 'contact', title: 'From a form' },
    });
    assert.equal(form.status, 303);
    assert.match(form.headers.get('location') ?? '', /^\/forms\/frm_[^/]+\/edit\?notice=created$/);
    const dup = await t.call('index', 'POST', {
      json: { slug: 'json-form', program: 'web', kind: 'contact', title: 'Again' },
    });
    assert.equal(dup.status, 409);
    assert.equal((await bodyOf(dup)).error.code, 'SLUG_TAKEN');
    const dupForm = await t.call('index', 'POST', {
      fields: { slug: 'json-form', program: 'web', kind: 'contact', title: 'Again' },
    });
    assert.equal(dupForm.status, 303);
    assert.equal(dupForm.headers.get('location'), '/forms/new?notice=conflict');
    const list = await bodyOf(await t.call('index', 'GET'));
    assert.deepEqual(list.data.map((f: { slug: string }) => f.slug).sort(), ['html-form', 'json-form']);
    assert.equal(list.data[0].currentVersion, null);
  });

  test('getForm and saveFormDraft: the draft round-trips; a stale revision is 409 with details and overwrites nothing', async () => {
    const t = await apiFixture();
    const { form, revision } = await t.newForm();
    const got = await bodyOf(await t.call('[id]/index', 'GET', { params: { id: form.id } }));
    assert.equal(got.data.revision, revision);
    assert.equal(got.data.draftSchema.sections.length, 2);
    const next = structuredClone(got.data.draftSchema);
    next.sections[0].questions[0].label = 'Renamed over the API';
    const saved = await t.call('[id]/index', 'PUT', {
      params: { id: form.id },
      json: { schema: next, revision, title: 'New title' },
    });
    assert.equal(saved.status, 200);
    assert.equal((await bodyOf(saved)).data.revision, revision + 1);
    assert.equal((await t.forms.getForm(form.id))?.title, 'New title');
    const stale = await t.call('[id]/index', 'PUT', {
      params: { id: form.id },
      json: { schema: base(), revision },
    });
    assert.equal(stale.status, 409);
    const detail = (await bodyOf(stale)).error;
    assert.equal(detail.code, 'REVISION_CONFLICT');
    assert.equal(detail.details.currentRevision, revision + 1);
    assert.equal(
      findQuestion((await t.forms.getForEdit(form.id)).draft, 'name')?.question.label,
      'Renamed over the API',
    );
    const bad = await t.call('[id]/index', 'PUT', {
      params: { id: form.id },
      json: { schema: { sections: [] }, revision: revision + 1 },
    });
    assert.equal(bad.status, 400);
    const missing = await t.call('[id]/index', 'PUT', { params: { id: form.id }, json: { schema: next } });
    assert.equal(missing.status, 400);
    // Form-post variant: the schema travels as JSON text; the answer is a redirect.
    const viaForm = await t.call('[id]/index', 'POST', {
      params: { id: form.id },
      fields: { schema: JSON.stringify(next), revision: String(revision + 1) },
    });
    assert.equal(viaForm.status, 303);
    assert.match(viaForm.headers.get('location') ?? '', /^\/forms\/frm_[^/]+\/edit\?notice=saved$/);
  });

  test('question endpoints: add, save, move, duplicate, type and delete over JSON; op_id duplicates are no-ops', async () => {
    const t = await apiFixture();
    const { form, revision } = await t.newForm();
    const id = { id: form.id };
    const added = await bodyOf(
      await t.call('[id]/questions/index', 'POST', {
        params: id,
        json: { section: 's2', type: 'date', revision, op_id: 'api-add' },
      }),
    );
    assert.equal(added.success, true);
    const qid = added.data.questionId as string;
    const replay = await bodyOf(
      await t.call('[id]/questions/index', 'POST', {
        params: id,
        json: { section: 's2', type: 'date', revision, op_id: 'api-add' },
      }),
    );
    assert.equal(replay.success, true);
    assert.equal(flattenQuestions((await t.forms.getForEdit(form.id)).draft).length, 6);
    let rev = (await t.forms.getForEdit(form.id)).revision;
    const saved = await t.call('[id]/questions/[qid]/index', 'PUT', {
      params: { ...id, qid },
      json: { revision: rev, label: 'Birthday', include_year: 'on' },
    });
    assert.equal(saved.status, 200);
    rev += 1;
    const moved = await t.call('[id]/questions/[qid]/move', 'POST', {
      params: { ...id, qid },
      json: { revision: rev, to: 1 },
    });
    assert.equal(moved.status, 200);
    rev += 1;
    assert.equal(flattenQuestions((await t.forms.getForEdit(form.id)).draft)[0]?.question.id, qid);
    const blocked = await t.call('[id]/questions/[qid]/move', 'POST', {
      params: { ...id, qid: 'role' },
      json: { revision: rev, to: 6 },
    });
    assert.equal(blocked.status, 409);
    assert.equal((await bodyOf(blocked)).error.code, 'MOVE_BLOCKED');
    const dup = await bodyOf(
      await t.call('[id]/questions/[qid]/duplicate', 'POST', {
        params: { ...id, qid: 'city' },
        json: { revision: rev, op_id: 'api-dup' },
      }),
    );
    assert.equal(dup.success, true);
    rev += 1;
    const typeChange = await t.call('[id]/questions/[qid]/type', 'POST', {
      params: { ...id, qid: 'role' },
      json: { revision: rev, type: 'short_text' },
    });
    assert.equal(typeChange.status, 200, 'JSON clients skip the browser confirmation step');
    rev += 1;
    const dependents = await t.call('[id]/questions/[qid]/delete', 'POST', {
      params: { ...id, qid: 'role' },
      json: { revision: rev },
    });
    assert.equal(dependents.status, 409);
    assert.deepEqual(
      (await bodyOf(dependents)).error.details.dependents.map((d: { id: string }) => d.id),
      ['why'],
    );
    const deleted = await t.call('[id]/questions/[qid]/delete', 'POST', {
      params: { ...id, qid: 'city' },
      json: { revision: rev },
    });
    assert.equal(deleted.status, 200);
    // The browser variant of the same refusal redirects with a fixed notice key (never the input).
    rev += 1;
    const formBlocked = await t.call('[id]/questions/[qid]/delete', 'POST', {
      params: { ...id, qid: 'role' },
      fields: { revision: String(rev), confirm: '1' },
    });
    assert.equal(formBlocked.status, 303);
    assert.equal(formBlocked.headers.get('location'), `/forms/${form.id}/edit?notice=delete-blocked`);
  });

  test('section endpoints: add, update, delete an empty one', async () => {
    const t = await apiFixture();
    const { form, revision } = await t.newForm();
    const id = { id: form.id };
    const added = await bodyOf(
      await t.call('[id]/sections/index', 'POST', { params: id, json: { title: 'Extras', revision } }),
    );
    const sid = added.data.sectionId as string;
    const renamed = await t.call('[id]/sections/[sid]/index', 'PUT', {
      params: { ...id, sid },
      json: { title: 'More extras', revision: revision + 1 },
    });
    assert.equal(renamed.status, 200);
    const removed = await t.call('[id]/sections/[sid]/delete', 'POST', {
      params: { ...id, sid },
      json: { revision: revision + 2 },
    });
    assert.equal(removed.status, 200);
    const refused = await t.call('[id]/sections/[sid]/delete', 'POST', {
      params: { ...id, sid: 's1' },
      json: { revision: revision + 3 },
    });
    assert.equal(refused.status, 400);
  });

  test('publish: refused with errors and warnings as 422 (JSON) or a 303 with a fixed key, then published', async () => {
    const t = await apiFixture();
    const { form, revision } = await t.newForm(
      parseFormSchema({
        sections: [{ id: 's1', title: 'A', questions: [txt('a', 'Same'), txt('b', 'Same')] }],
      }) as unknown as Raw,
    );
    const id = { id: form.id };
    const refused = await t.call('[id]/publish', 'POST', {
      params: id,
      json: { expected_revision: revision },
    });
    assert.equal(refused.status, 422);
    const details = (await bodyOf(refused)).error.details;
    assert.ok(details.errors.some((e: string) => /contact\.name/.test(e)));
    assert.ok(details.warnings.some((w: string) => /Duplicate label/.test(w)));
    const viaForm = await t.call('[id]/publish', 'POST', {
      params: id,
      fields: { expected_revision: String(revision) },
    });
    assert.equal(viaForm.status, 303);
    assert.equal(viaForm.headers.get('location'), `/forms/${form.id}/publish?notice=blocked`);
    assert.equal((await t.forms.listVersions(form.id)).length, 0);

    const fixed = parseFormSchema({
      sections: [
        {
          id: 's1',
          title: 'A',
          questions: [
            txt('name', 'Name', { bind: 'contact.name' }),
            txt('email', 'Email', { bind: 'contact.email' }),
          ],
        },
      ],
    });
    const rev2 = (
      await t.forms.saveDraft({
        formId: form.id,
        schema: fixed,
        expectedRevision: revision,
        staffId: t.staff.id,
      })
    ).revision;
    const stale = await t.call('[id]/publish', 'POST', { params: id, json: { expected_revision: revision } });
    assert.equal(stale.status, 409);
    const ok = await bodyOf(
      await t.call('[id]/publish', 'POST', {
        params: id,
        json: { expected_revision: rev2, change_note: 'first' },
      }),
    );
    assert.equal(ok.data.version, 1);
    const restored = await t.call('[id]/restore', 'POST', {
      params: id,
      json: { version: 1, revision: rev2, op_id: 'api-restore' },
    });
    assert.equal(restored.status, 200);
    const closed = await t.call('[id]/close', 'POST', { params: id, json: {} });
    assert.equal(closed.status, 200);
    assert.equal((await t.forms.getForm(form.id))?.status, 'closed');
    const reopened = await t.call('[id]/reopen', 'POST', { params: id, fields: {} });
    assert.equal(reopened.status, 303);
    assert.equal(reopened.headers.get('location'), '/forms?notice=reopened');
    assert.equal(
      (await t.call('[id]/settings', 'POST', { params: id, json: { title: 'Renamed', retention_months: 6 } }))
        .status,
      200,
    );
  });

  test('unknown forms are 404 and no refusal ever echoes the request into the answer', async () => {
    const t = await apiFixture();
    const gone = await t.call('[id]/index', 'GET', { params: { id: 'frm_nope' } });
    assert.equal(gone.status, 404);
    const hostile = '<img src=x onerror=alert(1)>';
    const r = await t.call('index', 'POST', {
      json: { slug: hostile, program: 'web', kind: 'contact', title: hostile },
    });
    assert.equal(r.status, 400);
    assert.ok(!(await r.text()).includes('onerror'));
    const f = await t.call('index', 'POST', {
      fields: { slug: hostile, program: 'web', kind: 'contact', title: hostile },
    });
    assert.equal(f.status, 303);
    assert.equal(f.headers.get('location'), '/forms/new?notice=invalid');
  });
});
