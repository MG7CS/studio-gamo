/**
 * The admin gate: one admin, Cloudflare Access only. The admin has no accounts or credentials of its own.
 * Every request must prove it belongs to exactly `ADMIN_EMAIL`; anything else, or any error, is denied.
 *
 *   outside local : a valid Access assertion (RS256, issuer + audience + signature + expiry) whose email is ADMIN_EMAIL
 *   local         : the same, or (loopback + ENVIRONMENT=local + ALLOW_LOCAL_ADMIN_IDENTITY=true) ADMIN_EMAIL itself
 *   local, phone  : only while `make admin-phone` runs (GAMO_DEV_PHONE_TOKEN set): the admin listens on the Wi-Fi, so the
 *                   Host header can no longer prove "this computer". Then every request, on a loopback or a private-network
 *                   host, needs the random secret (cookie or the one-time `?phone=` link), and nothing else is accepted.
 */
import type { GamoEnv } from '@gamo/config/env';
import { isLoopbackHost, isPrivateNetworkHost } from '@gamo/config/env-validation';
import { verifyCloudflareAccessJwt } from './access';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** True only for a local development run (ENVIRONMENT=local on a loopback host). Anything else needs Access. */
export function isLocalRuntime(env: Pick<GamoEnv, 'ENVIRONMENT'>, url: URL): boolean {
  return env.ENVIRONMENT === 'local' && LOOPBACK_HOSTS.has(url.hostname);
}

export type GateResult =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403 | 503; message: string }
  // Only after a valid `?phone=` secret on a GET: send the browser to the same page without the secret, with the cookie.
  | { ok: false; status: 303; message: string; location: string; setCookie: string };

export const PHONE_COOKIE = 'gamo_dev_phone';
const PHONE_PARAM = 'phone';
const PHONE_COOKIE_MAX_AGE = 8 * 60 * 60;
const PHONE_MIN_LENGTH = 16;

const normalize = (value: string | undefined | null) => (value ?? '').trim().toLowerCase();

const encoder = new TextEncoder();

async function digest(value: string, key?: string): Promise<Uint8Array> {
  if (key === undefined) return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(value)));
}

/** Constant-time equality of two strings of any length (both are hashed to 32 bytes first). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

/** What the browser keeps: a keyed hash of the secret, so the cookie is not the secret from the link. */
async function phoneCookieValue(token: string): Promise<string> {
  return Array.from(await digest('gamo-dev-phone-cookie', token), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

function cookieValue(request: Request, name: string): string {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return '';
}

/**
 * `make admin-phone`: the local admin reached from a phone on the same Wi-Fi, behind a random secret.
 * Returns null when the feature is off (anything but ENVIRONMENT=local with a configured token, or a host that is
 * neither loopback nor private-network), so the normal rules apply. Otherwise it answers: the one admin, a redirect that
 * removes the secret from the address (valid `?phone=` on GET), or a plain denial that never says why.
 */
async function checkPhoneAccess(
  request: Request,
  env: Pick<GamoEnv, 'ENVIRONMENT' | 'GAMO_DEV_PHONE_TOKEN'>,
  url: URL,
  admin: string,
): Promise<GateResult | null> {
  const token = typeof env.GAMO_DEV_PHONE_TOKEN === 'string' ? env.GAMO_DEV_PHONE_TOKEN.trim() : '';
  if (env.ENVIRONMENT !== 'local' || !token) return null;
  if (!isLoopbackHost(url.hostname) && !isPrivateNetworkHost(url.hostname)) return null;
  const denied: GateResult = { ok: false, status: 403, message: 'Not allowed.' };
  if (token.length < PHONE_MIN_LENGTH) return denied; // a weak secret opens nothing

  const cookie = cookieValue(request, PHONE_COOKIE);
  if (cookie && (await safeEqual(cookie, await phoneCookieValue(token)))) return { ok: true, email: admin };

  const offered = url.searchParams.get(PHONE_PARAM);
  if (request.method === 'GET' && offered && (await safeEqual(offered, token))) {
    const clean = new URL(url);
    clean.searchParams.delete(PHONE_PARAM);
    return {
      ok: false,
      status: 303,
      message: '',
      location: `/${clean.pathname.replace(/^\/+/, '')}${clean.search}`,
      setCookie: `${PHONE_COOKIE}=${await phoneCookieValue(token)}; Path=/; Max-Age=${PHONE_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`,
    };
  }
  return denied;
}

export async function checkGate(
  request: Request,
  env: Pick<
    GamoEnv,
    | 'ENVIRONMENT'
    | 'ADMIN_EMAIL'
    | 'CF_ACCESS_AUD'
    | 'CF_ACCESS_TEAM_NAME'
    | 'ALLOW_LOCAL_ADMIN_IDENTITY'
    | 'GAMO_DEV_PHONE_TOKEN'
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

  // With a phone token the dev server is on the network and the Host header proves nothing: the secret decides.
  const phone = await checkPhoneAccess(request, env, url, admin);
  if (phone) return phone;

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
