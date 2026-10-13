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
      status: 'active',
    },
    roles: ['staff_reviewer'],
    memberships: [
      {
        organizationId: 'org_gamo_ops',
        role: 'admin',
        orgName: 'Gamo Operations',
        orgSlug: 'gamo-ops',
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
      status: 'active',
    },
    roles: ['organizer'],
    memberships: [
      {
        organizationId: 'org_riverside_1',
        role: 'owner',
        orgName: 'Riverside Fellowship',
        orgSlug: 'riverside-fellowship',
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
        status: 'active',
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
