/**
 * Neutral wording for every sign-in/sign-up failure (design §4.3, docs/IDENTITY.md "Enumeration").
 *
 * Clerk's own messages say things like "Couldn't find your account" or "That email address is taken";
 * shown verbatim they reveal whether an address has an account in this product. Every Clerk error is
 * mapped here to a message that is the same for known and unknown addresses and tells the person what
 * to do next. Pure functions (unit-tested in auth-errors.test.ts).
 */

export type ClerkPhase = 'request' | 'verify';

export interface MappedAuthError {
  message: string;
  /** Which field the message belongs to ('email' | 'code' | 'turnstile' | 'terms' | 'name'). */
  field?: 'email' | 'code' | 'turnstile' | 'terms' | 'name';
  /**
   * For a sign-up whose address already has an account (or a sign-in whose address has none), the
   * flow carries on as if a code had been sent, so nobody learns which addresses exist.
   */
  continueAsSent?: boolean;
  /** Sign-up with an existing address: switch to the sign-in flow (send a sign-in code instead). */
  switchToSignIn?: boolean;
}

export const NEUTRAL_CODE_MESSAGE =
  'That code is not valid or has expired. Check the newest email from us or request a new code. No account yet? Create one instead.';
export const GENERIC_AUTH_MESSAGE = "We couldn't complete that step. Please try again in a moment.";
export const RATE_LIMIT_MESSAGE = 'Too many attempts. Please wait a few minutes and try again.';

function clerkCodes(err: unknown): string[] {
  const errors = (err as { errors?: Array<{ code?: unknown }> } | null)?.errors;
  if (!Array.isArray(errors)) return [];
  return errors.map((e) => (typeof e?.code === 'string' ? e.code : '')).filter(Boolean);
}

/** Maps a Clerk browser SDK error to a neutral message. Never returns Clerk's own text. */
export function mapClerkError(err: unknown, phase: ClerkPhase, intent: 'signin' | 'signup'): MappedAuthError {
  const codes = clerkCodes(err);
  const has = (...wanted: string[]) => codes.some((c) => wanted.includes(c));
  if (has('too_many_requests', 'rate_limit_exceeded', 'user_locked')) return { message: RATE_LIMIT_MESSAGE };
  if (phase === 'request') {
    if (has('form_identifier_not_found', 'identifier_not_found', 'form_identifier_not_allowed'))
      return { message: '', continueAsSent: true };
    if (has('form_identifier_exists', 'identifier_already_signed_in'))
      return intent === 'signup'
        ? { message: '', switchToSignIn: true }
        : { message: '', continueAsSent: true };
    if (has('form_param_format_invalid', 'form_param_nil', 'form_email_address_invalid'))
      return { message: 'Enter a valid email address, like name@example.org.', field: 'email' };
    if (has('captcha_invalid', 'captcha_missing_token', 'captcha_not_enabled'))
      return { message: 'Please complete the security check, then try again.', field: 'turnstile' };
    if (has('form_password_pwned', 'form_param_unknown')) return { message: GENERIC_AUTH_MESSAGE };
    return { message: GENERIC_AUTH_MESSAGE };
  }
  if (has('form_code_incorrect', 'verification_expired', 'verification_failed', 'form_param_format_invalid'))
    return { message: NEUTRAL_CODE_MESSAGE, field: 'code' };
  if (has('verification_already_verified', 'session_exists')) return { message: GENERIC_AUTH_MESSAGE };
  return { message: NEUTRAL_CODE_MESSAGE, field: 'code' };
}

/** Maps a Gamo API error code to the field it belongs to (for aria-invalid/aria-describedby). */
export function fieldForApiError(code: string | undefined): MappedAuthError['field'] | undefined {
  switch (code) {
    case 'TURNSTILE_REQUIRED':
    case 'TURNSTILE_FAILED':
      return 'turnstile';
    case 'TERMS_REQUIRED':
    case 'TERMS_OUTDATED':
      return 'terms';
    case 'VALIDATION_ERROR':
    case 'BAD_REQUEST':
      return 'email';
    case 'UNAUTHENTICATED':
      return 'code';
    default:
      return undefined;
  }
}

/** True when this product shows "Continue with Google": its own Clerk is configured AND the flag is on. */
export function googleSignInEnabled(input: {
  clerkConfigured: boolean;
  product: string | undefined;
  env: Record<string, unknown> | undefined;
}): boolean {
  if (!input.clerkConfigured || !input.product) return false;
  const flag = input.env?.[`CLERK_GOOGLE_ENABLED_${input.product.toUpperCase()}`];
  return flag === 'true' || flag === true;
}
