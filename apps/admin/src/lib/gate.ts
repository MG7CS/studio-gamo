/**
 * The admin gate: one admin, Cloudflare Access only. The admin has no accounts or credentials of its own.
 * Every request must prove it belongs to exactly `ADMIN_EMAIL`; anything else, or any error, is denied.
 *
 *   outside local : a valid Access assertion (RS256, issuer + audience + signature + expiry) whose email is ADMIN_EMAIL
 *   local         : the same, or (loopback + ENVIRONMENT=local + ALLOW_LOCAL_ADMIN_IDENTITY=true) ADMIN_EMAIL itself
 */
import type { GamoEnv } from '@gamo/config/env';
import { verifyCloudflareAccessJwt } from './access';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** True only for a local development run (ENVIRONMENT=local on a loopback host). Anything else needs Access. */
export function isLocalRuntime(env: Pick<GamoEnv, 'ENVIRONMENT'>, url: URL): boolean {
  return env.ENVIRONMENT === 'local' && LOOPBACK_HOSTS.has(url.hostname);
}

export type GateResult =
  { ok: true; email: string } | { ok: false; status: 401 | 403 | 503; message: string };

const normalize = (value: string | undefined | null) => (value ?? '').trim().toLowerCase();

export async function checkGate(
  request: Request,
  env: Pick<
    GamoEnv,
    'ENVIRONMENT' | 'ADMIN_EMAIL' | 'CF_ACCESS_AUD' | 'CF_ACCESS_TEAM_NAME' | 'ALLOW_LOCAL_ADMIN_IDENTITY'
  >,
  url: URL,
): Promise<GateResult> {
  const admin = normalize(env.ADMIN_EMAIL);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin)) {
    return { ok: false, status: 503, message: 'The admin is not configured.' };
  }

  const assertion = request.headers.get('cf-access-jwt-assertion');
  if (assertion) {
    const result = await verifyCloudflareAccessJwt(assertion, env.CF_ACCESS_AUD, env.CF_ACCESS_TEAM_NAME);
    if (!result.valid || !result.claims) {
      console.error('[admin] Cloudflare Access assertion rejected:', result.reason ?? 'unknown');
      return { ok: false, status: 401, message: 'Cloudflare Access sign-in is required.' };
    }
    if (normalize(result.claims.email) !== admin) {
      return { ok: false, status: 403, message: 'This account is not allowed to use the admin.' };
    }
    return { ok: true, email: admin };
  }

  if (isLocalRuntime(env, url) && env.ALLOW_LOCAL_ADMIN_IDENTITY === 'true')
    return { ok: true, email: admin };
  return { ok: false, status: 401, message: 'Cloudflare Access sign-in is required.' };
}

/** Set by the middleware once the gate passed; pages and layouts read it. Kept off `App.Locals` on purpose. */
export const setAdminEmail = (locals: object, email: string): void => {
  (locals as { adminEmail?: string }).adminEmail = email;
};
export const getAdminEmail = (locals: object): string | undefined =>
  (locals as { adminEmail?: string }).adminEmail;
