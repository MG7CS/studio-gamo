import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1, type SqliteD1 } from '@gamo/db/testing';
import { FormSchemaError, parseFormSchema, type UploadRef } from './schema.ts';
import {
  FormAnswersError,
  FormConflictError,
  FormPublishError,
  FormsError,
  FormsService,
  addMonthsUtc,
  canonicalJson,
  contentHash,
  csvCell,
  isFormsError,
  type Form,
} from './service.ts';
import { sha256Hex } from '../security/crypto.ts';

const T0 = Date.UTC(2026, 5, 1, 12, 0, 0) / 1000; // 2026-06-01
const STAFF = 'stf_a';
const STAFF_B = 'stf_b';

type Raw = Record<string, unknown>;
const q = {
  name: (): Raw => ({
    id: 'name',
    type: 'short_text',
    label: 'Your name',
    required: true,
    bind: 'contact.name',
  }),
  email: (): Raw => ({
    id: 'email',
    type: 'short_text',
    label: 'Your email',
    required: true,
    bind: 'contact.email',
    validation: { kind: 'email' },
  }),
  phone: (): Raw => ({
    id: 'phone',
    type: 'short_text',
    label: 'Your phone',
    bind: 'contact.phone',
    validation: { kind: 'phone' },
  }),
};
const schemaOf = (...extra: Raw[]) => ({
  sections: [{ id: 's1', title: 'Your details', questions: [q.name(), q.email(), ...extra] }],
});
const bareTextQuestion = (id: string, label: string, extra: Raw = {}): Raw => ({
  id,
  type: 'short_text',
  label,
  required: false,
  ...extra,
});

async function setup(
  options: {
    kind?: 'contact' | 'church_request' | 'musician_application';
    program?: Form['program'];
    slug?: string;
    retentionMonths?: number;
  } = {},
) {
  const db = await createMigratedD1();
  const forms = new FormsService(db, { now: T0 });
  const form = await forms.create({
    slug: options.slug ?? 'contact',
    program: options.program ?? 'web',
    kind: options.kind ?? 'contact',
    title: 'Contact message',
    retentionMonths: options.retentionMonths,
    staffId: STAFF,
  });
  return { db, forms, form };
}

/** Create a published contact form from `schema`. */
async function published(schema: unknown = schemaOf(), options: Parameters<typeof setup>[0] = {}) {
  const ctx = await setup(options);
  const { revision } = await ctx.forms.saveDraft({
    formId: ctx.form.id,
    schema,
    expectedRevision: ctx.form.revision,
    staffId: STAFF,
  });
  const result = await ctx.forms.publish({ formId: ctx.form.id, expectedRevision: revision, staffId: STAFF });
  return { ...ctx, revision, result };
}

const answers = (name = 'Ana Reyes', email = 'Ana@Example.org'): Record<string, string> => ({ name, email });
let n = 0;
const key = () => `idem-${++n}`;
const count = (db: SqliteD1, table: string) =>
  (db.sqlite.prepare(`SELECT count(*) AS c FROM ${table}`).get() as { c: number }).c;

describe('create', () => {
  test('starts as a draft with one empty section, revision 1', async () => {
    const { forms, form } = await setup();
    assert.equal(form.status, 'draft');
    assert.equal(form.revision, 1);
    assert.equal(form.currentVersionId, null);
    assert.equal(form.updatedByUserId, STAFF);
    const edit = await forms.getForEdit(form.id);
    assert.equal(edit.draft.sections.length, 1);
    assert.deepEqual(edit.draft.sections[0]!.questions, []);
    assert.equal(edit.latestVersion, null);
    assert.equal(edit.hasUnpublishedChanges, true);
  });

  test('refuses a bad slug, kind, program or title; a duplicate slug is SLUG_TAKEN', async () => {
    const { forms } = await setup();
    const base = {
      slug: 'other',
      program: 'web' as const,
      kind: 'contact' as const,
      title: 'Other',
      staffId: STAFF,
    };
    for (const bad of [
      { slug: 'Has Caps' },
      { slug: '' },
      { slug: 'a'.repeat(81) },
      { slug: '-x' },
      { kind: 'nope' as never },
      { program: 'live' as never },
      { title: '   ' },
      { retentionMonths: 0 },
    ]) {
      await assert.rejects(
        forms.create({ ...base, ...bad }),
        (e: unknown) => isFormsError(e) && e.code === 'INVALID_INPUT',
      );
    }
    await assert.rejects(
      forms.create({ ...base, slug: 'contact' }),
      (e: unknown) => e instanceof FormsError && e.code === 'SLUG_TAKEN' && e.status === 409,
    );
  });
});

describe('draft revision and operations', () => {
  test('saveDraft bumps the revision', async () => {
    const { forms, form } = await setup();
    const a = await forms.saveDraft({
      formId: form.id,
      schema: schemaOf(),
      expectedRevision: 1,
      staffId: STAFF,
    });
    assert.equal(a.revision, 2);
    const b = await forms.saveDraft({
      formId: form.id,
      schema: schemaOf(),
      expectedRevision: 2,
      staffId: STAFF_B,
    });
    assert.equal(b.revision, 3);
    assert.equal((await forms.getForm(form.id))!.updatedByUserId, STAFF_B);
  });

  test('a stale revision throws FormConflictError and leaves the other save untouched', async () => {
    const { forms, form } = await setup();
    await forms.saveDraft({
      formId: form.id,
      schema: schemaOf(bareTextQuestion('city', 'City')),
      expectedRevision: 1,
      staffId: STAFF,
    });
    const mine = schemaOf(bareTextQuestion('zip', 'Zip code'));
    const frozen = JSON.stringify(mine);
    let caught: unknown;
    try {
      await forms.saveDraft({ formId: form.id, schema: mine, expectedRevision: 1, staffId: STAFF_B });
    } catch (e) {
      caught = e;
    }
    assert.ok(caught instanceof FormConflictError);
    assert.equal(caught.code, 'REVISION_CONFLICT');
    assert.equal(caught.status, 409);
    assert.equal(caught.currentRevision, 2);
    assert.equal(caught.updatedByUserId, STAFF);
    assert.equal(caught.updatedAt, T0);
    assert.equal(caught.attemptedSchema?.sections[0]!.questions.at(-1)!.id, 'zip');
    assert.equal(JSON.stringify(mine), frozen, "the caller's schema object is not modified");
    const edit = await forms.getForEdit(form.id);
    assert.equal(edit.revision, 2);
    assert.ok(edit.draft.sections[0]!.questions.some((x) => x.id === 'city'));
    assert.ok(!edit.draft.sections[0]!.questions.some((x) => x.id === 'zip'));
  });

  test('a repeated opId is a no-op that returns the current revision', async () => {
    const { db, forms, form } = await setup();
    const first = await forms.saveDraft({
      formId: form.id,
      schema: schemaOf(),
      expectedRevision: 1,
      staffId: STAFF,
      opId: 'op-1',
    });
    assert.equal(first.revision, 2);
    const again = await forms.saveDraft({
      formId: form.id,
      schema: schemaOf(bareTextQuestion('extra', 'Extra')),
      expectedRevision: 1,
      staffId: STAFF,
      opId: 'op-1',
    });
    assert.equal(again.revision, 2);
    assert.deepEqual(
      (await forms.getForEdit(form.id)).draft.sections[0]!.questions.map((x) => x.id),
      ['name', 'email'],
    );
    assert.equal(count(db, 'form_operations'), 1);
  });

  test('a conflicting save with an opId records no operation; the retry with the new revision works', async () => {
    const { db, forms, form } = await setup();
    await forms.saveDraft({ formId: form.id, schema: schemaOf(), expectedRevision: 1, staffId: STAFF });
    await assert.rejects(
      forms.saveDraft({
        formId: form.id,
        schema: schemaOf(),
        expectedRevision: 1,
        staffId: STAFF_B,
        opId: 'op-x',
      }),
      FormConflictError,
    );
    assert.equal(count(db, 'form_operations'), 0);
    const ok = await forms.saveDraft({
      formId: form.id,
      schema: schemaOf(),
      expectedRevision: 2,
      staffId: STAFF_B,
      opId: 'op-x',
    });
    assert.equal(ok.revision, 3);
  });

  test('an opId cannot be reused on another form', async () => {
    const { forms, form } = await setup();
    const other = await forms.create({
      slug: 'other',
      program: 'web',
      kind: 'contact',
      title: 'Other',
      staffId: STAFF,
    });
    await forms.saveDraft({
      formId: form.id,
      schema: schemaOf(),
      expectedRevision: 1,
      staffId: STAFF,
      opId: 'op-9',
    });
    await assert.rejects(
      forms.saveDraft({
        formId: other.id,
        schema: schemaOf(),
        expectedRevision: 1,
        staffId: STAFF,
        opId: 'op-9',
      }),
      (e: unknown) => isFormsError(e) && e.code === 'INVALID_INPUT',
    );
  });

  test('an invalid schema throws FormSchemaError and the revision does not change', async () => {
    const { forms, form } = await setup();
    await assert.rejects(
      forms.saveDraft({ formId: form.id, schema: { sections: [] }, expectedRevision: 1, staffId: STAFF }),
      FormSchemaError,
    );
    assert.equal((await forms.getForm(form.id))!.revision, 1);
  });

  test('unknown form is NOT_FOUND', async () => {
    const { forms } = await setup();
    await assert.rejects(
      forms.saveDraft({ formId: 'frm_nope', schema: schemaOf(), expectedRevision: 1, staffId: STAFF }),
      (e: unknown) => isFormsError(e) && e.code === 'NOT_FOUND',
    );
  });
});

describe('publish and versions', () => {
  test('publish snapshots an immutable version with the canonical content hash', async () => {
    const { db, forms, form, result } = await published();
    assert.equal(result.created, true);
    assert.equal(result.version.version, 1);
    assert.equal(result.version.publishedByUserId, STAFF);
    const schema = parseFormSchema(schemaOf());
    assert.equal(result.version.contentHash, await sha256Hex(canonicalJson(schema)));
    assert.equal(result.version.contentHash, await contentHash(schema));
    assert.deepEqual(result.version.schema, schema);
    const after = (await forms.getForm(form.id))!;
    assert.equal(after.status, 'published');
    assert.equal(after.currentVersionId, result.version.id);
    assert.throws(
      () =>
        db.sqlite.prepare("UPDATE form_versions SET schema_json = '{}' WHERE id = ?").run(result.version.id),
      /immutable/,
    );
  });

  test('canonicalJson ignores key order', async () => {
    assert.equal(
      canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: undefined } }),
      canonicalJson({ a: { d: [2, { y: 2, z: 1 }] }, b: 1 }),
    );
  });

  test('blocking check errors throw FormPublishError and write no version', async () => {
    const { db, forms, form } = await setup();
    const bad = { sections: [{ id: 's1', title: 'x', questions: [q.name()] }] }; // contact needs contact.email
    const { revision } = await forms.saveDraft({
      formId: form.id,
      schema: bad,
      expectedRevision: 1,
      staffId: STAFF,
    });
    let caught: unknown;
    try {
      await forms.publish({ formId: form.id, expectedRevision: revision, staffId: STAFF });
    } catch (e) {
      caught = e;
    }
    assert.ok(caught instanceof FormPublishError);
    assert.equal(caught.code, 'PUBLISH_BLOCKED');
    assert.ok(caught.errors.some((m) => m.includes('contact.email')));
    assert.ok(Array.isArray(caught.warnings));
    assert.equal(count(db, 'form_versions'), 0);
    assert.equal((await forms.getForm(form.id))!.status, 'draft');
  });

  test('warnings do not block and are returned', async () => {
    const dropdownOne = {
      id: 'topic',
      type: 'dropdown',
      label: 'Topic',
      options: ['Only one'],
      required: false,
    };
    const { result } = await published(schemaOf(dropdownOne));
    assert.equal(result.created, true);
    assert.ok(result.checkWarnings.some((w) => /fewer than 2 options/.test(w)));
  });

  test('republishing an unchanged draft returns the same version', async () => {
    const { db, forms, form, revision, result } = await published();
    const again = await forms.publish({ formId: form.id, expectedRevision: revision, staffId: STAFF_B });
    assert.equal(again.created, false);
    assert.equal(again.version.id, result.version.id);
    // Saving identical content (a new revision) and publishing is still the same version.
    const saved = await forms.saveDraft({
      formId: form.id,
      schema: schemaOf(),
      expectedRevision: revision,
      staffId: STAFF,
    });
    const third = await forms.publish({ formId: form.id, expectedRevision: saved.revision, staffId: STAFF });
    assert.equal(third.version.id, result.version.id);
    assert.equal(count(db, 'form_versions'), 1);
  });

  test('republishing after an edit creates version 2 with a note; an old submission still renders with v1', async () => {
    const {
      forms,
      form,
      revision,
      result: v1,
    } = await published(schemaOf(bareTextQuestion('city', 'City where you live')));
    const sub = await forms.submit({
      slug: 'contact',
      raw: { ...answers(), city: 'Springfield' },
      uploads: {},
      idempotencyKey: key(),
    });
    // v2: the city question is removed and "name" is relabelled; a new question appears.
    const v2schema = {
      sections: [
        {
          id: 's1',
          title: 'Your details',
          questions: [{ ...q.name(), label: 'Full name' }, q.email(), bareTextQuestion('topic', 'Topic')],
        },
      ],
    };
    const saved = await forms.saveDraft({
      formId: form.id,
      schema: v2schema,
      expectedRevision: revision,
      staffId: STAFF,
    });
    const v2 = await forms.publish({
      formId: form.id,
      expectedRevision: saved.revision,
      changeNote: '  Removed city  ',
      staffId: STAFF_B,
    });
    assert.equal(v2.created, true);
    assert.equal(v2.version.version, 2);
    assert.equal(v2.version.changeNote, 'Removed city');
    assert.notEqual(v2.version.contentHash, v1.version.contentHash);

    const detail = (await forms.getSubmission(sub.submission.id))!;
    assert.equal(detail.version.version, 1);
    assert.equal(detail.version.id, v1.version.id);
    const labels = detail.version.schema.sections.flatMap((s) => s.questions.map((x) => x.label));
    assert.deepEqual(labels, ['Your name', 'Your email', 'City where you live']);
    assert.equal(detail.answers.city, 'Springfield', 'removed question keeps its answer');
    assert.equal((await forms.getPublished('contact'))!.version.version, 2);
    assert.equal((await forms.listVersions(form.id)).map((v) => v.version).join(), '2,1');
  });

  test('publish with a stale revision conflicts; a note over 500 characters is refused', async () => {
    const { forms, form, revision } = await published();
    await forms.saveDraft({
      formId: form.id,
      schema: schemaOf(),
      expectedRevision: revision,
      staffId: STAFF_B,
    });
    await assert.rejects(
      forms.publish({ formId: form.id, expectedRevision: revision, staffId: STAFF }),
      FormConflictError,
    );
    await assert.rejects(
      forms.publish({
        formId: form.id,
        expectedRevision: revision + 1,
        changeNote: 'x'.repeat(501),
        staffId: STAFF,
      }),
      (e: unknown) => isFormsError(e) && e.code === 'INVALID_INPUT',
    );
  });

  test('diffAgainstPublished lists added, changed and removed questions', async () => {
    const { forms, form, revision } = await published(
      schemaOf(bareTextQuestion('city', 'City'), bareTextQuestion('zip', 'Zip')),
    );
    assert.equal((await forms.diffAgainstPublished(form.id)).hasChanges, false);
    const next = {
      sections: [
        {
          id: 's1',
          title: 'Your details',
          questions: [
            q.name(),
            { ...q.email(), label: 'Email address' },
            bareTextQuestion('topic', 'Topic'),
            bareTextQuestion('zip', 'Zip'),
          ],
        },
      ],
    };
    await forms.saveDraft({ formId: form.id, schema: next, expectedRevision: revision, staffId: STAFF });
    const diff = await forms.diffAgainstPublished(form.id);
    assert.equal(diff.publishedVersion, 1);
    assert.deepEqual(
      diff.added.map((d) => [d.id, d.label]),
      [['topic', 'Topic']],
    );
    assert.deepEqual(
      diff.changed.map((d) => [d.id, d.label]),
      [['email', 'Email address']],
    );
    assert.deepEqual(
      diff.removed.map((d) => [d.id, d.label]),
      [['city', 'City']],
    );
    assert.equal(diff.hasChanges, true);
  });

  test('diff of a never-published form lists everything as added', async () => {
    const { forms, form } = await setup();
    const { revision } = await forms.saveDraft({
      formId: form.id,
      schema: schemaOf(),
      expectedRevision: 1,
      staffId: STAFF,
    });
    const diff = await forms.diffAgainstPublished(form.id);
    assert.equal(diff.publishedVersion, null);
    assert.deepEqual(
      diff.added.filter((d) => d.kind === 'question').map((d) => d.id),
      ['name', 'email'],
    );
    assert.ok(revision >= 2);
  });

  test('restoreVersionToDraft copies an old version into the draft without touching the published one', async () => {
    const { forms, form, revision, result: v1 } = await published(schemaOf(bareTextQuestion('city', 'City')));
    const s2 = await forms.saveDraft({
      formId: form.id,
      schema: schemaOf(),
      expectedRevision: revision,
      staffId: STAFF,
    });
    const v2 = await forms.publish({ formId: form.id, expectedRevision: s2.revision, staffId: STAFF });
    const restored = await forms.restoreVersionToDraft({
      formId: form.id,
      version: 1,
      expectedRevision: s2.revision,
      staffId: STAFF_B,
    });
    assert.equal(restored.revision, s2.revision + 1);
    const edit = await forms.getForEdit(form.id);
    assert.ok(edit.draft.sections[0]!.questions.some((x) => x.id === 'city'));
    assert.equal(edit.latestVersion!.version, 2);
    assert.equal(edit.latestVersion!.id, v2.version.id);
    assert.equal(edit.hasUnpublishedChanges, true);
    // Publishing the restored draft equals v1's content: a new version 3, not a mutation of v1.
    const v3 = await forms.publish({ formId: form.id, expectedRevision: restored.revision, staffId: STAFF });
    assert.equal(v3.version.version, 3);
    assert.equal(v3.version.contentHash, v1.version.contentHash);
    await assert.rejects(
      forms.restoreVersionToDraft({
        formId: form.id,
        version: 9,
        expectedRevision: restored.revision,
        staffId: STAFF,
      }),
      (e: unknown) => isFormsError(e) && e.code === 'VERSION_NOT_FOUND',
    );
  });

  test('close and reopen; closing a draft is refused; both are idempotent', async () => {
    const draft = await setup();
    await assert.rejects(
      draft.forms.close(draft.form.id),
      (e: unknown) => isFormsError(e) && e.code === 'INVALID_TRANSITION',
    );
    await assert.rejects(
      draft.forms.reopen(draft.form.id),
      (e: unknown) => isFormsError(e) && e.code === 'INVALID_TRANSITION',
    );
    const { forms, form } = await published();
    assert.equal((await forms.close(form.id, { staffId: STAFF_B })).status, 'closed');
    assert.equal((await forms.close(form.id)).status, 'closed');
    assert.equal((await forms.reopen(form.id)).status, 'published');
    assert.equal((await forms.reopen(form.id)).status, 'published');
  });

  test('getPublished: null for a draft or unknown slug, closed forms report accepting false', async () => {
    const { forms, form } = await setup();
    assert.equal(await forms.getPublished('contact'), null);
    assert.equal(await forms.getPublished('missing'), null);
    const p = await published(schemaOf(), { slug: 'live-one' });
    const got = (await p.forms.getPublished('live-one'))!;
    assert.equal(got.accepting, true);
    assert.equal(got.version.version, 1);
    assert.equal(got.form.kind, 'contact');
    await p.forms.close(p.form.id);
    assert.equal((await p.forms.getPublished('live-one'))!.accepting, false);
    assert.ok(form);
  });

  test('listForms and getForEdit report counts and pending changes', async () => {
    const { forms, form, revision } = await published();
    await forms.submit({ slug: 'contact', raw: answers(), uploads: {}, idempotencyKey: key() });
    let list = await forms.listForms({ program: 'web' });
    assert.equal(list[0]!.submissionCount, 1);
    assert.equal(list[0]!.newSubmissionCount, 1);
    assert.equal(list[0]!.publishedVersion, 1);
    assert.equal(list[0]!.hasUnpublishedChanges, false);
    await forms.saveDraft({
      formId: form.id,
      schema: schemaOf(bareTextQuestion('city', 'City')),
      expectedRevision: revision,
      staffId: STAFF,
    });
    list = await forms.listForms();
    assert.equal(list[0]!.hasUnpublishedChanges, true);
    const edit = await forms.getForEdit(form.id);
    assert.equal(edit.versionCount, 1);
    assert.equal(edit.submissionCount, 1);
  });
});

describe('submit', () => {
  test('draft and unknown forms are NOT_FOUND; closed is FORM_CLOSED until reopened', async () => {
    const draft = await setup();
    const call = (forms: FormsService, slug = 'contact') =>
      forms.submit({ slug, raw: answers(), uploads: {}, idempotencyKey: key() });
    await assert.rejects(call(draft.forms), (e: unknown) => isFormsError(e) && e.code === 'NOT_FOUND');
    await assert.rejects(
      call(draft.forms, 'nope'),
      (e: unknown) => isFormsError(e) && e.code === 'NOT_FOUND',
    );
    const { forms, form } = await published();
    await forms.close(form.id);
    await assert.rejects(
      call(forms),
      (e: unknown) => e instanceof FormsError && e.code === 'FORM_CLOSED' && e.status === 410,
    );
    await forms.reopen(form.id);
    assert.equal((await call(forms)).created, true);
  });

  test('validation errors throw FormAnswersError with the question ids and store nothing', async () => {
    const { db, forms } = await published();
    let caught: unknown;
    try {
      await forms.submit({
        slug: 'contact',
        raw: { name: '', email: 'not-an-email' },
        uploads: {},
        idempotencyKey: key(),
      });
    } catch (e) {
      caught = e;
    }
    assert.ok(caught instanceof FormAnswersError);
    assert.equal(caught.code, 'ANSWERS_INVALID');
    assert.deepEqual(caught.errors.map((e) => e.questionId).sort(), ['email', 'name']);
    assert.equal(count(db, 'form_submissions'), 0);
    assert.equal(count(db, 'form_reference_counters'), 0);
  });

  test('a question hidden by showIf is not required; answers to it are dropped', async () => {
    const schema = schemaOf(
      {
        id: 'kind',
        type: 'multiple_choice',
        label: 'Are you a church?',
        options: ['Yes', 'No'],
        required: true,
      },
      bareTextQuestion('church', 'Church name', {
        required: true,
        showIf: { join: 'all', rules: [{ questionId: 'kind', op: 'eq', value: 'Yes' }] },
      }),
    );
    const { forms } = await published(schema);
    const hidden = await forms.submit({
      slug: 'contact',
      raw: { ...answers(), kind: 'No', church: 'Ignored' },
      uploads: {},
      idempotencyKey: key(),
    });
    assert.equal(hidden.created, true);
    assert.equal('church' in hidden.submission.answers, false);
    await assert.rejects(
      forms.submit({
        slug: 'contact',
        raw: { ...answers(), kind: 'Yes' },
        uploads: {},
        idempotencyKey: key(),
      }),
      FormAnswersError,
    );
  });

  test('stores binds, normalised email, phone, answers and the version; ip hash stays internal', async () => {
    const { db, forms, result } = await published(schemaOf(q.phone()));
    const out = await forms.submit({
      slug: 'contact',
      raw: { name: 'Ana Reyes', email: '  Ana@Example.ORG ', phone: '555 010 0100' },
      uploads: {},
      idempotencyKey: key(),
      ipHash: 'iphash',
      now: T0 + 5,
    });
    const s = out.submission;
    assert.equal(s.status, 'new');
    assert.equal(s.formVersionId, result.version.id);
    assert.equal(s.submitterName, 'Ana Reyes');
    assert.equal(s.submitterEmail, 'ana@example.org');
    assert.equal(s.submitterPhone, '555 010 0100');
    assert.equal(s.submittedAt, T0 + 5);
    assert.deepEqual(s.binds, {
      'contact.name': 'Ana Reyes',
      'contact.email': 'ana@example.org',
      'contact.phone': '555 010 0100',
    });
    assert.equal(s.answers.name, 'Ana Reyes');
    assert.equal('ipHash' in s, false);
    const row = db.sqlite.prepare('SELECT ip_hash FROM form_submissions WHERE id = ?').get(s.id) as {
      ip_hash: string;
    };
    assert.equal(row.ip_hash, 'iphash');
    assert.deepEqual(
      { id: out.form.slug, program: out.form.program, kind: out.form.kind },
      { id: 'contact', program: 'web', kind: 'contact' },
    );
  });

  test('the same idempotency key returns the stored submission and creates nothing', async () => {
    const { db, forms, form } = await published();
    const k = key();
    const first = await forms.submit({ slug: 'contact', raw: answers(), uploads: {}, idempotencyKey: k });
    const second = await forms.submit({
      slug: 'contact',
      raw: answers('Someone Else', 'x@example.org'),
      uploads: {},
      idempotencyKey: k,
    });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.submission.id, first.submission.id);
    assert.equal(second.submission.submitterName, 'Ana Reyes');
    assert.equal(count(db, 'form_submissions'), 1);
    // Still idempotent after the form closes.
    await forms.close(form.id);
    assert.equal(
      (await forms.submit({ slug: 'contact', raw: answers(), uploads: {}, idempotencyKey: k })).created,
      false,
    );
  });

  test('a key owned by another form is IDEMPOTENCY_CONFLICT', async () => {
    const a = await published(schemaOf(), { slug: 'form-a' });
    const b = await a.forms.create({
      slug: 'form-b',
      program: 'web',
      kind: 'contact',
      title: 'B',
      staffId: STAFF,
    });
    const saved = await a.forms.saveDraft({
      formId: b.id,
      schema: schemaOf(),
      expectedRevision: 1,
      staffId: STAFF,
    });
    await a.forms.publish({ formId: b.id, expectedRevision: saved.revision, staffId: STAFF });
    const k = key();
    await a.forms.submit({ slug: 'form-a', raw: answers(), uploads: {}, idempotencyKey: k });
    await assert.rejects(
      a.forms.submit({ slug: 'form-b', raw: answers(), uploads: {}, idempotencyKey: k }),
      (e: unknown) => isFormsError(e) && e.code === 'IDEMPOTENCY_CONFLICT',
    );
  });

  test('two concurrent posts of the same key store one submission and burn no reference number', async () => {
    const { db, forms } = await published();
    const k = key();
    const [a, b] = await Promise.all([
      forms.submit({ slug: 'contact', raw: answers(), uploads: {}, idempotencyKey: k }),
      forms.submit({ slug: 'contact', raw: answers(), uploads: {}, idempotencyKey: k }),
    ]);
    assert.equal([a, b].filter((r) => r.created).length, 1);
    assert.equal(a.submission.id, b.submission.id);
    assert.equal(count(db, 'form_submissions'), 1);
    const next = await forms.submit({ slug: 'contact', raw: answers(), uploads: {}, idempotencyKey: key() });
    assert.equal(next.submission.reference, 'GS-2026-0002');
  });

  test('rejects a missing or oversized idempotency key', async () => {
    const { forms } = await published();
    for (const bad of ['', 'x'.repeat(201)]) {
      await assert.rejects(
        forms.submit({ slug: 'contact', raw: answers(), uploads: {}, idempotencyKey: bad }),
        (e: unknown) => isFormsError(e) && e.code === 'INVALID_INPUT',
      );
    }
  });

  test('references are sequential per program prefix and restart each UTC year', async () => {
    const web = await published(schemaOf(), { slug: 'contact' });
    const worship = await web.forms.create({
      slug: 'worship-request',
      program: 'worship',
      kind: 'contact',
      title: 'W',
      staffId: STAFF,
    });
    const production = await web.forms.create({
      slug: 'production-x',
      program: 'production',
      kind: 'contact',
      title: 'P',
      staffId: STAFF,
    });
    const academy = await web.forms.create({
      slug: 'academy-x',
      program: 'academy',
      kind: 'contact',
      title: 'A',
      staffId: STAFF,
    });
    for (const f of [worship, production, academy]) {
      const saved = await web.forms.saveDraft({
        formId: f.id,
        schema: schemaOf(),
        expectedRevision: 1,
        staffId: STAFF,
      });
      await web.forms.publish({ formId: f.id, expectedRevision: saved.revision, staffId: STAFF });
    }
    const dec31 = Date.UTC(2026, 11, 31, 23, 59, 58) / 1000;
    const jan1 = Date.UTC(2027, 0, 1, 0, 0, 1) / 1000;
    const ref = async (slug: string, now: number) =>
      (await web.forms.submit({ slug, raw: answers(), uploads: {}, idempotencyKey: key(), now })).submission
        .reference;
    assert.equal(await ref('contact', dec31), 'GS-2026-0001');
    assert.equal(await ref('contact', dec31), 'GS-2026-0002');
    assert.equal(await ref('worship-request', dec31), 'GW-2026-0001');
    assert.equal(await ref('production-x', dec31), 'GP-2026-0001');
    assert.equal(await ref('academy-x', dec31), 'GA-2026-0001');
    assert.equal(await ref('contact', jan1), 'GS-2027-0001');
    assert.equal(await ref('contact', jan1), 'GS-2027-0002');
  });

  test('delete_after is now plus the form retention in calendar months, or null', async () => {
    const withRetention = await published(schemaOf(), { retentionMonths: 12 });
    const a = await withRetention.forms.submit({
      slug: 'contact',
      raw: answers(),
      uploads: {},
      idempotencyKey: key(),
      now: T0,
    });
    assert.equal(a.submission.deleteAfter, Date.UTC(2027, 5, 1, 12, 0, 0) / 1000);
    const without = await published(schemaOf());
    const b = await without.forms.submit({
      slug: 'contact',
      raw: answers(),
      uploads: {},
      idempotencyKey: key(),
    });
    assert.equal(b.submission.deleteAfter, null);
    assert.equal(addMonthsUtc(Date.UTC(2026, 0, 31) / 1000, 1), Date.UTC(2026, 1, 28) / 1000);
    assert.equal(addMonthsUtc(Date.UTC(2026, 10, 30) / 1000, 3), Date.UTC(2027, 1, 28) / 1000);
  });

  test('uploadsHook gets the visible uploads and the id; onRequestKinds runs only for request kinds, after uploads', async () => {
    const schema = {
      sections: [
        {
          id: 's1',
          title: 'Request',
          questions: [
            { id: 'name', type: 'short_text', label: 'Your name', required: true, bind: 'contact.name' },
            { id: 'email', type: 'short_text', label: 'Your email', required: true, bind: 'contact.email' },
            {
              id: 'church',
              type: 'short_text',
              label: 'Church name',
              required: true,
              bind: 'request.church_name',
            },
            { id: 'date', type: 'date', label: 'Service date', required: true, bind: 'request.date' },
            {
              id: 'roles',
              type: 'checkboxes',
              label: 'Roles needed',
              options: ['Keys', 'Drums'],
              required: true,
              bind: 'request.roles_needed',
            },
            {
              id: 'plan',
              type: 'file_upload',
              label: 'Service plan',
              accept: ['pdf'],
              maxFiles: 2,
              maxMb: 10,
              required: false,
            },
          ],
        },
      ],
    };
    const ctx = await published(schema, {
      kind: 'church_request',
      program: 'worship',
      slug: 'worship-request',
    });
    const calls: string[] = [];
    const pdf: UploadRef[] = [{ uploadId: 'upl_1', kind: 'pdf', bytes: 10 }];
    const raw = {
      name: 'Pastor Sam',
      email: 'sam@example.org',
      church: 'Example Church',
      date: '2026-09-06',
      roles: ['Keys'],
    };
    const out = await ctx.forms.submit({
      slug: 'worship-request',
      raw,
      uploads: { plan: pdf, ignored: [{ uploadId: 'upl_x', kind: 'pdf', bytes: 1 }] },
      idempotencyKey: key(),
      uploadsHook: async (uploads, id) => {
        calls.push(`uploads:${id}:${Object.keys(uploads).join(',')}:${uploads.plan![0]!.uploadId}`);
      },
      onRequestKinds: async (id) => {
        calls.push(`request:${id}`);
      },
    });
    const id = out.submission.id;
    assert.deepEqual(calls, [`uploads:${id}:plan:upl_1`, `request:${id}`]);
    assert.deepEqual(out.hookFailures, []);
    assert.equal(out.submission.reference, 'GW-2026-0001');

    // A repeat does not run hooks again.
    const k = key();
    await ctx.forms.submit({ slug: 'worship-request', raw, uploads: {}, idempotencyKey: k });
    const before = calls.length;
    const again = await ctx.forms.submit({
      slug: 'worship-request',
      raw,
      uploads: {},
      idempotencyKey: k,
      onRequestKinds: async () => void calls.push('again'),
    });
    assert.equal(again.created, false);
    assert.equal(calls.length, before);

    // Hook failures never undo the stored submission.
    const warn = console.warn;
    console.warn = () => {};
    try {
      const failing = await ctx.forms.submit({
        slug: 'worship-request',
        raw,
        uploads: { plan: pdf },
        idempotencyKey: key(),
        uploadsHook: async () => {
          throw new Error('r2 down');
        },
        onRequestKinds: async () => {
          throw new Error('boom');
        },
      });
      assert.equal(failing.created, true);
      assert.deepEqual(failing.hookFailures, ['uploads', 'request']);
    } finally {
      console.warn = warn;
    }

    // Contact forms never call onRequestKinds.
    const contact = await published(schemaOf(), { slug: 'plain' });
    let called = false;
    await contact.forms.submit({
      slug: 'plain',
      raw: answers(),
      uploads: {},
      idempotencyKey: key(),
      onRequestKinds: async () => void (called = true),
    });
    assert.equal(called, false);
  });
});

describe('inbox', () => {
  async function inbox() {
    const ctx = await published(schemaOf());
    const ids: string[] = [];
    // Five submissions: two share a timestamp.
    const times = [T0, T0 + 10, T0 + 10, T0 + 20, T0 + 30];
    const names = ['Ana Reyes', 'Ben Cole', 'Cara_100% Wu', 'Dan Fox', 'Eve Lin'];
    for (const [i, t] of times.entries()) {
      const r = await ctx.forms.submit({
        slug: 'contact',
        raw: answers(names[i]!, `p${i}@example.org`),
        uploads: {},
        idempotencyKey: key(),
        now: t,
      });
      ids.push(r.submission.id);
    }
    return { ...ctx, ids };
  }

  test('keyset pagination walks newest first with no gaps or repeats, including equal timestamps', async () => {
    const { forms, ids } = await inbox();
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await forms.listSubmissions({ limit: 2, cursor });
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor);
    assert.equal(pages, 3);
    assert.equal(new Set(seen).size, 5);
    assert.deepEqual([...seen].sort(), [...ids].sort());
    const all = (await forms.listSubmissions({ limit: 50 })).items;
    assert.deepEqual(
      all.map((i) => i.submittedAt),
      [T0 + 30, T0 + 20, T0 + 10, T0 + 10, T0],
    );
    assert.equal(all[0]!.formTitle, 'Contact message');
    assert.equal(all[0]!.version, 1);
    await assert.rejects(
      forms.listSubmissions({ cursor: 'garbage' }),
      (e: unknown) => isFormsError(e) && e.code === 'INVALID_INPUT',
    );
  });

  test('filters: status, date range, search (wildcards are literal), attachments, version, form', async () => {
    const { db, forms, form, ids } = await inbox();
    await forms.setStatus({ submissionId: ids[1]!, status: 'handled', staffId: STAFF, now: T0 + 40 });
    assert.deepEqual(
      (await forms.listSubmissions({ status: 'handled' })).items.map((i) => i.id),
      [ids[1]],
    );
    assert.equal((await forms.listSubmissions({ status: ['handled', 'new'] })).items.length, 5);
    assert.equal((await forms.listSubmissions({ from: T0 + 10, to: T0 + 30 })).items.length, 3);
    assert.deepEqual(
      (await forms.listSubmissions({ q: 'ben' })).items.map((i) => i.id),
      [ids[1]],
    );
    assert.deepEqual(
      (await forms.listSubmissions({ q: 'P3@EXAMPLE' })).items.map((i) => i.id),
      [ids[3]],
    );
    assert.deepEqual(
      (await forms.listSubmissions({ q: '100%' })).items.map((i) => i.id),
      [ids[2]],
    );
    assert.equal(
      (await forms.listSubmissions({ q: '%' })).items.length,
      1,
      'a literal percent sign, not a wildcard',
    );
    assert.equal((await forms.listSubmissions({ q: 'GS-2026-0003' })).items.length, 1);
    db.sqlite
      .prepare(
        `INSERT INTO form_uploads (id, submission_id, question_id, kind, content_type, bytes, r2_key, status, created_at)
         VALUES ('upl_a', ?, 'photo', 'image', 'image/webp', 10, 'k1', 'verified', ?), ('upl_b', ?, 'photo', 'image', 'image/webp', 10, 'k2', 'rejected', ?)`,
      )
      .run(ids[0]!, T0, ids[4]!, T0);
    const withFiles = await forms.listSubmissions({ hasAttachments: true });
    assert.deepEqual(
      withFiles.items.map((i) => [i.id, i.attachmentCount]),
      [[ids[0], 1]],
    );
    assert.equal((await forms.listSubmissions({ hasAttachments: false })).items.length, 4);
    assert.equal((await forms.listSubmissions({ version: 1, formId: form.id })).items.length, 5);
    assert.equal((await forms.listSubmissions({ version: 2 })).items.length, 0);
    assert.equal((await forms.listSubmissions({ formId: 'frm_other' })).items.length, 0);
    await assert.rejects(forms.listSubmissions({ status: 'bogus' as never }), FormsError);
  });
});

describe('status, notes and events', () => {
  test('setStatus writes an append-only event with from, to and note; same status is a no-op', async () => {
    const { db, forms } = await published();
    const { submission } = await forms.submit({
      slug: 'contact',
      raw: answers(),
      uploads: {},
      idempotencyKey: key(),
    });
    const noop = await forms.setStatus({ submissionId: submission.id, status: 'new', staffId: STAFF });
    assert.deepEqual(noop, { changed: false, status: 'new', previous: 'new' });
    const a = await forms.setStatus({
      submissionId: submission.id,
      status: 'in_review',
      note: ' looking ',
      staffId: STAFF,
      now: T0 + 1,
    });
    assert.deepEqual(a, { changed: true, status: 'in_review', previous: 'new' });
    await forms.setStatus({ submissionId: submission.id, status: 'handled', staffId: STAFF_B, now: T0 + 2 });
    await forms.addNote({ submissionId: submission.id, note: 'Called back', staffId: STAFF_B, now: T0 + 3 });
    const detail = (await forms.getSubmission(submission.id))!;
    assert.equal(detail.submission.status, 'handled');
    assert.equal(detail.submission.reviewedByUserId, STAFF_B);
    assert.equal(detail.submission.reviewedAt, T0 + 2);
    assert.deepEqual(
      detail.events.map((e) => [
        e.kind,
        e.actorUserId,
        e.change?.from,
        e.change?.to,
        e.change?.note ?? null,
        e.kind === 'note' ? e.body : null,
      ]),
      [
        ['status', STAFF, 'new', 'in_review', 'looking', null],
        ['status', STAFF_B, 'in_review', 'handled', null, null],
        ['note', STAFF_B, undefined, undefined, null, 'Called back'],
      ],
    );
    assert.throws(() => db.sqlite.prepare("UPDATE form_submission_events SET body = 'x'").run(), /immutable/);
  });

  test('approved and declined are only for application kinds', async () => {
    const contact = await published();
    const c = await contact.forms.submit({
      slug: 'contact',
      raw: answers(),
      uploads: {},
      idempotencyKey: key(),
    });
    for (const status of ['approved', 'declined'] as const) {
      await assert.rejects(
        contact.forms.setStatus({ submissionId: c.submission.id, status, staffId: STAFF }),
        (e: unknown) => isFormsError(e) && e.code === 'INVALID_TRANSITION',
      );
    }
    const schema = {
      sections: [
        {
          id: 's1',
          title: 'About you',
          questions: [
            q.name(),
            q.email(),
            {
              id: 'roles',
              type: 'checkboxes',
              label: 'Roles',
              options: ['Keys', 'Drums'],
              required: true,
              bind: 'roster.roles',
            },
          ],
        },
      ],
    };
    const app = await published(schema, {
      kind: 'musician_application',
      program: 'worship',
      slug: 'worship-apply',
    });
    const s = await app.forms.submit({
      slug: 'worship-apply',
      raw: { ...answers(), roles: ['Keys'] },
      uploads: {},
      idempotencyKey: key(),
    });
    assert.equal(
      (await app.forms.setStatus({ submissionId: s.submission.id, status: 'approved', staffId: STAFF }))
        .changed,
      true,
    );
    assert.equal(
      (await app.forms.setStatus({ submissionId: s.submission.id, status: 'archived', staffId: STAFF }))
        .changed,
      true,
    );
    await assert.rejects(
      app.forms.setStatus({ submissionId: s.submission.id, status: 'nope' as never, staffId: STAFF }),
      FormsError,
    );
    await assert.rejects(
      app.forms.setStatus({ submissionId: 'fsub_missing', status: 'handled', staffId: STAFF }),
      (e: unknown) => isFormsError(e) && e.code === 'NOT_FOUND',
    );
    await assert.rejects(
      app.forms.addNote({ submissionId: s.submission.id, note: '   ', staffId: STAFF }),
      FormsError,
    );
    await assert.rejects(
      app.forms.addNote({ submissionId: 'fsub_missing', note: 'x', staffId: STAFF }),
      (e: unknown) => isFormsError(e) && e.code === 'NOT_FOUND',
    );
  });
});

describe('retention purge', () => {
  async function aged() {
    const ctx = await published(schemaOf(), { retentionMonths: 1 });
    const ids: Record<string, string> = {};
    for (const status of ['new', 'handled', 'declined', 'spam', 'archived', 'in_review'] as const) {
      const r = await ctx.forms.submit({
        slug: 'contact',
        raw: answers(status, `${status}@example.org`),
        uploads: {},
        idempotencyKey: key(),
        now: T0,
      });
      if (status !== 'new') {
        // `declined` is only valid for applications; set it directly for this retention test.
        if (status === 'declined')
          ctx.db.sqlite
            .prepare("UPDATE form_submissions SET status = 'declined' WHERE id = ?")
            .run(r.submission.id);
        else
          await ctx.forms.setStatus({ submissionId: r.submission.id, status, staffId: STAFF, now: T0 + 1 });
      }
      ids[status] = r.submission.id;
    }
    ctx.db.sqlite
      .prepare(
        `INSERT INTO form_uploads (id, submission_id, question_id, kind, content_type, bytes, r2_key, status, created_at) VALUES ('upl_h', ?, 'photo', 'image', 'image/webp', 5, 'forms/h', 'verified', ?)`,
      )
      .run(ids.handled!, T0);
    return { ...ctx, ids, due: addMonthsUtc(T0, 1) };
  }

  test('deletes only due submissions in declined, spam, archived or handled; files hook runs first', async () => {
    const { db, forms, ids, due } = await aged();
    assert.deepEqual(
      await forms.purgeExpiredSubmissions(due),
      { deleted: 0, ids: [] },
      'not before delete_after',
    );
    const order: string[] = [];
    const result = await forms.purgeExpiredSubmissions(due + 1, {
      beforeDelete: async (hookIds) => {
        const still = db.sqlite
          .prepare(
            `SELECT count(*) AS c FROM form_submissions WHERE id IN (${hookIds.map(() => '?').join(',')})`,
          )
          .get(...hookIds) as { c: number };
        const uploads = db.sqlite.prepare('SELECT count(*) AS c FROM form_uploads').get() as { c: number };
        order.push(`hook:${hookIds.length}:rows=${still.c}:uploads=${uploads.c}`);
      },
    });
    assert.deepEqual(order, ['hook:4:rows=4:uploads=1']);
    assert.equal(result.deleted, 4);
    assert.deepEqual([...result.ids].sort(), [ids.handled, ids.declined, ids.spam, ids.archived].sort());
    const left = db.sqlite.prepare('SELECT status FROM form_submissions ORDER BY status').all() as {
      status: string;
    }[];
    assert.deepEqual(
      left.map((r) => r.status),
      ['in_review', 'new'],
    );
    assert.equal(count(db, 'form_uploads'), 0);
    assert.equal(
      count(db, 'form_submission_events'),
      1,
      'events of deleted submissions are gone; the in_review one keeps its status event',
    );
  });

  test('if the files hook throws nothing is deleted', async () => {
    const { db, forms, due } = await aged();
    await assert.rejects(
      forms.purgeExpiredSubmissions(due + 1, {
        beforeDelete: async () => {
          throw new Error('r2 unavailable');
        },
      }),
      /r2 unavailable/,
    );
    assert.equal(count(db, 'form_submissions'), 6);
    assert.equal(count(db, 'form_uploads'), 1);
  });

  test('submissions without delete_after are never purged; limit caps one run', async () => {
    const ctx = await published(schemaOf());
    const r = await ctx.forms.submit({
      slug: 'contact',
      raw: answers(),
      uploads: {},
      idempotencyKey: key(),
      now: T0,
    });
    await ctx.forms.setStatus({ submissionId: r.submission.id, status: 'archived', staffId: STAFF });
    assert.equal((await ctx.forms.purgeExpiredSubmissions(T0 * 2)).deleted, 0);
    const { forms, due } = await aged();
    assert.equal((await forms.purgeExpiredSubmissions(due + 1, { limit: 1 })).deleted, 1);
  });
});

describe('csv export', () => {
  test('csvCell quotes everything, doubles quotes and neutralises formula starters (incl. full-width)', () => {
    assert.equal(csvCell('plain'), '"plain"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell('a,b\nc'), '"a,b\nc"');
    for (const start of ['=', '+', '-', '@', '\t', '\r', '\n', '＝', '＋', '－', '＠']) {
      assert.equal(
        csvCell(`${start}SUM(1)`),
        `"'${start}SUM(1)"`.replace(/\r/g, '\r'),
        `prefix for U+${start.codePointAt(0)!.toString(16)}`,
      );
    }
    assert.equal(csvCell('-5', { numeric: true }), '"-5"');
    assert.equal(csvCell('=1+1', { numeric: false }), `"'=1+1"`);
    assert.equal(csvCell(''), '""');
    assert.equal(csvCell('ok = fine'), '"ok = fine"');
  });

  async function exportable() {
    const schema = schemaOf(
      bareTextQuestion('age', 'Age', { validation: { kind: 'number', min: -100, max: 200, integer: true } }),
      { id: 'scale', type: 'linear_scale', label: 'Scale', min: 1, max: 5, required: false },
      { id: 'roles', type: 'checkboxes', label: 'Roles', options: ['Keys', 'Drums'], required: false },
      { id: 'note', type: 'short_text', label: 'Note', required: false },
    );
    const ctx = await published(schema);
    return ctx;
  }

  test('header uses version labels; cells are safe; numbers are exempt; an export event is written per row', async () => {
    const { db, forms, form, revision } = await exportable();
    const first = await forms.submit({
      slug: 'contact',
      raw: {
        name: '=HYPERLINK("http://evil")',
        email: 'a@example.org',
        age: '-5',
        scale: '4',
        roles: ['Keys', 'Drums'],
        note: '@cmd',
      },
      uploads: {},
      idempotencyKey: key(),
      now: T0,
    });
    await forms.submit({
      slug: 'contact',
      raw: { name: '+Sam', email: 'b@example.org', age: '42', note: 'tab\tinside "quoted"' },
      uploads: {},
      idempotencyKey: key(),
      now: T0 + 1,
    });
    // v2 drops "Age" and relabels "Note".
    const v2 = {
      sections: [
        {
          id: 's1',
          title: 'Your details',
          questions: [
            q.name(),
            q.email(),
            { id: 'note', type: 'short_text', label: 'Anything to add', required: false },
          ],
        },
      ],
    };
    const saved = await forms.saveDraft({
      formId: form.id,
      schema: v2,
      expectedRevision: revision,
      staffId: STAFF,
    });
    await forms.publish({ formId: form.id, expectedRevision: saved.revision, staffId: STAFF });
    await forms.submit({
      slug: 'contact',
      raw: { name: '－wide', email: 'c@example.org', note: 'v2 note' },
      uploads: {},
      idempotencyKey: key(),
      now: T0 + 2,
    });

    const out = await forms.exportCsv({ formId: form.id, staffId: STAFF_B, now: T0 + 100 });
    assert.equal(out.rows, 3);
    assert.equal(out.truncated, false);
    assert.equal(out.filename, 'contact-submissions-2026-06-01.csv');
    const lines = out.csv.split('\r\n');
    assert.equal(lines.at(-1), '', 'ends with CRLF');
    assert.equal(
      lines[0],
      '"Reference","Submitted (UTC)","Status","Form version","Name","Email","Phone","Your name","Your email","Anything to add","Age","Scale","Roles"',
    );
    assert.equal(lines.length, 5);
    const row1 = lines[1]!;
    assert.ok(row1.startsWith(`"${first.submission.reference}","2026-06-01T12:00:00.000Z","new","1",`));
    assert.ok(row1.includes(`"'=HYPERLINK(""http://evil"")"`), row1);
    assert.ok(row1.includes('"-5"'), 'negative numbers keep their sign');
    assert.ok(row1.includes(`"'@cmd"`));
    assert.ok(row1.includes('"Keys; Drums"'));
    assert.ok(lines[2]!.includes(`"'+Sam"`));
    assert.ok(lines[2]!.includes('"tab\tinside ""quoted"""'));
    assert.ok(lines[3]!.includes(`"'－wide"`), 'full-width minus is prefixed');
    const events = db.sqlite
      .prepare("SELECT actor_user_id, body, created_at FROM form_submission_events WHERE kind = 'export'")
      .all() as { actor_user_id: string; body: string; created_at: number }[];
    assert.equal(events.length, 3);
    assert.ok(events.every((e) => e.actor_user_id === STAFF_B && e.created_at === T0 + 100));
    assert.deepEqual(JSON.parse(events[0]!.body), { formId: form.id, rows: 3 });
  });

  test('an export respects filters and an empty export writes no events', async () => {
    const { db, forms, form } = await exportable();
    const out = await forms.exportCsv({ formId: form.id, staffId: STAFF, status: 'spam' });
    assert.equal(out.rows, 0);
    assert.equal(out.csv.split('\r\n').length, 2);
    assert.equal(count(db, 'form_submission_events'), 0);
  });

  test('caps at 5000 rows and says so', async () => {
    const { db, forms, form, result } = await published(schemaOf());
    const insert = db.sqlite.prepare(
      `INSERT INTO form_submissions (id, form_id, form_version_id, reference, answers_json, idempotency_key, submitted_at)
       VALUES (?, ?, ?, ?, '{"name":"N","email":"e@example.org"}', ?, ?)`,
    );
    db.sqlite.exec('BEGIN');
    for (let i = 0; i < 5001; i++)
      insert.run(`fsub_${i}`, form.id, result.version.id, `GS-2026-${i}`, `k${i}`, T0 + i);
    db.sqlite.exec('COMMIT');
    const out = await forms.exportCsv({ formId: form.id, staffId: STAFF, now: T0 + 10_000 });
    assert.equal(out.rows, 5000);
    assert.equal(out.truncated, true);
    assert.equal(out.csv.split('\r\n').length, 5002);
    assert.equal(
      (
        db.sqlite.prepare("SELECT count(*) AS c FROM form_submission_events WHERE kind = 'export'").get() as {
          c: number;
        }
      ).c,
      5000,
    );
  });
});

describe('settings', () => {
  test('updateSettings changes title, description, confirmation and retention without touching the revision', async () => {
    const { forms, form } = await setup();
    const updated = await forms.updateSettings({
      formId: form.id,
      title: '  New title ',
      description: 'About',
      confirmationMessage: 'Thanks',
      retentionMonths: 6,
      staffId: STAFF_B,
      now: T0 + 9,
    });
    assert.equal(updated.title, 'New title');
    assert.equal(updated.description, 'About');
    assert.equal(updated.confirmationMessage, 'Thanks');
    assert.equal(updated.retentionMonths, 6);
    assert.equal(updated.revision, 1);
    assert.equal(updated.updatedByUserId, STAFF_B);
    assert.equal(
      (await forms.updateSettings({ formId: form.id, retentionMonths: null, staffId: STAFF }))
        .retentionMonths,
      null,
    );
    await assert.rejects(forms.updateSettings({ formId: form.id, title: ' ', staffId: STAFF }), FormsError);
  });
});
