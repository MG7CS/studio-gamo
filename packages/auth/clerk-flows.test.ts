/**
 * Clerk session handling with Clerk mocked: signing keys are generated here, Clerk's Backend API is
 * answered by a stub, and nothing leaves the machine. Covers token verification (issuer, authorized
 * parties, key format, clock skew, cross-product replay), what happens when Clerk is unreachable or
 * unconfigured, and how Clerk users map onto D1 rows.
 *
 * Not coverable without a live Clerk instance (see docs/AUTH.md "Manual test script"): Clerk's own
 * emails, its hosted bot protection, and the browser SDK.
 */
import { createSign, generateKeyPairSync } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import type { GamoEnv } from '@gamo/config/env';
import { createDb, clerkIdentityLinks, productAccounts, roles, userRoles, users } from '@gamo/db';
import { applyMigrations, createInMemoryD1 } from '@gamo/db/testing';

// Clerk's Backend client binds `fetch` when it is first imported, so install a switchable stub first.
const realFetch = globalThis.fetch;
let clerkApi: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  clerkApi ? clerkApi(String(input), init) : realFetch(input, init)) as typeof fetch;
after(() => {
  globalThis.fetch = realFetch;
});

const {
  ClerkUnavailableError,
  resolveAuth,
  resolveProductClerkConfig,
  verifyClerkProductToken,
  resolveOrProvisionClerkProductSession,
  extractSessionCookie,
  AuthError,
} = await import('./index.ts');

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_SECRET = 'super_secret_test_key_minimum_32_characters_long_12345';

const pair = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
const webKeys = pair();
const worshipKeys = pair();

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function signJwt(privateKeyPem: string, payload: Record<string, unknown>, header: object = {}): string {
  const head = { alg: 'RS256', typ: 'JWT', kid: 'ins_test_key', ...header };
  const input = `${b64url(JSON.stringify(head))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  return `${input}.${b64url(signer.sign(privateKeyPem))}`;
}

const publishableKey = (host: string) =>
  `pk_test_${Buffer.from(`${host}$`).toString('base64').replace(/=+$/, '')}`;
const WEB_HOST = 'web-instance.clerk.accounts.dev';
const WORSHIP_HOST = 'worship-instance.clerk.accounts.dev';

const baseEnv: GamoEnv = {
  SESSION_SECRET,
  CLERK_APP_ID_WEB: 'app_web_test_instance',
  PUBLIC_CLERK_PUBLISHABLE_KEY_WEB: publishableKey(WEB_HOST),
  CLERK_SECRET_KEY_WEB: 'sk_test_web_secret',
  CLERK_JWT_KEY_WEB: webKeys.publicKey,
  CLERK_ISSUER_WEB: `https://${WEB_HOST}`,
  CLERK_AUTHORIZED_PARTIES_WEB: 'https://gamostudio.org,http://127.0.0.1:4321',
  CLERK_APP_ID_WORSHIP: 'app_worship_test_instance',
  PUBLIC_CLERK_PUBLISHABLE_KEY_WORSHIP: publishableKey(WORSHIP_HOST),
  CLERK_SECRET_KEY_WORSHIP: 'sk_test_worship_secret',
  CLERK_JWT_KEY_WORSHIP: worshipKeys.publicKey,
  CLERK_ISSUER_WORSHIP: `https://${WORSHIP_HOST}`,
  CLERK_AUTHORIZED_PARTIES_WORSHIP: 'https://worship.gamostudio.org',
};

const now = () => Math.floor(Date.now() / 1000);
const webClaims = (over: Record<string, unknown> = {}) => ({
  iss: `https://${WEB_HOST}`,
  sub: 'user_web_1',
  sid: 'sess_web_1',
  azp: 'https://gamostudio.org',
  email: 'visitor@example.org',
  email_verified: true,
  name: 'Visitor One',
  iat: now() - 10,
  exp: now() + 600,
  ...over,
});
const webToken = (over: Record<string, unknown> = {}) => signJwt(webKeys.privateKey, webClaims(over));
const bearer = (token: string, url = 'https://gamostudio.org/account') =>
  new Request(url, { headers: { Authorization: `Bearer ${token}` } });

async function migratedDb() {
  const d1 = createInMemoryD1();
  const dir = resolve(__dirname, '../db/migrations');
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(resolve(dir, f), 'utf8'));
  await applyMigrations(d1, sql);
  return createDb(d1);
}

describe('token verification', () => {
  test('a valid token for the product resolves a product-scoped session', async () => {
    const db = await migratedDb();
    const session = await resolveAuth(bearer(webToken()), db, {
      secret: SESSION_SECRET,
      product: 'web',
      env: baseEnv,
    });
    assert.ok(session);
    assert.equal(session.user.email, 'visitor@example.org');
    assert.deepEqual(session.products, ['web']);
    assert.equal(session.sessionProduct, 'web');
  });

  test('expired, tampered, unsigned and wrong-algorithm tokens are refused', async () => {
    const db = await migratedDb();
    const resolve = (token: string) =>
      resolveAuth(bearer(token), db, { secret: SESSION_SECRET, product: 'web', env: baseEnv });
    assert.equal(await resolve(webToken({ exp: now() - 3600, iat: now() - 7200 })), null, 'expired');
    const good = webToken();
    const [h, , s] = good.split('.');
    const forgedPayload = b64url(
      JSON.stringify(webClaims({ sub: 'user_attacker', email: 'admin@example.org' })),
    );
    assert.equal(await resolve(`${h}.${forgedPayload}.${s}`), null, 'payload swapped, signature kept');
    assert.equal(await resolve(`${b64url('{"alg":"none"}')}.${forgedPayload}.`), null, 'alg none');
    assert.equal(
      await resolve(signJwt(worshipKeys.privateKey, webClaims())),
      null,
      'signed with another key',
    );
    assert.equal(await resolve('a.b.c'), null, 'garbage');
    assert.equal((await db.select().from(clerkIdentityLinks)).length, 0, 'no account was created');
  });

  test('clock skew: a few seconds past expiry is tolerated, a minute is not', async () => {
    const db = await migratedDb();
    const env = baseEnv;
    const identity = (token: string) => verifyClerkProductToken(token, 'web', env);
    assert.ok(await identity(webToken({ exp: now() - 2 })), 'expired 2 s ago: within skew');
    assert.equal(await identity(webToken({ exp: now() - 60 })), null, 'expired 60 s ago');
    assert.equal(await identity(webToken({ nbf: now() + 120, iat: now() + 120 })), null, 'not yet valid');
    void db;
  });

  test('issuer must match this product’s Clerk instance (trailing slash ignored)', async () => {
    assert.ok(await verifyClerkProductToken(webToken({ iss: `https://${WEB_HOST}/` }), 'web', baseEnv));
    assert.equal(
      await verifyClerkProductToken(webToken({ iss: 'https://other.clerk.accounts.dev' }), 'web', baseEnv),
      null,
    );
  });

  test('authorized party (azp) must be one of the product’s origins', async () => {
    assert.equal(
      await verifyClerkProductToken(webToken({ azp: 'https://worship.gamostudio.org' }), 'web', baseEnv),
      null,
    );
    assert.equal(
      await verifyClerkProductToken(webToken({ azp: 'https://evil.example' }), 'web', baseEnv),
      null,
    );
  });

  test('a token from product A is rejected by product B, in both directions', async () => {
    const worshipToken = signJwt(worshipKeys.privateKey, {
      ...webClaims(),
      iss: `https://${WORSHIP_HOST}`,
      azp: 'https://worship.gamostudio.org',
    });
    assert.ok(await verifyClerkProductToken(worshipToken, 'worship', baseEnv));
    assert.equal(await verifyClerkProductToken(worshipToken, 'web', baseEnv), null, 'worship token on web');
    assert.equal(await verifyClerkProductToken(webToken(), 'worship', baseEnv), null, 'web token on worship');
    const db = await migratedDb();
    const onWorship = await resolveAuth(bearer(webToken(), 'https://worship.gamostudio.org/account'), db, {
      secret: SESSION_SECRET,
      product: 'worship',
      env: baseEnv,
    });
    assert.equal(onWorship, null);
  });

  test('the signing key may be stored as PEM with real newlines, as one line with literal \\n, or quoted', async () => {
    const variants = [
      webKeys.publicKey,
      webKeys.publicKey.trim().replace(/\n/g, '\\n'),
      `"${webKeys.publicKey.trim().replace(/\n/g, '\\n')}"`,
      webKeys.publicKey.replace(/\n/g, '\r\n'),
    ];
    for (const key of variants) {
      const identity = await verifyClerkProductToken(webToken(), 'web', {
        ...baseEnv,
        CLERK_JWT_KEY_WEB: key,
      });
      assert.ok(identity, `variant starting ${JSON.stringify(key.slice(0, 30))}`);
    }
  });

  test('a token without email claims is completed from Clerk’s Backend API; an unverified address is refused', async () => {
    const calls: string[] = [];
    clerkApi = async (url) => {
      calls.push(url);
      return new Response(
        JSON.stringify({
          object: 'user',
          id: 'user_web_1',
          first_name: 'Visitor',
          last_name: 'One',
          primary_email_address_id: 'idn_1',
          email_addresses: [
            {
              object: 'email_address',
              id: 'idn_1',
              email_address: 'looked-up@example.org',
              verification: { status: 'verified', strategy: 'email_code' },
              linked_to: [],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    try {
      const identity = await verifyClerkProductToken(
        webToken({ email: undefined, email_verified: undefined }),
        'web',
        baseEnv,
      );
      assert.equal(identity?.email, 'looked-up@example.org');
      assert.equal(identity?.emailVerified, true);
      assert.ok(calls.some((u) => u.includes('/users/user_web_1')));
    } finally {
      clerkApi = null;
    }

    const db = await migratedDb();
    const unverified = await verifyClerkProductToken(webToken({ email_verified: false }), 'web', {
      ...baseEnv,
      CLERK_SECRET_KEY_WEB: undefined,
    });
    assert.ok(unverified);
    await assert.rejects(
      resolveOrProvisionClerkProductSession(db, unverified),
      (e: unknown) => e instanceof AuthError && e.status === 403,
    );
  });
});

describe('Clerk unreachable or not configured', () => {
  const noEmail = () => webToken({ email: undefined, email_verified: undefined });

  test('network failure and 5xx are reported as unavailable, not as "signed out"', async () => {
    for (const handler of [
      async () => {
        throw new TypeError('fetch failed');
      },
      async () => new Response('{"errors":[{"message":"boom"}]}', { status: 503 }),
    ]) {
      clerkApi = handler;
      try {
        await assert.rejects(verifyClerkProductToken(noEmail(), 'web', baseEnv), ClerkUnavailableError);
      } finally {
        clerkApi = null;
      }
    }
  });

  test('a user Clerk no longer knows (404) is simply not signed in', async () => {
    clerkApi = async () =>
      new Response('{"errors":[{"code":"resource_not_found","message":"not found"}]}', {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    try {
      assert.equal(await verifyClerkProductToken(noEmail(), 'web', baseEnv), null);
    } finally {
      clerkApi = null;
    }
  });

  test('without the signing key, an unreachable key endpoint is "unavailable"; with it no network is needed', async () => {
    let calls = 0;
    clerkApi = async () => {
      calls++;
      throw new TypeError('fetch failed');
    };
    try {
      assert.ok(
        await verifyClerkProductToken(webToken(), 'web', baseEnv),
        'offline verification with the PEM',
      );
      assert.equal(calls, 0);
      await assert.rejects(
        verifyClerkProductToken(webToken(), 'web', { ...baseEnv, CLERK_JWT_KEY_WEB: undefined }),
        ClerkUnavailableError,
      );
    } finally {
      clerkApi = null;
    }
  });

  test('missing or placeholder keys leave Clerk off: tokens are ignored and the emailed-code session still works', async () => {
    for (const env of [
      { SESSION_SECRET } as GamoEnv,
      { ...baseEnv, PUBLIC_CLERK_PUBLISHABLE_KEY_WEB: 'pk_test_REPLACE_WITH_KEY' } as GamoEnv,
      { ...baseEnv, CLERK_SECRET_KEY_WEB: undefined, CLERK_JWT_KEY_WEB: undefined } as GamoEnv,
    ]) {
      const config = resolveProductClerkConfig('web', env);
      assert.equal(config.isConfigured, false);
      assert.equal(await verifyClerkProductToken(webToken(), 'web', env), null);
    }
  });

  test('a Clerk cookie never hides a valid Gamo cookie of the same name, and never authenticates when invalid', async () => {
    const jwt = webToken();
    const request = new Request('https://gamostudio.org/account', {
      headers: { cookie: `__session=${jwt}; __session=abc123.sig456` },
    });
    assert.equal(extractSessionCookie(request), 'abc123.sig456', 'the two-part Gamo cookie is picked');
    assert.equal(
      extractSessionCookie(
        new Request('https://gamostudio.org/', { headers: { cookie: `__session=${jwt}` } }),
      ),
      null,
    );
    const db = await migratedDb();
    const expired = new Request('https://gamostudio.org/account', {
      headers: { cookie: `__session=${webToken({ exp: now() - 3600, iat: now() - 7200 })}` },
    });
    assert.equal(
      await resolveAuth(expired, db, { secret: SESSION_SECRET, product: 'web', env: baseEnv }),
      null,
    );
  });

  test('un-suffixed Clerk names work only off-Cloudflare; a deployed Worker ignores them', () => {
    const generic = {
      SESSION_SECRET,
      PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey(WEB_HOST),
      CLERK_SECRET_KEY: 'sk_test_x',
      CLERK_APP_ID: 'app_web_generic',
    } as GamoEnv;
    assert.equal(resolveProductClerkConfig('web', { ...generic, ENVIRONMENT: 'local' }).isConfigured, true);
    for (const environment of ['preview', 'production'] as const) {
      const config = resolveProductClerkConfig('web', { ...generic, ENVIRONMENT: environment });
      assert.equal(config.isConfigured, false, `${environment} must ignore un-suffixed names`);
      assert.equal(config.publishableKey, undefined);
    }
  });
});

describe('Clerk users in D1', () => {
  const identity = async (over: Record<string, unknown> = {}, env: GamoEnv = baseEnv) => {
    const verified = await verifyClerkProductToken(webToken(over), 'web', env);
    assert.ok(verified);
    return verified;
  };

  test('first sign-in creates one user, one product account and one link; repeating or racing creates no duplicates', async () => {
    const db = await migratedDb();
    const who = await identity();
    const results = await Promise.all([
      resolveOrProvisionClerkProductSession(db, who).catch(() =>
        resolveOrProvisionClerkProductSession(db, who),
      ),
      resolveOrProvisionClerkProductSession(db, who).catch(() =>
        resolveOrProvisionClerkProductSession(db, who),
      ),
    ]);
    await resolveOrProvisionClerkProductSession(db, who);
    assert.equal(results[0].user.id, results[1].user.id);
    assert.equal((await db.select().from(users)).length, 1);
    assert.equal((await db.select().from(productAccounts)).length, 1);
    assert.equal((await db.select().from(clerkIdentityLinks)).length, 1);
    assert.equal(results[0].roles.length, 0, 'a new registration holds no roles');
  });

  test('changing the email in Clerk updates the link and the account; a taken address only updates the link', async () => {
    const db = await migratedDb();
    await resolveOrProvisionClerkProductSession(db, await identity());
    const changed = await resolveOrProvisionClerkProductSession(
      db,
      await identity({ email: 'new-address@example.org' }),
    );
    assert.equal(changed.user.email, 'new-address@example.org');
    const [link] = await db.select().from(clerkIdentityLinks);
    assert.equal(link.clerkEmail, 'new-address@example.org');
    assert.equal((await db.select().from(users)).length, 1, 'still one user');

    await db.insert(users).values({
      id: 'usr_other',
      email: 'taken@example.org',
      displayName: null,
      verifiedEmailAt: new Date(),
      status: 'active',
      createdAt: new Date(),
    });
    const blocked = await resolveOrProvisionClerkProductSession(
      db,
      await identity({ email: 'taken@example.org' }),
    );
    assert.equal(blocked.user.id, changed.user.id, 'same account, never merged into the other user');
    assert.equal(
      (await db.select().from(users).where(eq(users.id, 'usr_other')))[0].email,
      'taken@example.org',
    );
    assert.equal(
      (await db.select().from(users).where(eq(users.id, changed.user.id)))[0].email,
      'new-address@example.org',
    );
  });

  test('an email change in one product never moves the address another product signs in with', async () => {
    const db = await migratedDb();
    const first = await resolveOrProvisionClerkProductSession(db, await identity());
    const before = (await db.select().from(users).where(eq(users.id, first.user.id)))[0].email;
    await db.insert(productAccounts).values({
      id: 'pacc_academy_shared',
      userId: first.user.id,
      product: 'academy',
      status: 'active',
      onboardingStatus: 'completed',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await resolveOrProvisionClerkProductSession(db, await identity({ email: 'moved@example.org' }));
    const [link] = await db.select().from(clerkIdentityLinks);
    assert.equal(link.clerkEmail, 'moved@example.org', 'the link follows Clerk');
    assert.equal(
      (await db.select().from(users).where(eq(users.id, first.user.id)))[0].email,
      before,
      'the shared address is unchanged',
    );
  });

  test('a revoked link or a disabled user is refused even with a valid token', async () => {
    const db = await migratedDb();
    const session = await resolveOrProvisionClerkProductSession(db, await identity());
    await db
      .update(clerkIdentityLinks)
      .set({ status: 'revoked' })
      .where(eq(clerkIdentityLinks.userId, session.user.id));
    await assert.rejects(
      resolveOrProvisionClerkProductSession(db, await identity()),
      (e: unknown) => e instanceof AuthError && e.status === 403,
    );
    await db
      .update(clerkIdentityLinks)
      .set({ status: 'active' })
      .where(eq(clerkIdentityLinks.userId, session.user.id));
    await db.update(users).set({ status: 'disabled' }).where(eq(users.id, session.user.id));
    await assert.rejects(
      resolveOrProvisionClerkProductSession(db, await identity()),
      (e: unknown) => e instanceof AuthError && e.status === 403,
    );
  });

  test('roles: unscoped and this-product roles apply; another product’s roles never do', async () => {
    const db = await migratedDb();
    const first = await resolveOrProvisionClerkProductSession(db, await identity());
    const when = new Date();
    for (const [id, code] of [
      ['role_t_a', 'test_unscoped'],
      ['role_t_b', 'test_web_scoped'],
      ['role_t_c', 'test_live_scoped'],
    ] as const) {
      await db.insert(roles).values({ id, code, description: null });
    }
    await db.insert(userRoles).values([
      {
        id: 'ur_a',
        userId: first.user.id,
        roleId: 'role_t_a',
        scopeType: null,
        scopeId: null,
        createdAt: when,
      },
      {
        id: 'ur_b',
        userId: first.user.id,
        roleId: 'role_t_b',
        scopeType: 'program',
        scopeId: 'web',
        createdAt: when,
      },
      {
        id: 'ur_c',
        userId: first.user.id,
        roleId: 'role_t_c',
        scopeType: 'program',
        scopeId: 'live',
        createdAt: when,
      },
    ]);
    const again = await resolveOrProvisionClerkProductSession(db, await identity());
    assert.deepEqual([...again.roles].sort(), ['test_unscoped', 'test_web_scoped']);
  });

  test('the same Clerk user id and email in two products are two unrelated accounts', async () => {
    const db = await migratedDb();
    const web = await resolveOrProvisionClerkProductSession(db, await identity());
    const worshipVerified = await verifyClerkProductToken(
      signJwt(worshipKeys.privateKey, {
        ...webClaims(),
        iss: `https://${WORSHIP_HOST}`,
        azp: 'https://worship.gamostudio.org',
      }),
      'worship',
      baseEnv,
    );
    assert.ok(worshipVerified);
    const worship = await resolveOrProvisionClerkProductSession(db, worshipVerified);
    assert.notEqual(web.user.id, worship.user.id);
    assert.deepEqual(worship.products, ['worship']);
    assert.equal((await db.select().from(clerkIdentityLinks)).length, 2);
  });
});
