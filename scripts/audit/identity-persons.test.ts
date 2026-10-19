/**
 * Shared person record (design §4.6) and Clerk session revocation (design §4.3).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createSign, generateKeyPairSync } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { createSession, resolveAuth } from '../../packages/auth/index.ts';
import { createAuthHandlers } from '../../packages/domain/src/http/auth.ts';
import { IdentityService } from '../../packages/domain/src/services/identity.ts';
import {
  linkUserToVerifiedPerson,
  listCustomerRecordsForPerson,
  listPersonProducts,
  unlinkUserFromPerson,
} from '../../packages/domain/src/services/persons.ts';
import {
  markCustomerEmailVerified,
  upsertCustomerProfile,
} from '../../packages/domain/src/services/customers.ts';
import { applyClerkWebhookEvent } from '../../packages/domain/src/services/identity-clerk-webhook.ts';
import { recordTermsAcceptance } from '../../packages/domain/src/terms/acceptance.ts';
import { termsDocumentsFor } from '../../packages/domain/src/terms/registry.ts';
import { GUARD_SECRETS } from './auth-test-kit.ts';

const SECRET = 'identity-persons-test-session-secret-0123456789';
const NOW = 1_800_000_000;

async function setup() {
  const d1 = createInMemoryD1();
  await applyMigrations(
    d1,
    readdirSync('packages/db/migrations')
      .filter((n) => n.endsWith('.sql'))
      .sort()
      .map((n) => readFileSync(`packages/db/migrations/${n}`, 'utf8')),
  );
  const db = createDb(d1);
  const one = <T>(sql: string, ...params: (string | number)[]) => d1.sqlite.prepare(sql).get(...params) as T;
  return { d1, db, one, identity: new IdentityService(db) };
}

async function signUp(
  identity: IdentityService,
  email: string,
  product: 'web' | 'worship' | 'academy' | 'live' | 'production',
) {
  const c = await identity.issueEmailChallenge(email, { product, intent: 'signup' });
  return identity.verifyEmailChallenge(email, c.code, {
    product,
    intent: 'signup',
    displayName: 'Sample Person',
  });
}

test('two products, same verified email → one person; sign-in keeps it; nothing else is granted', async () => {
  const { d1, one, identity } = await setup();
  const worshipUser = await signUp(identity, 'shared@example.org', 'worship');
  const liveUser = await signUp(identity, 'Shared@Example.org', 'live');
  assert.ok(worshipUser.personId);
  assert.equal(liveUser.personId, worshipUser.personId);
  assert.equal(one<{ n: number }>('SELECT COUNT(*) AS n FROM persons').n, 1);

  // A Clerk-provisioned, product-scoped user row for Academy with the same verified email links to the
  // same person — but gets no Worship/Live account, role or session from it.
  d1.sqlite
    .prepare(
      "INSERT INTO users (id, email, display_name, verified_email_at, status, created_at) VALUES ('usr_academy_x', 'shared@example.org#academy:x', NULL, ?1, 'active', ?1)",
    )
    .run(NOW);
  const linked = await linkUserToVerifiedPerson(d1, {
    userId: 'usr_academy_x',
    email: 'shared@example.org',
    product: 'academy',
    source: 'clerk',
    now: NOW,
  });
  assert.equal(linked.linked && linked.personId, worshipUser.personId);
  assert.equal(
    one<{ n: number }>("SELECT COUNT(*) AS n FROM product_accounts WHERE user_id = 'usr_academy_x'").n,
    0,
  );
  assert.equal(one<{ n: number }>("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 'usr_academy_x'").n, 0);

  const products = await listPersonProducts(d1, { userId: worshipUser.id, product: 'worship' });
  assert.deepEqual(
    products.products.map((p) => [p.name, p.current]),
    [
      ['Gamo Worship', true],
      ['Gamo Live', false],
    ],
  );
});

test('an unverified email never links: guest forms and unverified Clerk emails create no person', async () => {
  const { d1, one } = await setup();
  await upsertCustomerProfile(d1, { email: 'guest@example.org', now: NOW });
  assert.equal(
    one<{ n: number }>('SELECT COUNT(*) AS n FROM persons').n,
    0,
    'typing an address proves nothing',
  );

  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const host = 'live-instance.clerk.accounts.dev';
  const b64 = (x: string | Buffer) => Buffer.from(x).toString('base64url');
  const input = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'k' }))}.${b64(
    JSON.stringify({
      iss: `https://${host}`,
      sub: 'user_unverified',
      sid: 'sess_unverified',
      azp: 'https://live.gamostudio.org',
      email: 'guest@example.org',
      email_verified: false,
      iat: Math.floor(Date.now() / 1000) - 5,
      exp: Math.floor(Date.now() / 1000) + 60,
    }),
  )}`;
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  const token = `${input}.${b64(signer.sign(keys.privateKey))}`;
  const env = {
    ENVIRONMENT: 'production',
    DB: d1,
    SESSION_SECRET: SECRET,
    ...GUARD_SECRETS,
    CLERK_APP_ID_LIVE: 'app_live_test',
    PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE: `pk_live_${Buffer.from(`${host}$`).toString('base64').replace(/=+$/, '')}`,
    CLERK_JWT_KEY_LIVE: keys.publicKey,
    CLERK_ISSUER_LIVE: `https://${host}`,
    CLERK_AUTHORIZED_PARTIES_LIVE: 'https://live.gamostudio.org',
  };
  const res = await createAuthHandlers('live').clerkSessionPOST({
    request: new Request('https://live.gamostudio.org/api/auth/clerk-session', {
      method: 'POST',
      headers: { origin: 'https://live.gamostudio.org', authorization: `Bearer ${token}` },
    }),
    locals: { runtime: { env }, product: 'live' },
  });
  assert.equal(res.status, 403);
  assert.equal(one<{ n: number }>('SELECT COUNT(*) AS n FROM persons').n, 0);

  // Opening an emailed link proves the inbox: now the customer (only) links.
  const profile = await upsertCustomerProfile(d1, { email: 'guest@example.org', now: NOW });
  const verified = await markCustomerEmailVerified(d1, { customerProfileId: profile.id, now: NOW });
  assert.ok(verified.personId);
});

test('unlink clears the link, writes an audit row and keeps automatic re-linking off until linked again', async () => {
  const { d1, one, identity } = await setup();
  const user = await signUp(identity, 'unlink@example.org', 'worship');
  const personId = user.personId!;
  assert.equal(await unlinkUserFromPerson(d1, { userId: user.id, product: 'worship', now: NOW }), true);
  assert.equal(
    one<{ person_id: string | null }>('SELECT person_id FROM users WHERE id = ?', user.id).person_id,
    null,
  );
  const audit = one<{ action: string; payload_json: string }>(
    "SELECT action, payload_json FROM audit_logs WHERE action = 'person.unlinked'",
  );
  assert.equal(JSON.parse(audit.payload_json).personId, personId);
  assert.equal(await unlinkUserFromPerson(d1, { userId: user.id, product: 'worship', now: NOW }), false);

  // Signing in again does not silently re-link.
  const c = await identity.issueEmailChallenge('unlink@example.org', {
    product: 'worship',
    intent: 'signin',
  });
  const again = await identity.verifyEmailChallenge('unlink@example.org', c.code, {
    product: 'worship',
    intent: 'signin',
  });
  assert.equal(again.personId, null);
  const view = await listPersonProducts(d1, { userId: user.id, product: 'worship' });
  assert.equal(view.optedOut, true);

  // The person links again explicitly from the account page.
  const relinked = await linkUserToVerifiedPerson(d1, {
    userId: user.id,
    email: 'unlink@example.org',
    product: 'worship',
    source: 'account_page',
    explicit: true,
    now: NOW + 1,
  });
  assert.equal(relinked.linked && relinked.personId, personId);
});

test("a Clerk email change never moves another product's person link (commit 2b08ce3 rule)", async () => {
  const { d1, one, identity } = await setup();
  // One users row backs Worship and Live accounts (emailed-code flow).
  const shared = await signUp(identity, 'old@example.org', 'worship');
  await signUp(identity, 'old@example.org', 'live');
  const kept = await linkUserToVerifiedPerson(d1, {
    userId: shared.id,
    email: 'new@example.org',
    product: 'live',
    source: 'clerk',
    allowRelink: true,
    now: NOW,
  });
  assert.equal(kept.linked, false);
  assert.equal(
    one<{ person_id: string }>('SELECT person_id FROM users WHERE id = ?', shared.id).person_id,
    shared.personId,
  );

  // A product-only row (Clerk registration) follows its own verified email.
  d1.sqlite
    .prepare(
      "INSERT INTO users (id, email, verified_email_at, status, created_at) VALUES ('usr_live_solo', 'solo@example.org', ?1, 'active', ?1)",
    )
    .run(NOW);
  d1.sqlite
    .prepare(
      "INSERT INTO product_accounts (id, user_id, product, status, onboarding_status, created_at, updated_at) VALUES ('pacc_solo', 'usr_live_solo', 'live', 'active', 'pending', ?1, ?1)",
    )
    .run(NOW);
  const first = await linkUserToVerifiedPerson(d1, {
    userId: 'usr_live_solo',
    email: 'solo@example.org',
    product: 'live',
    source: 'clerk',
    allowRelink: true,
    now: NOW,
  });
  const moved = await linkUserToVerifiedPerson(d1, {
    userId: 'usr_live_solo',
    email: 'solo.new@example.org',
    product: 'live',
    source: 'clerk',
    allowRelink: true,
    now: NOW + 1,
  });
  assert.ok(first.linked && moved.linked && moved.personId !== first.personId);
});

test('concurrent links of the same verified email end with one person and one link', async () => {
  const { d1, one } = await setup();
  d1.sqlite
    .prepare(
      "INSERT INTO users (id, email, verified_email_at, status, created_at) VALUES ('usr_race', 'race@example.org', ?1, 'active', ?1)",
    )
    .run(NOW);
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      linkUserToVerifiedPerson(d1, {
        userId: 'usr_race',
        email: 'race@example.org',
        product: 'web',
        source: 'email_code',
        now: NOW,
      }),
    ),
  );
  const ids = new Set(results.map((r) => (r.linked ? r.personId : null)));
  assert.equal(ids.size, 1);
  assert.equal(one<{ n: number }>('SELECT COUNT(*) AS n FROM persons').n, 1);
  assert.equal(
    one<{ n: number }>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'person.linked'").n,
    1,
  );
});

test('customer account claim: the account lists the guest records of the same verified person (read-only)', async () => {
  const { d1, identity } = await setup();
  const profile = await upsertCustomerProfile(d1, { email: 'parent@example.org', now: NOW });
  await markCustomerEmailVerified(d1, { customerProfileId: profile.id, now: NOW });
  const [acc] = await recordTermsAcceptance(d1, {
    documents: termsDocumentsFor(['academy-enrollment-terms']).map((d) => ({
      slug: d.slug,
      version: d.version,
    })),
    subject: { customerProfileId: profile.id, email: 'parent@example.org' },
    context: 'registration:reg_sample',
    now: NOW,
  });
  d1.sqlite
    .prepare(
      `INSERT INTO academy_registrations (id, reference, program_slug, lesson_slug, location, student_first_name, student_age_band, customer_profile_id, status, terms_acceptance_id, idempotency_key, created_at, updated_at)
       VALUES ('reg_sample', 'GA-SAMPLE', 'piano', 'sample-piano-lesson', 'Sample Church Hall', 'Sam', '18_plus', ?1, 'reserved', ?2, 'idem-1', ?3, ?3)`,
    )
    .run(profile.id, acc.id, NOW);

  // The parent later creates an Academy account with the same address: same person, records listed.
  const user = await signUp(identity, 'parent@example.org', 'academy');
  const records = await listCustomerRecordsForPerson(d1, user.personId!);
  assert.deepEqual(
    records.map((r) => [r.kind, r.reference, r.managePath]),
    [['academy_registration', 'GA-SAMPLE', '/registrations/find']],
  );
});

function svixHeaders(secretB64: string, body: string, id = 'msg_1', ts = Math.floor(Date.now() / 1000)) {
  const sig = createHmac('sha256', Buffer.from(secretB64, 'base64'))
    .update(`${id}.${ts}.${body}`)
    .digest('base64');
  return {
    'svix-id': id,
    'svix-timestamp': String(ts),
    'svix-signature': `v1,${sig}`,
    'content-type': 'application/json',
  };
}

test('Clerk webhook: Svix-verified session.ended revokes only the matching sessions of this product; user.deleted suspends the link', async () => {
  const { d1, db, one, identity } = await setup();
  const user = await signUp(identity, 'clerk@example.org', 'live');
  const keep = await createSession(db, user.id, SECRET, { product: 'live' });
  const ended = await createSession(db, user.id, SECRET, { product: 'live', clerkSessionId: 'sess_ended' });
  const otherProduct = await createSession(db, user.id, SECRET, {
    product: 'worship',
    clerkSessionId: 'sess_ended',
  });
  const secretB64 = Buffer.from('clerk-webhook-test-key-0123456789').toString('base64');
  const env = {
    ENVIRONMENT: 'production',
    DB: d1,
    SESSION_SECRET: SECRET,
    CLERK_WEBHOOK_SECRET_LIVE: `whsec_${secretB64}`,
  };
  const hook = createAuthHandlers('live').clerkWebhookPOST;
  const send = (payload: unknown, headers?: Record<string, string>, e: Record<string, unknown> = env) => {
    const body = JSON.stringify(payload);
    return hook({
      request: new Request('https://live.gamostudio.org/api/auth/clerk-webhook', {
        method: 'POST',
        headers: headers ?? svixHeaders(secretB64, body),
        body,
      }),
      locals: { runtime: { env: e }, product: 'live' },
    });
  };

  assert.equal(
    (
      await send(
        { type: 'session.ended', data: { id: 'sess_ended' } },
        { 'content-type': 'application/json' },
      )
    ).status,
    400,
  );
  const forged = await send(
    { type: 'session.ended', data: { id: 'sess_ended' } },
    svixHeaders(
      Buffer.from('wrong-key-0123456789').toString('base64'),
      JSON.stringify({ type: 'session.ended', data: { id: 'sess_ended' } }),
    ),
  );
  assert.equal(forged.status, 401);
  assert.equal(
    (
      await send({ type: 'session.ended', data: { id: 'sess_ended' } }, undefined, {
        ...env,
        CLERK_WEBHOOK_SECRET_LIVE: undefined,
      })
    ).status,
    503,
  );

  const ok = await send({ type: 'session.ended', data: { id: 'sess_ended' } });
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { data: { sessionsRevoked: number } }).data.sessionsRevoked, 1);
  const revoked = (id: string) =>
    one<{ revoked_at: number | null }>('SELECT revoked_at FROM sessions WHERE id = ?', id).revoked_at !==
    null;
  assert.equal(revoked(ended.sessionId), true);
  assert.equal(revoked(keep.sessionId), false);
  assert.equal(revoked(otherProduct.sessionId), false, "another product's session is untouched");
  // Replays are harmless.
  assert.equal(
    (
      (await (await send({ type: 'session.ended', data: { id: 'sess_ended' } })).json()) as {
        data: { sessionsRevoked: number };
      }
    ).data.sessionsRevoked,
    0,
  );
  assert.equal(
    ((await (await send({ type: 'email.created', data: {} })).json()) as { data: { status: string } }).data
      .status,
    'ignored',
  );

  // user.deleted: every Live session of the linked user ends and the identity link is suspended.
  d1.sqlite
    .prepare(
      "INSERT INTO clerk_identity_links (id, product, clerk_app_id, clerk_issuer, clerk_user_id, clerk_email, user_id, product_account_id, status, linked_at, updated_at) SELECT 'clink_1', 'live', 'app', 'https://x', 'user_clerk_1', 'clerk@example.org', ?1, id, 'active', ?2, ?2 FROM product_accounts WHERE user_id = ?1 AND product = 'live'",
    )
    .run(user.id, NOW);
  const outcome = await applyClerkWebhookEvent(d1, {
    product: 'live',
    type: 'user.deleted',
    data: { id: 'user_clerk_1' },
    now: NOW,
  });
  assert.deepEqual(outcome, { status: 'revoked', event: 'user.deleted', sessions: 1, linkSuspended: true });
  assert.equal(revoked(keep.sessionId), true);
  assert.equal(revoked(otherProduct.sessionId), false);
  assert.equal(
    one<{ status: string }>("SELECT status FROM clerk_identity_links WHERE id = 'clink_1'").status,
    'suspended',
  );
  const later = new Request('https://live.gamostudio.org/account', {
    headers: { cookie: `__session=${encodeURIComponent(keep.cookieValue)}` },
  });
  assert.equal(await resolveAuth(later, db, { secret: SECRET, product: 'live' }), null);
});

test('legacy unlink (audit row only, column NULL) still counts as opted out and is backfilled', async () => {
  const { d1, one, identity } = await setup();
  const user = await signUp(identity, 'legacy@example.org', 'worship');
  d1.sqlite
    .prepare('UPDATE users SET person_id = NULL, person_link_opt_out_at = NULL WHERE id = ?')
    .run(user.id);
  d1.sqlite
    .prepare(
      "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, payload_json, created_at) VALUES ('audit_legacy', ?1, 'person.unlinked', 'user', ?1, '{}', ?2)",
    )
    .run(user.id, NOW);
  const blocked = await linkUserToVerifiedPerson(d1, {
    userId: user.id,
    email: 'legacy@example.org',
    product: 'worship',
    source: 'email_code',
    now: NOW + 5,
  });
  assert.equal(blocked.linked, false);
  assert.equal(
    one<{ o: number }>('SELECT person_link_opt_out_at AS o FROM users WHERE id = ?', user.id).o,
    NOW,
  );
  const back = await linkUserToVerifiedPerson(d1, {
    userId: user.id,
    email: 'legacy@example.org',
    product: 'worship',
    source: 'account_page',
    explicit: true,
    now: NOW + 6,
  });
  assert.equal(back.linked, true);
  assert.equal(
    one<{ o: number | null }>('SELECT person_link_opt_out_at AS o FROM users WHERE id = ?', user.id).o,
    null,
  );
});
