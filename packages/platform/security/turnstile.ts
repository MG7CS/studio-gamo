/**
 * Cloudflare Turnstile server-side verification (design T-08).
 * Fail closed: outside local, a missing secret means the protected form answers 503.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** The token Turnstile's documented dummy site keys produce (accepted only with `allowMock`). */
export const TURNSTILE_DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
export const TURNSTILE_TIMEOUT_MS = 5000;
/** Turnstile tokens are at most 2048 characters. */
export const TURNSTILE_MAX_TOKEN_LENGTH = 2048;

export type TurnstileFailure =
  'not_configured' | 'missing_token' | 'rejected' | 'unavailable' | 'hostname_mismatch' | 'action_mismatch';

export type TurnstileResult =
  | { ok: true; mocked: boolean; hostname?: string; action?: string }
  | { ok: false; reason: TurnstileFailure; errorCodes?: string[] };

export interface VerifyTurnstileInput {
  /** The `cf-turnstile-response` form field. */
  token: string | null | undefined;
  /** TURNSTILE_SECRET_KEY. */
  secret: string | null | undefined;
  /** `clientIp(request)`; optional. */
  remoteIp?: string | null;
  /** Injected for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Only true when ENVIRONMENT=local: without a secret, the dummy token passes and anything else is rejected. */
  allowMock?: boolean;
  /** When set, the token must have been issued on this hostname. */
  expectedHostname?: string;
  /** When set, the widget's `data-action` must match. */
  expectedAction?: string;
  /** Lets a retry of the same request re-verify the same token (Turnstile tokens are single-use). */
  idempotencyKey?: string;
  timeoutMs?: number;
}

interface SiteverifyResponse {
  success?: boolean;
  'error-codes'?: unknown;
  hostname?: unknown;
  action?: unknown;
}

export async function verifyTurnstile(input: VerifyTurnstileInput): Promise<TurnstileResult> {
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  if (!token || token.length > TURNSTILE_MAX_TOKEN_LENGTH) return { ok: false, reason: 'missing_token' };

  const secret = typeof input.secret === 'string' ? input.secret.trim() : '';
  if (!secret) {
    if (!input.allowMock) return { ok: false, reason: 'not_configured' };
    return token === TURNSTILE_DUMMY_TOKEN
      ? { ok: true, mocked: true }
      : { ok: false, reason: 'rejected', errorCodes: ['invalid-input-response'] };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (input.remoteIp) body.set('remoteip', input.remoteIp);
  if (input.idempotencyKey) body.set('idempotency_key', input.idempotencyKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? TURNSTILE_TIMEOUT_MS);
  let data: SiteverifyResponse;
  try {
    const response = await (input.fetchImpl ?? fetch)(TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      body,
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: 'unavailable' };
    data = (await response.json()) as SiteverifyResponse;
  } catch {
    return { ok: false, reason: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }

  if (!data || typeof data !== 'object') return { ok: false, reason: 'unavailable' };
  const errorCodes = Array.isArray(data['error-codes']) ? data['error-codes'].map(String) : [];
  if (data.success !== true) {
    // Our own secret being wrong is a configuration problem, not the visitor's fault.
    if (errorCodes.some((c) => c === 'invalid-input-secret' || c === 'missing-input-secret'))
      return { ok: false, reason: 'not_configured', errorCodes };
    if (errorCodes.includes('internal-error')) return { ok: false, reason: 'unavailable', errorCodes };
    return { ok: false, reason: 'rejected', errorCodes };
  }
  const hostname = typeof data.hostname === 'string' ? data.hostname : undefined;
  const action = typeof data.action === 'string' ? data.action : undefined;
  if (input.expectedHostname && hostname !== input.expectedHostname)
    return { ok: false, reason: 'hostname_mismatch' };
  if (input.expectedAction && action !== input.expectedAction)
    return { ok: false, reason: 'action_mismatch' };
  return { ok: true, mocked: false, hostname, action };
}
