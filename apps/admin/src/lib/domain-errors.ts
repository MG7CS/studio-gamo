/**
 * Maps the errors the domain layer throws to HTTP answers and to the generic notice keys a redirect carries.
 * Only messages the domain classes mark as safe for staff are returned; an unknown error is a generic 500
 * (never its message, stack, SQL or a secret).
 */
import { AuthError } from '@gamo/auth';
import { ContractValidationError } from '@gamo/api-contracts/runtime';
import { errorResponse, handleApiError } from '@gamo/domain';
import {
  FormAnswersError,
  FormConflictError,
  FormPublishError,
  FormsError,
  UploadError,
  type FormsErrorCode,
} from '@gamo/domain/forms';
import { InvoiceError } from '@gamo/domain/invoices';
import { WorshipError, type WorshipErrorCode } from '@gamo/domain/worship';

/**
 * A Zod validation error. Recognised by shape because admin does not depend on `zod` itself (the domain
 * package does) and a second copy of the class would fail `instanceof`.
 */
function isZodError(
  err: unknown,
): err is Error & { issues: { path: (string | number)[]; message: string; code: string }[] } {
  return (
    err instanceof Error && err.name === 'ZodError' && Array.isArray((err as { issues?: unknown }).issues)
  );
}

const WORSHIP_STATUS: Record<WorshipErrorCode, number> = {
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  INVALID_STATE: 409,
  NOT_AN_APPLICATION: 409,
  NOT_A_REQUEST: 409,
};

/** The standard error body (`{ success: false, error: { code, message, details? } }`) for `err`. */
export function domainErrorResponse(err: unknown): Response {
  if (err instanceof Response) return err;
  if (err instanceof FormConflictError) {
    return errorResponse(err.code, err.message, err.status, {
      currentRevision: err.currentRevision,
      updatedAt: err.updatedAt,
    });
  }
  if (err instanceof FormPublishError) {
    return errorResponse(err.code, err.message, err.status, { errors: err.errors, warnings: err.warnings });
  }
  if (err instanceof FormAnswersError) {
    return errorResponse(err.code, err.message, err.status, err.errors);
  }
  if (err instanceof FormsError) return errorResponse(err.code, err.message, err.status);
  if (err instanceof InvoiceError) {
    return errorResponse(
      err.code,
      err.message,
      err.status,
      err.fieldErrors.length > 0 ? err.fieldErrors : undefined,
    );
  }
  if (err instanceof WorshipError) {
    return errorResponse(err.code, err.message, WORSHIP_STATUS[err.code] ?? 400);
  }
  if (err instanceof UploadError) return errorResponse(err.code, err.message, err.status);
  if (err instanceof AuthError) return errorResponse(err.code, err.message, err.status);
  if (isZodError(err)) {
    return errorResponse(
      'VALIDATION_ERROR',
      'The request payload failed schema validation.',
      400,
      err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message, code: issue.code })),
    );
  }
  if (err instanceof ContractValidationError) return handleApiError(err);
  // Name only: a message can carry SQL, paths or personal data.
  console.error('[admin] unexpected error:', err instanceof Error ? err.name : typeof err);
  return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
}

type NoticeKey = 'conflict' | 'invalid' | 'not-found' | 'blocked' | 'unavailable';

const FORMS_KEY: Record<FormsErrorCode, NoticeKey> = {
  INVALID_INPUT: 'invalid',
  ANSWERS_INVALID: 'invalid',
  NOT_FOUND: 'not-found',
  VERSION_NOT_FOUND: 'not-found',
  SLUG_TAKEN: 'conflict',
  REVISION_CONFLICT: 'conflict',
  IDEMPOTENCY_CONFLICT: 'conflict',
  CONFLICT: 'conflict',
  PUBLISH_BLOCKED: 'blocked',
  FORM_CLOSED: 'blocked',
  INVALID_TRANSITION: 'blocked',
};

const INVOICE_KEY: Record<InvoiceError['code'], NoticeKey> = {
  INVOICE_NOT_FOUND: 'not-found',
  LINE_NOT_FOUND: 'not-found',
  SOURCE_NOT_FOUND: 'not-found',
  INVOICE_INVALID: 'invalid',
  INVOICE_STATE: 'blocked',
  GAMO_ADMIN_NOT_APPROVED: 'blocked',
  LIVEMODE_REFUSED: 'blocked',
  PAYOUT_EXISTS: 'conflict',
  PAYMENT_NOT_CONFIGURED: 'unavailable',
  STRIPE_FAILED: 'unavailable',
  EMAIL_FAILED: 'unavailable',
};

const WORSHIP_KEY: Record<WorshipErrorCode, NoticeKey> = {
  NOT_FOUND: 'not-found',
  INVALID_INPUT: 'invalid',
  INVALID_STATE: 'blocked',
  NOT_AN_APPLICATION: 'blocked',
  NOT_A_REQUEST: 'blocked',
};

/**
 * A generic key (`conflict`, `invalid`, `not-found`, `blocked`, `unavailable`) for a post-redirect-get
 * `see(location, key)` after a refused write; the page maps it to its own wording with `noticeFrom`.
 * Null for anything that is not an expected refusal (auth failures, Response, unknown errors): answer
 * those with `domainErrorResponse` instead of redirecting.
 */
export function noticeKeyForError(err: unknown): string | null {
  if (err instanceof FormConflictError) return 'conflict';
  if (err instanceof FormsError) return FORMS_KEY[err.code] ?? 'invalid';
  if (err instanceof InvoiceError) return INVOICE_KEY[err.code] ?? 'invalid';
  if (err instanceof WorshipError) return WORSHIP_KEY[err.code] ?? 'invalid';
  if (err instanceof UploadError) {
    if (err.status === 404) return 'not-found';
    if (err.status === 409) return 'conflict';
    if (err.status >= 500) return 'unavailable';
    return 'invalid';
  }
  if (isZodError(err) || err instanceof ContractValidationError) return 'invalid';
  return null;
}
