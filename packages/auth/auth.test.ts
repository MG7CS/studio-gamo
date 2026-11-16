import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInMemoryD1, applyMigrations } from '@gamo/db/testing';
import { createDb, users, roles, userRoles, sessions } from '@gamo/db';
import { eq } from 'drizzle-orm';
import * as auth from './index.ts';
import * as pageAccess from './page-access.ts';
import { isPrivatePage } from './page-access.ts';
import {
  signValue,
  verifySignedValue,
  generateSessionId,
  buildSessionCookie,
  buildClearSessionCookie,
  extractSessionCookie,
  hasSystemRole,
  isStaffOrAdmin,
  createSession,
  validateSession,
  resolveAuth,
  requireStaff,
  requireSuperadmin,
  requireSameOrigin,
  AuthError,
  type SessionData,
} from './index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const secret = 'super_secret_test_key_minimum_32_characters_long_12345';

describe('Auth & Session Cookie Cryptography', () => {
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

    const tamperedPayload = 'tampered' + signed.slice(8);
    assert.equal(await verifySignedValue(tamperedPayload, secret), null);

    const tamperedSig = signed.slice(0, -2) + 'xx';
    assert.equal(await verifySignedValue(tamperedSig, secret), null);
  });

  test('rejects signatures created with a different secret', async () => {
    const signed = await signValue(generateSessionId(), secret);
    const wrongSecret = 'another_secret_key_minimum_32_characters_long_abcde';
    assert.equal(await verifySignedValue(signed, wrongSecret), null);
  });

  test('serializes and extracts HTTP-only session cookie', () => {
    const expires = new Date('2026-12-31T00:00:00Z');
    const cookie = buildSessionCookie('test_session_token_123', expires, { secure: true, sameSite: 'Lax' });

    assert.ok(cookie.includes('__session=test_session_token_123'));
    assert.ok(cookie.includes('HttpOnly'));
    assert.ok(cookie.includes('Secure'));
    assert.ok(cookie.includes('SameSite=Lax'));

    const mockRequest = new Request('https://admin.gamostudio.org', {
      headers: { cookie: 'theme=light; __session=test_session_token_123; tracking=no' },
    });
    assert.equal(extractSessionCookie(mockRequest), 'test_session_token_123');
  });

  test('builds cleared session cookie on logout', () => {
    const clearCookie = buildClearSessionCookie();
    assert.ok(clearCookie.includes('__session=;'));
    assert.ok(clearCookie.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'));
  });
});

describe('Staff roles', () => {
  const session = (roleCodes: string[]): SessionData => ({
    user: {
      id: 'usr_1',
      email: 'staff@example.org',
      displayName: 'Example Staff',
      verifiedEmailAt: new Date(0),
      status: 'active',
      createdAt: new Date(0),
    },
    roles: roleCodes,
    sessionId: 'sess_1',
    expiresAt: new Date(Date.now() + 86400000),
  });

  test('staff_reviewer and superadmin are staff; other roles are not', () => {
    assert.equal(hasSystemRole(session(['staff_reviewer']), 'staff_reviewer'), true);
    assert.equal(hasSystemRole(session(['staff_reviewer']), 'worship_leader'), false);
    assert.equal(isStaffOrAdmin(session(['staff_reviewer'])), true);
    assert.equal(isStaffOrAdmin(session(['organizer'])), false);
    assert.equal(isStaffOrAdmin(null), false);
    assert.equal(hasSystemRole(session(['superadmin']), 'staff_reviewer'), true);
    assert.equal(isStaffOrAdmin(session(['superadmin'])), true);
  });
});

describe('Public product accounts are gone (2026-11-16)', () => {
  test('no public account, product or organization exports remain', () => {
    for (const name of [
      'PRODUCT_DISPLAY_NAMES',
      'hasProductAccess',
      'hasOrgRole',
      'requireVerifiedAuth',
      'requireProductAuth',
      'requireOrgAccess',
      'loadVerifiedChurchOrganizationIds',
      'resolveProductClerkConfig',
      'verifyClerkProductToken',
      'extractClerkJwtFromRequest',
      'resolveOrProvisionClerkProductSession',
      'ClerkUnavailableError',
      'CLERK_PRODUCT_APPS',
    ]) {
      assert.ok(!(name in auth), `${name} should no longer be exported`);
    }
  });

  test('public apps have no private pages left', () => {
    for (const [app, path] of [
      ['web', '/account'],
      ['web', '/partner/workspace'],
      ['worship', '/musician/profile'],
      ['worship', '/church'],
      ['academy', '/family'],
      ['production', '/crew/schedule'],
    ] as const)
      assert.equal(isPrivatePage(app, path), false, `${app} ${path}`);
    for (const name of ['canAccessPage', 'isIsolatedDemo', 'safeReturnPath', 'pageCacheControl'])
      assert.ok(!(name in pageAccess), `${name} should no longer be exported`);
  });

  test('the Clerk modules are deleted', () => {
    assert.equal(existsSync(resolve(__dirname, 'clerk.ts')), false);
    assert.equal(existsSync(resolve(__dirname, '../config/clerk-env.ts')), false);
  });
});

describe('Staff sessions in D1', () => {
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

  async function seedUser(db: Awaited<ReturnType<typeof createMigratedDb>>, id: string, role?: string) {
    await db.insert(users).values({
      id,
      email: `${id}@example.org`,
      displayName: 'Example',
      verifiedEmailAt: new Date(),
      status: 'active',
      createdAt: new Date(),
    });
    if (role) {
      const [existing] = await db.select().from(roles).where(eq(roles.code, role)).limit(1);
      const roleId = existing?.id ?? `role_${role}`;
      if (!existing) await db.insert(roles).values({ id: roleId, code: role, description: role });
      await db.insert(userRoles).values({ id: `ur_${id}`, userId: id, roleId, createdAt: new Date() });
    }
  }

  const adminRequest = (cookieValue: string, init: RequestInit = {}) =>
    new Request('https://admin.gamostudio.org/api/x', {
      ...init,
      headers: { cookie: `__session=${encodeURIComponent(cookieValue)}`, ...(init.headers ?? {}) },
    });

  test('a staff session resolves with roles only (no product or organization data)', async () => {
    const db = await createMigratedDb();
    await seedUser(db, 'usr_staff', 'staff_reviewer');
    const { cookieValue, sessionId } = await createSession(db, 'usr_staff', secret);

    const data = await validateSession(db, cookieValue, secret);
    assert.ok(data);
    assert.equal(data.sessionId, sessionId);
    assert.deepEqual(data.roles, ['staff_reviewer']);
    assert.deepEqual(
      Object.keys(data).sort(),
      ['expiresAt', 'roles', 'sessionId', 'user'],
      'session carries no product accounts, memberships or person data',
    );
    const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    assert.equal(row.product, null);

    const resolved = await requireStaff(adminRequest(cookieValue), db, secret);
    assert.equal(resolved.user.id, 'usr_staff');
    await assert.rejects(
      requireSuperadmin(adminRequest(cookieValue), db, secret),
      (e: unknown) => e instanceof AuthError && e.status === 403,
    );
  });

  test('a signed-in user without a staff role is refused; no cookie is unauthenticated', async () => {
    const db = await createMigratedDb();
    await seedUser(db, 'usr_plain');
    const { cookieValue } = await createSession(db, 'usr_plain', secret);
    await assert.rejects(
      requireStaff(adminRequest(cookieValue), db, secret),
      (e: unknown) => e instanceof AuthError && e.code === 'FORBIDDEN',
    );
    await assert.rejects(
      requireStaff(new Request('https://admin.gamostudio.org/api/x'), db, secret),
      (e: unknown) => e instanceof AuthError && e.code === 'UNAUTHENTICATED' && e.status === 401,
    );
    assert.equal(await resolveAuth(adminRequest('bogus.value'), db, secret), null);
  });

  test('a leftover public-product session row never authenticates', async () => {
    const db = await createMigratedDb();
    await seedUser(db, 'usr_old', 'staff_reviewer');
    const { cookieValue, sessionId } = await createSession(db, 'usr_old', secret);
    await db.update(sessions).set({ product: 'worship' }).where(eq(sessions.id, sessionId));
    assert.equal(await validateSession(db, cookieValue, secret), null);
  });

  test('cross-origin mutations are refused before the session is read', async () => {
    const db = await createMigratedDb();
    await seedUser(db, 'usr_staff2', 'staff_reviewer');
    const { cookieValue } = await createSession(db, 'usr_staff2', secret);
    await assert.rejects(
      requireStaff(
        adminRequest(cookieValue, { method: 'POST', headers: { origin: 'https://evil.example' } }),
        db,
        secret,
      ),
      (e: unknown) => e instanceof AuthError && e.code === 'FORBIDDEN',
    );
    assert.doesNotThrow(() =>
      requireSameOrigin(
        new Request('https://admin.gamostudio.org/x', {
          method: 'POST',
          headers: { origin: 'https://admin.gamostudio.org' },
        }),
      ),
    );
  });
});
