/**
 * POST /api/auth/clerk-session: Clerk's one-minute session token is exchanged for a Gamo session cookie,
 * because nothing on ordinary pages refreshes the Clerk token. Clerk is mocked: keys are generated here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createDb } from '../../packages/db/index.ts';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createAuthHandlers } from '../../packages/domain/src/http/auth.ts';
import { resolveAuth } from '../../packages/auth/index.ts';

const SECRET = 'clerk-exchange-test-session-secret-0123456789';
const keys = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
const academyKeys = keys();
const otherKeys = keys();
const b64url = (x: Buffer | string) => Buffer.from(x).toString('base64url');
const sign = (privateKey: string, claims: Record<string, unknown>) => {
  const input = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'k' }))}.${b64url(JSON.stringify(claims))}`;
  const s = createSign('RSA-SHA256');
  s.update(input);
  return `${input}.${b64url(s.sign(privateKey))}`;
};
const HOST = 'academy-instance.clerk.accounts.dev';
const now = Math.floor(Date.now() / 1000);
const claims = (over: Record<string, unknown> = {}) => ({
  iss: `https://${HOST}`,
  sub: 'user_academy_1',
  sid: 'sess_1',
  azp: 'https://academy.gamostudio.org',
  email: 'parent@example.org',
  email_verified: true,
  name: 'Pat Parent',
  iat: now - 5,
  exp: now + 60,
  ...over,
});
const baseEnv = (d1: unknown, over: Record<string, unknown> = {}) => ({
  ENVIRONMENT: 'production',
  DB: d1,
  SESSION_SECRET: SECRET,
  CLERK_APP_ID_ACADEMY: 'app_academy_test',
  PUBLIC_CLERK_PUBLISHABLE_KEY_ACADEMY: `pk_live_${Buffer.from(`${HOST}$`).toString('base64').replace(/=+$/, '')}`,
  CLERK_SECRET_KEY_ACADEMY: 'sk_live_academy',
  CLERK_JWT_KEY_ACADEMY: academyKeys.publicKey,
  CLERK_ISSUER_ACADEMY: `https://${HOST}`,
  CLERK_AUTHORIZED_PARTIES_ACADEMY: 'https://academy.gamostudio.org',
  ...over,
});

async function setup() {
  const d1 = createInMemoryD1();
  await applyMigrations(
    d1,
    readdirSync('packages/db/migrations')
      .filter((n) => n.endsWith('.sql'))
      .sort()
      .map((n) => readFileSync(`packages/db/migrations/${n}`, 'utf8')),
  );
  return { d1, db: createDb(d1) };
}

const call = (env: Record<string, unknown>, token: string | null, headers: Record<string, string> = {}) =>
  createAuthHandlers('academy').clerkSessionPOST({
    request: new Request('https://academy.gamostudio.org/api/auth/clerk-session', {
      method: 'POST',
      headers: {
        origin: 'https://academy.gamostudio.org',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    }),
    locals: { runtime: { env }, product: 'academy' },
  });

test('a valid Clerk token becomes a 7-day Gamo session cookie that keeps working after the Clerk token expires', async () => {
  const { d1, db } = await setup();
  const env = baseEnv(d1);
  const res = await call(env, sign(academyKeys.privateKey, claims()));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { user: { email: string }; sessionId: string } };
  assert.equal(body.data.user.email, 'parent@example.org');

  const cookie = res.headers.get('set-cookie')!;
  assert.match(cookie, /^__session=[^;]+\.[^;]+;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.ok(!/Domain=/i.test(cookie), 'host-only: no cookie shared with sibling subdomains');

  const row = (await d1
    .prepare('SELECT product, expires_at AS expiresAt FROM sessions WHERE id = ?')
    .bind(body.data.sessionId)
    .first()) as { product: string; expiresAt: number } | null;
  assert.equal(row?.product, 'academy');
  const days = (row!.expiresAt * 1000 - Date.now()) / 86_400_000;
  assert.ok(days > 6.9 && days <= 7.01, `expires in ${days} days`);

  // Later: the Clerk token in the browser expired, only the Gamo cookie is left.
  const later = new Request('https://academy.gamostudio.org/family', {
    headers: {
      cookie: `__session=${sign(academyKeys.privateKey, claims({ exp: now - 600, iat: now - 700 }))}; ${cookie.split(';')[0]}`,
    },
  });
  const session = await resolveAuth(later, db, { secret: SECRET, product: 'academy', env: env as never });
  assert.equal(session?.user.email, 'parent@example.org');
  assert.deepEqual(session?.products, ['academy']);

  // A suspended Clerk identity ends the Gamo session too.
  await d1.prepare("UPDATE clerk_identity_links SET status = 'suspended' WHERE product = 'academy'").run();
  assert.equal(await resolveAuth(later, db, { secret: SECRET, product: 'academy', env: env as never }), null);
});

test('refuses: no token, another product’s token, expired or forged tokens, cross-origin calls, Clerk off', async () => {
  const { d1 } = await setup();
  const env = baseEnv(d1);
  assert.equal((await call(env, null)).status, 401);
  assert.equal((await call(env, 'not.a.jwt')).status, 401);
  assert.equal(
    (await call(env, sign(otherKeys.privateKey, claims()))).status,
    401,
    'signed by another Clerk application',
  );
  assert.equal(
    (await call(env, sign(academyKeys.privateKey, claims({ exp: now - 600, iat: now - 700 })))).status,
    401,
    'expired',
  );
  assert.equal(
    (await call(env, sign(academyKeys.privateKey, claims({ azp: 'https://worship.gamostudio.org' })))).status,
    401,
    'wrong authorized party',
  );
  assert.equal(
    (await call(env, sign(academyKeys.privateKey, claims({ iss: 'https://elsewhere.clerk.accounts.dev' }))))
      .status,
    401,
    'wrong issuer',
  );
  assert.equal(
    (await call(env, sign(academyKeys.privateKey, claims()), { origin: 'https://evil.example' })).status,
    403,
    'cross-origin',
  );
  // An unverified email is refused (no secret key here, so Clerk's Backend API is never contacted).
  const offline = baseEnv(d1, { CLERK_SECRET_KEY_ACADEMY: undefined });
  assert.equal(
    (await call(offline, sign(academyKeys.privateKey, claims({ email_verified: false })))).status,
    403,
  );

  const off = await call(
    baseEnv(d1, { CLERK_SECRET_KEY_ACADEMY: undefined, CLERK_JWT_KEY_ACADEMY: undefined }),
    sign(academyKeys.privateKey, claims()),
  );
  assert.equal(off.status, 503);
  const generic = await call(
    {
      ENVIRONMENT: 'production',
      DB: d1,
      SESSION_SECRET: SECRET,
      PUBLIC_CLERK_PUBLISHABLE_KEY: baseEnv(d1).PUBLIC_CLERK_PUBLISHABLE_KEY_ACADEMY,
      CLERK_SECRET_KEY: 'sk_live_x',
    },
    sign(academyKeys.privateKey, claims()),
  );
  assert.equal(generic.status, 503, 'un-suffixed names do not enable Clerk on a deployed Worker');
});
