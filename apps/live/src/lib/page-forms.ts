/**
 * Helpers for server-rendered (no-JS) ticketing forms: turn thrown errors and guard errors into the
 * summary + per-field messages the form kit renders, and read the shared request facts.
 */
import { TicketingError, type FieldError, type PublicFormError, type RemainingCount } from '@gamo/domain';

export interface FormProblem {
  /** HTTP status the page should answer with. */
  status: number;
  /** One sentence, always says what to do. */
  message: string;
  summary: Array<{ message: string; fieldId?: string }>;
  /** Messages by form field name. */
  fields: Record<string, string>;
  remaining: RemainingCount[];
  retryAfterSeconds?: number;
  headers: Record<string, string>;
}

/** Form field name → element id (the ids the shared form components render). */
const FIELD_IDS: Record<string, string> = {
  purchaserName: 'purchaser-name',
  email: 'email',
  emailConfirm: 'email-confirm',
  terms_accept: 'terms-accept',
  attendee_name: 'attendee-0',
  tickets: 'ticket-options',
  form: 'order-form',
  toName: 'to-name',
  toEmail: 'to-email',
  toEmailConfirm: 'to-email-confirm',
  code: 'code',
  reason: 'reason',
  'cf-turnstile-response': 'turnstile-widget',
};

export const fieldId = (field: string): string =>
  FIELD_IDS[field] ?? (field.startsWith('policy.') ? `policy-${field.slice(7)}` : field);

function fromFields(list: FieldError[]): Pick<FormProblem, 'summary' | 'fields'> {
  const fields: Record<string, string> = {};
  const summary: FormProblem['summary'] = [];
  for (const f of list) {
    if (!fields[f.field]) fields[f.field] = f.message;
    summary.push({ message: f.message, fieldId: fieldId(f.field) });
  }
  return { summary, fields };
}

export function problemFromError(err: unknown): FormProblem {
  if (err instanceof TicketingError) {
    const list = err.details?.fields ?? [];
    const { summary, fields } = fromFields(list);
    return {
      status: err.status,
      message: err.message,
      summary: summary.length ? summary : [{ message: err.message }],
      fields,
      remaining: err.details?.remaining ?? [],
      retryAfterSeconds: err.details?.retryAfterSeconds,
      headers: err.details?.retryAfterSeconds ? { 'Retry-After': String(err.details.retryAfterSeconds) } : {},
    };
  }
  console.error('[live] unexpected page error');
  return {
    status: 500,
    message: 'Something went wrong on our side. Please try again in a moment.',
    summary: [{ message: 'Something went wrong on our side. Please try again in a moment.' }],
    fields: {},
    remaining: [],
    headers: {},
  };
}

export function problemFromGuard(error: PublicFormError): FormProblem {
  return {
    status: error.status,
    message: error.message,
    summary: [{ message: error.message, fieldId: error.fieldId }],
    fields: error.field ? { [error.field]: error.message } : {},
    remaining: [],
    retryAfterSeconds: error.retryAfterSeconds,
    headers: error.headers,
  };
}

/** A fresh form idempotency key (rendered into the order form). */
export function newFormKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return `idem_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export const isHttpsRequest = (request: Request): boolean => new URL(request.url).protocol === 'https:';

/** 303 with extra headers (cookies). */
export function see(location: string, cookies: Array<string | null | undefined> = []): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'private, no-store' });
  for (const c of cookies) if (c) headers.append('Set-Cookie', c);
  return new Response(null, { status: 303, headers });
}
