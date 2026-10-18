/**
 * HTTP glue shared by the Gamo Live ticketing API routes and pages: error responses, the customer
 * session behind a request, and the public-form rate limits per route.
 */
import { errorResponse, handleApiError } from '../../api/response.ts';
import { SecretNotConfiguredError } from '../../security/crypto.ts';
import { TermsAcceptanceError } from '../../terms/acceptance.ts';
import { CUSTOMER_COOKIE_NAME, CustomerInputError, readCustomerSession } from '../customers.ts';
import type { SqlDatabase } from '../../security/sql-database.ts';
import { customerIdentity, type CustomerIdentity } from './orders.ts';
import { TicketingError, type TicketingEnv } from './orders-shared.ts';
import type { PublicFormGuardOptions } from '../../api/public-form-guard.ts';

/** Rate limits and Turnstile actions of the public ticketing forms (design T-08). */
export const TICKETING_FORMS = {
  order: {
    route: 'live.order',
    turnstileAction: 'order',
    limits: { perIp: { limit: 30, windowSeconds: 600 }, perEmail: { limit: 10, windowSeconds: 3600 } },
  },
  confirm: {
    route: 'live.confirm',
    requireTurnstile: false,
    limits: { perIp: { limit: 30, windowSeconds: 600 } },
  },
  recovery: {
    route: 'live.recovery',
    turnstileAction: 'recovery',
    limits: { perIp: { limit: 10, windowSeconds: 900 }, perEmail: { limit: 3, windowSeconds: 3600 } },
  },
  waitlist: {
    route: 'live.waitlist',
    turnstileAction: 'waitlist',
    limits: { perIp: { limit: 20, windowSeconds: 600 }, perEmail: { limit: 5, windowSeconds: 3600 } },
  },
  transfer: {
    route: 'live.transfer',
    requireTurnstile: false,
    limits: { perIp: { limit: 20, windowSeconds: 600 } },
  },
} satisfies Record<string, PublicFormGuardOptions>;

/** JSON error for any failure a ticketing route can meet (TicketingError keeps its status and details). */
export function ticketingErrorResponse(err: unknown): Response {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (err instanceof TicketingError) {
    const d = err.details;
    if (d?.retryAfterSeconds) headers['Retry-After'] = String(d.retryAfterSeconds);
    const details =
      d && (d.fields || d.remaining || d.retryAfterSeconds)
        ? {
            ...(d.fields ? { fields: d.fields } : {}),
            ...(d.remaining ? { remaining: d.remaining } : {}),
            ...(d.retryAfterSeconds ? { retryAfterSeconds: d.retryAfterSeconds } : {}),
          }
        : undefined;
    return errorResponse(err.code, err.message, err.status, details, headers);
  }
  if (err instanceof TermsAcceptanceError || err instanceof CustomerInputError)
    return errorResponse('VALIDATION', err.message, 400, undefined, headers);
  if (err instanceof SecretNotConfiguredError) {
    console.error(`[ticketing] ${err.message}`);
    return errorResponse(
      'UNAVAILABLE',
      'Tickets are temporarily unavailable. Please try again shortly.',
      503,
      undefined,
      headers,
    );
  }
  return handleApiError(err);
}

/** The customer behind the request's `__gamo_customer` cookie, or null. */
export async function requestCustomer(
  db: SqlDatabase,
  env: TicketingEnv,
  request: Request,
  now: number,
): Promise<CustomerIdentity | null> {
  // No cookie → anonymous (401 in the routes), even when the link secret is missing.
  if (!(request.headers.get('cookie') ?? '').includes(`${CUSTOMER_COOKIE_NAME}=`)) return null;
  try {
    return await customerIdentity(db, await readCustomerSession(db, env, request, now));
  } catch (err) {
    if (err instanceof SecretNotConfiguredError)
      throw new TicketingError(
        'UNAVAILABLE',
        'Your tickets are temporarily unavailable. Please try again shortly.',
      );
    throw err;
  }
}

export const requestOrigin = (request: Request): string => new URL(request.url).origin;
export const isHttps = (request: Request): boolean => new URL(request.url).protocol === 'https:';
