import { checkEnvOnce } from '@gamo/config/env-validation';
import { defineMiddleware } from 'astro/middleware';
import type { MiddlewareHandler } from 'astro';
import { generateCspNonce, getRuntimeEnv, withSecurityHeaders } from '@gamo/domain';
import { isLocalRuntime, mustChangePassword, readAccessIdentity, resolveStaffSession } from './lib/gate';

/**
 * Admin access control. Nothing is served to an unauthenticated request except the sign-in and sign-out
 * pages; there is no development bypass, no emergency credential and no "demo" identity. Order:
 *
 *   env check → Cloudflare Access (outside local) → gateway session → temporary-password rule → page/API
 *
 * Unauthenticated page requests are answered 401 with the sign-in page (rendered by the admin shell's own
 * `/signin` page through a rewrite); API requests get a 401 JSON body. A signed-in user who is not allowed
 * (Access identity mismatch) gets a 403.
 */

/** Pages an unauthenticated request may reach. Each one still requires Access outside local. */
const PUBLIC_PATHS = new Set(['/signin', '/signout']);
/** Pages a user on a temporary password may use. */
const TEMPORARY_PASSWORD_PATHS = new Set(['/security', '/signout']);

const plain = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow, noarchive' },
  });

const unauthenticatedApi = () =>
  new Response(
    JSON.stringify({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Staff sign-in required.' },
    }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );

const handleAdminRequest: MiddlewareHandler = async (context, next) => {
  const url = new URL(context.request.url);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;

  const env = await getRuntimeEnv(context);
  const misconfigured = checkEnvOnce('admin', env, context.request);
  if (misconfigured) return misconfigured;

  const local = isLocalRuntime(env, url);
  const access = await readAccessIdentity(context.request, env);
  if (!local && !access) return plain(401, 'Cloudflare Access sign-in is required.');
  if (access) {
    context.locals.staffEmail = access.email;
    context.locals.staffSubject = access.sub;
  }

  const resolution = await resolveStaffSession(context.request, env, access);
  if (resolution.kind === 'denied') return plain(403, resolution.message);

  if (resolution.kind === 'staff') {
    context.locals.adminAuthSession = resolution.session;
    context.locals.staffEmail = access?.email ?? resolution.session.user.email;
    if (!TEMPORARY_PASSWORD_PATHS.has(path) && (await mustChangePassword(env, resolution.session.user.id))) {
      return new Response(null, { status: 303, headers: { Location: '/security?welcome=1' } });
    }
    return next();
  }

  // Not signed in.
  if (PUBLIC_PATHS.has(path)) return next();
  if (path.startsWith('/api/')) return unauthenticatedApi();
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD')
    return plain(401, 'Staff sign-in required.');
  context.locals.signIn = { reason: 'required', next: path + url.search, email: access?.email };
  return next('/signin');
};

export const onRequest = defineMiddleware(async (context, next) => {
  const response = (await handleAdminRequest(context, next)) ?? (await next());
  const secured = withSecurityHeaders(response, {
    enforceCsp: import.meta.env?.PROD === true,
    https: new URL(context.request.url).protocol === 'https:',
    // Cloudflare injects an inline script (JavaScript Detections) whose content changes per request; it
    // takes this nonce from the header. No admin page has an inline script of its own.
    nonce: generateCspNonce(),
  });
  // Everything on admin is staff-only (including the sign-in pages): never cache.
  secured.headers.set('Cache-Control', 'no-store');
  secured.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return secured;
});
