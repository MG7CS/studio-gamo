/**
 * The builder's writes, independent of HTTP: one function per action that loads the draft, applies a pure
 * helper from `schema-edit.ts` / `question-form.ts`, saves it through `FormsService` and answers with an
 * `Outcome`. Pages (HTML form posts that re-render on a refusal) and the API routes (JSON or 303) both
 * call `runBuilderAction`, so the behaviour is written once.
 *
 *  - Every draft write carries the form `revision` the staff member saw (`expectedRevision`): a stale one is
 *    a conflict (409), nothing is overwritten, and the submitted values come back so the screen can show them.
 *  - Every draft write also carries a per-render `op_id`: a double click or a replayed post is a no-op.
 *  - Messages here are fixed plain-language texts; the only dynamic parts are staff-authored labels, which
 *    the screens render escaped.
 */
import {
  FormConflictError,
  FormPublishError,
  FormSchemaError,
  FormsError,
  FormsService,
  QUESTION_TYPES,
  FORM_KINDS,
  FORM_PROGRAMS,
  parseFormSchema,
  seedDefaultForms,
  type FormKind,
  type FormSchema,
  type QuestionType,
} from '@gamo/domain/forms';
import { allRows, type SqlDatabase } from '@gamo/domain/security';
import { noticeKeyForError } from '../domain-errors';
import {
  BuilderError,
  addQuestion,
  addSection,
  changeQuestionType,
  deleteQuestion,
  duplicateQuestion,
  findQuestion,
  moveQuestion,
  moveQuestionToPosition,
  normalizeQuestion,
  removeSection,
  updateSection,
  type Dependent,
} from './schema-edit';
import { validateQuestionEdit, type FieldError, type FieldValues } from './question-form';

export type Body = Record<string, string | string[]>;

export interface BuilderDeps {
  db: SqlDatabase;
  staff: { userId: string };
  /** Epoch seconds, for tests. */
  now?: number;
}

interface ConflictInfo {
  currentRevision: number;
  /** Who saved first (display name or email, or a generic phrase). */
  by: string;
  /** Epoch seconds. */
  at: number;
}

export type Outcome =
  | {
      ok: true;
      /** Where a browser goes next (303). */
      location: string;
      /** Key into `FORM_NOTICES`. */
      notice?: string;
      /** What a JSON client receives as `data`. */
      data: Record<string, unknown>;
    }
  | {
      ok: false;
      status: 400 | 404 | 409 | 422;
      code: string;
      /** Key into `FORM_NOTICES` for a redirecting client. */
      notice: string;
      message: string;
      fieldErrors?: FieldError[];
      /** The values the staff member submitted (kept for the re-render). */
      values?: FieldValues;
      dependents?: Dependent[];
      conflict?: ConflictInfo;
      publish?: { errors: string[]; warnings: string[] };
    };

const editUrl = (formId: string) => `/forms/${formId}/edit`;
const questionUrl = (formId: string, qid: string) => `${editUrl(formId)}?q=${qid}#q-${qid}`;

const str = (body: Body, key: string): string => {
  const value = Object.prototype.hasOwnProperty.call(body, key) ? body[key] : '';
  const first = Array.isArray(value) ? (value[0] ?? '') : value;
  return typeof first === 'string' ? first : '';
};

function fail(
  status: 400 | 404 | 409 | 422,
  code: string,
  notice: string,
  message: string,
  extra: Partial<Extract<Outcome, { ok: false }>> = {},
): Outcome {
  return { ok: false, status, code, notice, message, ...extra };
}

async function staffLabel(db: SqlDatabase, userId: string | null): Promise<string> {
  if (!userId) return 'another staff member';
  const [row] = await allRows<{ display_name: string | null; email: string }>(db, {
    sql: 'SELECT display_name, email FROM users WHERE id = ?',
    params: [userId],
  });
  return row?.display_name?.trim() || row?.email || 'another staff member';
}

function revisionOf(body: Body): number | null {
  const raw = str(body, 'expected_revision') || str(body, 'expectedRevision') || str(body, 'revision');
  const n = Number(raw);
  return raw !== '' && Number.isInteger(n) && n >= 1 ? n : null;
}

const MISSING_REVISION = () =>
  fail(400, 'INVALID_INPUT', 'invalid', 'This page is out of date. Reload it and try again.');

/** The submitted values worth keeping for a re-render (everything except routing fields). */
function keptValues(body: Body): FieldValues {
  const out: FieldValues = {};
  for (const [key, value] of Object.entries(body)) {
    if (['action', 'revision', 'op_id', 'expected_revision', 'qid', 'confirm'].includes(key)) continue;
    out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------

interface Draft {
  schema: FormSchema;
  revision: number;
}

/** What a draft mutation decides: the new schema and where to go, or a refusal. */
type Mutation =
  | { schema: FormSchema; location: string; notice: string; data?: Record<string, unknown> }
  | { noop: Outcome }
  | { refuse: Outcome };

export async function runBuilderAction(
  deps: BuilderDeps,
  formId: string | null,
  action: string,
  body: Body,
): Promise<Outcome> {
  const forms = new FormsService(deps.db, deps.now === undefined ? {} : { now: deps.now });
  const staffId = deps.staff.userId;
  try {
    return await dispatch({ forms, deps, staffId, formId, action, body });
  } catch (error) {
    if (error instanceof FormConflictError) {
      const message = error.message;
      return fail(409, error.code, 'conflict', message, {
        values: keptValues(body),
        conflict: {
          currentRevision: error.currentRevision,
          by: await staffLabel(deps.db, error.updatedByUserId),
          at: error.updatedAt,
        },
      });
    }
    if (error instanceof FormPublishError) {
      return fail(422, error.code, 'blocked', error.message, {
        publish: { errors: error.errors, warnings: error.warnings },
      });
    }
    if (error instanceof FormsError) {
      return fail(
        error.status === 410 ? 409 : (error.status as 400 | 404 | 409 | 422),
        error.code,
        noticeKeyForError(error) ?? 'invalid',
        error.message,
        {
          values: keptValues(body),
        },
      );
    }
    if (error instanceof FormSchemaError) {
      return fail(400, 'INVALID_INPUT', 'invalid', error.message, { values: keptValues(body) });
    }
    if (error instanceof BuilderError) {
      return fail(400, 'INVALID_INPUT', 'invalid', error.message, { values: keptValues(body) });
    }
    throw error;
  }
}

interface Ctx {
  forms: FormsService;
  deps: BuilderDeps;
  staffId: string;
  formId: string | null;
  action: string;
  body: Body;
}

async function dispatch(c: Ctx): Promise<Outcome> {
  switch (c.action) {
    case 'form.create':
      return createForm(c);
    case 'form.close':
    case 'form.reopen':
      return setStatus(c);
    case 'forms.seed_defaults':
      return seedDefaults(c);
    case 'settings.save':
      return saveSettings(c);
    case 'publish':
      return publishDraft(c);
    case 'draft.save': {
      const saved = await mutateDraft(c, async (draft) => {
        const raw = str(c.body, 'schema');
        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch {
          return { refuse: fail(400, 'INVALID_INPUT', 'invalid', 'The schema must be valid JSON.') };
        }
        const schema = parseFormSchema(json);
        return {
          schema,
          location: editUrl(c.formId!),
          notice: 'saved',
          data: { revision: draft.revision + 1 },
        };
      });
      // Title, description and confirmation message travel with a full-draft save (API clients).
      const hasSettings = ['title', 'description', 'confirmation_message', 'confirmationMessage'].some((k) =>
        Object.prototype.hasOwnProperty.call(c.body, k),
      );
      if (saved.ok && hasSettings) await saveSettings(c);
      return saved;
    }
    case 'version.restore':
      return restoreVersion(c);
    case 'question.add':
      return mutateDraft(c, (draft) => {
        const type = str(c.body, 'type') as QuestionType;
        if (!(QUESTION_TYPES as readonly string[]).includes(type)) {
          return { refuse: fail(400, 'INVALID_INPUT', 'invalid', 'Choose a question type.') };
        }
        const after = str(c.body, 'after');
        const { schema, question } = addQuestion(
          draft.schema,
          str(c.body, 'section'),
          type,
          after ? { afterQuestionId: after } : {},
        );
        return {
          schema,
          location: questionUrl(c.formId!, question.id),
          notice: 'added',
          data: { questionId: question.id },
        };
      });
    case 'question.save':
      return mutateDraft(c, (draft) => saveQuestion(c, draft));
    case 'question.move':
      return mutateDraft(c, (draft) => moveAction(c, draft));
    case 'question.duplicate':
      return mutateDraft(c, (draft) => {
        const { schema, question } = duplicateQuestion(draft.schema, str(c.body, 'qid'));
        return {
          schema,
          location: questionUrl(c.formId!, question.id),
          notice: 'duplicated',
          data: { questionId: question.id },
        };
      });
    case 'question.delete':
      return mutateDraft(c, (draft) => deleteAction(c, draft));
    case 'question.type':
      return mutateDraft(c, (draft) => typeAction(c, draft));
    case 'section.add':
      return mutateDraft(c, (draft) => {
        const { schema, section } = addSection(draft.schema, str(c.body, 'title'));
        return {
          schema,
          location: `${editUrl(c.formId!)}#section-${section.id}`,
          notice: 'section-added',
          data: { sectionId: section.id },
        };
      });
    case 'section.update':
      return mutateDraft(c, (draft) => {
        const sid = str(c.body, 'sid');
        const schema = updateSection(draft.schema, sid, {
          title: str(c.body, 'title'),
          description: str(c.body, 'description'),
        });
        return { schema, location: `${editUrl(c.formId!)}#section-${sid}`, notice: 'section-saved' };
      });
    case 'section.delete':
      return mutateDraft(c, (draft) => ({
        schema: removeSection(draft.schema, str(c.body, 'sid')),
        location: `${editUrl(c.formId!)}#outline`,
        notice: 'section-deleted',
      }));
    default:
      return fail(400, 'INVALID_INPUT', 'invalid', 'That action is not known.');
  }
}

// ---- draft mutations ------------------------------------------------------------------------

async function mutateDraft(c: Ctx, fn: (draft: Draft) => Mutation | Promise<Mutation>): Promise<Outcome> {
  if (!c.formId) return fail(404, 'NOT_FOUND', 'not-found', 'This form does not exist.');
  const revision = revisionOf(c.body);
  if (revision === null) return MISSING_REVISION();
  const edit = await c.forms.getForEdit(c.formId);
  const result = await fn({ schema: edit.draft, revision });
  if ('refuse' in result) return result.refuse;
  if ('noop' in result) return result.noop;
  const opId = str(c.body, 'op_id');
  const saved = await c.forms.saveDraft({
    formId: c.formId,
    schema: result.schema,
    expectedRevision: revision,
    staffId: c.staffId,
    ...(opId ? { opId } : {}),
    ...(c.deps.now === undefined ? {} : { now: c.deps.now }),
  });
  return {
    ok: true,
    location: result.location,
    notice: result.notice,
    data: { formId: c.formId, revision: saved.revision, ...result.data },
  };
}

function saveQuestion(c: Ctx, draft: Draft): Mutation {
  const qid = str(c.body, 'qid');
  const posted = str(c.body, 'question');
  if (posted !== '') {
    // JSON clients may send the whole question.
    let parsed: unknown;
    try {
      parsed = JSON.parse(posted);
    } catch {
      return { refuse: fail(400, 'INVALID_INPUT', 'invalid', 'The question must be valid JSON.') };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { refuse: fail(400, 'INVALID_INPUT', 'invalid', 'The question must be an object.') };
    }
    if (!findQuestion(draft.schema, qid))
      throw new BuilderError('That question no longer exists. Reload the page.');
    const question = normalizeQuestion({ ...(parsed as Record<string, unknown>), id: qid });
    const schema = {
      sections: draft.schema.sections.map((s) => ({
        ...s,
        questions: s.questions.map((q) => (q.id === qid ? question : q)),
      })),
    };
    return { schema, location: questionUrl(c.formId!, qid), notice: 'saved', data: { questionId: qid } };
  }
  const result = validateQuestionEdit(draft.schema, qid, c.body);
  if (!result.ok) {
    return {
      refuse: fail(400, 'INVALID_INPUT', 'invalid', 'Some answers need attention.', {
        fieldErrors: result.errors,
        values: keptValues(c.body),
      }),
    };
  }
  return {
    schema: result.schema,
    location: questionUrl(c.formId!, qid),
    notice: 'saved',
    data: { questionId: qid },
  };
}

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;

/** `?q=<open question>` when the post names a well-formed id, so a redirect keeps the editor where it was. */
function openQuery(body: Body): string {
  const open = str(body, 'open');
  return ID_PATTERN.test(open) ? `?q=${open}` : '';
}

function moveAction(c: Ctx, draft: Draft): Mutation {
  const qid = str(c.body, 'qid');
  const to = str(c.body, 'to');
  const dir = str(c.body, 'dir');
  let result;
  if (to !== '') result = moveQuestionToPosition(draft.schema, qid, Number(to));
  else if (dir === 'up' || dir === 'down') result = moveQuestion(draft.schema, qid, dir);
  else return { refuse: fail(400, 'INVALID_INPUT', 'invalid', 'Choose a direction or a position.') };
  if (result.blocked) return { refuse: fail(409, 'MOVE_BLOCKED', 'move-blocked', result.blocked) };
  const where = `${editUrl(c.formId!)}${openQuery(c.body)}#q-${qid}`;
  if (!result.moved) {
    return {
      noop: {
        ok: true,
        location: where,
        notice: 'move-none',
        data: { formId: c.formId, position: result.position },
      },
    };
  }
  return { schema: result.schema, location: where, notice: 'moved', data: { position: result.position } };
}

function deleteAction(c: Ctx, draft: Draft): Mutation {
  const qid = str(c.body, 'qid');
  const found = findQuestion(draft.schema, qid);
  if (!found) throw new BuilderError('That question no longer exists. Reload the page.');
  const result = deleteQuestion(draft.schema, qid);
  if (!result.ok) {
    return {
      refuse: fail(
        409,
        'HAS_DEPENDENTS',
        'delete-blocked',
        'Other questions are shown depending on this one. Change their rules first.',
        {
          dependents: result.dependents,
        },
      ),
    };
  }
  if (str(c.body, 'confirm') !== '1') {
    return {
      noop: {
        ok: true,
        location: `${editUrl(c.formId!)}?q=${qid}&confirm=delete#delete-confirm`,
        data: { formId: c.formId, confirm: true },
      },
    };
  }
  return {
    schema: result.schema,
    location: `${editUrl(c.formId!)}#outline`,
    notice: 'deleted',
    data: { deleted: qid },
  };
}

function typeAction(c: Ctx, draft: Draft): Mutation {
  const qid = str(c.body, 'qid');
  const type = str(c.body, 'type') as QuestionType;
  if (!(QUESTION_TYPES as readonly string[]).includes(type)) {
    return { refuse: fail(400, 'INVALID_INPUT', 'invalid', 'Choose a question type.') };
  }
  const change = changeQuestionType(draft.schema, qid, type);
  if (!change.changed) {
    return {
      noop: {
        ok: true,
        location: questionUrl(c.formId!, qid),
        notice: 'move-none',
        data: { changed: false },
      },
    };
  }
  if ((change.lost.length > 0 || change.dependents.length > 0) && str(c.body, 'confirm') !== '1') {
    return {
      noop: {
        ok: true,
        location: `${editUrl(c.formId!)}?q=${qid}&type=${type}#type-confirm`,
        data: { formId: c.formId, confirm: true, lost: change.lost },
      },
    };
  }
  return {
    schema: change.schema,
    location: questionUrl(c.formId!, qid),
    notice: 'type-changed',
    data: { questionId: qid, lost: change.lost },
  };
}

// ---- other writes ---------------------------------------------------------------------------

async function createForm(c: Ctx): Promise<Outcome> {
  const slug = str(c.body, 'slug').trim();
  const program = str(c.body, 'program');
  const kind = str(c.body, 'kind');
  const title = str(c.body, 'title');
  if (
    !(FORM_PROGRAMS as readonly string[]).includes(program) ||
    !(FORM_KINDS as readonly string[]).includes(kind)
  ) {
    return fail(400, 'INVALID_INPUT', 'invalid', 'Choose a program and a kind of form.', {
      values: keptValues(c.body),
    });
  }
  const form = await c.forms.create({
    slug,
    program: program as (typeof FORM_PROGRAMS)[number],
    kind: kind as FormKind,
    title,
    description: str(c.body, 'description') || null,
    confirmationMessage: str(c.body, 'confirmation_message') || str(c.body, 'confirmationMessage') || null,
    staffId: c.staffId,
    ...(c.deps.now === undefined ? {} : { now: c.deps.now }),
  });
  return {
    ok: true,
    location: editUrl(form.id),
    notice: 'created',
    data: { id: form.id, slug: form.slug, status: form.status, revision: form.revision },
  };
}

/**
 * Adds and publishes only the default forms that are missing (matched by slug), attributed to the signed-in
 * staff member. Existing forms are never touched, so a second click is a no-op.
 */
async function seedDefaults(c: Ctx): Promise<Outcome> {
  const now = c.deps.now ?? Math.floor(Date.now() / 1000);
  const { created, skipped } = await seedDefaultForms(c.deps.db, now, c.staffId);
  return {
    ok: true,
    location: '/forms',
    notice: created.length === 0 ? 'defaults-none' : `defaults-added-${created.length}`,
    data: { created, existing: skipped },
  };
}

async function setStatus(c: Ctx): Promise<Outcome> {
  if (!c.formId) return fail(404, 'NOT_FOUND', 'not-found', 'This form does not exist.');
  const by = { staffId: c.staffId, ...(c.deps.now === undefined ? {} : { now: c.deps.now }) };
  const form =
    c.action === 'form.close' ? await c.forms.close(c.formId, by) : await c.forms.reopen(c.formId, by);
  return {
    ok: true,
    location: '/forms',
    notice: c.action === 'form.close' ? 'closed' : 'reopened',
    data: { id: form.id, status: form.status },
  };
}

async function saveSettings(c: Ctx): Promise<Outcome> {
  if (!c.formId) return fail(404, 'NOT_FOUND', 'not-found', 'This form does not exist.');
  const retention = str(c.body, 'retention_months').trim() || str(c.body, 'retentionMonths').trim();
  const months = retention === '' ? null : Number(retention);
  if (months !== null && !Number.isInteger(months)) {
    return fail(400, 'INVALID_INPUT', 'invalid', 'Retention is a whole number of months from 1 to 240.', {
      fieldErrors: [
        { field: 'retention_months', message: 'Retention is a whole number of months from 1 to 240.' },
      ],
      values: keptValues(c.body),
    });
  }
  const has = (k: string) => Object.prototype.hasOwnProperty.call(c.body, k);
  const form = await c.forms.updateSettings({
    formId: c.formId,
    ...(has('title') ? { title: str(c.body, 'title') } : {}),
    ...(has('description') ? { description: str(c.body, 'description') || null } : {}),
    ...(has('confirmation_message') || has('confirmationMessage')
      ? {
          confirmationMessage:
            str(c.body, 'confirmation_message') || str(c.body, 'confirmationMessage') || null,
        }
      : {}),
    ...(has('retention_months') || has('retentionMonths') ? { retentionMonths: months } : {}),
    staffId: c.staffId,
    ...(c.deps.now === undefined ? {} : { now: c.deps.now }),
  });
  return {
    ok: true,
    location: `${editUrl(c.formId)}?view=settings`,
    notice: 'settings-saved',
    data: { id: form.id, title: form.title },
  };
}

async function publishDraft(c: Ctx): Promise<Outcome> {
  if (!c.formId) return fail(404, 'NOT_FOUND', 'not-found', 'This form does not exist.');
  const revision = revisionOf(c.body);
  if (revision === null) return MISSING_REVISION();
  const note = str(c.body, 'change_note') || str(c.body, 'changeNote');
  const result = await c.forms.publish({
    formId: c.formId,
    expectedRevision: revision,
    changeNote: note || null,
    staffId: c.staffId,
    ...(c.deps.now === undefined ? {} : { now: c.deps.now }),
  });
  return {
    ok: true,
    location: editUrl(c.formId),
    notice: result.created ? 'published' : 'publish-same',
    data: {
      formId: c.formId,
      versionId: result.version.id,
      version: result.version.version,
      created: result.created,
      warnings: result.checkWarnings,
    },
  };
}

async function restoreVersion(c: Ctx): Promise<Outcome> {
  if (!c.formId) return fail(404, 'NOT_FOUND', 'not-found', 'This form does not exist.');
  const revision = revisionOf(c.body);
  if (revision === null) return MISSING_REVISION();
  const version = Number(str(c.body, 'version'));
  if (!Number.isInteger(version) || version < 1) {
    return fail(400, 'INVALID_INPUT', 'invalid', 'Choose a version to restore.');
  }
  const opId = str(c.body, 'op_id');
  const saved = await c.forms.restoreVersionToDraft({
    formId: c.formId,
    version,
    expectedRevision: revision,
    staffId: c.staffId,
    ...(opId ? { opId } : {}),
    ...(c.deps.now === undefined ? {} : { now: c.deps.now }),
  });
  return {
    ok: true,
    location: editUrl(c.formId),
    notice: 'restored',
    data: { formId: c.formId, revision: saved.revision },
  };
}
