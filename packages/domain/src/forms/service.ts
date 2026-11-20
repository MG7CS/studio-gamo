/**
 * Forms service (design 2026-11-16, Task 2.2; builder UX decisions 4, 7, 8, 11, 12, 13).
 *
 * Staff edit a draft schema (`forms.draft_schema_json`, guarded by an integer `revision`); Publish snapshots it
 * into an immutable `form_versions` row, and every submission cites the version it answered, so editing a
 * published form never changes how an old submission renders. All times are epoch seconds. Staff ids are
 * plain strings (no FK: attribution survives staff removal).
 *
 *   const forms = new FormsService(db);
 *   const { revision } = await forms.saveDraft({ formId, schema, expectedRevision, staffId, opId });
 *   const { version, checkWarnings } = await forms.publish({ formId, expectedRevision: revision, staffId });
 *
 *   // Public submit (the HTTP handler: same-origin, Turnstile and rate limits first):
 *   const { submission, created, form } = await forms.submit({ slug, raw, uploads, idempotencyKey, ipHash,
 *     uploadsHook: (uploads, id) => uploadService.attach(…, id),
 *     onRequestKinds: (id) => createRequestFromSubmission({ submissionId: id, now }) });
 *   // afterSubmit: `submit` never sends email. When `created` is true the caller (not the service) runs
 *   //   sendSubmissionEmails(db, env, { submission: { id, reference, submitterEmail, submitterName },
 *   //   form, adminUrl, now }) and redirects with the reference. `created === false` is a repeat of the same
 *   //   form post: show the same confirmation and send nothing.
 *
 * Errors: `FormsError` (codes below), `FormConflictError` (stale revision), `FormPublishError` (blocking
 * publish checks), `FormAnswersError` (answers failed validation); `saveDraft` also lets `FormSchemaError`
 * (from ./schema.ts) through when the schema is invalid.
 */
import { newPrefixedId } from '../security/ids.ts';
import { sha256Hex } from '../security/crypto.ts';
import { normalizeEmail } from '../security/pii-hash.ts';
import {
  allRows,
  changesOf,
  prepareSpec,
  runBatch,
  type SqlDatabase,
  type SqlParam,
  type SqlStatementSpec,
} from '../security/sql-database.ts';
import {
  FORM_KINDS,
  checkPublishable,
  parseFormSchema,
  type FormKind,
  type FormSchema,
  type Question,
  type UploadRef,
} from './schema.ts';
import { validateAnswers, type AnswerError, type Answers } from './validate.ts';
import {
  REFERENCE_SQL,
  counterUpsertSpec,
  referenceCounterKey,
  referenceParams,
  type FormProgram,
} from './reference.ts';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const FORM_PROGRAMS = ['web', 'worship', 'academy', 'production'] as const;
export type FormStatus = 'draft' | 'published' | 'closed';

export const SUBMISSION_STATUSES = [
  'new',
  'in_review',
  'handled',
  'spam',
  'archived',
  'approved',
  'declined',
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Kinds whose submissions can be approved or declined (they feed the roster). */
export const APPLICATION_KINDS: readonly FormKind[] = [
  'musician_application',
  'technician_application',
  'instructor_application',
];
/** Kinds that create a service request after submit. */
export const REQUEST_KINDS: readonly FormKind[] = ['church_request', 'production_request'];

/** Statuses the retention purge may delete (after `delete_after`). */
export const PURGEABLE_STATUSES: readonly SubmissionStatus[] = ['declined', 'spam', 'archived', 'handled'];

export const EXPORT_ROW_CAP = 5000;
export const VERSION_NOTE_MAX = 500;
const NOTE_MAX = 2000;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type FormsErrorCode =
  | 'INVALID_INPUT' // 400 a field is malformed
  | 'NOT_FOUND' // 404 no such form, submission, or an unpublished form on the public path
  | 'VERSION_NOT_FOUND' // 404
  | 'SLUG_TAKEN' // 409
  | 'REVISION_CONFLICT' // 409 (FormConflictError)
  | 'PUBLISH_BLOCKED' // 422 (FormPublishError)
  | 'ANSWERS_INVALID' // 422 (FormAnswersError)
  | 'FORM_CLOSED' // 410 the form no longer accepts submissions
  | 'IDEMPOTENCY_CONFLICT' // 409 the key belongs to a submission of another form
  | 'INVALID_TRANSITION' // 409 e.g. approving a non-application submission, or closing a draft
  | 'CONFLICT'; // 409 lost a race (republished while submitting)

const STATUS_OF: Record<FormsErrorCode, 400 | 404 | 409 | 410 | 422> = {
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  VERSION_NOT_FOUND: 404,
  SLUG_TAKEN: 409,
  REVISION_CONFLICT: 409,
  PUBLISH_BLOCKED: 422,
  ANSWERS_INVALID: 422,
  FORM_CLOSED: 410,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_TRANSITION: 409,
  CONFLICT: 409,
};

/** A refusal whose `message` is safe to show to staff or the public. */
export class FormsError extends Error {
  readonly status: 400 | 404 | 409 | 410 | 422;
  constructor(
    readonly code: FormsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FormsError';
    this.status = STATUS_OF[code];
  }
}

/** Another staff member saved first (`UPDATE … WHERE revision = ?` changed nothing). */
export class FormConflictError extends FormsError {
  constructor(
    readonly currentRevision: number,
    readonly updatedByUserId: string | null,
    readonly updatedAt: number,
    /** What the staff member tried to save, so the screen can re-render it (never stored). */
    readonly attemptedSchema?: FormSchema,
  ) {
    super('REVISION_CONFLICT', 'Someone else saved this form first. Review their changes, then save again.');
    this.name = 'FormConflictError';
  }
}

/** `checkPublishable` found blocking errors. `warnings` are returned so the builder can show both. */
export class FormPublishError extends FormsError {
  constructor(
    readonly errors: string[],
    readonly warnings: string[],
  ) {
    super('PUBLISH_BLOCKED', `This form cannot be published yet: ${errors.length} problem(s) to fix.`);
    this.name = 'FormPublishError';
  }
}

/** The posted answers failed validation against the published version. */
export class FormAnswersError extends FormsError {
  constructor(readonly errors: AnswerError[]) {
    super('ANSWERS_INVALID', 'Some answers need attention.');
    this.name = 'FormAnswersError';
  }
}

export function isFormsError(error: unknown): error is FormsError {
  return error instanceof FormsError;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Form {
  id: string;
  slug: string;
  program: FormProgram;
  kind: FormKind;
  title: string;
  description: string | null;
  status: FormStatus;
  currentVersionId: string | null;
  confirmationMessage: string | null;
  revision: number;
  retentionMonths: number | null;
  updatedByUserId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface FormVersionInfo {
  id: string;
  formId: string;
  version: number;
  publishedByUserId: string | null;
  publishedAt: number;
  changeNote: string | null;
  contentHash: string | null;
}
export interface FormVersion extends FormVersionInfo {
  schema: FormSchema;
}

export interface FormSummary extends Form {
  publishedVersion: number | null;
  submissionCount: number;
  newSubmissionCount: number;
  hasUnpublishedChanges: boolean;
}

export interface FormForEdit {
  form: Form;
  draft: FormSchema;
  revision: number;
  latestVersion: FormVersionInfo | null;
  versionCount: number;
  submissionCount: number;
  newSubmissionCount: number;
  /** True when the draft differs from the published version (or nothing is published yet). */
  hasUnpublishedChanges: boolean;
}

export interface PublishedForm {
  form: Pick<
    Form,
    'id' | 'slug' | 'program' | 'kind' | 'title' | 'description' | 'confirmationMessage' | 'status'
  > & { retentionMonths: number | null };
  version: { id: string; version: number; schema: FormSchema };
  /** `form.status === 'published'`: false for a closed form (render a closed notice, accept nothing). */
  accepting: boolean;
}

export interface DiffItem {
  id: string;
  label: string;
  kind: 'question' | 'section';
}
export interface FormDiff {
  /** The published version compared against, or null when nothing is published yet. */
  publishedVersion: number | null;
  added: DiffItem[];
  changed: DiffItem[];
  removed: DiffItem[];
  /** Same questions, different order or section. */
  reordered: boolean;
  hasChanges: boolean;
}

export interface FormSubmission {
  id: string;
  formId: string;
  formVersionId: string;
  reference: string;
  status: SubmissionStatus;
  submitterName: string | null;
  submitterEmail: string | null;
  submitterPhone: string | null;
  answers: Answers;
  binds: Record<string, unknown>;
  submittedAt: number;
  reviewedByUserId: string | null;
  reviewedAt: number | null;
  staffNotes: string | null;
  deleteAfter: number | null;
}

export interface SubmissionEvent {
  id: string;
  kind: 'status' | 'note' | 'export';
  actorUserId: string | null;
  body: string | null;
  /** Parsed `body` of a status event. */
  change: { from: string; to: string; note: string | null } | null;
  createdAt: number;
}

export interface SubmissionUpload {
  id: string;
  questionId: string;
  kind: string;
  contentType: string;
  originalName: string | null;
  bytes: number;
  status: string;
}

export interface SubmissionDetail {
  submission: FormSubmission;
  form: Pick<Form, 'id' | 'slug' | 'program' | 'kind' | 'title'>;
  /** The version the person answered: render labels from this schema, never from the draft. */
  version: FormVersion;
  answers: Answers;
  events: SubmissionEvent[];
  uploads: SubmissionUpload[];
}

export interface SubmissionSummary {
  id: string;
  formId: string;
  formSlug: string;
  formTitle: string;
  version: number;
  reference: string;
  status: SubmissionStatus;
  submitterName: string | null;
  submitterEmail: string | null;
  submittedAt: number;
  deleteAfter: number | null;
  attachmentCount: number;
}

export interface SubmissionFilter {
  formId?: string;
  /** Published version number of the form. */
  version?: number;
  status?: SubmissionStatus | SubmissionStatus[];
  /** Inclusive epoch seconds. */
  from?: number;
  /** Exclusive epoch seconds. */
  to?: number;
  hasAttachments?: boolean;
  /** Matches name, email or reference (case-insensitive substring, at most 100 characters). */
  q?: string;
}

export interface ListSubmissionsInput extends SubmissionFilter {
  /** 1–100 (default 25). */
  limit?: number;
  /** `nextCursor` of the previous page. */
  cursor?: string;
}

export interface SubmitInput {
  slug: string;
  raw: Record<string, string | string[]>;
  uploads: Record<string, UploadRef[]>;
  idempotencyKey: string;
  ipHash?: string | null;
  now?: number;
  /** Runs after the insert for `church_request` / `production_request` forms (creates the service request). */
  onRequestKinds?: (submissionId: string) => Promise<void>;
  /** Runs after the insert with the uploads referenced by the accepted answers (attach them to the id). */
  uploadsHook?: (uploads: Record<string, UploadRef[]>, submissionId: string) => Promise<void>;
}

export interface SubmitResult {
  submission: FormSubmission;
  /** False when the same idempotency key was posted before: nothing new was stored. */
  created: boolean;
  form: Pick<Form, 'id' | 'slug' | 'program' | 'kind' | 'title'>;
  /** Hooks that threw after the submission was saved (never rethrown); empty on success. */
  hookFailures: ('uploads' | 'request')[];
}

export interface FormsServiceOptions {
  /** Epoch seconds (a number or a clock function); default the system clock. */
  now?: number | (() => number);
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** JSON with sorted object keys, so equal content always serialises (and hashes) identically. */
export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v as object).sort()) {
        const item = (v as Record<string, unknown>)[key];
        if (item !== undefined) out[key] = walk(item);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/** SHA-256 (hex) of the canonical JSON of a schema. */
export async function contentHash(schema: FormSchema): Promise<string> {
  return sha256Hex(canonicalJson(schema));
}

/** Schema of a brand-new form: one empty section. */
export function emptyFormSchema(): FormSchema {
  return parseFormSchema({ sections: [{ id: 's1', title: 'Questions', questions: [] }] });
}

/** Calendar-month addition in UTC (clamped to the end of a shorter month), epoch seconds. */
export function addMonthsUtc(epochSeconds: number, months: number): number {
  const d = new Date(epochSeconds * 1000);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return Math.floor(d.getTime() / 1000);
}

const CSV_FORMULA_START = new Set(['=', '+', '-', '@', '\t', '\r', '\n', '＝', '＋', '－', '＠']);

/**
 * One CSV field: always quoted, internal quotes doubled, and a leading `= + - @ TAB CR LF` (or a full-width
 * `＝ ＋ － ＠`) neutralised with a leading `'` so spreadsheets never run it. `numeric: true` is only for
 * values the server validated as numbers (negative numbers keep their sign).
 */
export function csvCell(value: string, options: { numeric?: boolean } = {}): string {
  let text = value;
  if (!options.numeric && text.length > 0 && CSV_FORMULA_START.has(text[0]!)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;

function answerToCell(question: Question | undefined, value: unknown): { text: string; numeric: boolean } {
  if (value === undefined || value === null) return { text: '', numeric: false };
  if (typeof value === 'number') return { text: String(value), numeric: Number.isFinite(value) };
  if (typeof value === 'string') {
    const numeric =
      question?.type === 'short_text' && question.validation?.kind === 'number' && NUMERIC_TEXT.test(value);
    return { text: value, numeric };
  }
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'string')) return { text: value.join('; '), numeric: false };
    const files = value.filter((v) => v && typeof v === 'object' && 'uploadId' in v) as UploadRef[];
    if (files.length > 0) {
      return {
        text: `${files.length} file${files.length === 1 ? '' : 's'} (${files.map((f) => f.kind).join(', ')})`,
        numeric: false,
      };
    }
    return { text: '', numeric: false };
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.canonical === 'string') return { text: obj.canonical, numeric: false };
    return {
      text: Object.entries(obj)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
        .join('; '),
      numeric: false,
    };
  }
  return { text: String(value), numeric: false };
}

function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (text === null || text === undefined) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function questionsOf(schema: FormSchema): Question[] {
  return schema.sections.flatMap((s) => s.questions);
}

function isUniqueViolation(error: unknown, column?: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message) && (column === undefined || message.includes(column));
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

interface FormRow {
  id: string;
  slug: string;
  program: FormProgram;
  kind: FormKind;
  title: string;
  description: string | null;
  status: FormStatus;
  draft_schema_json: string;
  current_version_id: string | null;
  confirmation_message: string | null;
  revision: number;
  retention_months: number | null;
  updated_by_user_id: string | null;
  created_at: number;
  updated_at: number;
}
interface VersionRow {
  id: string;
  form_id: string;
  version: number;
  schema_json: string;
  published_by_user_id: string | null;
  published_at: number;
  change_note: string | null;
  content_hash: string | null;
}
interface SubmissionRow {
  id: string;
  form_id: string;
  form_version_id: string;
  reference: string;
  status: SubmissionStatus;
  submitter_name: string | null;
  submitter_email_normalized: string | null;
  submitter_phone: string | null;
  answers_json: string;
  binds_json: string;
  submitted_at: number;
  reviewed_by_user_id: string | null;
  reviewed_at: number | null;
  staff_notes: string | null;
  delete_after: number | null;
}

const toForm = (r: FormRow): Form => ({
  id: r.id,
  slug: r.slug,
  program: r.program,
  kind: r.kind,
  title: r.title,
  description: r.description,
  status: r.status,
  currentVersionId: r.current_version_id,
  confirmationMessage: r.confirmation_message,
  revision: Number(r.revision),
  retentionMonths: r.retention_months === null ? null : Number(r.retention_months),
  updatedByUserId: r.updated_by_user_id,
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
});

const toVersionInfo = (r: VersionRow): FormVersionInfo => ({
  id: r.id,
  formId: r.form_id,
  version: Number(r.version),
  publishedByUserId: r.published_by_user_id,
  publishedAt: Number(r.published_at),
  changeNote: r.change_note,
  contentHash: r.content_hash,
});

const toSubmission = (r: SubmissionRow): FormSubmission => ({
  id: r.id,
  formId: r.form_id,
  formVersionId: r.form_version_id,
  reference: r.reference,
  status: r.status,
  submitterName: r.submitter_name,
  submitterEmail: r.submitter_email_normalized,
  submitterPhone: r.submitter_phone,
  answers: parseJson<Answers>(r.answers_json, {}),
  binds: parseJson<Record<string, unknown>>(r.binds_json, {}),
  submittedAt: Number(r.submitted_at),
  reviewedByUserId: r.reviewed_by_user_id,
  reviewedAt: r.reviewed_at === null ? null : Number(r.reviewed_at),
  staffNotes: r.staff_notes,
  deleteAfter: r.delete_after === null ? null : Number(r.delete_after),
});

const formRef = (f: Form) => ({
  id: f.id,
  slug: f.slug,
  program: f.program,
  kind: f.kind,
  title: f.title,
});

const FORM_COLUMNS = `id, slug, program, kind, title, description, status, draft_schema_json, current_version_id,
  confirmation_message, revision, retention_months, updated_by_user_id, created_at, updated_at`;
const SUBMISSION_COLUMNS = `id, form_id, form_version_id, reference, status, submitter_name, submitter_email_normalized,
  submitter_phone, answers_json, binds_json, submitted_at, reviewed_by_user_id, reviewed_at, staff_notes, delete_after`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** A submission that a roster member or service request references can never be purged (foreign keys). */
const NOT_REFERENCED = `NOT EXISTS (SELECT 1 FROM roster_members WHERE roster_members.submission_id = form_submissions.id)
  AND NOT EXISTS (SELECT 1 FROM service_requests WHERE service_requests.submission_id = form_submissions.id)`;

export class FormsService {
  constructor(
    private readonly db: SqlDatabase,
    private readonly options: FormsServiceOptions = {},
  ) {}

  private clock(now?: number): number {
    if (now !== undefined) return now;
    const o = this.options.now;
    if (typeof o === 'function') return o();
    return o ?? Math.floor(Date.now() / 1000);
  }

  private async one<T>(sql: string, ...params: SqlParam[]): Promise<T | null> {
    return (await allRows<T>(this.db, { sql, params }))[0] ?? null;
  }

  private async formRow(id: string): Promise<FormRow | null> {
    return this.one<FormRow>(`SELECT ${FORM_COLUMNS} FROM forms WHERE id = ?`, id);
  }

  private async requireFormRow(id: string): Promise<FormRow> {
    const row = await this.formRow(id);
    if (!row) throw new FormsError('NOT_FOUND', 'This form does not exist.');
    return row;
  }

  private async versionRow(id: string): Promise<VersionRow | null> {
    return this.one<VersionRow>(
      `SELECT id, form_id, version, schema_json, published_by_user_id, published_at, change_note, content_hash
       FROM form_versions WHERE id = ?`,
      id,
    );
  }

  private toVersion(row: VersionRow): FormVersion {
    return { ...toVersionInfo(row), schema: parseFormSchema(JSON.parse(row.schema_json)) };
  }

  private parseDraft(row: FormRow): FormSchema {
    if (row.draft_schema_json.trim() === '{}') return emptyFormSchema();
    return parseFormSchema(JSON.parse(row.draft_schema_json));
  }

  private conflictFrom(row: FormRow, attempted?: FormSchema): FormConflictError {
    return new FormConflictError(
      Number(row.revision),
      row.updated_by_user_id,
      Number(row.updated_at),
      attempted,
    );
  }

  // ---- forms ---------------------------------------------------------------------------------------

  /** A new draft form with one empty section. Slug must be unique; `kind` one of `FORM_KINDS`. */
  async create(input: {
    slug: string;
    program: FormProgram;
    kind: FormKind;
    title: string;
    description?: string | null;
    confirmationMessage?: string | null;
    retentionMonths?: number | null;
    staffId: string;
    now?: number;
  }): Promise<Form> {
    const slug = String(input.slug ?? '');
    if (slug.length < 1 || slug.length > 80 || !SLUG_PATTERN.test(slug)) {
      throw new FormsError(
        'INVALID_INPUT',
        'The web address may use lower-case letters, digits and hyphens (max 80).',
      );
    }
    if (!(FORM_PROGRAMS as readonly string[]).includes(input.program)) {
      throw new FormsError('INVALID_INPUT', 'Choose a program for this form.');
    }
    if (!(FORM_KINDS as readonly string[]).includes(input.kind)) {
      throw new FormsError('INVALID_INPUT', 'Choose what kind of form this is.');
    }
    const title = String(input.title ?? '').trim();
    if (title.length < 1 || title.length > 200) {
      throw new FormsError('INVALID_INPUT', 'The title needs 1 to 200 characters.');
    }
    const description = input.description?.trim() || null;
    if (description !== null && description.length > 1000) {
      throw new FormsError('INVALID_INPUT', 'The description can have at most 1000 characters.');
    }
    const confirmation = input.confirmationMessage?.trim() || null;
    if (confirmation !== null && confirmation.length > 1000) {
      throw new FormsError('INVALID_INPUT', 'The confirmation message can have at most 1000 characters.');
    }
    this.assertRetention(input.retentionMonths);
    if (!input.staffId) throw new FormsError('INVALID_INPUT', 'A staff id is required.');

    const now = this.clock(input.now);
    const id = newPrefixedId('frm');
    try {
      await prepareSpec(this.db, {
        sql: `INSERT INTO forms (id, slug, program, kind, title, description, status, draft_schema_json,
                confirmation_message, revision, retention_months, updated_by_user_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, 1, ?, ?, ?, ?)`,
        params: [
          id,
          slug,
          input.program,
          input.kind,
          title,
          description,
          JSON.stringify(emptyFormSchema()),
          confirmation,
          input.retentionMonths ?? null,
          input.staffId,
          now,
          now,
        ],
      }).run();
    } catch (error) {
      if (isUniqueViolation(error, 'forms.slug')) {
        throw new FormsError('SLUG_TAKEN', 'Another form already uses this web address.');
      }
      throw error;
    }
    return toForm(await this.requireFormRow(id));
  }

  private assertRetention(months: number | null | undefined): void {
    if (months === null || months === undefined) return;
    if (!Number.isInteger(months) || months < 1 || months > 240) {
      throw new FormsError('INVALID_INPUT', 'Retention is a whole number of months from 1 to 240.');
    }
  }

  async getForm(id: string): Promise<Form | null> {
    const row = await this.formRow(id);
    return row ? toForm(row) : null;
  }

  async findBySlug(slug: string): Promise<Form | null> {
    const row = await this.one<FormRow>(`SELECT ${FORM_COLUMNS} FROM forms WHERE slug = ?`, slug);
    return row ? toForm(row) : null;
  }

  /** Forms list screen: one row per form with counts and a "draft changes pending" flag. */
  async listForms(filter: { program?: FormProgram; status?: FormStatus } = {}): Promise<FormSummary[]> {
    const where: string[] = [];
    const params: SqlParam[] = [];
    if (filter.program) {
      where.push('f.program = ?');
      params.push(filter.program);
    }
    if (filter.status) {
      where.push('f.status = ?');
      params.push(filter.status);
    }
    const rows = await allRows<
      FormRow & {
        published_version: number | null;
        submission_count: number;
        new_count: number;
        current_schema_json: string | null;
      }
    >(this.db, {
      sql: `SELECT f.id, f.slug, f.program, f.kind, f.title, f.description, f.status, f.draft_schema_json,
              f.current_version_id, f.confirmation_message, f.revision, f.retention_months,
              f.updated_by_user_id, f.created_at, f.updated_at,
              v.version AS published_version, v.schema_json AS current_schema_json,
              (SELECT count(*) FROM form_submissions s WHERE s.form_id = f.id) AS submission_count,
              (SELECT count(*) FROM form_submissions s WHERE s.form_id = f.id AND s.status = 'new') AS new_count
            FROM forms f LEFT JOIN form_versions v ON v.id = f.current_version_id
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY f.program, f.title`,
      params,
    });
    const out: FormSummary[] = [];
    for (const row of rows) {
      out.push({
        ...toForm(row),
        publishedVersion: row.published_version === null ? null : Number(row.published_version),
        submissionCount: Number(row.submission_count),
        newSubmissionCount: Number(row.new_count),
        hasUnpublishedChanges: this.draftDiffersFrom(row, row.current_schema_json),
      });
    }
    return out;
  }

  private draftDiffersFrom(row: FormRow, publishedJson: string | null): boolean {
    if (publishedJson === null) return true;
    try {
      return (
        canonicalJson(this.parseDraft(row)) !== canonicalJson(parseFormSchema(JSON.parse(publishedJson)))
      );
    } catch {
      return true;
    }
  }

  /** Update title, description, confirmation message or retention (not the questions; no revision change). */
  async updateSettings(input: {
    formId: string;
    title?: string;
    description?: string | null;
    confirmationMessage?: string | null;
    retentionMonths?: number | null;
    staffId: string;
    now?: number;
  }): Promise<Form> {
    const sets: string[] = [];
    const params: SqlParam[] = [];
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (title.length < 1 || title.length > 200) {
        throw new FormsError('INVALID_INPUT', 'The title needs 1 to 200 characters.');
      }
      sets.push('title = ?');
      params.push(title);
    }
    for (const [key, column] of [
      ['description', 'description'],
      ['confirmationMessage', 'confirmation_message'],
    ] as const) {
      const value = input[key];
      if (value === undefined) continue;
      const text = value === null ? null : value.trim() || null;
      if (text !== null && text.length > 1000) {
        throw new FormsError('INVALID_INPUT', 'Text can have at most 1000 characters.');
      }
      sets.push(`${column} = ?`);
      params.push(text);
    }
    if (input.retentionMonths !== undefined) {
      this.assertRetention(input.retentionMonths);
      sets.push('retention_months = ?');
      params.push(input.retentionMonths);
    }
    await this.requireFormRow(input.formId);
    if (sets.length > 0) {
      await prepareSpec(this.db, {
        sql: `UPDATE forms SET ${sets.join(', ')}, updated_by_user_id = ?, updated_at = ? WHERE id = ?`,
        params: [...params, input.staffId, this.clock(input.now), input.formId],
      }).run();
    }
    return toForm(await this.requireFormRow(input.formId));
  }

  /** Everything the builder needs: form, draft, revision, latest version, counts. */
  async getForEdit(id: string): Promise<FormForEdit> {
    const row = await this.requireFormRow(id);
    const current = row.current_version_id ? await this.versionRow(row.current_version_id) : null;
    const counts = await this.one<{ versions: number; submissions: number; fresh: number }>(
      `SELECT (SELECT count(*) FROM form_versions WHERE form_id = ?) AS versions,
              (SELECT count(*) FROM form_submissions WHERE form_id = ?) AS submissions,
              (SELECT count(*) FROM form_submissions WHERE form_id = ? AND status = 'new') AS fresh`,
      id,
      id,
      id,
    );
    return {
      form: toForm(row),
      draft: this.parseDraft(row),
      revision: Number(row.revision),
      latestVersion: current ? toVersionInfo(current) : null,
      versionCount: Number(counts?.versions ?? 0),
      submissionCount: Number(counts?.submissions ?? 0),
      newSubmissionCount: Number(counts?.fresh ?? 0),
      hasUnpublishedChanges: this.draftDiffersFrom(row, current?.schema_json ?? null),
    };
  }

  // ---- draft ---------------------------------------------------------------------------------------

  /**
   * Saves the draft if `expectedRevision` is still current (`UPDATE … WHERE id = ? AND revision = ?`), bumping
   * the revision. A stale revision throws `FormConflictError` and stores nothing. With `opId` the save is
   * idempotent: a repeated `opId` is a no-op that returns the current revision.
   */
  async saveDraft(input: {
    formId: string;
    schema: unknown;
    expectedRevision: number;
    staffId: string;
    opId?: string;
    now?: number;
  }): Promise<{ revision: number }> {
    return this.writeDraft({ ...input, action: 'save_draft' });
  }

  /** New draft from an old version (the published version is untouched). */
  async restoreVersionToDraft(input: {
    formId: string;
    version: number;
    expectedRevision: number;
    staffId: string;
    opId?: string;
    now?: number;
  }): Promise<{ revision: number }> {
    const found = await this.getVersion(input.formId, input.version);
    if (!found) throw new FormsError('VERSION_NOT_FOUND', 'That version does not exist.');
    return this.writeDraft({ ...input, schema: found.schema, action: 'restore_version' });
  }

  private async writeDraft(input: {
    formId: string;
    schema: unknown;
    expectedRevision: number;
    staffId: string;
    opId?: string;
    now?: number;
    action: string;
  }): Promise<{ revision: number }> {
    const parsed = parseFormSchema(input.schema); // FormSchemaError before the database is touched
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new FormsError('INVALID_INPUT', 'A revision number is required.');
    }
    if (!input.staffId) throw new FormsError('INVALID_INPUT', 'A staff id is required.');
    const opId = input.opId;
    if (opId !== undefined && (opId.length < 1 || opId.length > 100)) {
      throw new FormsError('INVALID_INPUT', 'The operation id needs 1 to 100 characters.');
    }
    const form = await this.requireFormRow(input.formId);
    if (opId !== undefined) {
      const seen = await this.one<{ form_id: string }>(
        'SELECT form_id FROM form_operations WHERE op_id = ?',
        opId,
      );
      if (seen) {
        if (seen.form_id !== input.formId) {
          throw new FormsError('INVALID_INPUT', 'This operation id was used for another form.');
        }
        return { revision: Number(form.revision) };
      }
    }
    const now = this.clock(input.now);
    const update: SqlStatementSpec = {
      sql: `UPDATE forms SET draft_schema_json = ?, revision = revision + 1, updated_by_user_id = ?, updated_at = ?
            WHERE id = ? AND revision = ?`,
      params: [JSON.stringify(parsed), input.staffId, now, input.formId, input.expectedRevision],
    };
    let saved: boolean;
    if (opId === undefined) {
      saved = changesOf(await prepareSpec(this.db, update).run()) === 1;
    } else {
      // The operation row is written only when the update changed a row (`changes()` of the previous statement).
      await runBatch(this.db, [
        update,
        {
          sql: `INSERT INTO form_operations (op_id, form_id, action, created_at) SELECT ?, ?, ?, ? WHERE changes() > 0`,
          params: [opId, input.formId, input.action, now],
        },
      ]);
      saved = (await this.one('SELECT 1 AS x FROM form_operations WHERE op_id = ?', opId)) !== null;
    }
    const after = await this.requireFormRow(input.formId);
    if (!saved) throw this.conflictFrom(after, parsed);
    return { revision: Number(after.revision) };
  }

  // ---- versions ------------------------------------------------------------------------------------

  async getVersion(formId: string, version: number): Promise<FormVersion | null> {
    const row = await this.one<VersionRow>(
      `SELECT id, form_id, version, schema_json, published_by_user_id, published_at, change_note, content_hash
       FROM form_versions WHERE form_id = ? AND version = ?`,
      formId,
      version,
    );
    return row ? this.toVersion(row) : null;
  }

  /** Version history, newest first. */
  async listVersions(formId: string): Promise<FormVersionInfo[]> {
    const rows = await allRows<VersionRow>(this.db, {
      sql: `SELECT id, form_id, version, schema_json, published_by_user_id, published_at, change_note, content_hash
            FROM form_versions WHERE form_id = ? ORDER BY version DESC`,
      params: [formId],
    });
    return rows.map(toVersionInfo);
  }

  /**
   * Snapshots the draft as the next immutable version and makes it the one the public form renders.
   * Blocking `checkPublishable` errors throw `FormPublishError`; warnings are returned. A stale
   * `expectedRevision` throws `FormConflictError`. If the draft is identical (canonical hash) to the current
   * version nothing is written and the existing version is returned with `created: false`. Publishing a closed
   * form with changes makes it live again.
   */
  async publish(input: {
    formId: string;
    expectedRevision: number;
    changeNote?: string | null;
    staffId: string;
    now?: number;
  }): Promise<{ version: FormVersion; checkWarnings: string[]; created: boolean }> {
    if (!input.staffId) throw new FormsError('INVALID_INPUT', 'A staff id is required.');
    const note = input.changeNote?.trim() || null;
    if (note !== null && note.length > VERSION_NOTE_MAX) {
      throw new FormsError(
        'INVALID_INPUT',
        `The version note can have at most ${VERSION_NOTE_MAX} characters.`,
      );
    }
    const form = await this.requireFormRow(input.formId);
    if (Number(form.revision) !== input.expectedRevision) throw this.conflictFrom(form);

    const draft = this.parseDraft(form);
    const check = checkPublishable(form.kind, draft);
    if (check.errors.length > 0) throw new FormPublishError(check.errors, check.warnings);
    const hash = await contentHash(draft);

    const same = async (row: VersionRow): Promise<boolean> => {
      try {
        return (await contentHash(parseFormSchema(JSON.parse(row.schema_json)))) === hash;
      } catch {
        return row.content_hash === hash;
      }
    };
    const current = form.current_version_id ? await this.versionRow(form.current_version_id) : null;
    if (current && (await same(current))) {
      return { version: this.toVersion(current), checkWarnings: check.warnings, created: false };
    }

    const id = newPrefixedId('fv');
    const now = this.clock(input.now);
    // Compare-and-swap on (revision, current_version_id): a concurrent save or publish makes the insert a no-op.
    await runBatch(this.db, [
      {
        sql: `INSERT INTO form_versions (id, form_id, version, schema_json, published_by_user_id, published_at, change_note, content_hash)
              SELECT ?, f.id, COALESCE((SELECT MAX(version) FROM form_versions WHERE form_id = f.id), 0) + 1, ?, ?, ?, ?, ?
              FROM forms f WHERE f.id = ? AND f.revision = ? AND f.current_version_id IS ?`,
        params: [
          id,
          JSON.stringify(draft),
          input.staffId,
          now,
          note,
          hash,
          input.formId,
          input.expectedRevision,
          form.current_version_id,
        ],
      },
      {
        sql: `UPDATE forms SET current_version_id = ?, status = 'published', updated_at = ?, updated_by_user_id = ?
              WHERE id = ? AND EXISTS (SELECT 1 FROM form_versions WHERE id = ?)`,
        params: [id, now, input.staffId, input.formId, id],
      },
    ]);

    const after = await this.requireFormRow(input.formId);
    if (after.current_version_id === id) {
      return {
        version: this.toVersion((await this.versionRow(id))!),
        checkWarnings: check.warnings,
        created: true,
      };
    }
    // Lost a race. If the winner published the same content this is still a success.
    const winner = after.current_version_id ? await this.versionRow(after.current_version_id) : null;
    if (winner && (await same(winner)) && Number(after.revision) === input.expectedRevision) {
      return { version: this.toVersion(winner), checkWarnings: check.warnings, created: false };
    }
    throw this.conflictFrom(after);
  }

  /** What changed in the draft since the published version (question ids and labels for the publish screen). */
  async diffAgainstPublished(formId: string): Promise<FormDiff> {
    const form = await this.requireFormRow(formId);
    const draft = this.parseDraft(form);
    const current = form.current_version_id ? await this.versionRow(form.current_version_id) : null;
    const published = current ? this.toVersion(current) : null;

    const added: DiffItem[] = [];
    const changed: DiffItem[] = [];
    const removed: DiffItem[] = [];

    const index = (schema: FormSchema) => {
      const map = new Map<string, { q: Question; section: string; order: number }>();
      let order = 0;
      for (const s of schema.sections) {
        for (const q of s.questions) map.set(q.id, { q, section: s.id, order: order++ });
      }
      return map;
    };
    const next = index(draft);
    const prev = published
      ? index(published.schema)
      : new Map<string, { q: Question; section: string; order: number }>();

    for (const [id, item] of next) {
      const old = prev.get(id);
      if (!old) added.push({ id, label: item.q.label, kind: 'question' });
      else if (canonicalJson(old.q) !== canonicalJson(item.q)) {
        changed.push({ id, label: item.q.label, kind: 'question' });
      }
    }
    for (const [id, item] of prev) {
      if (!next.has(id)) removed.push({ id, label: item.q.label, kind: 'question' });
    }

    const sectionMeta = (s: FormSchema['sections'][number]) =>
      canonicalJson({ title: s.title, description: s.description, showIf: s.showIf });
    const prevSections = new Map((published?.schema.sections ?? []).map((s) => [s.id, s]));
    const nextSections = new Map(draft.sections.map((s) => [s.id, s]));
    for (const [id, s] of nextSections) {
      const old = prevSections.get(id);
      if (!old) added.push({ id, label: s.title, kind: 'section' });
      else if (sectionMeta(old) !== sectionMeta(s)) changed.push({ id, label: s.title, kind: 'section' });
    }
    for (const [id, s] of prevSections) {
      if (!nextSections.has(id)) removed.push({ id, label: s.title, kind: 'section' });
    }

    let reordered = false;
    if (published) {
      const common = [...next.keys()].filter((id) => prev.has(id));
      const prevOrder = [...prev.keys()].filter((id) => next.has(id));
      reordered =
        common.some((id, i) => id !== prevOrder[i]) ||
        common.some((id) => next.get(id)!.section !== prev.get(id)!.section);
    }
    return {
      publishedVersion: published ? published.version : null,
      added,
      changed,
      removed,
      reordered,
      hasChanges: added.length + changed.length + removed.length > 0 || reordered,
    };
  }

  /** Stop accepting submissions (the published version stays). Closing a closed form is a no-op. */
  async close(formId: string, by: { staffId?: string; now?: number } = {}): Promise<Form> {
    return this.setFormStatus(formId, 'published', 'closed', by);
  }

  /** Accept submissions again. Reopening a published form is a no-op. */
  async reopen(formId: string, by: { staffId?: string; now?: number } = {}): Promise<Form> {
    return this.setFormStatus(formId, 'closed', 'published', by);
  }

  private async setFormStatus(
    formId: string,
    from: FormStatus,
    to: FormStatus,
    by: { staffId?: string; now?: number },
  ): Promise<Form> {
    const form = await this.requireFormRow(formId);
    if (form.status === to) return toForm(form);
    if (form.status !== from) {
      throw new FormsError(
        'INVALID_TRANSITION',
        to === 'closed' ? 'Only a published form can be closed.' : 'Only a closed form can be reopened.',
      );
    }
    await prepareSpec(this.db, {
      sql: `UPDATE forms SET status = ?, updated_at = ?, updated_by_user_id = COALESCE(?, updated_by_user_id)
            WHERE id = ? AND status = ?`,
      params: [to, this.clock(by.now), by.staffId ?? null, formId, from],
    }).run();
    return toForm(await this.requireFormRow(formId));
  }

  /**
   * The form the public sees: current published version, or null when the form does not exist or was never
   * published. A closed form is returned with `accepting: false` so the page can say it is closed.
   */
  async getPublished(slug: string): Promise<PublishedForm | null> {
    const row = await this.one<FormRow>(`SELECT ${FORM_COLUMNS} FROM forms WHERE slug = ?`, slug);
    if (!row || row.status === 'draft' || !row.current_version_id) return null;
    const version = await this.versionRow(row.current_version_id);
    if (!version) return null;
    const form = toForm(row);
    return {
      form: {
        id: form.id,
        slug: form.slug,
        program: form.program,
        kind: form.kind,
        title: form.title,
        description: form.description,
        confirmationMessage: form.confirmationMessage,
        status: form.status,
        retentionMonths: form.retentionMonths,
      },
      version: {
        id: version.id,
        version: Number(version.version),
        schema: parseFormSchema(JSON.parse(version.schema_json)),
      },
      accepting: form.status === 'published',
    };
  }

  // ---- submissions ---------------------------------------------------------------------------------

  /**
   * Validates `raw`/`uploads` against the PUBLISHED version and stores the submission. A repeat of the same
   * `idempotencyKey` returns the stored submission with `created: false`. Draft or unknown form: `NOT_FOUND`;
   * closed: `FORM_CLOSED`; invalid answers: `FormAnswersError`. Does not send email (see the file header).
   * Hooks run after the insert, uploads first; a throwing hook is reported in `hookFailures`, never thrown.
   */
  async submit(input: SubmitInput): Promise<SubmitResult> {
    const key = input.idempotencyKey;
    if (typeof key !== 'string' || key.length < 1 || key.length > 200) {
      throw new FormsError('INVALID_INPUT', 'The form could not be sent. Reload the page and try again.');
    }
    const now = this.clock(input.now);

    for (let attempt = 0; attempt < 3; attempt++) {
      const formRow = await this.one<FormRow>(`SELECT ${FORM_COLUMNS} FROM forms WHERE slug = ?`, input.slug);
      if (!formRow) throw new FormsError('NOT_FOUND', 'This form does not exist.');
      const form = toForm(formRow);

      const existing = await this.one<SubmissionRow>(
        `SELECT ${SUBMISSION_COLUMNS} FROM form_submissions WHERE idempotency_key = ?`,
        key,
      );
      if (existing) {
        if (existing.form_id !== form.id) {
          throw new FormsError(
            'IDEMPOTENCY_CONFLICT',
            'This form was already sent. Reload the page to start again.',
          );
        }
        return { submission: toSubmission(existing), created: false, form: formRef(form), hookFailures: [] };
      }

      if (form.status === 'closed') {
        throw new FormsError('FORM_CLOSED', 'This form is closed and is not accepting responses.');
      }
      if (form.status !== 'published' || !form.currentVersionId) {
        throw new FormsError('NOT_FOUND', 'This form does not exist.');
      }
      const versionRow = await this.versionRow(form.currentVersionId);
      if (!versionRow) throw new FormsError('NOT_FOUND', 'This form does not exist.');
      const schema = parseFormSchema(JSON.parse(versionRow.schema_json));

      const result = validateAnswers(schema, input.raw, input.uploads);
      if (!result.ok) throw new FormAnswersError(result.errors);

      const text = (value: unknown): string | null =>
        typeof value === 'string' && value !== '' ? value : null;
      const name = text(result.binds['contact.name']);
      const emailBind = text(result.binds['contact.email']);
      const email = emailBind === null ? null : normalizeEmail(emailBind);
      const phone = text(result.binds['contact.phone']);
      const deleteAfter = form.retentionMonths === null ? null : addMonthsUtc(now, form.retentionMonths);
      const id = newPrefixedId('fsub');
      const counterKey = referenceCounterKey(form.program, now);
      const guardSql = `EXISTS (SELECT 1 FROM forms WHERE id = ? AND status = 'published' AND current_version_id = ?)`;
      const guardParams: SqlParam[] = [form.id, form.currentVersionId];

      let rows: unknown[][];
      try {
        rows = await runBatch(this.db, [
          counterUpsertSpec(counterKey, { sql: guardSql, params: guardParams }),
          {
            sql: `INSERT INTO form_submissions (id, form_id, form_version_id, reference, status, submitter_name,
                    submitter_email_normalized, submitter_phone, answers_json, binds_json, idempotency_key, ip_hash,
                    submitted_at, delete_after)
                  SELECT ?, f.id, ?, ${REFERENCE_SQL}, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?
                  FROM forms f WHERE f.id = ? AND f.status = 'published' AND f.current_version_id = ?`,
            params: [
              id,
              form.currentVersionId,
              ...referenceParams(counterKey),
              name,
              email,
              phone,
              JSON.stringify(result.answers),
              JSON.stringify(result.binds),
              key,
              input.ipHash ?? null,
              now,
              deleteAfter,
              form.id,
              form.currentVersionId,
            ],
          },
          { sql: `SELECT ${SUBMISSION_COLUMNS} FROM form_submissions WHERE id = ?`, params: [id] },
        ]);
      } catch (error) {
        if (isUniqueViolation(error, 'idempotency_key')) continue; // a concurrent post of the same form won
        throw error;
      }
      const stored = rows[2]?.[0] as SubmissionRow | undefined;
      if (!stored) continue; // closed or republished between the read and the insert: re-evaluate

      const hookFailures: ('uploads' | 'request')[] = [];
      if (input.uploadsHook) {
        const accepted = this.acceptedUploads(schema, result.answers);
        if (Object.keys(accepted).length > 0) {
          try {
            await input.uploadsHook(accepted, id);
          } catch {
            console.warn('[forms] uploadsHook failed after submit');
            hookFailures.push('uploads');
          }
        }
      }
      if (input.onRequestKinds && REQUEST_KINDS.includes(form.kind)) {
        try {
          await input.onRequestKinds(id);
        } catch {
          console.warn('[forms] onRequestKinds failed after submit');
          hookFailures.push('request');
        }
      }
      return { submission: toSubmission(stored), created: true, form: formRef(form), hookFailures };
    }
    throw new FormsError('CONFLICT', 'The form changed while it was being sent. Please try again.');
  }

  private acceptedUploads(schema: FormSchema, answers: Answers): Record<string, UploadRef[]> {
    const out: Record<string, UploadRef[]> = {};
    for (const q of questionsOf(schema)) {
      if (q.type !== 'file_upload') continue;
      const value = answers[q.id];
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        out[q.id] = value as UploadRef[];
      }
    }
    return out;
  }

  private filterSql(filter: SubmissionFilter): { where: string[]; params: SqlParam[] } {
    const where: string[] = [];
    const params: SqlParam[] = [];
    if (filter.formId) {
      where.push('s.form_id = ?');
      params.push(filter.formId);
    }
    if (filter.version !== undefined) {
      where.push('v.version = ?');
      params.push(filter.version);
    }
    if (filter.status !== undefined) {
      const list = Array.isArray(filter.status) ? filter.status : [filter.status];
      for (const s of list) {
        if (!(SUBMISSION_STATUSES as readonly string[]).includes(s)) {
          throw new FormsError('INVALID_INPUT', 'Unknown status filter.');
        }
      }
      if (list.length > 0) {
        where.push(`s.status IN (${list.map(() => '?').join(', ')})`);
        params.push(...list);
      }
    }
    if (filter.from !== undefined) {
      where.push('s.submitted_at >= ?');
      params.push(filter.from);
    }
    if (filter.to !== undefined) {
      where.push('s.submitted_at < ?');
      params.push(filter.to);
    }
    if (filter.hasAttachments !== undefined) {
      where.push(
        `${filter.hasAttachments ? '' : 'NOT '}EXISTS (SELECT 1 FROM form_uploads u WHERE u.submission_id = s.id AND u.status NOT IN ('rejected', 'deleted'))`,
      );
    }
    const q = filter.q?.trim().toLowerCase();
    if (q) {
      if (q.length > 100) throw new FormsError('INVALID_INPUT', 'The search text is too long.');
      const like = `%${escapeLike(q)}%`;
      where.push(
        `(lower(coalesce(s.submitter_name, '')) LIKE ? ESCAPE '\\' OR coalesce(s.submitter_email_normalized, '') LIKE ? ESCAPE '\\' OR lower(s.reference) LIKE ? ESCAPE '\\')`,
      );
      params.push(like, like, like);
    }
    return { where, params };
  }

  /** Inbox page, newest first, keyset-paginated by (submitted_at desc, id desc). */
  async listSubmissions(input: ListSubmissionsInput = {}): Promise<{
    items: SubmissionSummary[];
    nextCursor: string | null;
  }> {
    const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 25)));
    const { where, params } = this.filterSql(input);
    if (input.cursor !== undefined) {
      const m = /^(\d{1,12}):([A-Za-z0-9_-]{1,80})$/.exec(input.cursor);
      if (!m) throw new FormsError('INVALID_INPUT', 'The page link is not valid.');
      where.push('(s.submitted_at < ? OR (s.submitted_at = ? AND s.id < ?))');
      params.push(Number(m[1]), Number(m[1]), m[2]!);
    }
    const rows = await allRows<{
      id: string;
      form_id: string;
      slug: string;
      title: string;
      version: number;
      reference: string;
      status: SubmissionStatus;
      submitter_name: string | null;
      submitter_email_normalized: string | null;
      submitted_at: number;
      delete_after: number | null;
      attachment_count: number;
    }>(this.db, {
      sql: `SELECT s.id, s.form_id, f.slug, f.title, v.version, s.reference, s.status, s.submitter_name,
              s.submitter_email_normalized, s.submitted_at, s.delete_after,
              (SELECT count(*) FROM form_uploads u WHERE u.submission_id = s.id AND u.status NOT IN ('rejected', 'deleted')) AS attachment_count
            FROM form_submissions s
            JOIN forms f ON f.id = s.form_id
            JOIN form_versions v ON v.id = s.form_version_id
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY s.submitted_at DESC, s.id DESC
            LIMIT ?`,
      params: [...params, limit + 1],
    });
    const page = rows.slice(0, limit);
    const items = page.map((r): SubmissionSummary => ({
      id: r.id,
      formId: r.form_id,
      formSlug: r.slug,
      formTitle: r.title,
      version: Number(r.version),
      reference: r.reference,
      status: r.status,
      submitterName: r.submitter_name,
      submitterEmail: r.submitter_email_normalized,
      submittedAt: Number(r.submitted_at),
      deleteAfter: r.delete_after === null ? null : Number(r.delete_after),
      attachmentCount: Number(r.attachment_count),
    }));
    const last = page[page.length - 1];
    return {
      items,
      nextCursor: rows.length > limit && last ? `${Number(last.submitted_at)}:${last.id}` : null,
    };
  }

  /** One submission with the schema of the version it answered, its history and attachments. */
  async getSubmission(id: string): Promise<SubmissionDetail | null> {
    const row = await this.one<SubmissionRow>(
      `SELECT ${SUBMISSION_COLUMNS} FROM form_submissions WHERE id = ?`,
      id,
    );
    if (!row) return null;
    const [formRow, versionRow, events, uploads] = await Promise.all([
      this.requireFormRow(row.form_id),
      this.versionRow(row.form_version_id),
      allRows<{
        id: string;
        kind: SubmissionEvent['kind'];
        actor_user_id: string | null;
        body: string | null;
        created_at: number;
      }>(this.db, {
        sql: `SELECT id, kind, actor_user_id, body, created_at FROM form_submission_events
              WHERE submission_id = ? ORDER BY created_at, rowid`,
        params: [id],
      }),
      allRows<{
        id: string;
        question_id: string;
        kind: string;
        content_type: string;
        original_name: string | null;
        bytes: number;
        status: string;
      }>(this.db, {
        sql: `SELECT id, question_id, kind, content_type, original_name, bytes, status FROM form_uploads
              WHERE submission_id = ? AND status NOT IN ('rejected', 'deleted') ORDER BY created_at, rowid`,
        params: [id],
      }),
    ]);
    if (!versionRow) throw new FormsError('VERSION_NOT_FOUND', 'The version of this submission is missing.');
    const submission = toSubmission(row);
    return {
      submission,
      form: formRef(toForm(formRow)),
      version: this.toVersion(versionRow),
      answers: submission.answers,
      events: events.map((e): SubmissionEvent => {
        const change =
          e.kind === 'status'
            ? parseJson<{ from?: string; to?: string; note?: string | null } | null>(e.body, null)
            : null;
        return {
          id: e.id,
          kind: e.kind,
          actorUserId: e.actor_user_id,
          body: e.body,
          change:
            change && typeof change.from === 'string' && typeof change.to === 'string'
              ? { from: change.from, to: change.to, note: change.note ?? null }
              : null,
          createdAt: Number(e.created_at),
        };
      }),
      uploads: uploads.map((u) => ({
        id: u.id,
        questionId: u.question_id,
        kind: u.kind,
        contentType: u.content_type,
        originalName: u.original_name,
        bytes: Number(u.bytes),
        status: u.status,
      })),
    };
  }

  /**
   * Changes a submission's status and appends a `status` event (from, to, note). Any change is allowed except
   * `approved`/`declined` on a form that is not an application (`INVALID_TRANSITION`). Setting the current
   * status is a no-op (`changed: false`, no event).
   */
  async setStatus(input: {
    submissionId: string;
    status: SubmissionStatus;
    note?: string | null;
    staffId: string;
    now?: number;
  }): Promise<{ changed: boolean; status: SubmissionStatus; previous: SubmissionStatus }> {
    if (!(SUBMISSION_STATUSES as readonly string[]).includes(input.status)) {
      throw new FormsError('INVALID_INPUT', 'Unknown status.');
    }
    const note = input.note?.trim() || null;
    if (note !== null && note.length > NOTE_MAX) {
      throw new FormsError('INVALID_INPUT', `A note can have at most ${NOTE_MAX} characters.`);
    }
    const row = await this.one<{ status: SubmissionStatus; kind: FormKind }>(
      `SELECT s.status, f.kind FROM form_submissions s JOIN forms f ON f.id = s.form_id WHERE s.id = ?`,
      input.submissionId,
    );
    if (!row) throw new FormsError('NOT_FOUND', 'This submission does not exist.');
    if (
      (input.status === 'approved' || input.status === 'declined') &&
      !APPLICATION_KINDS.includes(row.kind)
    ) {
      throw new FormsError('INVALID_TRANSITION', 'Only applications can be approved or declined.');
    }
    if (row.status === input.status) return { changed: false, status: row.status, previous: row.status };
    const now = this.clock(input.now);
    await runBatch(this.db, [
      {
        sql: `INSERT INTO form_submission_events (id, submission_id, kind, actor_user_id, body, created_at)
              SELECT ?, id, 'status', ?, json_object('from', status, 'to', ?, 'note', ?), ?
              FROM form_submissions WHERE id = ? AND status <> ?`,
        params: [
          newPrefixedId('fse'),
          input.staffId,
          input.status,
          note,
          now,
          input.submissionId,
          input.status,
        ],
      },
      {
        sql: `UPDATE form_submissions SET status = ?, reviewed_by_user_id = ?, reviewed_at = ?
              WHERE id = ? AND status <> ?`,
        params: [input.status, input.staffId, now, input.submissionId, input.status],
      },
    ]);
    return { changed: true, status: input.status, previous: row.status };
  }

  /** Appends an internal note (append-only; never shown to the submitter). */
  async addNote(input: {
    submissionId: string;
    note: string;
    staffId: string;
    now?: number;
  }): Promise<SubmissionEvent> {
    const note = String(input.note ?? '').trim();
    if (note.length < 1 || note.length > NOTE_MAX) {
      throw new FormsError('INVALID_INPUT', `A note needs 1 to ${NOTE_MAX} characters.`);
    }
    const exists = await this.one('SELECT 1 AS x FROM form_submissions WHERE id = ?', input.submissionId);
    if (!exists) throw new FormsError('NOT_FOUND', 'This submission does not exist.');
    const id = newPrefixedId('fse');
    const now = this.clock(input.now);
    await prepareSpec(this.db, {
      sql: `INSERT INTO form_submission_events (id, submission_id, kind, actor_user_id, body, created_at)
            VALUES (?, ?, 'note', ?, ?, ?)`,
      params: [id, input.submissionId, input.staffId, note, now],
    }).run();
    return { id, kind: 'note', actorUserId: input.staffId, body: note, change: null, createdAt: now };
  }

  // ---- retention -----------------------------------------------------------------------------------

  /**
   * Deletes submissions whose `delete_after` has passed and whose status is declined, spam, archived or
   * handled (never new, in review or approved), up to `limit` per call (default 500, oldest first).
   * `beforeDelete(ids)` runs first so the caller can delete the stored files; if it throws nothing is deleted.
   * Submissions that a roster member or service request still points at are kept (those rows reference
   * them, so deleting would fail the whole batch). Their `form_uploads` rows and events go with the rest. Returns the ids actually deleted.
   */
  async purgeExpiredSubmissions(
    now: number,
    options: { beforeDelete?: (ids: string[]) => Promise<void>; limit?: number } = {},
  ): Promise<{ deleted: number; ids: string[] }> {
    const limit = Math.min(1000, Math.max(1, Math.floor(options.limit ?? 500)));
    const statuses = [...PURGEABLE_STATUSES];
    const marks = statuses.map(() => '?').join(', ');
    const due = await allRows<{ id: string }>(this.db, {
      sql: `SELECT id FROM form_submissions
            WHERE delete_after IS NOT NULL AND delete_after < ? AND status IN (${marks})
              AND ${NOT_REFERENCED}
            ORDER BY delete_after, id LIMIT ?`,
      params: [now, ...statuses, limit],
    });
    const ids = due.map((r) => r.id);
    if (ids.length === 0) return { deleted: 0, ids: [] };
    if (options.beforeDelete) await options.beforeDelete(ids);

    const specs: SqlStatementSpec[] = [];
    for (let i = 0; i < ids.length; i += 40) {
      const chunk = ids.slice(i, i + 40);
      const inList = chunk.map(() => '?').join(', ');
      // The status and date are re-checked: a submission reopened since the read is not deleted.
      const guard = `id IN (${inList}) AND delete_after IS NOT NULL AND delete_after < ? AND status IN (${marks}) AND ${NOT_REFERENCED}`;
      specs.push(
        {
          sql: `DELETE FROM form_uploads WHERE submission_id IN (SELECT id FROM form_submissions WHERE ${guard})`,
          params: [...chunk, now, ...statuses],
        },
        {
          sql: `DELETE FROM form_submission_events WHERE submission_id IN (SELECT id FROM form_submissions WHERE ${guard})`,
          params: [...chunk, now, ...statuses],
        },
        { sql: `DELETE FROM form_submissions WHERE ${guard}`, params: [...chunk, now, ...statuses] },
      );
    }
    await runBatch(this.db, specs);

    const gone: string[] = [];
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const left = await allRows<{ id: string }>(this.db, {
        sql: `SELECT id FROM form_submissions WHERE id IN (${chunk.map(() => '?').join(', ')})`,
        params: chunk,
      });
      const kept = new Set(left.map((r) => r.id));
      gone.push(...chunk.filter((id) => !kept.has(id)));
    }
    return { deleted: gone.length, ids: gone };
  }

  // ---- export --------------------------------------------------------------------------------------

  /**
   * Safe CSV of a form's submissions (oldest first, at most `EXPORT_ROW_CAP`; `truncated` says more exist).
   * Every field is quoted, quotes doubled, formula starters prefixed (see `csvCell`). Header: fixed columns,
   * then the question labels of the latest version (questions only present in older versions follow, with their
   * last label). Writes an `export` event on every exported submission. Rows are CRLF-separated.
   */
  async exportCsv(
    input: { formId: string; staffId: string; now?: number } & Omit<SubmissionFilter, 'formId'>,
  ): Promise<{ csv: string; filename: string; rows: number; truncated: boolean }> {
    if (!input.staffId) throw new FormsError('INVALID_INPUT', 'A staff id is required.');
    const form = await this.requireFormRow(input.formId);
    const now = this.clock(input.now);

    const versions = (
      await allRows<VersionRow>(this.db, {
        sql: `SELECT id, form_id, version, schema_json, published_by_user_id, published_at, change_note, content_hash
              FROM form_versions WHERE form_id = ? ORDER BY version DESC`,
        params: [input.formId],
      })
    ).map((row) => this.toVersion(row));
    const schemaById = new Map(versions.map((v) => [v.id, v.schema]));

    const columns: { id: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const v of versions) {
      for (const q of questionsOf(v.schema)) {
        if (q.type === 'statement' || seen.has(q.id)) continue;
        seen.add(q.id);
        columns.push({ id: q.id, label: q.label });
      }
    }

    const { where, params } = this.filterSql({ ...input, formId: input.formId });
    const rows = await allRows<SubmissionRow & { version: number }>(this.db, {
      sql: `SELECT s.id, s.form_id, s.form_version_id, s.reference, s.status, s.submitter_name,
              s.submitter_email_normalized, s.submitter_phone, s.answers_json, s.binds_json, s.submitted_at,
              s.reviewed_by_user_id, s.reviewed_at, s.staff_notes, s.delete_after, v.version
            FROM form_submissions s JOIN form_versions v ON v.id = s.form_version_id
            WHERE ${where.join(' AND ')}
            ORDER BY s.submitted_at, s.id LIMIT ?`,
      params: [...params, EXPORT_ROW_CAP + 1],
    });
    const truncated = rows.length > EXPORT_ROW_CAP;
    const exported = rows.slice(0, EXPORT_ROW_CAP);

    const lines: string[] = [];
    lines.push(
      [
        'Reference',
        'Submitted (UTC)',
        'Status',
        'Form version',
        'Name',
        'Email',
        'Phone',
        ...columns.map((c) => c.label),
      ]
        .map((h) => csvCell(h))
        .join(','),
    );
    for (const r of exported) {
      const answers = parseJson<Record<string, unknown>>(r.answers_json, {});
      const questions = new Map(
        questionsOf(schemaById.get(r.form_version_id) ?? { sections: [] }).map((q) => [q.id, q] as const),
      );
      const cells = [
        csvCell(r.reference),
        csvCell(new Date(Number(r.submitted_at) * 1000).toISOString()),
        csvCell(r.status),
        csvCell(String(r.version), { numeric: true }),
        csvCell(r.submitter_name ?? ''),
        csvCell(r.submitter_email_normalized ?? ''),
        csvCell(r.submitter_phone ?? ''),
      ];
      for (const c of columns) {
        const cell = answerToCell(questions.get(c.id), answers[c.id]);
        cells.push(csvCell(cell.text, { numeric: cell.numeric }));
      }
      lines.push(cells.join(','));
    }

    // Audit before handing the file out: one export event per exported submission.
    const body = JSON.stringify({ formId: input.formId, rows: exported.length });
    for (let i = 0; i < exported.length; i += 90 * 10) {
      const specs: SqlStatementSpec[] = [];
      for (let j = i; j < Math.min(exported.length, i + 90 * 10); j += 90) {
        const chunk = exported.slice(j, j + 90);
        specs.push({
          sql: `INSERT INTO form_submission_events (id, submission_id, kind, actor_user_id, body, created_at)
                SELECT 'fse_' || lower(hex(randomblob(13))), id, 'export', ?, ?, ?
                FROM form_submissions WHERE id IN (${chunk.map(() => '?').join(', ')})`,
          params: [input.staffId, body, now, ...chunk.map((r) => r.id)],
        });
      }
      await runBatch(this.db, specs);
    }

    const day = new Date(now * 1000).toISOString().slice(0, 10);
    return {
      csv: `${lines.join('\r\n')}\r\n`,
      filename: `${form.slug}-submissions-${day}.csv`,
      rows: exported.length,
      truncated,
    };
  }
}
