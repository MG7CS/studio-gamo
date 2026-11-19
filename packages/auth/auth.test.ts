import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInMemoryD1, applyMigrations } from '@gamo/db/testing';
import { createDb, users, roles, userRoles, sessions } from '@gamo/db';
import { eq } from 'drizzle-orm';
import {
  signValue,
  verifySignedValue,
  generateSessionId,
  buildSessionCookie,
  extractSessionCookie,
  createSession,
  validateSession,
  resolveAuth,
  requireStaff,
  requireSuperadmin,
  requireSameOrigin,
  AuthError,
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
