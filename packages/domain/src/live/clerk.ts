/**
 * Clerk for Gamo Live organizers. Gamo Live has its own Clerk application (never shared with another
 * product). The browser signs in with clerk-js; the server never trusts the browser, it verifies the
 * session token's signature and claims here, then reads the verified email from Clerk's Backend API
 * (`CLERK_SECRET_KEY_LIVE`) before it starts its own session (see `organizers.ts`).
 *
 * Variables (Live only): `PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE`, `CLERK_SECRET_KEY_LIVE`, optional
 * `CLERK_JWT_KEY_LIVE` (PEM public key: verify without a network call) and `CLERK_AUTHORIZED_PARTIES_LIVE`
 * (comma-separated origins allowed as the token's `azp`).
 */
import { base64UrlToBytes } from '../security/crypto.ts';

type Env = { ENVIRONMENT?: unknown };

export interface LiveClerkConfig {
  publishableKey: string;
  /** `https://<frontend api host>`; the only script/connect origin the sign-in pages add to the CSP. */
  frontendApi: string;
  secretKey: string;
  jwtKey?: string;
  authorizedParties: string[];
}

const isReal = (value: unknown): value is string => {
  const v = typeof value === 'string' ? value.trim() : '';
  return v !== '' && !/REPLACE_WITH|YOUR_|placeholder|^pending_/i.test(v);
};

/** Decodes the Frontend API host inside a publishable key (`pk_test_<base64 of host$>`). */
export function frontendApiFromPublishableKey(key: string | undefined): string | null {
  const m = /^pk_(?:test|live)_([A-Za-z0-9+/=_-]+)$/.exec((key ?? '').trim());
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    if (!decoded.endsWith('$')) return null;
    const host = decoded.slice(0, -1).trim().toLowerCase();
    return host.includes('.') && /^[a-z0-9.-]+$/.test(host) ? `https://${host}` : null;
  } catch {
    return null;
  }
}

/** The PEM public key with real line breaks, whichever way it was stored. */
export function normalizePem(value: string): string {
  return value
    .trim()
    .replace(/^(["'])([\s\S]*)\1$/, '$2')
    .replace(/\\r\\n|\\n/g, '\n')
    .trim();
}

/** Live's Clerk settings, or null when Clerk is not (fully) configured. Never throws. */
export function liveClerkConfig(env: Env): LiveClerkConfig | null {
  const get = (name: string) => (env as Record<string, unknown>)[name];
  const publishableKey = get('PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE');
  const secretKey = get('CLERK_SECRET_KEY_LIVE');
  if (!isReal(publishableKey) || !isReal(secretKey)) return null;
  const frontendApi = frontendApiFromPublishableKey(publishableKey);
  if (!frontendApi) return null;
  const jwt = get('CLERK_JWT_KEY_LIVE');
  const parties = get('CLERK_AUTHORIZED_PARTIES_LIVE');
  return {
    publishableKey: publishableKey.trim(),
    frontendApi,
    secretKey: secretKey.trim(),
    jwtKey: isReal(jwt) ? normalizePem(jwt) : undefined,
    authorizedParties:
      typeof parties === 'string'
        ? parties
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
        : [],
  };
}

/** Local-only sign-in without Clerk, for working on the organizer area before keys exist. Fatal elsewhere. */
export function localSimulatedSignInAllowed(env: Env): boolean {
  const e = env as Record<string, unknown>;
  return e.ENVIRONMENT === 'local' && e.ALLOW_AUTH_SIMULATION === 'true' && liveClerkConfig(env) === null;
}

export class ClerkVerificationError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = 'ClerkVerificationError';
    this.reason = reason;
  }
}

/** Raised when Clerk cannot be reached; callers answer 503, not "signed out". */
export class ClerkUnavailableError extends Error {
  constructor() {
    super('clerk_unavailable');
    this.name = 'ClerkUnavailableError';
  }
}

interface Jwk extends JsonWebKey {
  kid?: string;
}
const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();
const JWKS_TTL_MS = 10 * 60 * 1000;

/** Forgets the cached key sets (tests, and after a key rotation). */
export function clearJwksCache(): void {
  jwksCache.clear();
}

async function loadJwks(frontendApi: string, force: boolean, fetchImpl: typeof fetch): Promise<Jwk[]> {
  const cached = jwksCache.get(frontendApi);
  if (!force && cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  let response: Response;
  try {
    response = await fetchImpl(`${frontendApi}/.well-known/jwks.json`, {
      headers: { accept: 'application/json' },
    });
  } catch {
    throw new ClerkUnavailableError();
  }
  if (!response.ok) throw new ClerkUnavailableError();
  const body = (await response.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache.set(frontendApi, { keys, fetchedAt: Date.now() });
  return keys;
}

function pemToSpki(pem: string): Uint8Array<ArrayBuffer> | null {
  const body = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');
  const bytes = base64UrlToBytes(body.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
  return bytes;
}

export interface ClerkSessionClaims {
  userId: string;
  sessionId: string | null;
}

/**
 * Verifies a Clerk session token: RS256 signature (public key from `CLERK_JWT_KEY_LIVE` or the Frontend API's
 * JWKS), `iss` equal to the Frontend API, `exp`/`nbf` with 10 s leeway, and `azp` in the authorized parties
 * when any are configured. Throws `ClerkVerificationError` (bad token) or `ClerkUnavailableError` (no JWKS).
 */
export async function verifyClerkSessionToken(
  token: string,
  config: LiveClerkConfig,
  now: number = Math.floor(Date.now() / 1000),
  fetchImpl: typeof fetch = fetch,
): Promise<ClerkSessionClaims> {
  const parts = String(token).split('.');
  if (parts.length !== 3 || String(token).length > 8192) throw new ClerkVerificationError('malformed');
  const decoder = new TextDecoder();
  const decode = (part: string) => {
    const bytes = base64UrlToBytes(part);
    if (!bytes) throw new ClerkVerificationError('malformed');
    return bytes;
  };
  let header: { alg?: string; kid?: string };
  let claims: { sub?: string; sid?: string; iss?: string; exp?: number; nbf?: number; azp?: string };
  try {
    header = JSON.parse(decoder.decode(decode(parts[0])));
    claims = JSON.parse(decoder.decode(decode(parts[1])));
  } catch {
    throw new ClerkVerificationError('malformed');
  }
  if (header.alg !== 'RS256') throw new ClerkVerificationError('algorithm');

  let key: CryptoKey | null = null;
  if (config.jwtKey) {
    const spki = pemToSpki(config.jwtKey);
    if (!spki) throw new ClerkVerificationError('key');
    key = await crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
      'verify',
    ]);
  } else {
    for (const force of [false, true]) {
      const keys = await loadJwks(config.frontendApi, force, fetchImpl);
      const jwk = keys.find((k) => k.kid === header.kid);
      if (jwk) {
        key = await crypto.subtle.importKey(
          'jwk',
          jwk,
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['verify'],
        );
        break;
      }
    }
    if (!key) throw new ClerkVerificationError('unknown_key');
  }
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    decode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new ClerkVerificationError('signature');
  if (claims.iss !== config.frontendApi) throw new ClerkVerificationError('issuer');
  if (typeof claims.exp !== 'number' || claims.exp + 10 <= now) throw new ClerkVerificationError('expired');
  if (typeof claims.nbf === 'number' && claims.nbf - 10 > now)
    throw new ClerkVerificationError('not_yet_valid');
  if (config.authorizedParties.length > 0 && claims.azp && !config.authorizedParties.includes(claims.azp))
    throw new ClerkVerificationError('party');
  if (typeof claims.sub !== 'string' || !/^user_[A-Za-z0-9]+$/.test(claims.sub))
    throw new ClerkVerificationError('subject');
  return { userId: claims.sub, sessionId: typeof claims.sid === 'string' ? claims.sid : null };
}

export interface ClerkUserProfile {
  email: string;
  displayName: string | null;
}

/** The user's verified email and name from Clerk's Backend API. Throws `ClerkVerificationError('no_verified_email')`. */
export async function fetchClerkUserProfile(
  userId: string,
  config: LiveClerkConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ClerkUserProfile> {
  let response: Response;
  try {
    response = await fetchImpl(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
      headers: { authorization: `Bearer ${config.secretKey}`, accept: 'application/json' },
    });
  } catch {
    throw new ClerkUnavailableError();
  }
  if (response.status === 404) throw new ClerkVerificationError('unknown_user');
  if (!response.ok) throw new ClerkUnavailableError();
  const user = (await response.json()) as {
    first_name?: string | null;
    last_name?: string | null;
    primary_email_address_id?: string | null;
    email_addresses?: Array<{ id: string; email_address: string; verification?: { status?: string } | null }>;
  };
  const verified = (user.email_addresses ?? []).filter((e) => e.verification?.status === 'verified');
  const chosen = verified.find((e) => e.id === user.primary_email_address_id) ?? verified[0];
  if (!chosen) throw new ClerkVerificationError('no_verified_email');
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return { email: chosen.email_address.trim().toLowerCase(), displayName: name || null };
}
