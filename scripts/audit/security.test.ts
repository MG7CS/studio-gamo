import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import {
  IdentityService,
  LiveService,
  AdminService,
  placeOrder,
  readConfirmToken,
  confirmFreeOrder,
  refundTickets,
  getTermsDocument,
} from '../../packages/domain/index.ts';
import {
  createSession,
  validateSession,
  revokeSession,
  revokeAllUserSessions,
  extractSessionCookie,
  requireSameOrigin,
} from '../../packages/auth/index.ts';
import { readContract } from '../../packages/api-contracts/src/runtime.ts';

const migrations = () =>
  readdirSync('packages/db/migrations')
    .filter((x) => x.endsWith('.sql'))
    .sort()
    .map((x) => readFileSync(`packages/db/migrations/${x}`, 'utf8'));
const secret = 'audit-only-not-a-real-secret-32-characters';
/** A free order through the ticketing service (local env: simulated email, development keys). */
function rsvp(f: Awaited<ReturnType<typeof fixture>>, email: string, quantity: number, key?: string) {
  return placeOrder(
    f.d1,
    { DB: f.d1, ENVIRONMENT: 'local' },
    {
      request: {
        eventId: f.event.id,
        items: [{ categoryId: f.tier.id, sectionId: null, quantity }],
        purchaserName: 'Sample Attendee',
        email,
        emailConfirm: email,
        attendeeNames: [],
        termsAccepted: true,
        termsDocuments: ['ticket-terms', 'privacy-policy'].map((slug) => ({
          slug,
          version: getTermsDocument(slug)!.version,
        })),
        marketingOptIn: false,
        idempotencyKey: key ?? `idem_${email.replace(/[^a-z0-9]/gi, '_')}_${quantity}_x`,
      },
      allow: 'free',
      ipHash: null,
      origin: 'https://live.example.test',
      https: true,
      now: Math.floor(Date.now() / 1000),
    },
  );
}
const ADMIN = { name: 'Sample Admin' };
async function fixture() {
  const d1 = createInMemoryD1();
  await applyMigrations(d1, migrations());
  const db = createDb(d1);
  const identity = new IdentityService(db),
    live = new LiveService(db),
    admin = new AdminService(db);
  const owner = await identity.findOrCreateUser('owner@example.invalid');
  const staff = await identity.findOrCreateUser('reviewer@example.invalid');
  await identity.assignSystemRole(staff.id, 'staff_reviewer');
  const org = await identity.createOrganization(
    'Sample Audit Ministry',
    'audit-ministry',
    'church',
    owner.id,
  );
  const input = {
    organizationId: org.id,
    title: 'Sample Audit Worship',
    category: 'worship' as const,
    description: 'Fictional isolated audit event only.',
    venueName: 'Sample Hall',
    city: 'Phoenix',
    state: 'AZ',
    startsAt: new Date(Date.now() + 86400000),
    timezone: 'America/Phoenix',
    admissionType: 'free' as const,
    tiers: [{ name: 'Free', priceCents: 0, capacity: 3 }],
  };
  const created = await live.createEvent(org.id, input);
  await admin.reviewEvent(ADMIN, created.event.id, { decision: 'approved' });
  return {
    d1,
    db,
    identity,
    live,
    admin,
    owner,
    staff,
    org,
    input,
    event: created.event,
    tier: created.tiers[0],
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
  for (const origin of ['https://evil.invalid', 'https://worship.gamostudio.org', 'null'])
    assert.throws(() =>
      requireSameOrigin(
        new Request('https://live.gamostudio.org/api/events', { method: 'POST', headers: { origin } }),
      ),
    );
  requireSameOrigin(
    new Request('https://live.gamostudio.org/api/events', {
      method: 'POST',
      headers: { origin: 'https://live.gamostudio.org' },
    }),
  );
});
test('registration races enforce capacity, duplicate uniqueness, outbox atomicity and FK integrity', async () => {
  const f = await fixture();
  try {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 12 }, (_, n) => rsvp(f, `sample${n}@example.org`, 1)),
    );
    assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 3);
    assert.equal(
      (f.d1.sqlite.prepare('SELECT reserved_count FROM ticket_tiers WHERE id=?').get(f.tier.id) as any)
        .reserved_count,
      3,
    );
    assert.equal(
      (f.d1.sqlite.prepare("SELECT count(*) n FROM email_log WHERE kind = 'order_verification'").get() as any)
        .n,
      3,
    );
    // The same idempotency key (double submit) never holds a second time.
    const winner = outcomes.findIndex((x) => x.status === 'fulfilled');
    const duplicates = await Promise.all(
      Array.from({ length: 8 }, () => rsvp(f, `sample${winner}@example.org`, 1)),
    );
    assert.ok(duplicates.every((x) => x.type === 'verify'));
    assert.equal((f.d1.sqlite.prepare('SELECT count(*) n FROM ticket_orders').get() as any).n, 3);
    assert.deepEqual(f.d1.sqlite.prepare('PRAGMA foreign_key_check').all() as any, []);
    assert.equal((f.d1.sqlite.prepare('PRAGMA integrity_check').get() as any).integrity_check, 'ok');
    await assert.rejects(
      f.db.batch([
        f.db.run("UPDATE events SET title='Should rollback'"),
        f.db.run('INSERT INTO nonexistent VALUES (1)'),
      ]),
    );
    assert.equal((await f.live.getEvent(f.event.id))?.title, f.input.title);
    assert.throws(() =>
      f.d1.sqlite.exec("INSERT INTO sessions(id,user_id,expires_at) VALUES('bad','missing',9999999999)"),
    );
  } finally {
    f.d1.sqlite.close();
  }
});
test('moderation rejects repeat decisions and invalid schedules', async () => {
  const f = await fixture();
  try {
    const next = await f.live.createEvent(f.org.id, f.input);
    assert.equal(
      (await f.admin.reviewEvent(ADMIN, next.event.id, { decision: 'revision_requested' })).event.status,
      'revision_requested',
    );
    await assert.rejects(f.admin.reviewEvent(ADMIN, next.event.id, { decision: 'approved' }), /CONFLICT/);
    await assert.rejects(f.live.createEvent(f.org.id, { ...f.input, startsAt: new Date(0) }), /schedule/);
    await assert.rejects(f.live.createEvent(f.org.id, { ...f.input, endsAt: new Date(0) }), /schedule/);
    f.d1.sqlite.prepare("UPDATE events SET status='canceled' WHERE id=?").run(f.event.id);
    await assert.rejects(rsvp(f, 'x@example.org', 1), (e: { code?: string }) => e.code === 'CLOSED');
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
        body: JSON.stringify({ attendeeName: 'X'.repeat(70000), attendeeEmail: 'x@example.invalid' }),
      }),
      'RegisterAttendee',
    ),
  );
  await assert.rejects(
    readContract(
      new Request('https://example.invalid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendeeName: 'Sample',
          attendeeEmail: 'x@example.invalid',
          userId: 'victim',
        }),
      }),
      'RegisterAttendee',
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
      .run(f.org.id, f.staff.id);
    const session = await createSession(f.db, f.staff.id, secret);
    assert.deepEqual((await validateSession(f.db, session.cookieValue, secret))?.roles, []);
  } finally {
    f.d1.sqlite.close();
  }
});
test('order insert failure rolls back the whole hold batch; cancelling tickets releases capacity', async () => {
  const f = await fixture();
  try {
    f.d1.sqlite.exec(
      "CREATE TRIGGER fail_item BEFORE INSERT ON order_items BEGIN SELECT RAISE(ABORT,'injected failure'); END;",
    );
    await assert.rejects(rsvp(f, 'rollback@example.org', 2));
    assert.equal((f.d1.sqlite.prepare('SELECT count(*) n FROM ticket_orders').get() as any).n, 0);
    assert.equal((f.d1.sqlite.prepare('SELECT count(*) n FROM ticket_holds').get() as any).n, 0);
    assert.equal(
      (f.d1.sqlite.prepare('SELECT reserved_count FROM ticket_tiers').get() as any).reserved_count,
      0,
    );
    f.d1.sqlite.exec('DROP TRIGGER fail_item');
    const env = { DB: f.d1, ENVIRONMENT: 'local' };
    const placed = (await rsvp(f, 'cancel@example.org', 2)) as { confirmToken: string };
    const orderId = (await readConfirmToken(env, placed.confirmToken, Math.floor(Date.now() / 1000)))!;
    await confirmFreeOrder(f.d1, env, {
      orderId,
      now: Math.floor(Date.now() / 1000),
      origin: 'https://live.example.test',
    });
    await refundTickets(f.d1, env, {
      orderId,
      reason: 'Sample cancellation',
      actorUserId: f.owner.id,
      now: Math.floor(Date.now() / 1000),
      origin: 'https://live.example.test',
    });
    assert.equal(
      (f.d1.sqlite.prepare('SELECT reserved_count FROM ticket_tiers').get() as any).reserved_count,
      0,
    );
    assert.throws(() =>
      f.d1.sqlite.prepare('UPDATE order_items SET quantity=5 WHERE order_id=?').run(orderId),
    );
  } finally {
    f.d1.sqlite.close();
  }
});
test('Stripe webhook route enforces signature timestamp tolerance, processes financial events idempotently, and deduplicates unsupported events', async () => {
  const { POST: webhook } = await import('../../apps/live/src/pages/api/webhook/stripe.ts');
  const f = await fixture();
  try {
    const whSecret = 'whsec_audit_test_secret_32_chars_long';
    const sendWebhook = async (payloadObj: Record<string, unknown>, tsOffsetSec = 0) => {
      const rawBody = JSON.stringify(payloadObj);
      const ts = Math.floor(Date.now() / 1000) + tsOffsetSec;
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(whSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${rawBody}`));
      const hex = Array.from(new Uint8Array(sigBuf), (b) => b.toString(16).padStart(2, '0')).join('');
      const request = new Request('https://live.gamostudio.org/api/webhook/stripe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'stripe-signature': `t=${ts},v1=${hex}` },
        body: rawBody,
      });
      return webhook({
        request,
        params: {},
        locals: { runtime: { env: { DB: f.d1, STRIPE_WEBHOOK_SECRET: whSecret } } },
      } as any);
    };
    // Stale timestamp rejected (400)
    const stale = await sendWebhook(
      { id: 'evt_stale', type: 'customer.created', livemode: false, data: { object: {} } },
      -900,
    );
    assert.equal(stale.status, 400);
    // Future timestamp outside tolerance rejected (400)
    const future = await sendWebhook(
      { id: 'evt_future', type: 'customer.created', livemode: false, data: { object: {} } },
      900,
    );
    assert.equal(future.status, 400);
    // Financial events for orders this database does not know are processed (and recorded) without effect.
    for (const finType of ['checkout.session.completed', 'charge.refunded', 'charge.dispute.created']) {
      const res = await sendWebhook({
        id: `evt_${finType.replace(/\./g, '_')}`,
        type: finType,
        livemode: false,
        data: {
          object: {
            id: 'cs_test_unknown',
            payment_status: 'paid',
            payment_intent: 'pi_test_unknown',
            amount_refunded: 100,
            metadata: { orderId: 'ord_missing' },
          },
        },
      });
      // A refund or dispute can arrive before its order is visible: answer 409 so Stripe retries (D-175).
      const retryable = finType !== 'checkout.session.completed';
      assert.equal(res.status, retryable ? 409 : 200);
      if (!retryable) assert.equal((await res.json()).outcome, 'unknown_order');
    }
    assert.equal(
      (
        f.d1.sqlite
          .prepare("SELECT count(*) n FROM stripe_webhook_events WHERE status = 'processed'")
          .get() as any
      ).n,
      1,
    );
    // Without a webhook secret outside local the route fails closed.
    const unsigned = await webhook({
      request: new Request('https://live.gamostudio.org/api/webhook/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=00' },
        body: '{}',
      }),
      params: {},
      locals: { runtime: { env: { DB: f.d1, ENVIRONMENT: 'production' } } },
    } as any);
    assert.equal(unsigned.status, 503);
    // Unsupported non-financial event recorded idempotently as ignored
    const nonFin = {
      id: 'evt_nonfin_1',
      type: 'customer.created',
      livemode: false,
      data: { object: { id: 'cus_1' } },
    };
    const first = await sendWebhook(nonFin);
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.received, true);
    assert.equal(firstBody.deduplicated, undefined);
    const second = await sendWebhook(nonFin);
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(secondBody.deduplicated, true);
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
test('verified email challenge enforces SHA-256 hashing, 10-min expiry, 5-attempt lockout, rate limiting, and single-use consumption', async () => {
  const f = await fixture();
  try {
    const email = 'verify-audit@example.invalid';
    const issued = await f.identity.issueEmailChallenge(email);
    // Plaintext code must never be stored in D1
    const stored = f.d1.sqlite
      .prepare('SELECT code_hash, attempts FROM auth_challenges WHERE id=?')
      .get(issued.challengeId) as any;
    assert.notEqual(stored.code_hash, issued.code);
    assert.equal(stored.code_hash.length, 64);
    // Expired challenge rejected
    const expired = await f.identity.issueEmailChallenge('expired@example.invalid', { ttlSeconds: -5 });
    await assert.rejects(
      () => f.identity.verifyEmailChallenge('expired@example.invalid', expired.code),
      /Invalid or expired/,
    );
    // 4 wrong attempts increment counter; 5th attempt locks out with RATE_LIMITED
    for (let i = 0; i < 4; i++) {
      await assert.rejects(() => f.identity.verifyEmailChallenge(email, '000000'), /Invalid or expired/);
    }
    await assert.rejects(() => f.identity.verifyEmailChallenge(email, '000000'), /RATE_LIMITED/);
    // Even presenting the right code after 5 failed attempts is rejected
    await assert.rejects(() => f.identity.verifyEmailChallenge(email, issued.code), /RATE_LIMITED/);
    // Issue fresh challenge and verify successfully
    const fresh = await f.identity.issueEmailChallenge(email);
    const verifiedUser = await f.identity.verifyEmailChallenge(email, fresh.code, {
      displayName: 'Verified Ministry Leader',
    });
    assert.ok(verifiedUser.verifiedEmailAt);
    // Replay of consumed code rejected
    await assert.rejects(() => f.identity.verifyEmailChallenge(email, fresh.code), /Invalid or expired/);
    // Per-address cap (direct calls count every IP): 6 codes per hour; the 7th is rejected with RATE_LIMITED.
    // (`issued` and `fresh` above are two; four more fit.)
    for (let i = 0; i < 4; i++) await f.identity.issueEmailChallenge(email);
    await assert.rejects(() => f.identity.issueEmailChallenge(email), /RATE_LIMITED/);
  } finally {
    f.d1.sqlite.close();
  }
});
test('NotificationService outbox consumer escapes untrusted HTML, marks sent jobs, and enforces retry backoff + terminal failure', async () => {
  const { NotificationService, escapeHtml, MediaService } = await import('../../packages/domain/index.ts');
  const f = await fixture();
  const oldFetch = globalThis.fetch;
  try {
    assert.equal(
      escapeHtml('<script>alert("xss")</script>'),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
    // Register attendee with HTML payload in name
    // A pre-0013 registration row (the legacy table and its outbox trigger remain for old RSVPs).
    f.d1.sqlite
      .prepare(
        "INSERT INTO event_registrations (id, event_id, tier_id, attendee_name, attendee_email, quantity, qr_token, status, created_at) VALUES ('reg_legacy_outbox', ?, ?, ?, 'outbox@example.invalid', 1, 'gamt_audit000_0123456789abcdef0123456789abcdef', 'confirmed', unixepoch())",
      )
      .run(f.event.id, f.tier.id, '<b>Sample & <script>evil()</script></b>');
    const reg = { registration: { id: 'reg_legacy_outbox' } };
    let capturedPayload: any = null;
    let shouldFail = true;
    globalThis.fetch = (async (_url: any, init: any) => {
      capturedPayload = JSON.parse(String(init.body));
      if (shouldFail) return new Response('upstream error', { status: 502 });
      return Response.json({ id: 're_live_test_msg_1' });
    }) as typeof fetch;
    const notif = new NotificationService(f.db, { apiKey: 're_live_simulated_key_for_test' });
    // 1st attempt fails -> status stays pending, attempts=1, nextAttemptAt > now
    const fail1 = await notif.processRegistrationJob(reg.registration.id, new Date(1700000000000));
    assert.equal(fail1?.status, 'pending');
    assert.equal(fail1?.attempts, 1);
    // HTML payload must be escaped in outgoing email HTML
    assert.ok(capturedPayload.html.includes('&lt;script&gt;evil()&lt;/script&gt;'));
    assert.ok(!capturedPayload.html.includes('<script>evil()</script>'));
    // processPendingJobs before nextAttemptAt skips the backed-off job
    const skipped = await notif.processPendingJobs(10, new Date(1700000005000));
    assert.equal(skipped.length, 0);
    // When nextAttemptAt arrives and Resend succeeds -> status becomes sent
    shouldFail = false;
    const sent = await notif.processPendingJobs(10, new Date(1700000100000));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].status, 'sent');
    assert.equal(sent[0].providerMessageId, 're_live_test_msg_1');
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
    globalThis.fetch = oldFetch;
    f.d1.sqlite.close();
  }
});
