/**
 * Shared bits for tests that drive the sign-in/sign-up API (Phase 2 identity rules):
 * - the local Turnstile dummy token (accepted only with ENVIRONMENT=local and no secret),
 * - the current Site Terms + Privacy versions a sign-up must carry,
 * - a fetch stub that answers Cloudflare siteverify as a pass (for preview/production tests) and hands
 *   every other request to `next`.
 */
import { TURNSTILE_DUMMY_TOKEN } from '../../packages/domain/src/security/turnstile.ts';
import { termsDocumentsFor } from '../../packages/domain/src/terms/registry.ts';

export const TURNSTILE_FIELD = 'cf-turnstile-response';
export const LOCAL_TURNSTILE = { [TURNSTILE_FIELD]: TURNSTILE_DUMMY_TOKEN } as const;

/** What the sign-up screen sends with `intent: 'signup'` to /api/auth/verify. */
export function signupTerms(): { slug: string; version: string }[] {
  return termsDocumentsFor(['site-terms', 'privacy-policy']).map((d) => ({
    slug: d.slug,
    version: d.version,
  }));
}

/** Secrets the guarded auth routes need outside local (values are test-only, ≥ 32 chars). */
export const GUARD_SECRETS = {
  PII_HASH_SECRET: 'test-only-pii-hash-secret-0123456789abcdef',
  TURNSTILE_SECRET_KEY: 'test-only-turnstile-secret',
} as const;

export function siteverifyPass(next: typeof fetch = globalThis.fetch): typeof fetch {
  return (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.includes('challenges.cloudflare.com/turnstile'))
      return new Response(JSON.stringify({ success: true, action: 'auth', hostname: 'example.test' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    return next(input as Parameters<typeof fetch>[0], init);
  }) as typeof fetch;
}
