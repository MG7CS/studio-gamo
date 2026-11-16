/**
 * Drizzle model of migration 0020 (forms engine and chunked uploads). Like schema.ts it models tables,
 * columns, defaults, foreign keys and indexes; CHECK constraints and the `form_versions_immutable` and `form_submission_events_immutable` triggers
 * live only in the SQL. Times are epoch seconds (`mode: 'timestamp'`). Not re-exported from index.ts here.
 */
import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, foreignKey, unique } from 'drizzle-orm/sqlite-core';

/** Programs a form (or roster/request) can belong to. */
export type FormProgram = 'web' | 'worship' | 'academy' | 'production';
export type FormStatus = 'draft' | 'published' | 'closed';
/** approved/declined are for applications; handled/spam/archived for everything else. */
export type FormSubmissionStatus =
  'new' | 'in_review' | 'handled' | 'spam' | 'archived' | 'approved' | 'declined';
export type FormSubmissionEventKind = 'status' | 'note' | 'export';
export type FormUploadKind = 'image' | 'video' | 'pdf' | 'other';
export type FormUploadStatus = 'started' | 'uploaded' | 'verified' | 'rejected' | 'deleted';

export const forms = sqliteTable(
  'forms',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    program: text('program').$type<FormProgram>().notNull(),
    kind: text('kind').notNull(), // 'musician_application' | 'church_request' | 'contact' | … (service-validated)
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').$type<FormStatus>().notNull().default('draft'),
    draftSchemaJson: text('draft_schema_json').notNull().default('{}'),
    /** No foreign key (forms <-> form_versions would be a cycle); the publish batch sets it. */
    currentVersionId: text('current_version_id'),
    confirmationMessage: text('confirmation_message'),
    /** Optimistic concurrency: bumped on every draft save; starts at 1. */
    revision: integer('revision').notNull().default(1),
    /** Per-form retention in months; null means the program default. */
    retentionMonths: integer('retention_months'),
    updatedByUserId: text('updated_by_user_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('forms_program_status_idx').on(t.program, t.status)],
);

/** Immutable snapshot taken by Publish (a trigger refuses rewriting schema, hash, number, form or time; the note may be corrected). */
export const formVersions = sqliteTable(
  'form_versions',
  {
    id: text('id').primaryKey(),
    formId: text('form_id')
      .notNull()
      .references(() => forms.id),
    version: integer('version').notNull(),
    schemaJson: text('schema_json').notNull(),
    publishedByUserId: text('published_by_user_id'),
    publishedAt: integer('published_at', { mode: 'timestamp' }).notNull(),
    changeNote: text('change_note'),
    contentHash: text('content_hash'),
  },
  (t) => [
    unique('form_versions_form_version_unique').on(t.formId, t.version),
    unique('form_versions_id_form_unique').on(t.id, t.formId),
  ],
);

export const formSubmissions = sqliteTable(
  'form_submissions',
  {
    id: text('id').primaryKey(),
    formId: text('form_id')
      .notNull()
      .references(() => forms.id),
    formVersionId: text('form_version_id').notNull(),
    reference: text('reference').notNull().unique(), // GW-2026-0001
    status: text('status').$type<FormSubmissionStatus>().notNull().default('new'),
    submitterName: text('submitter_name'),
    submitterEmailNormalized: text('submitter_email_normalized'),
    submitterPhone: text('submitter_phone'),
    answersJson: text('answers_json').notNull(),
    bindsJson: text('binds_json').notNull().default('{}'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    ipHash: text('ip_hash'),
    submittedAt: integer('submitted_at', { mode: 'timestamp' }).notNull(),
    reviewedByUserId: text('reviewed_by_user_id'),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    staffNotes: text('staff_notes'),
    deleteAfter: integer('delete_after', { mode: 'timestamp' }),
  },
  (t) => [
    // The version must be one of this form's versions.
    foreignKey({
      columns: [t.formVersionId, t.formId],
      foreignColumns: [formVersions.id, formVersions.formId],
    }),
    index('form_submissions_form_status_idx').on(t.formId, t.status, t.submittedAt),
    index('form_submissions_status_idx').on(t.status, t.submittedAt),
    index('form_submissions_email_idx').on(t.submitterEmailNormalized),
    index('form_submissions_delete_after_idx')
      .on(t.deleteAfter)
      .where(sql`delete_after IS NOT NULL`),
  ],
);

/** Append-only history and internal notes; removed only with their submission (cascade). */
export const formSubmissionEvents = sqliteTable(
  'form_submission_events',
  {
    id: text('id').primaryKey(),
    submissionId: text('submission_id')
      .notNull()
      .references(() => formSubmissions.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<FormSubmissionEventKind>().notNull(),
    actorUserId: text('actor_user_id'),
    body: text('body'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('form_submission_events_submission_idx').on(t.submissionId, t.createdAt)],
);

/** Idempotent builder actions keyed by the client's `op_id`. */
export const formOperations = sqliteTable(
  'form_operations',
  {
    opId: text('op_id').primaryKey(),
    formId: text('form_id')
      .notNull()
      .references(() => forms.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('form_operations_form_idx').on(t.formId, t.createdAt)],
);

/** One counter per `prefix_year` (for example `GW-2026`); `nextValue` is the next number to hand out. */
export const formReferenceCounters = sqliteTable('form_reference_counters', {
  prefixYear: text('prefix_year').primaryKey(),
  nextValue: integer('next_value').notNull().default(1),
});

export const uploadSessions = sqliteTable(
  'upload_sessions',
  {
    id: text('id').primaryKey(),
    formSlug: text('form_slug').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    ipHash: text('ip_hash'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    fileCount: integer('file_count').notNull().default(0),
  },
  (t) => [
    index('upload_sessions_expires_idx').on(t.expiresAt),
    index('upload_sessions_ip_idx').on(t.ipHash, t.createdAt),
  ],
);

export const formUploads = sqliteTable(
  'form_uploads',
  {
    id: text('id').primaryKey(),
    /** Set null when the 48 h session is purged: files attached to a submission must survive. */
    sessionId: text('session_id').references(() => uploadSessions.id, { onDelete: 'set null' }),
    /** No foreign key: a file uploads before its submission exists; `attach()` sets this. */
    submissionId: text('submission_id'),
    questionId: text('question_id').notNull(),
    kind: text('kind').$type<FormUploadKind>().notNull(),
    contentType: text('content_type').notNull(),
    originalName: text('original_name'), // sanitised
    bytes: integer('bytes').notNull(),
    r2Key: text('r2_key').notNull().unique(),
    multipartUploadId: text('multipart_upload_id'),
    partsJson: text('parts_json').notNull().default('[]'),
    status: text('status').$type<FormUploadStatus>().notNull().default('started'),
    rejectReason: text('reject_reason'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('form_uploads_session_idx').on(t.sessionId),
    index('form_uploads_submission_idx')
      .on(t.submissionId)
      .where(sql`submission_id IS NOT NULL`),
    index('form_uploads_status_idx').on(t.status, t.createdAt),
  ],
);

export type Form = typeof forms.$inferSelect;
export type NewForm = typeof forms.$inferInsert;
export type FormVersion = typeof formVersions.$inferSelect;
export type NewFormVersion = typeof formVersions.$inferInsert;
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type NewFormSubmission = typeof formSubmissions.$inferInsert;
export type FormSubmissionEvent = typeof formSubmissionEvents.$inferSelect;
export type NewFormSubmissionEvent = typeof formSubmissionEvents.$inferInsert;
export type FormOperation = typeof formOperations.$inferSelect;
export type NewFormOperation = typeof formOperations.$inferInsert;
export type FormReferenceCounter = typeof formReferenceCounters.$inferSelect;
export type UploadSession = typeof uploadSessions.$inferSelect;
export type NewUploadSession = typeof uploadSessions.$inferInsert;
export type FormUpload = typeof formUploads.$inferSelect;
export type NewFormUpload = typeof formUploads.$inferInsert;
