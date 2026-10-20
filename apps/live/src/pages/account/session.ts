/**
 * POST /account/session: turns a verified sign-in into a Gamo Live organizer session.
 *
 * - Clerk: the browser sends its Clerk session token as JSON; the server verifies the signature and claims,
 *   reads the verified email from Clerk, and only then starts a session.
 * - Local simulation: a plain form post, accepted only while ENVIRONMENT=local, ALLOW_AUTH_SIMULATION=true,
 *   Clerk is not configured and the request is for localhost / 127.0.0.1 / ::1 (not a LAN address). Never
 *   available anywhere else.
 */
import type { APIRoute } from 'astro';
import { requireSameOrigin } from '@gamo/auth';
import {
  ClerkUnavailableError,
  ClerkVerificationError,
  SecretNotConfiguredError,
  fetchClerkUserProfile,
  liveClerkConfig,
  localSimulatedSignInAllowed,
  requesterHash,
  signInRateLimit,
  startOrganizerSession,
  verifyClerkSessionToken,
} from '@gamo/domain';
import { SESSION_COOKIE, cookieHeader, safeNext } from '../../lib/organizer-session';
import { openLive } from '../../lib/registration';

export const prerender = false;

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });

export const POST: APIRoute = async ({ request, url, redirect, locals }) => {
  try {
    requireSameOrigin(request);
  } catch {
    return json({ ok: false, error: 'forbidden' }, 403);
  }
  const secure = url.protocol === 'https:';
  const isJson = (request.headers.get('content-type') ?? '').includes('application/json');
  let next: string;
  try {
    const live = await openLive({ locals });
    const now = Math.floor(Date.now() / 1000);
    const hash = await requesterHash(request, live.env);
    if (hash) {
      const limit = await signInRateLimit(live.db, hash, now);
      if (!limit.allowed)
        return json({ ok: false, error: 'rate_limited', retryAfterSeconds: limit.retryAfterSeconds }, 429, {
          'retry-after': String(limit.retryAfterSeconds),
        });
    }

    let identity: { clerkUserId: string; email: string; displayName: string | null };
    if (isJson) {
      const body = (await request.json().catch(() => null)) as { token?: unknown; next?: unknown } | null;
      next = safeNext(typeof body?.next === 'string' ? body.next : null);
      const config = liveClerkConfig(live.env);
      if (!config) return json({ ok: false, error: 'unavailable' }, 503);
      if (typeof body?.token !== 'string') return json({ ok: false, error: 'invalid' }, 400);
      // With no CLERK_AUTHORIZED_PARTIES_LIVE the token's azp must be this request's own origin.
      const claims = await verifyClerkSessionToken(body.token, config, now, fetch, url.origin);
      const profile = await fetchClerkUserProfile(claims.userId, config);
      identity = { clerkUserId: claims.userId, email: profile.email, displayName: profile.displayName };
    } else {
      const form = await request.formData();
      next = safeNext(String(form.get('next') ?? ''));
      if (!localSimulatedSignInAllowed(live.env, url.hostname))
        return json({ ok: false, error: 'unavailable' }, 503);
      const email = String(form.get('email') ?? '')
        .trim()
        .toLowerCase();
      const name = String(form.get('name') ?? '').trim() || null;
      if (!email) return redirect(`/account/signin?error=invalid&next=${encodeURIComponent(next)}`, 303);
      identity = { clerkUserId: `local:${email}`, email, displayName: name };
    }

    const session = await startOrganizerSession(live.db, { ...identity, now });
    const cookie = cookieHeader(SESSION_COOKIE, session.token, session.expiresAt - now, secure);
    if (isJson) return json({ ok: true, next }, 200, { 'set-cookie': cookie });
    return new Response(null, { status: 303, headers: { location: next, 'set-cookie': cookie } });
  } catch (error) {
    if (error instanceof ClerkVerificationError) return json({ ok: false, error: 'not_verified' }, 401);
    if (error instanceof ClerkUnavailableError || error instanceof SecretNotConfiguredError)
      return json({ ok: false, error: 'unavailable' }, 503);
    console.error('[live:session] failed', (error as Error)?.name);
    return json({ ok: false, error: 'unavailable' }, 503);
  }
};
