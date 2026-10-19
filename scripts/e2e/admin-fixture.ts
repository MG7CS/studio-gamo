/**
 * Shared by scripts/e2e/admin-server.ts (the production-like admin test server) and tests/e2e/admin.spec.ts:
 * the single admin's email, the Cloudflare Access test identity, and a minter for Access assertions.
 * Every value is a throwaway for a local server that answers only on 127.0.0.1.
 */
import { createSign } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Not 4326: that is the port of `make dev-admin`, which the tests must never touch. */
export const ADMIN_E2E_PORT = 4327;
export const ADMIN_E2E_ORIGIN = `http://127.0.0.1:${ADMIN_E2E_PORT}`;

export const ADMIN_EMAIL = 'owner@example.invalid';

export const ACCESS_TEAM = 'gamo-e2e';
export const ACCESS_AUD = 'e2e-access-application-aud-tag-0123456789abcdef';
export const ACCESS_KID = 'e2e-access-key';

/** Where the server leaves the Access signing key for the spec (this machine only, mode 600). */
export const ACCESS_KEY_FILE = join(tmpdir(), 'gamo-admin-e2e', 'access-key.pem');

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

/** A signed `Cf-Access-Jwt-Assertion` value for `email`, as Cloudflare Access would forward it. */
export function mintAccessJwt(
  privateKeyPem: string,
  email: string,
  overrides: Record<string, unknown> = {},
  now = Math.floor(Date.now() / 1000),
) {
  const header = b64url(JSON.stringify({ alg: 'RS256', kid: ACCESS_KID, typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      aud: [ACCESS_AUD],
      email,
      iat: now,
      nbf: now,
      exp: now + 3600,
      iss: `https://${ACCESS_TEAM}.cloudflareaccess.com`,
      type: 'app',
      identity_nonce: 'e2e',
      sub: 'e2e-access-subject-0001',
      ...overrides,
    }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKeyPem);
  return `${header}.${payload}.${b64url(signature)}`;
}
