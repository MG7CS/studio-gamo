/** Service construction and the question check for the public upload routes. */
import type { GamoEnv } from '@gamo/config/env';
import {
  FILE_GROUP_KINDS,
  UploadError,
  uploadKindFor,
  uploadServiceFromEnv,
  type FormSchema,
  type UploadService,
} from '@gamo/domain/forms';
import { resolveEnvSecret, type SqlDatabase } from '@gamo/domain/security';

/**
 * The UploadService for this request. Throws UploadError UPLOAD_UNAVAILABLE (503) without MEDIA_BUCKET and
 * SecretNotConfiguredError (503) outside local without FORM_UPLOAD_SECRET (local uses the fixed dev key).
 */
export function uploadServiceFor(db: SqlDatabase, env: GamoEnv): UploadService {
  if (!env.MEDIA_BUCKET) throw new UploadError('UPLOAD_UNAVAILABLE');
  const secret = resolveEnvSecret(env as Record<string, unknown>, 'FORM_UPLOAD_SECRET');
  return uploadServiceFromEnv(db, {
    FORM_UPLOAD_SECRET: secret,
    MEDIA_BUCKET: env.MEDIA_BUCKET as never,
    IMAGES: env.IMAGES as never,
  });
}

type Question = FormSchema['sections'][number]['questions'][number];
type FileQuestion = Extract<Question, { type: 'file_upload' }>;

export function findFileQuestion(schema: FormSchema, questionId: string): FileQuestion | null {
  for (const section of schema.sections)
    for (const question of section.questions)
      if (question.id === questionId && question.type === 'file_upload') return question;
  return null;
}

export function hasFileQuestion(schema: FormSchema): boolean {
  return schema.sections.some((s) => s.questions.some((q) => q.type === 'file_upload'));
}

/**
 * Does this file_upload question accept the declared content type and size? The browser-declared type is a
 * hint: it must map to one of OUR kinds, and one of the question's accept groups must allow that kind.
 */
export function questionAccepts(question: FileQuestion, contentType: string, size: number): boolean {
  const kind = uploadKindFor(contentType);
  if (!kind) return false;
  if (!question.accept.some((group) => FILE_GROUP_KINDS[group].includes(kind))) return false;
  return size <= question.maxMb * 1_048_576;
}
