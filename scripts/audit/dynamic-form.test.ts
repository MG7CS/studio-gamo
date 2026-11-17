/**
 * Guarantees of the shared dynamic form renderer (packages/ui/src/components/forms/dynamic/*, the helpers in
 * packages/ui/src/lib/dynamic-form.ts and its browser enhancement):
 * - the domain `FormSchema` is assignable to the renderer's structural schema type (compile-time, `tsc -p scripts`);
 * - field naming, upload limits and show-if semantics agree with the server (the real `validateAnswers`);
 * - every question type is rendered; markup keeps the form kit's contracts (no inline script, no on*=,
 *   no h1, semantic tokens only, 44 px targets, labelled groups).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  FILE_GROUP_KINDS,
  OTHER_VALUE as DOMAIN_OTHER,
  QUESTION_TYPES,
  gridFieldName as domainGridFieldName,
  otherFieldName as domainOtherFieldName,
  parseFormSchema,
  validateAnswers,
  type FormSchema,
  type UploadRef,
} from '../../packages/domain/src/forms/index.ts';
import { UPLOAD_LIMITS, UPLOAD_PART_SIZE } from '../../packages/domain/src/forms/upload-checks.ts';
import {
  ACCEPT_BY_GROUP,
  OTHER_VALUE,
  decodeShowIfRules,
  encodeShowIfRules,
  gridFieldName,
  otherFieldName,
  visibilityForRaw,
  type DynFormSchema,
} from '../../packages/ui/src/lib/dynamic-form.ts';
import { PARITY_CASES } from '../../packages/ui/src/lib/dynamic-form.fixtures.ts';
import { CLIENT_UPLOAD_LIMITS, PART_SIZE } from '../../packages/ui/src/lib/chunked-upload.ts';
import {
  fixtureErrors,
  fixtureSchema,
  fixtureValues,
} from '../../apps/web/src/components/catalog/dynamic-form-fixture.ts';

const DIR = 'packages/ui/src/components/forms/dynamic';
const files = readdirSync(DIR).filter((f) => f.endsWith('.astro'));
const source = (name: string) => readFileSync(`${DIR}/${name}`, 'utf8');
const markup = (name: string) => source(name).replace(/\/\*\*[\s\S]*?\*\//g, '');

// ---------------------------------------------------------------------------
// ui -> domain compatibility
// ---------------------------------------------------------------------------

test('the domain FormSchema is assignable to the renderer schema type', () => {
  // Compile-time check: `tsc -p scripts` fails here if the domain type drifts from DynFormSchema.
  const accepts = (schema: DynFormSchema): number => schema.sections.length;
  const domain = parseFormSchema({
    sections: [{ id: 's', title: 'S', questions: [{ id: 'q', type: 'short_text', label: 'Q' }] }],
  });
  const asDomain: FormSchema = domain;
  assert.equal(accepts(asDomain), 1);
});

test('the preview fixture is a valid published-shape schema using every question type', () => {
  const parsed = parseFormSchema(fixtureSchema);
  const types = new Set(parsed.sections.flatMap((s) => s.questions.map((q) => q.type)));
  for (const type of QUESTION_TYPES) assert.ok(types.has(type), `fixture has a ${type} question`);
  assert.ok(
    parsed.sections.some((s) => s.showIf),
    'a section show-if',
  );
  assert.ok(
    parsed.sections.some((s) => s.questions.some((q) => q.showIf)),
    'a question show-if',
  );
  const asRaw: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(fixtureValues)) if (v !== undefined) asRaw[k] = v;
  const result = validateAnswers(parsed, asRaw, {});
  assert.equal(result.ok, false);
  const ids = new Set(parsed.sections.flatMap((s) => s.questions.map((q) => q.id)));
  for (const e of fixtureErrors) assert.ok(ids.has(e.questionId), `error id ${e.questionId} exists`);
});

// ---------------------------------------------------------------------------
// Agreement with the server
// ---------------------------------------------------------------------------

test('field names equal the server conventions', () => {
  assert.equal(OTHER_VALUE, DOMAIN_OTHER);
  for (const id of ['a', 'long-id_1']) {
    assert.equal(otherFieldName(id), domainOtherFieldName(id));
    for (const i of [0, 3, 19]) assert.equal(gridFieldName(id, i), domainGridFieldName(id, i));
  }
});

test('upload limits and part size equal the server allowlist', () => {
  assert.equal(PART_SIZE, UPLOAD_PART_SIZE);
  assert.deepEqual(CLIENT_UPLOAD_LIMITS.video, {
    maxBytes: UPLOAD_LIMITS.video.maxBytes,
    types: UPLOAD_LIMITS.video.types,
  });
  assert.deepEqual(CLIENT_UPLOAD_LIMITS.image, {
    maxBytes: UPLOAD_LIMITS.photo.maxBytes,
    types: UPLOAD_LIMITS.photo.types,
  });
  assert.deepEqual(CLIENT_UPLOAD_LIMITS.pdf, {
    maxBytes: UPLOAD_LIMITS.pdf.maxBytes,
    types: UPLOAD_LIMITS.pdf.types,
  });
  assert.equal(ACCEPT_BY_GROUP.video.maxMb * 1024 * 1024, UPLOAD_LIMITS.video.maxBytes);
  assert.equal(ACCEPT_BY_GROUP.image.maxMb * 1024 * 1024, UPLOAD_LIMITS.photo.maxBytes);
  assert.equal(ACCEPT_BY_GROUP.pdf.maxMb * 1024 * 1024, UPLOAD_LIMITS.pdf.maxBytes);
  for (const group of Object.keys(FILE_GROUP_KINDS)) assert.ok(group in ACCEPT_BY_GROUP, group);
});

test('show-if parity: the page and the real validateAnswers agree on every case of the shared table', () => {
  for (const c of PARITY_CASES) {
    const server = validateAnswers(
      c.schema as unknown as FormSchema,
      c.raw,
      (c.uploads ?? {}) as Record<string, UploadRef[]>,
    );
    const requiredErrors = new Set(
      server.ok
        ? []
        : server.errors.filter((e) => e.message === 'This question is required.').map((e) => e.questionId),
    );
    const counts = Object.fromEntries(Object.entries(c.uploads ?? {}).map(([id, list]) => [id, list.length]));
    const page = visibilityForRaw(c.schema, c.raw, counts);
    for (const [id, expected] of Object.entries(c.expectVisible)) {
      assert.equal(requiredErrors.has(id), expected, `${c.name}: server shows ${id}`);
      assert.equal(page.shown.get(id), expected, `${c.name}: page shows ${id}`);
    }
  }
});

test('show-if rules of a domain-parsed schema survive the attribute encoding', () => {
  const schema = parseFormSchema(fixtureSchema);
  for (const section of schema.sections) {
    for (const showIf of [section.showIf, ...section.questions.map((q) => q.showIf)]) {
      if (!showIf) continue;
      assert.deepEqual(decodeShowIfRules(encodeShowIfRules(showIf.rules)), showIf.rules);
    }
  }
});

// ---------------------------------------------------------------------------
// Markup contracts
// ---------------------------------------------------------------------------

test('every question type is rendered by QuestionField', () => {
  const text = markup('QuestionField.astro');
  for (const type of QUESTION_TYPES) assert.match(text, new RegExp(`'${type}'`), type);
  assert.match(text, /data-dyn-question=\{q\.id\}/);
  assert.match(text, /showIfAttributes\(q\.showIf\)/);
  assert.match(markup('SectionBlock.astro'), /showIfAttributes\(section\.showIf\)/);
});

test('every component documents its props', () => {
  for (const name of files)
    assert.match(source(name), /^---\n\/\*\*[\s\S]*?Props/, `${name} documents its props`);
});

test('CSP: no inline script code and no on*= handlers; only the bundled client module', () => {
  for (const name of files) {
    const text = source(name);
    assert.ok(!/\son[a-z]+=/i.test(text.replace(/---[\s\S]*?---/, '')), `${name}: no on*= handler`);
    assert.ok(!/is:inline|set:html|innerHTML|javascript:/.test(text), `${name}: no inline or raw HTML`);
    for (const m of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
      assert.equal(name, 'DynamicForm.astro', 'only DynamicForm loads the client module');
      assert.match(
        m[1]!.trim(),
        /^import \{ initDynamicForms \} from '\.\.\/\.\.\/\.\.\/lib\/dynamic-form-client';\s*initDynamicForms\(\);$/,
      );
    }
  }
  const client = readFileSync('packages/ui/src/lib/dynamic-form-client.ts', 'utf8');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/.test(client));
  const uploader = readFileSync('packages/ui/src/lib/chunked-upload.ts', 'utf8');
  assert.ok(!/https?:\/\//.test(uploader.replace(/\/\*\*[\s\S]*?\*\//g, '')), 'uploader names no host');
});

test('no h1, no inline styles, no raw colours or arbitrary values in the renderer', () => {
  for (const name of files) {
    const text = markup(name);
    assert.ok(!/<h1\b/i.test(text), `${name}: no h1`);
    assert.ok(!/\sstyle=/.test(text), `${name}: no inline style`);
    assert.ok(
      !/#[0-9a-fA-F]{3,8}\b(?![\w-])/.test(text.replace(/---[\s\S]*?---/, '')),
      `${name}: no hex colour`,
    );
    assert.ok(!/\b(rgb|hsl|oklch)a?\(/.test(text), `${name}: no raw colour function`);
    // `data-[state=error]:` is a data-attribute variant, not an arbitrary value.
    assert.ok(
      !/\b[a-z-]+-\[[^\]]+\]/.test(text.replace(/data-\[[^\]]+\]/g, '')),
      `${name}: no arbitrary Tailwind value`,
    );
  }
});

test('groups are labelled and the posted names follow the server conventions', () => {
  assert.match(source('ChoiceGroup.astro'), /import Fieldset from/);
  assert.match(source('ChoiceGroup.astro'), /otherFieldName\(name\)/);
  assert.match(source('ChoiceGroup.astro'), /role=\{radios \? 'radiogroup' : 'group'\}/);
  assert.match(source('GridField.astro'), /gridFieldName\(q\.id, i\)/);
  assert.equal(
    (source('GridField.astro').match(/<Fieldset/g) ?? []).length,
    2,
    'outer and per-row fieldsets',
  );
  assert.match(source('UploadField.astro'), /uploadFieldName\(q\.id\)/);
  assert.match(source('UploadField.astro'), /fileInputName\(q\.id\)/);
  const form = markup('DynamicForm.astro');
  for (const piece of [
    'FormErrorSummary',
    'TurnstileWidget',
    'SubmitButton',
    'idempotency_key',
    'data-dynamic-form',
  ]) {
    assert.ok(form.includes(piece), `DynamicForm has ${piece}`);
  }
  assert.match(form, /<slot name="before" \/>/);
  assert.match(
    form,
    /enctype=\{method === 'post' \? \(enctype \?\? \(hasFiles \? 'multipart\/form-data' : undefined\)\) : undefined\}/,
  );
});

test('custom buttons are at least 44 px tall and statements are plain text', () => {
  for (const name of files) {
    for (const m of markup(name).matchAll(/<button\b[\s\S]*?>/g)) {
      assert.match(m[0], /min-h-11/, `${name}: button has a 44 px target`);
    }
  }
  const statement = markup('StatementBlock.astro');
  assert.ok(!/set:html|<Fragment/.test(statement));
  assert.match(statement, /splitParagraphs/);
});
