import type { GamoEnv } from '@gamo/config/env';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  signValue,
  verifySignedValue,
  generateSessionId,
  buildSessionCookie,
  buildClearSessionCookie,
  extractSessionCookie,
  hasSystemRole,
  isStaffOrAdmin,
  hasOrgRole,
  type SessionData,
} from './index.ts';

describe('Auth & Session Cookie Cryptography', () => {
  const secret = 'super_secret_test_key_minimum_32_characters_long_12345';

  test('signs and verifies a session ID with HMAC-SHA256', async () => {
    const sessionId = generateSessionId();
    assert.equal(sessionId.length, 48);

    const signed = await signValue(sessionId, secret);
    assert.ok(signed.startsWith(`${sessionId}.`));

    const verified = await verifySignedValue(signed, secret);
    assert.equal(verified, sessionId);
  });

  test('rejects tampered signed values', async () => {
    const sessionId = generateSessionId();
    const signed = await signValue(sessionId, secret);

    // Tamper with session id
    const tamperedPayload = 'tampered' + signed.slice(8);
    const result1 = await verifySignedValue(tamperedPayload, secret);
    assert.equal(result1, null);

    // Tamper with signature
    const tamperedSig = signed.slice(0, -2) + 'xx';
    const result2 = await verifySignedValue(tamperedSig, secret);
    assert.equal(result2, null);
  });

  test('rejects signatures created with a different secret', async () => {
    const sessionId = generateSessionId();
    const signed = await signValue(sessionId, secret);

    const wrongSecret = 'another_secret_key_minimum_32_characters_long_abcde';
    const verified = await verifySignedValue(signed, wrongSecret);
    assert.equal(verified, null);
  });

  test('serializes and extracts HTTP-only session cookie', () => {
    const expires = new Date('2026-12-31T00:00:00Z');
    const cookie = buildSessionCookie('test_session_token_123', expires, {
      domain: '.gamostudio.org',
      secure: true,
      sameSite: 'Lax',
    });

    assert.ok(cookie.includes('__session=test_session_token_123'));
    assert.ok(cookie.includes('HttpOnly'));
    assert.ok(cookie.includes('Secure'));
    assert.ok(cookie.includes('SameSite=Lax'));
    assert.ok(cookie.includes('Domain=.gamostudio.org'));

    // Test extraction from incoming request
    const mockRequest = new Request('https://gamostudio.org', {
      headers: {
        cookie: 'theme=light; __session=test_session_token_123; tracking=no',
      },
    });

    const extracted = extractSessionCookie(mockRequest);
    assert.equal(extracted, 'test_session_token_123');
  });

  test('builds cleared session cookie on logout', () => {
    const clearCookie = buildClearSessionCookie();
    assert.ok(clearCookie.includes('__session=;'));
    assert.ok(clearCookie.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'));
  });
});

describe('Authorization & Multi-Tenant Role Enforcement', () => {
  const mockStaffSession: SessionData = {
    user: {
      id: 'usr_staff_1',
      email: 'jordan@gamostudio.org',
      displayName: 'Jordan Avery',
      verifiedEmailAt: new Date(0),
      status: 'active',
      createdAt: new Date(0),
    },
    roles: ['staff_reviewer'],
    memberships: [
      {
        organizationId: 'org_gamo_ops',
        role: 'admin',
        orgName: 'Gamo Operations',
        orgSlug: 'gamo-ops',
        orgType: 'ministry',
        status: 'active',
      },
    ],
    sessionId: 'sess_1',
    expiresAt: new Date(Date.now() + 86400000),
  };

  const mockOrganizerSession: SessionData = {
    user: {
      id: 'usr_organizer_1',
      email: 'pastor@riverside.org',
      displayName: 'Pastor David',
      verifiedEmailAt: new Date(0),
      status: 'active',
      createdAt: new Date(0),
    },
    roles: ['organizer'],
    memberships: [
      {
        organizationId: 'org_riverside_1',
        role: 'owner',
        orgName: 'Riverside Fellowship',
        orgSlug: 'riverside-fellowship',
        orgType: 'church',
        status: 'active',
      },
    ],
    sessionId: 'sess_2',
    expiresAt: new Date(Date.now() + 86400000),
  };

  test('correctly identifies staff roles and capabilities', () => {
    assert.equal(hasSystemRole(mockStaffSession, 'staff_reviewer'), true);
    assert.equal(hasSystemRole(mockStaffSession, 'worship_leader'), false);
    assert.equal(isStaffOrAdmin(mockStaffSession), true);

    assert.equal(hasSystemRole(mockOrganizerSession, 'staff_reviewer'), false);
    assert.equal(isStaffOrAdmin(mockOrganizerSession), false);
  });

  test('strictly enforces tenant isolation across organizations', () => {
    // Organizer has owner role on their own organization
    assert.equal(hasOrgRole(mockOrganizerSession, 'org_riverside_1', ['owner']), true);
    assert.equal(hasOrgRole(mockOrganizerSession, 'org_riverside_1', ['member', 'admin', 'owner']), true);

    // Cross-tenant access denied: organizer attempting to act on a different organization
    assert.equal(hasOrgRole(mockOrganizerSession, 'org_cornerstone_2', ['owner', 'admin']), false);
    assert.equal(hasOrgRole(mockOrganizerSession, 'org_gamo_ops', ['member']), false);
  });

  test('superadmin role overrides organization checks', () => {
    const superAdminSession: SessionData = {
      user: {
        id: 'usr_super_1',
        email: 'admin@gamostudio.org',
        displayName: 'Super Admin',
        verifiedEmailAt: new Date(0),
        status: 'active',
        createdAt: new Date(0),
      },
      roles: ['superadmin'],
      memberships: [],
      sessionId: 'sess_admin',
      expiresAt: new Date(Date.now() + 86400000),
    };

    assert.equal(hasSystemRole(superAdminSession, 'staff_reviewer'), true);
    assert.equal(isStaffOrAdmin(superAdminSession), true);
    // Superadmin has access to any org
    assert.equal(hasOrgRole(superAdminSession, 'org_riverside_1', ['owner']), true);
  });
});

import { generateKeyPairSync, createSign } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInMemoryD1, applyMigrations } from '@gamo/db/testing';
import {
  createDb,
  users,
  productAccounts,
  organizations,
  organizationMembers,
  clerkIdentityLinks,
} from '@gamo/db';
import { eq } from 'drizzle-orm';
import {
  CLERK_PRODUCT_APPS,
  resolveProductClerkConfig,
  resolveAuth,
  requireProductAuth,
  AuthError,
} from './index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORSHIP_CLERK_APP_ID = 'app_worship_isolated_instance_88';

function signTestClerkJwt(
  privateKeyPem: string,
  payload: Record<string, unknown>,
  kid = 'ins_test_key_1',
): string {
  const header = { alg: 'RS256', typ: 'JWT', kid };
  const encode = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer
    .sign(privateKeyPem)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${signingInput}.${signature}`;
}

function buildTestPublishableKey(frontendApiHost: string): string {
  const b64 = Buffer.from(`${frontendApiHost}$`).toString('base64').replace(/=+$/, '');
  return `pk_test_${b64}`;
}

describe('Independent Clerk Applications & Product Account Isolation', () => {
  const sessionSecret = 'super_secret_test_key_minimum_32_characters_long_12345';

  // Generate separate RSA keypairs for Gamo Worship and Gamo Academy Clerk instances
  const worshipKeys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const academyKeys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const worshipIssuer = 'https://worship-instance-01.clerk.accounts.dev';
  const academyIssuer = 'https://academy-instance-02.clerk.accounts.dev';

  const testEnv: GamoEnv = {
    SESSION_SECRET: sessionSecret,
    CLERK_APP_ID_WORSHIP: WORSHIP_CLERK_APP_ID,
    PUBLIC_CLERK_PUBLISHABLE_KEY_WORSHIP: buildTestPublishableKey('worship-instance-01.clerk.accounts.dev'),
    CLERK_SECRET_KEY_WORSHIP: 'sk_test_worship_isolated_secret_key',
    CLERK_JWT_KEY_WORSHIP: worshipKeys.publicKey,
    CLERK_ISSUER_WORSHIP: worshipIssuer,
    CLERK_AUTHORIZED_PARTIES_WORSHIP: 'http://127.0.0.1:4322,https://worship.gamostudio.org',

    CLERK_APP_ID_ACADEMY: 'app_academy_isolated_instance_99',
    PUBLIC_CLERK_PUBLISHABLE_KEY_ACADEMY: buildTestPublishableKey('academy-instance-02.clerk.accounts.dev'),
    CLERK_SECRET_KEY_ACADEMY: 'sk_test_academy_isolated_secret_key',
    CLERK_JWT_KEY_ACADEMY: academyKeys.publicKey,
    CLERK_ISSUER_ACADEMY: academyIssuer,
    CLERK_AUTHORIZED_PARTIES_ACADEMY: 'http://127.0.0.1:4323,https://academy.gamostudio.org',
  };

  async function createMigratedDb() {
    const d1 = createInMemoryD1();
    const migrationDir = resolve(__dirname, '../db/migrations');
    const sqlFiles = readdirSync(migrationDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(resolve(migrationDir, f), 'utf-8'));
    await applyMigrations(d1, sqlFiles);
    return createDb(d1);
  }

  test('lists one Clerk application per remaining product; the removed Gamo Live has none', () => {
    assert.deepEqual(Object.keys(CLERK_PRODUCT_APPS).sort(), ['academy', 'production', 'web', 'worship']);
    assert.equal(CLERK_PRODUCT_APPS.web.provisioningStatus, 'pending_founder_provisioning');
    assert.equal(CLERK_PRODUCT_APPS.worship.provisioningStatus, 'pending_founder_provisioning');
    assert.equal(CLERK_PRODUCT_APPS.academy.provisioningStatus, 'pending_founder_provisioning');
    assert.equal(CLERK_PRODUCT_APPS.production.provisioningStatus, 'pending_founder_provisioning');

    // Stale Gamo Live keys in the environment never switch Clerk on for 'live'
    assert.equal(
      resolveProductClerkConfig('live', {
        ...testEnv,
        PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE: testEnv.PUBLIC_CLERK_PUBLISHABLE_KEY_WORSHIP,
        CLERK_SECRET_KEY_LIVE: 'sk_test_stale_live_key',
      }).isConfigured,
      false,
    );
    assert.equal(resolveProductClerkConfig('worship', testEnv).isConfigured, true);
  });

  test('authenticates a valid Gamo Worship Clerk JWT on Gamo Worship and provisions isolated product account', async () => {
    const db = await createMigratedDb();
    const nowSec = Math.floor(Date.now() / 1000);
    const token = signTestClerkJwt(worshipKeys.privateKey, {
      iss: worshipIssuer,
      sub: 'user_2worshipClerk999',
      sid: 'sess_worshipClerk999',
      azp: 'https://worship.gamostudio.org',
      email: 'artist@worshipcollective.org',
      email_verified: true,
      name: 'Naomi Brooks',
      iat: nowSec - 10,
      exp: nowSec + 3600,
    });

    const req = new Request('https://worship.gamostudio.org/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const session = await resolveAuth(req, db, {
      secret: sessionSecret,
      product: 'worship',
      env: testEnv,
    });

    assert.ok(session, 'Expected Gamo Worship Clerk session to resolve');
    assert.equal(session.sessionProduct, 'worship');
    assert.equal(session.user.email, 'artist@worshipcollective.org');
    assert.equal(session.user.displayName, 'Naomi Brooks');
    assert.deepEqual(session.products, ['worship']);

    const links = await db.select().from(clerkIdentityLinks);
    assert.equal(links.length, 1);
    assert.equal(links[0]!.product, 'worship');
    assert.equal(links[0]!.clerkAppId, WORSHIP_CLERK_APP_ID);
    assert.equal(links[0]!.clerkUserId, 'user_2worshipClerk999');
  });

  test('rejects a valid Gamo Worship Clerk JWT when presented to Academy, Production, or Studios', async () => {
    const db = await createMigratedDb();
    const nowSec = Math.floor(Date.now() / 1000);
    const worshipToken = signTestClerkJwt(worshipKeys.privateKey, {
      iss: worshipIssuer,
      sub: 'user_2worshipClerkCrossTest',
      sid: 'sess_worshipClerkCrossTest',
      azp: 'https://worship.gamostudio.org',
      email: 'crossproduct@example.org',
      email_verified: true,
      iat: nowSec - 10,
      exp: nowSec + 3600,
    });

    for (const targetProduct of ['academy', 'production', 'web'] as const) {
      const req = new Request(`https://${targetProduct}.gamostudio.org/api/auth/me`, {
        headers: { Authorization: `Bearer ${worshipToken}` },
      });

      const resolved = await resolveAuth(req, db, {
        secret: sessionSecret,
        product: targetProduct,
        env: testEnv,
      });
      assert.equal(resolved, null, `Gamo Worship token must not authenticate against ${targetProduct}`);

      await assert.rejects(
        () =>
          requireProductAuth(req, db, targetProduct, {
            secret: sessionSecret,
            env: testEnv,
          }),
        (err: unknown) => err instanceof AuthError && err.status === 401,
      );
    }
  });

  test('keeps accounts strictly separate when the same email registers on Gamo Worship and Gamo Academy', async () => {
    const db = await createMigratedDb();
    const sharedEmail = 'family@gracefellowship.org';
    const nowSec = Math.floor(Date.now() / 1000);

    const worshipToken = signTestClerkJwt(worshipKeys.privateKey, {
      iss: worshipIssuer,
      sub: 'user_worship_same_email_1',
      sid: 'sess_worship_1',
      azp: 'https://worship.gamostudio.org',
      email: sharedEmail,
      email_verified: true,
      name: 'Grace Worship Coordinator',
      iat: nowSec - 10,
      exp: nowSec + 3600,
    });

    const academyToken = signTestClerkJwt(academyKeys.privateKey, {
      iss: academyIssuer,
      sub: 'user_academy_same_email_2',
      sid: 'sess_academy_2',
      azp: 'https://academy.gamostudio.org',
      email: sharedEmail,
      email_verified: true,
      name: 'Grace Academy Parent',
      iat: nowSec - 10,
      exp: nowSec + 3600,
    });

    const worshipSession = await resolveAuth(
      new Request('https://worship.gamostudio.org/account', {
        headers: { Authorization: `Bearer ${worshipToken}` },
      }),
      db,
      { secret: sessionSecret, product: 'worship', env: testEnv },
    );

    const academySession = await resolveAuth(
      new Request('https://academy.gamostudio.org/account', {
        headers: { Authorization: `Bearer ${academyToken}` },
      }),
      db,
      { secret: sessionSecret, product: 'academy', env: testEnv },
    );

    assert.ok(worshipSession);
    assert.ok(academySession);

    // Must be two completely independent D1 users and product accounts
    assert.notEqual(
      worshipSession.user.id,
      academySession.user.id,
      'Identical email across independent Clerk apps must NEVER auto-merge D1 users',
    );
    assert.equal(worshipSession.user.email, sharedEmail);
    assert.equal(academySession.user.email, sharedEmail);
    assert.deepEqual(worshipSession.products, ['worship']);
    assert.deepEqual(academySession.products, ['academy']);
  });

  test('safely claims pre-existing same-product legacy D1 account on verified Clerk login while preserving domain ownership', async () => {
    const db = await createMigratedDb();
    const now = new Date();
    const legacyUserId = 'usr_legacy_worship_coordinator';
    const legacyEmail = 'pastor.legacy@cornerstone.org';

    await db.insert(users).values({
      id: legacyUserId,
      email: legacyEmail,
      verifiedEmailAt: now,
      displayName: 'Pastor Legacy',
      status: 'active',
      createdAt: now,
    });

    await db.insert(productAccounts).values({
      id: 'pa_legacy_worship_1',
      userId: legacyUserId,
      product: 'worship',
      status: 'active',
      onboardingStatus: 'completed',
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(organizations).values({
      id: 'org_cornerstone_legacy',
      name: 'Cornerstone Church',
      slug: 'cornerstone-church',
      type: 'church',
      verifiedAt: now,
      createdAt: now,
    });

    await db.insert(organizationMembers).values({
      id: 'om_cornerstone_owner',
      organizationId: 'org_cornerstone_legacy',
      userId: legacyUserId,
      role: 'owner',
      createdAt: now,
    });

    const nowSec = Math.floor(Date.now() / 1000);
    const worshipToken = signTestClerkJwt(worshipKeys.privateKey, {
      iss: worshipIssuer,
      sub: 'user_clerk_claimed_legacy',
      sid: 'sess_clerk_claimed_legacy',
      azp: 'https://worship.gamostudio.org',
      email: legacyEmail,
      email_verified: true,
      iat: nowSec - 10,
      exp: nowSec + 3600,
    });

    const session = await resolveAuth(
      new Request('https://worship.gamostudio.org/workspaces', {
        headers: { Authorization: `Bearer ${worshipToken}` },
      }),
      db,
      { secret: sessionSecret, product: 'worship', env: testEnv },
    );

    assert.ok(session);
    assert.equal(session.user.id, legacyUserId, 'Should preserve legacy D1 user ID for same-product account');
    assert.equal(session.memberships.length, 1);
    assert.equal(session.memberships[0]!.organizationId, 'org_cornerstone_legacy');
    assert.equal(session.memberships[0]!.role, 'owner');

    const [link] = await db
      .select()
      .from(clerkIdentityLinks)
      .where(eq(clerkIdentityLinks.clerkUserId, 'user_clerk_claimed_legacy'))
      .limit(1);
    assert.ok(link);
    assert.equal(link.migrationSource, 'verified_domain_claim');
    assert.equal(link.userId, legacyUserId);
  });
});
