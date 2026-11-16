import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { StaffIdentityService } from '../../packages/domain/src/services/staff-identity.ts';
import { svixSignature } from '../../packages/domain/src/services/email-outbox.ts';
import {
  createSession,
  validateSession,
  revokeSession,
  revokeAllUserSessions,
  extractSessionCookie,
  requireSameOrigin,
} from '../../packages/auth/index.ts';
import { verifyCloudflareAccessJwt } from '../../apps/admin/src/lib/cf-access.ts';
import { readContract } from '../../packages/api-contracts/src/runtime.ts';
import { staffContext } from '../../packages/domain/src/http/staff.ts';
import { handleApiError } from '../../packages/domain/src/api/response.ts';

/** A stand-in admin handler: passes the staff gate every admin action uses, then answers 200. */
async function staffGatedHandler(context: any): Promise<Response> {
  try {
    await staffContext(context);
    return Response.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Admin middleware wrapped so every call resolves to a Response (the tests never call `next()` lazily). */
async function loadAdminMiddleware() {
  const { onRequest } = await import('../../apps/admin/src/middleware.ts');
  return async (context: any, next: () => Promise<Response>): Promise<Response> => {
    const result = await onRequest(context, next);
    assert.ok(result instanceof Response, 'admin middleware must return a Response');
    return result;
  };
}
const migrations = () =>
  readdirSync('packages/db/migrations')
    .filter((x) => x.endsWith('.sql'))
    .sort()
    .map((x) => readFileSync(`packages/db/migrations/${x}`, 'utf8'));
const secret = 'audit-only-not-a-real-secret-32-characters';
async function fixture() {
  const d1 = createInMemoryD1();
  await applyMigrations(d1, migrations());
  const db = createDb(d1);
  const identity = new StaffIdentityService(db);
  const owner = await identity.findOrCreateUser('owner@example.invalid', 'Sample Audit Owner');
  const staff = await identity.findOrCreateUser('reviewer@example.invalid');
  await identity.assignSystemRole(staff.id, 'staff_reviewer');
  return {
    d1,
    db,
    identity,
    owner,
    staff,
  };
}
test('D1 session persistence: rotation, concurrent sessions, expiry, revocation, disabling and role refresh', async () => {
  const f = await fixture();
  try {
    await assert.rejects(createSession(f.db, f.owner.id));
    const a = await createSession(f.db, f.owner.id, secret),
      b = await createSession(f.db, f.owner.id, secret);
    assert.notEqual(a.sessionId, b.sessionId);
    assert.ok(await validateSession(f.db, a.cookieValue, secret));
    assert.equal(await validateSession(f.db, a.cookieValue, secret + 'rotated'), null);
    await f.identity.assignSystemRole(f.owner.id, 'musician');
    assert.ok((await validateSession(f.db, a.cookieValue, secret))?.roles.includes('musician'));
    f.d1.sqlite.prepare('DELETE FROM user_roles WHERE user_id=?').run(f.owner.id);
    assert.deepEqual((await validateSession(f.db, a.cookieValue, secret))?.roles, []);
    await revokeSession(f.db, a.sessionId);
    assert.equal(await validateSession(f.db, a.cookieValue, secret), null);
    assert.ok(await validateSession(f.db, b.cookieValue, secret));
    f.d1.sqlite.prepare("UPDATE users SET status='disabled' WHERE id=?").run(f.owner.id);
    assert.equal(await validateSession(f.db, b.cookieValue, secret), null);
    f.d1.sqlite.prepare("UPDATE users SET status='active' WHERE id=?").run(f.owner.id);
    await revokeAllUserSessions(f.db, f.owner.id);
    assert.equal(await validateSession(f.db, b.cookieValue, secret), null);
    const expired = await createSession(f.db, f.owner.id, secret, { ttlSeconds: -1 });
    assert.equal(await validateSession(f.db, expired.cookieValue, secret), null);
  } finally {
    f.d1.sqlite.close();
  }
});
test('malformed cookie and sibling-origin mutation fail safely', () => {
  assert.equal(
    extractSessionCookie(new Request('https://gamostudio.org', { headers: { cookie: '__session=%' } })),
    null,
  );
  for (const origin of ['https://evil.invalid', 'https://academy.gamostudio.org', 'null'])
    assert.throws(() =>
      requireSameOrigin(
        new Request('https://admin.gamostudio.org/api/staff/provision', {
          method: 'POST',
          headers: { origin },
        }),
      ),
    );
  requireSameOrigin(
    new Request('https://admin.gamostudio.org/api/staff/provision', {
      method: 'POST',
      headers: { origin: 'https://admin.gamostudio.org' },
    }),
  );
});
test('Access issuer configuration required before network; missing expiry denied', async () => {
  const old = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw Error('outbound forbidden');
  };
  try {
    const jwt = (payload: any) =>
      `${btoa(JSON.stringify({ alg: 'RS256', kid: 'evil' }))}.${btoa(JSON.stringify(payload))}.signature`;
    assert.equal(
      (await verifyCloudflareAccessJwt(jwt({ iss: 'https://attacker.invalid', exp: 9e9 }))).valid,
      false,
    );
    assert.equal(
      (
        await verifyCloudflareAccessJwt(
          jwt({
            iss: 'https://sample.cloudflareaccess.com',
            sub: 'x',
            email: 'x@example.invalid',
            aud: ['audit'],
          }),
          'audit',
          'sample',
        )
      ).valid,
      false,
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = old;
  }
});
test('D1 batches roll back as a whole and foreign keys hold', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.db.batch([
        f.db.run("UPDATE users SET display_name='Should rollback'"),
        f.db.run('INSERT INTO nonexistent VALUES (1)'),
      ]),
    );
    assert.equal(
      (f.d1.sqlite.prepare('SELECT display_name FROM users WHERE id=?').get(f.owner.id) as any).display_name,
      'Sample Audit Owner',
    );
    assert.throws(() =>
      f.d1.sqlite.exec("INSERT INTO sessions(id,user_id,expires_at) VALUES('bad','missing',9999999999)"),
    );
    assert.deepEqual(f.d1.sqlite.prepare('PRAGMA foreign_key_check').all() as any, []);
    assert.equal((f.d1.sqlite.prepare('PRAGMA integrity_check').get() as any).integrity_check, 'ok');
  } finally {
    f.d1.sqlite.close();
  }
});
test('bounded contract reader rejects chunked oversized bodies and forged user binding', async () => {
  await assert.rejects(
    readContract(
      new Request('https://example.invalid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'staff@example.invalid',
          role: 'staff_reviewer',
          accessSubject: 'X'.repeat(70000),
        }),
      }),
      'ProvisionStaffInput',
    ),
  );
  await assert.rejects(
    readContract(
      new Request('https://example.invalid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'staff@example.invalid',
          role: 'staff_reviewer',
          accessSubject: 'cf-sub-1',
          userId: 'victim',
        }),
      }),
      'ProvisionStaffInput',
    ),
  );
});
test('migrations upgrade populated pre-backend development data without losing identities', async () => {
  const d1 = createInMemoryD1();
  try {
    const sql = migrations();
    await applyMigrations(d1, sql.slice(0, 2));
    d1.sqlite.exec(
      "INSERT INTO users(id,email,created_at) VALUES('legacy','legacy@example.invalid',1); INSERT INTO sessions(id,user_id,expires_at) VALUES('legacy-session','legacy',9999999999)",
    );
    await applyMigrations(d1, sql.slice(2));
    assert.equal(
      (d1.sqlite.prepare("SELECT email FROM users WHERE id='legacy'").get() as any).email,
      'legacy@example.invalid',
    );
    assert.ok(
      (d1.sqlite.prepare("SELECT created_at FROM sessions WHERE id='legacy-session'").get() as any)
        .created_at > 0,
    );
    assert.deepEqual(d1.sqlite.prepare('PRAGMA foreign_key_check').all() as any, []);
  } finally {
    d1.sqlite.close();
  }
});
test('scoped system role rows never grant global staff permissions', async () => {
  const f = await fixture();
  try {
    f.d1.sqlite
      .prepare("UPDATE user_roles SET scope_type='organization',scope_id=? WHERE user_id=?")
      .run('org_sample', f.staff.id);
    const session = await createSession(f.db, f.staff.id, secret);
    assert.deepEqual((await validateSession(f.db, session.cookieValue, secret))?.roles, []);
  } finally {
    f.d1.sqlite.close();
  }
});
test('Admin middleware verifies real RS256 Access JWT via trusted JWKS and rejects forged headers or mismatched staff identity', async () => {
  const onRequest = await loadAdminMiddleware();
  const f = await fixture();
  const oldFetch = globalThis.fetch;
  try {
    const kp = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
    const kid = 'audit-key-1';
    globalThis.fetch = (async (url: any) => {
      assert.equal(String(url), 'https://gamoteam.cloudflareaccess.com/cdn-cgi/access/certs');
      return Response.json({ keys: [{ ...jwk, kid, kty: 'RSA', alg: 'RS256', use: 'sig' }] });
    }) as typeof fetch;
    const b64u = (str: string) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const signJwt = async (
      claims: Record<string, unknown>,
      key = kp.privateKey,
      header: Record<string, unknown> = { alg: 'RS256', kid },
    ) => {
      const unsigned = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claims))}`;
      const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      return `${unsigned}.${sigB64}`;
    };
    const now = Math.floor(Date.now() / 1000);
    const staffSession = await createSession(f.db, f.staff.id, secret);
    const staffCookie = `__session=${encodeURIComponent(staffSession.cookieValue)}`;
    const env = {
      DB: f.d1,
      ENVIRONMENT: 'production',
      REQUIRE_ADMIN_AUTH: 'true',
      SESSION_SECRET: secret,
      CF_ACCESS_AUD: 'aud-tag-123',
      CF_ACCESS_TEAM_NAME: 'gamoteam',
    };
    const runMiddleware = async (headers: Record<string, string>) => {
      const request = new Request('https://admin.gamostudio.org/api/staff/provision', { headers });
      const context: any = { request, params: {}, locals: { runtime: { env } } };
      return onRequest(context, async () => staffGatedHandler(context));
    };
    // 1. Forged header without valid signature rejected with 401
    const wrongKp = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const forgedJwt = await signJwt(
      {
        aud: ['aud-tag-123'],
        email: 'reviewer@example.invalid',
        sub: 'sub-1',
        iss: 'https://gamoteam.cloudflareaccess.com',
        exp: now + 300,
        iat: now,
        nbf: now,
      },
      wrongKp.privateKey,
    );
    assert.equal(
      (await runMiddleware({ 'cf-access-jwt-assertion': forgedJwt, cookie: staffCookie })).status,
      401,
    );
    // 2. Valid Access JWT signature but mismatched email vs D1 staff session rejected with 403
    const mismatchJwt = await signJwt({
      aud: ['aud-tag-123'],
      email: 'other-staff@example.invalid',
      sub: 'sub-2',
      iss: 'https://gamoteam.cloudflareaccess.com',
      exp: now + 300,
      iat: now,
      nbf: now,
    });
    assert.equal(
      (await runMiddleware({ 'cf-access-jwt-assertion': mismatchJwt, cookie: staffCookie })).status,
      403,
    );
    // 3. Valid Access JWT signature + matching D1 staff session succeeds with 200
    const validJwt = await signJwt({
      aud: ['aud-tag-123'],
      email: 'reviewer@example.invalid',
      sub: 'sub-1',
      iss: 'https://gamoteam.cloudflareaccess.com',
      exp: now + 300,
      iat: now,
      nbf: now,
    });
    assert.equal(
      (await runMiddleware({ 'cf-access-jwt-assertion': validJwt, cookie: staffCookie })).status,
      200,
    );
    // 4. Behind Access but not signed in to the gateway, a workspace PAGE shows the gateway
    //    sign-in (401, email prefilled) instead of redirecting into a sign-in loop.
    const pageRequest = new Request('https://admin.gamostudio.org/security', {
      headers: { 'cf-access-jwt-assertion': validJwt },
    });
    const pageContext: any = { request: pageRequest, params: {}, locals: { runtime: { env } } };
    let rendered = false;
    const page = await onRequest(pageContext, async () => {
      rendered = true;
      return new Response('page');
    });
    assert.equal(rendered, false);
    assert.equal(page.status, 401);
    assert.match(await page.text(), /value="reviewer@example\.invalid"/);
  } finally {
    globalThis.fetch = oldFetch;
    f.d1.sqlite.close();
  }
});
test('Resend webhook on the global site fails closed without a secret and rejects bad or stale signatures', async () => {
  const { POST: webhook } = await import('../../apps/web/src/pages/api/webhook/resend.ts');
  const f = await fixture();
  try {
    const whSecret = `whsec_${btoa('audit-only-resend-webhook-secret')}`;
    const body = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 're_unknown', bounce: { type: 'Permanent' } },
    });
    const send = async (env: Record<string, unknown>, signature?: string, tsOffsetSec = 0) => {
      const ts = String(Math.floor(Date.now() / 1000) + tsOffsetSec);
      const sig = signature ?? `v1,${await svixSignature(whSecret, 'msg_audit_1', ts, body)}`;
      return webhook({
        request: new Request('https://gamostudio.org/api/webhook/resend', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'svix-id': 'msg_audit_1',
            'svix-timestamp': ts,
            'svix-signature': sig,
          },
          body,
        }),
        params: {},
        locals: { runtime: { env: { DB: f.d1, ...env } } },
      } as any);
    };
    // Without RESEND_WEBHOOK_SECRET the route answers 503, never a fake success.
    assert.equal((await send({ ENVIRONMENT: 'production' })).status, 503);
    assert.equal((await send({ ENVIRONMENT: 'production', RESEND_WEBHOOK_SECRET: '  ' })).status, 503);
    // A forged signature or a stale timestamp is rejected with 400.
    const env = { ENVIRONMENT: 'production', RESEND_WEBHOOK_SECRET: whSecret };
    assert.equal((await send(env, 'v1,AAAAforgedAAAA')).status, 400);
    assert.equal((await send(env, undefined, -900)).status, 400);
    // A correctly signed event is accepted (an unknown message id changes nothing).
    const ok = await send(env);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { received: true, applied: false });
  } finally {
    f.d1.sqlite.close();
  }
});
test('R2 storage enforces key scope prefix, ticket expiry, MIME spoofing rejection, and no-overwrite policy', async () => {
  const { createR2StorageClient } = await import('../../packages/integrations/src/storage.ts');
  const storage = createR2StorageClient(undefined, { signingSecret: secret });
  const ticket = await storage.authorizeUpload({
    filename: 'chart.pdf',
    contentType: 'application/pdf',
    byteSize: 128,
    scope: 'private_document',
    ownerUserId: 'usr_1',
  });
  assert.ok(await storage.verifyTicket(ticket.ticket));
  // Tampered expired ticket rejected
  const rawJson = ticket.ticket.slice(0, ticket.ticket.lastIndexOf('.'));
  const expiredJson = JSON.stringify({ ...JSON.parse(rawJson), expiresAt: Date.now() - 1000 });
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(expiredJson));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  assert.equal(await storage.verifyTicket(`${expiredJson}.${sigB64}`), null);
  // Wrong scope or owner prefix in key rejected
  await assert.rejects(
    () =>
      storage.putObject('public_asset/usr_1/chart.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        contentType: 'application/pdf',
        scope: 'private_document',
        accessPolicy: 'private',
        ownerUserId: 'usr_1',
      }),
    /scope or owner prefix/,
  );
  await assert.rejects(
    () =>
      storage.putObject('private_document/usr_2/chart.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        contentType: 'application/pdf',
        scope: 'private_document',
        accessPolicy: 'private',
        ownerUserId: 'usr_1',
      }),
    /scope or owner prefix/,
  );
  // MIME spoofing (HTML/script/SVG/MZ executable disguised as PDF or PNG) rejected
  await assert.rejects(
    () =>
      storage.putObject(ticket.r2Key, '<!DOCTYPE html><script>alert(1)</script>', {
        contentType: 'application/pdf',
        scope: 'private_document',
        accessPolicy: 'private',
        ownerUserId: 'usr_1',
      }),
    /MIME spoofing/,
  );
  await assert.rejects(
    () =>
      storage.putObject(ticket.r2Key, '<svg onload="alert(1)"></svg>', {
        contentType: 'image/png',
        scope: 'private_document',
        accessPolicy: 'private',
        ownerUserId: 'usr_1',
      }),
    /MIME spoofing/,
  );
  await assert.rejects(
    () =>
      storage.putObject(ticket.r2Key, new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), {
        contentType: 'application/pdf',
        scope: 'private_document',
        accessPolicy: 'private',
        ownerUserId: 'usr_1',
      }),
    /MIME spoofing/,
  );
  // First valid write succeeds; overwrite without allowOverwrite is rejected
  await storage.putObject(ticket.r2Key, '%PDF-1.7 sample chart', {
    contentType: 'application/pdf',
    scope: 'private_document',
    accessPolicy: 'private',
    ownerUserId: 'usr_1',
  });
  await assert.rejects(
    () =>
      storage.putObject(ticket.r2Key, '%PDF-1.7 overwritten', {
        contentType: 'application/pdf',
        scope: 'private_document',
        accessPolicy: 'private',
        ownerUserId: 'usr_1',
      }),
    /Overwrite denied/,
  );
  // Sensitive student and personal identity documents are strictly rejected across authorizeUpload, putObject, MediaService, and D1 trigger
  await assert.rejects(
    () =>
      storage.authorizeUpload({
        filename: 'driver_license.pdf',
        contentType: 'application/pdf',
        byteSize: 128,
        scope: 'private_document',
        ownerUserId: 'usr_1',
      }),
    /SENSITIVE_DOCUMENT_PROHIBITED/,
  );
  await assert.rejects(
    () =>
      storage.authorizeUpload({
        filename: 'student_id_card.png',
        contentType: 'image/png',
        byteSize: 128,
        scope: 'private_document',
        ownerUserId: 'usr_1',
      }),
    /SENSITIVE_DOCUMENT_PROHIBITED/,
  );
  await assert.rejects(
    () =>
      storage.putObject('private_document/usr_1/passport_scan.pdf', '%PDF-1.7', {
        contentType: 'application/pdf',
        scope: 'private_document',
        accessPolicy: 'private',
        ownerUserId: 'usr_1',
      }),
    /SENSITIVE_DOCUMENT_PROHIBITED/,
  );
});
test('staff identity provisioning binds immutable Cloudflare Access sub and blocks subject spoofing or cross-account binding', async () => {
  const { verifyStaffBoundaryIdentity } = await import('../../packages/auth/index.ts');
  const f = await fixture();
  try {
    const superadmin = await f.identity.findOrCreateUser('super@example.invalid');
    await f.identity.assignSystemRole(superadmin.id, 'superadmin');
    // Non-superadmin cannot provision staff
    await assert.rejects(
      () =>
        f.identity.provisionStaffIdentity(f.staff.id, {
          email: 'newstaff@example.invalid',
          role: 'staff_reviewer',
          accessSubject: 'cf-sub-100',
        }),
      /Superadmin permission required/,
    );
    // Superadmin provisions staff reviewer with immutable Cloudflare Access sub
    const provisioned = await f.identity.provisionStaffIdentity(superadmin.id, {
      email: 'newstaff@example.invalid',
      role: 'staff_reviewer',
      accessSubject: 'cf-sub-100',
      displayName: 'Staff Reviewer 100',
    });
    assert.equal(provisioned.accessSubject, 'cf-sub-100');
    assert.ok(provisioned.user.verifiedEmailAt);
    // Re-binding the same Access sub to a different user is rejected with CONFLICT
    await assert.rejects(
      () =>
        f.identity.provisionStaffIdentity(superadmin.id, {
          email: 'otherstaff@example.invalid',
          role: 'staff_reviewer',
          accessSubject: 'cf-sub-100',
        }),
      /CONFLICT/,
    );
    // Re-binding a different Access sub to the same user is rejected with CONFLICT
    await assert.rejects(
      () =>
        f.identity.provisionStaffIdentity(superadmin.id, {
          email: 'newstaff@example.invalid',
          role: 'staff_reviewer',
          accessSubject: 'cf-sub-999',
        }),
      /CONFLICT/,
    );
    // Verify boundary identity check with matching email + matching sub succeeds
    const session = await createSession(f.db, provisioned.user.id, secret);
    const auth = await validateSession(f.db, session.cookieValue, secret);
    assert.ok(auth);
    await verifyStaffBoundaryIdentity(f.db, auth, {
      staffEmail: 'newstaff@example.invalid',
      staffSubject: 'cf-sub-100',
    });
    // Mismatched Access sub (even if email matches!) is rejected with 403
    await assert.rejects(
      () =>
        verifyStaffBoundaryIdentity(f.db, auth, {
          staffEmail: 'newstaff@example.invalid',
          staffSubject: 'cf-sub-spoofed',
        }),
      /Staff Access subject does not match/,
    );
  } finally {
    f.d1.sqlite.close();
  }
});
test('email HTML escaping and the sensitive-document guard on media uploads', async () => {
  const { escapeHtml, MediaService } = await import('../../packages/domain/index.ts');
  const f = await fixture();
  try {
    assert.equal(
      escapeHtml('<script>alert("xss")</script>'),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
    // D1 trigger blocks sensitive document rows even if inserted directly into media_files
    const media = new MediaService(f.db);
    await assert.rejects(
      () =>
        media.recordMediaUpload({
          ownerUserId: f.owner.id,
          scopeType: 'student_document',
          r2Key: 'student_document/1.pdf',
          contentType: 'application/pdf',
          byteSize: 100,
          accessPolicy: 'private',
        }),
      /SENSITIVE_DOCUMENT_PROHIBITED/,
    );
    assert.throws(
      () =>
        f.d1.sqlite
          .prepare(
            "INSERT INTO media_files(id,owner_user_id,scope_type,r2_key,content_type,byte_size,access_policy,status,created_at) VALUES('m1',?,'identity_document','k1','application/pdf',10,'private','quarantined',unixepoch())",
          )
          .run(f.owner.id),
      /SENSITIVE_DOCUMENT_PROHIBITED/,
    );
  } finally {
    f.d1.sqlite.close();
  }
});
test('Admin password gateway never provisions implicitly; explicit local fixture enforces lockout and rotation', async () => {
  const onRequest = await loadAdminMiddleware();
  const { authenticateAdminPassword, changeAdminPassword, ensureBootstrapAdminAccount } =
    await import('../../apps/admin/src/lib/admin-password-auth.ts');
  // Test-only identity; real bootstrap identities are never committed.
  const BOOTSTRAP_ADMIN_EMAIL = 'bootstrap.admin@example.invalid';
  const BOOTSTRAP_ADMIN_TEMP_PASSWORD = 'temporary-test-password-1';
  const bootstrapIdentity = {
    email: BOOTSTRAP_ADMIN_EMAIL,
    displayName: 'Bootstrap Admin (test)',
    temporaryPassword: BOOTSTRAP_ADMIN_TEMP_PASSWORD,
  };
  const f = await fixture();
  try {
    const env = { DB: f.d1, ENVIRONMENT: 'production', REQUIRE_ADMIN_AUTH: 'true', SESSION_SECRET: secret };
    // 1. Initial login with temporary password succeeds and flags mustChangePassword=true
    assert.equal(
      (await authenticateAdminPassword(f.db, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_TEMP_PASSWORD)).ok,
      false,
    );
    await assert.rejects(ensureBootstrapAdminAccount(f.db, bootstrapIdentity));
    await ensureBootstrapAdminAccount(f.db, bootstrapIdentity, {
      environment: 'local',
      enabled: true,
      requestUrl: 'http://localhost',
    });
    const initial = await authenticateAdminPassword(
      f.db,
      BOOTSTRAP_ADMIN_EMAIL,
      BOOTSTRAP_ADMIN_TEMP_PASSWORD,
    );
    assert.equal(initial.ok, true);
    assert.equal(initial.mustChangePassword, true);
    // 2.Middleware POST /__admin_auth/login issues __session + __admin_gate cookies and redirects to /security?welcome=1
    const loginForm = new URLSearchParams({
      email: BOOTSTRAP_ADMIN_EMAIL,
      password: BOOTSTRAP_ADMIN_TEMP_PASSWORD,
    });
    const loginReq = new Request('https://admin.gamostudio.org/__admin_auth/login', {
      method: 'POST',
      headers: {
        origin: 'https://admin.gamostudio.org',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: loginForm,
    });
    const loginRes = await onRequest(
      { request: loginReq, params: {}, locals: { runtime: { env } } } as any,
      async () => new Response('ok'),
    );
    assert.equal(loginRes.status, 303);
    assert.equal(loginRes.headers.get('location'), '/security?welcome=1');
    const setCookies = loginRes.headers.getSetCookie
      ? loginRes.headers.getSetCookie()
      : [loginRes.headers.get('set-cookie') || ''].filter(Boolean);
    const cookieHeader = setCookies.map((c) => c.split(';')[0]).join('; ');
    assert.match(cookieHeader, /__session=/);
    assert.match(cookieHeader, /__admin_gate=/);
    // 3. Authenticated request with __session + __admin_gate accesses Admin API & UI
    const apiReq = new Request('https://admin.gamostudio.org/api/staff/provision', {
      headers: { cookie: cookieHeader },
    });
    const apiCtx: any = { request: apiReq, params: {}, locals: { runtime: { env } } };
    const apiRes = await onRequest(apiCtx, async () => staffGatedHandler(apiCtx));
    assert.equal(apiRes.status, 200);
    // 4. Changing password updates hash and disables temporary password
    const changed = await changeAdminPassword(
      f.db,
      initial.userId!,
      BOOTSTRAP_ADMIN_TEMP_PASSWORD,
      'NewStrongAdminPass2026!',
    );
    assert.equal(changed.ok, true);
    assert.equal(
      (await authenticateAdminPassword(f.db, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_TEMP_PASSWORD)).ok,
      false,
    );
    const afterChange = await authenticateAdminPassword(
      f.db,
      BOOTSTRAP_ADMIN_EMAIL,
      'NewStrongAdminPass2026!',
    );
    assert.equal(afterChange.ok, true);
    assert.equal(afterChange.mustChangePassword, false);
    // 5. 5 failed attempts lock out the account even if the right password is provided afterward
    for (let i = 0; i < 5; i++) {
      assert.equal((await authenticateAdminPassword(f.db, BOOTSTRAP_ADMIN_EMAIL, 'wrong-pass')).ok, false);
    }
    const locked = await authenticateAdminPassword(f.db, BOOTSTRAP_ADMIN_EMAIL, 'NewStrongAdminPass2026!');
    assert.equal(locked.ok, false);
    assert.match(locked.error || '', /Too many failed sign-in attempts/);
  } finally {
    f.d1.sqlite.close();
  }
});
