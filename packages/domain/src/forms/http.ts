/**
 * What a public form page does with a posted form (Task 2.3), without any web framework in it:
 *
 *   const outcome = await submitFormPage({ slug, env, db, request, locals, uploads, adminUrlFor });
 *   if (outcome.kind === 'sent') redirect(`/worship/apply?sent=${outcome.signedReference}`, 303);
 *   // 'redisplay' => render the form again with outcome.values / errors / uploads and the status and headers
 *
 * Order: published form (404 / closed) -> public form guard (body bounded and read once, per-IP limit, Turnstile,
 * per-email limit) -> raw answers and the finished uploads the visitor lists -> `FormsService.submit`
 * (validates against the PUBLISHED version, stores, attaches files, creates the service request for request
 * forms) -> receipt and staff emails. The caller runs `requireSameOrigin` first.
 *
 * Uploads: the browser sends the ids of finished uploads (`{questionId}.upload`) and the session token(s) they
 * were uploaded under (`upload_session_token`). Only ids that the token's session owns for this form and
 * question count; anything else is dropped, so a required file question then reports an error and the
 * visitor adds the file again. Nothing about other visitors' uploads is revealed.
 *
 * The confirmation is a signed, short-lived reference (`?sent=`), so the page can show the reference after the
 * redirect without trusting the query string. Logs carry error names only, never answers, tokens or addresses.
 */
import type { GamoEnv } from '@gamo/config/env';
import { guardPublicFormForPage, TURNSTILE_RESPONSE_FIELD } from '../api/public-form-guard.ts';
import { signValue, verifySignedValue } from '../security/signed-value.ts';
import { resolveEnvSecret } from '../security/env-secret.ts';
import type { SqlDatabase } from '../security/sql-database.ts';
import { sendSubmissionEmails } from './emails.ts';
import type { OutboxOptions } from '../services/email-outbox.ts';
import { createRequestFromSubmission } from '../worship/requests.ts';
import { FormAnswersError, FormsError, FormsService } from './service.ts';
import type { AttachedUpload, UploadService } from './uploads.ts';
import type { AnswerError } from './validate.ts';
import type { FormSchema } from './schema.ts';

export const FORM_SENT_PURPOSE = 'form-sent';
export const FORM_SENT_TTL_SECONDS = 60 * 60;
/** The single Turnstile action every dynamic form uses; the page passes it to the widget. */
export const FORM_TURNSTILE_ACTION = 'form_submit';
export const UPLOAD_TOKEN_FIELD = 'upload_session_token';

/** Hidden or protocol fields that are never answers. */
const RESERVED_FIELDS = new Set(['idempotency_key', UPLOAD_TOKEN_FIELD, TURNSTILE_RESPONSE_FIELD]);
const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{16,64}$/;
/** A no-JavaScript post may carry an empty file part; real files go through the chunked uploader. */
const MAX_FORM_BYTES = 128 * 1024;
const MAX_TOKENS = 3;
const MAX_UPLOADS_PER_QUESTION = 20;

export interface FormPageUpload {
  uploadId: string;
  filename?: string;
}

export interface FormSubmitInput {
  slug: string;
  env: GamoEnv;
  db: SqlDatabase;
  request: Request;
  locals: unknown;
  /** Null when uploads are not configured (no bucket or secret): file questions then see no files. */
  uploads: UploadService | null;
  /** Absolute admin URL of a stored submission, for the staff notice (`siteUrl('admin', ...)`). */
  adminUrlFor: (submissionId: string) => string;
  /** Epoch seconds (tests). */
  now?: number;
  /** Outbox options (tests inject the provider fetch). */
  email?: OutboxOptions;
  /** Injected Turnstile siteverify fetch (tests). */
  turnstileFetch?: typeof fetch;
}

export type FormSubmitOutcome =
  | {
      kind: 'sent';
      signedReference: string;
      reference: string;
      /** Files or the service request could not be saved after the answers were; staff must follow up. */
      hookFailures: ('uploads' | 'request')[];
    }
  | { kind: 'not_found' }
  | { kind: 'closed' }
  | {
      kind: 'redisplay';
      status: number;
      headers: Record<string, string>;
      values: Record<string, string | string[]>;
      errors: AnswerError[];
      summaryExtra: { message: string; fieldId?: string }[];
      uploads: Record<string, FormPageUpload[]>;
      uploadTokens: string[];
      idempotencyKey: string;
      turnstileError?: string;
    };

export const formSentSecret = (env: GamoEnv): string =>
  resolveEnvSecret(env as unknown as Record<string, unknown>, 'FORM_UPLOAD_SECRET');

/** The reference carried by a `?sent=` value, or null when it is forged, expired or malformed. */
export async function readSentReference(
  env: GamoEnv,
  signed: string | null | undefined,
  now = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  let secret: string;
  try {
    secret = formSentSecret(env);
  } catch {
    return null;
  }
  const verified = await verifySignedValue({ signed, now, secret, purpose: FORM_SENT_PURPOSE });
  return verified?.value ?? null;
}

function questionsOf(schema: FormSchema) {
  return schema.sections.flatMap((s) => s.questions);
}

function rawAnswers(form: FormData): Record<string, string | string[]> {
  const raw: Record<string, string | string[]> = {};
  for (const name of new Set(form.keys())) {
    if (RESERVED_FIELDS.has(name) || name.endsWith('.upload')) continue;
    const values = form.getAll(name).filter((v): v is string => typeof v === 'string');
    if (values.length === 0) continue;
    raw[name] = values.length === 1 ? values[0]! : values;
  }
  return raw;
}

export async function submitFormPage(input: FormSubmitInput): Promise<FormSubmitOutcome> {
  const { slug, env, db, request, uploads: uploadService } = input;
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const forms = new FormsService(db, { now });

  const published = await forms.getPublished(slug);
  if (!published) return { kind: 'not_found' };
  if (!published.accepting) return { kind: 'closed' };
  const schema = published.version.schema;
  const emailQuestion = questionsOf(schema).find((q) => q.bind === 'contact.email');

  const redisplay = (
    over: Partial<Extract<FormSubmitOutcome, { kind: 'redisplay' }>>,
  ): Extract<FormSubmitOutcome, { kind: 'redisplay' }> => ({
    kind: 'redisplay',
    status: 400,
    headers: {},
    values: {},
    errors: [],
    summaryExtra: [],
    uploads: {},
    uploadTokens: [],
    idempotencyKey: crypto.randomUUID(),
    ...over,
  });

  const guard = await guardPublicFormForPage(
    { request, env, locals: input.locals as never },
    {
      route: `forms.${slug}`,
      turnstileAction: FORM_TURNSTILE_ACTION,
      limits: {
        perIp: { limit: 20, windowSeconds: 15 * 60 },
        ...(emailQuestion ? { perEmail: { limit: 5, windowSeconds: 60 * 60, field: emailQuestion.id } } : {}),
      },
      allowMultipart: { maxBytes: MAX_FORM_BYTES },
      now,
      ...(input.turnstileFetch ? { fetchImpl: input.turnstileFetch } : {}),
    },
  );
  if (!guard.ok) {
    return redisplay({
      status: guard.error.status,
      headers: guard.error.headers,
      summaryExtra: [{ message: guard.error.message, fieldId: guard.error.fieldId }],
      ...(guard.error.field === TURNSTILE_RESPONSE_FIELD ? { turnstileError: guard.error.message } : {}),
    });
  }

  const body = guard.body;
  const form = body.form ?? new FormData();
  const raw = rawAnswers(form);
  const key = body.get('idempotency_key') ?? '';
  const idempotencyKey = IDEMPOTENCY_KEY.test(key) ? key : crypto.randomUUID();
  const tokens = body.getAll(UPLOAD_TOKEN_FIELD).slice(0, MAX_TOKENS);

  // Finished uploads this visitor owns for this form and question, and the token that proves it.
  const refs: Record<string, AttachedUpload[]> = {};
  const tokenOf = new Map<string, string>();
  if (uploadService) {
    for (const q of questionsOf(schema)) {
      if (q.type !== 'file_upload') continue;
      for (const id of body.getAll(`${q.id}.upload`).slice(0, MAX_UPLOADS_PER_QUESTION)) {
        for (const token of tokens) {
          try {
            const [found] = await uploadService.describeForSubmit([id], token, slug, now);
            if (found && found.questionId === q.id) {
              (refs[q.id] ??= []).push(found);
              tokenOf.set(found.uploadId, token);
              break;
            }
          } catch {
            // Not this token's upload (or not a usable one): try the next token, else drop it.
          }
        }
      }
    }
  }
  const keptUploads = (): Record<string, FormPageUpload[]> =>
    Object.fromEntries(
      Object.entries(refs).map(([qid, list]) => [
        qid,
        list.map((u) => ({ uploadId: u.uploadId, ...(u.originalName ? { filename: u.originalName } : {}) })),
      ]),
    );
  const keptTokens = [...new Set(tokenOf.values())];

  try {
    const result = await forms.submit({
      slug,
      raw,
      uploads: refs,
      idempotencyKey,
      ipHash: guard.ipHash,
      now,
      uploadsHook: async (accepted, submissionId) => {
        if (!uploadService) return;
        const byToken = new Map<string, string[]>();
        for (const list of Object.values(accepted))
          for (const ref of list) {
            const token = tokenOf.get(ref.uploadId);
            if (token) byToken.set(token, [...(byToken.get(token) ?? []), ref.uploadId]);
          }
        for (const [token, ids] of byToken) await uploadService.attach(ids, submissionId, now, { token });
      },
      onRequestKinds: async (submissionId) => {
        await createRequestFromSubmission(db, { submissionId, now });
      },
    });

    if (result.created && result.submission.submitterEmail) {
      try {
        await sendSubmissionEmails(
          db,
          env,
          {
            submission: {
              id: result.submission.id,
              reference: result.submission.reference,
              submitterEmail: result.submission.submitterEmail,
              ...(result.submission.submitterName ? { submitterName: result.submission.submitterName } : {}),
            },
            form: { title: result.form.title, program: result.form.program },
            adminUrl: input.adminUrlFor(result.submission.id),
            now,
          },
          input.email,
        );
      } catch (error) {
        // The submission is saved; the emails are retried by the daily job where they were queued.
        console.error(`[forms.${slug}] submission emails failed: ${(error as Error)?.name ?? 'Error'}`);
      }
    }
    const signedReference = await signValue({
      value: result.submission.reference,
      expiresAt: now + FORM_SENT_TTL_SECONDS,
      secret: formSentSecret(env),
      purpose: FORM_SENT_PURPOSE,
      secretName: 'FORM_UPLOAD_SECRET',
    });
    return {
      kind: 'sent',
      signedReference,
      reference: result.submission.reference,
      hookFailures: result.hookFailures,
    };
  } catch (error) {
    if (error instanceof FormAnswersError) {
      return redisplay({
        status: 422,
        values: raw,
        errors: error.errors,
        uploads: keptUploads(),
        uploadTokens: keptTokens,
        idempotencyKey,
      });
    }
    if (error instanceof FormsError) {
      if (error.code === 'FORM_CLOSED') return { kind: 'closed' };
      if (error.code === 'NOT_FOUND') return { kind: 'not_found' };
      return redisplay({
        status: error.code === 'CONFLICT' || error.code === 'IDEMPOTENCY_CONFLICT' ? 409 : 400,
        values: raw,
        summaryExtra: [{ message: error.message }],
        uploads: keptUploads(),
        uploadTokens: keptTokens,
        // A conflicting key must not be reused for the next try.
        idempotencyKey: error.code === 'IDEMPOTENCY_CONFLICT' ? crypto.randomUUID() : idempotencyKey,
      });
    }
    throw error;
  }
}
