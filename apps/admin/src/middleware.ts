import { checkEnvOnce } from '@gamo/config/env-validation';
import { defineMiddleware } from 'astro/middleware';
import type { MiddlewareHandler } from 'astro';
import { generateCspNonce, getRuntimeEnv, withSecurityHeaders } from '@gamo/domain';
import { checkGate, setAdminEmail } from './lib/gate';

/**
 * Admin access control: env check, then the gate (docs/ADMIN_REQUIREMENTS.md). There is no sign-in page: a
 * request that does not belong to the one admin gets a plain 401/403/503 and nothing else, for every path
 * (pages, APIs, unknown routes). Cloudflare Access performs the login before a request ever reaches the app.
 */
const handleAdminRequest: MiddlewareHandler = async (context, next) => {
  const env = await getRuntimeEnv(context);
  const misconfigured = checkEnvOnce('admin', env, context.request);
  if (misconfigured) return misconfigured;

  const gate = await checkGate(context.request, env, new URL(context.request.url));
  if (!gate.ok) {
    return new Response(gate.message, {
      status: gate.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  setAdminEmail(context.locals, gate.email);
  return next();
};

export const onRequest = defineMiddleware(async (context, next) => {
  const response = (await handleAdminRequest(context, next)) ?? (await next());
  const secured = withSecurityHeaders(response, {
    enforceCsp: import.meta.env?.PROD === true,
    https: new URL(context.request.url).protocol === 'https:',
    // Cloudflare injects an inline script whose content changes per request; it takes this nonce from the header.
    nonce: generateCspNonce(),
  });
  // Everything on admin is for one person: never cache, never index.
  secured.headers.set('Cache-Control', 'no-store');
  secured.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return secured;
});
