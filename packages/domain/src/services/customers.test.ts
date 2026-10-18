import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import {
  CUSTOMER_COOKIE_NAME,
  CUSTOMER_LINK_INVALID_MESSAGE,
  CustomerInputError,
  endCustomerSession,
  findOrCreatePersonForVerifiedEmail,
  issueCustomerLink,
  markCustomerEmailVerified,
  openCustomerLink,
  readCustomerSession,
  revokeCustomerSessions,
  upsertCustomerProfile,
} from './customers.ts';
import { CUSTOMER_SESSION_TTL_SECONDS, CustomerLinkTokens } from '../security/link-tokens.ts';
import { SecretNotConfiguredError } from '../security/crypto.ts';

const SECRET = 'customer-link-secret-for-tests-000000000001';
const ENV = { ENVIRONMENT: 'production', CUSTOMER_LINK_SECRET: SECRET };
const NOW = 1_900_000_000;

const cookieValue = (setCookie: string) => setCookie.split(';')[0].slice(CUSTOMER_COOKIE_NAME.length + 1);
const withCookie = (setCookie: string) =>
  new Request('https://live.example.test/tickets', {
    headers: { cookie: `other=1; ${CUSTOMER_COOKIE_NAME}=${cookieValue(setCookie)}` },
  });

test('upsertCustomerProfile: normalised email is the key; fills an empty name; never changes verification', async () => {
  const db = await createMigratedD1();
  const a = await upsertCustomerProfile(db, { email: ' Sam@Example.org ', now: NOW });
  assert.equal(a.emailNormalized, 'sam@example.org');
  assert.equal(a.displayName, null);
  const b = await upsertCustomerProfile(db, {
    email: 'sam@example.org',
    displayName: '  Sam   Lee ',
    now: NOW + 1,
  });
  assert.equal(b.id, a.id);
  assert.equal(b.displayName, 'Sam Lee');
  const c = await upsertCustomerProfile(db, {
    email: 'SAM@example.org',
    displayName: 'Someone Else',
    now: NOW + 2,
  });
  assert.equal(c.displayName, 'Sam Lee', 'an existing name is not overwritten by a guest form');
  await markCustomerEmailVerified(db, { customerProfileId: a.id, now: NOW + 3 });
  const d = await upsertCustomerProfile(db, { email: 'sam@example.org', now: NOW + 4 });
  assert.equal(d.emailVerifiedAt, NOW + 3);
  assert.ok(d.personId);
  await assert.rejects(upsertCustomerProfile(db, { email: 'not-an-email', now: NOW }), CustomerInputError);
});

test('erased profiles are returned unchanged and cannot be verified or sent links', async () => {
  const db = await createMigratedD1();
  const p = await upsertCustomerProfile(db, { email: 'gone@example.org', now: NOW });
  db.sqlite.prepare('UPDATE customer_profiles SET erased_at = ? WHERE id = ?').run(NOW + 1, p.id);
  const again = await upsertCustomerProfile(db, {
    email: 'gone@example.org',
    displayName: 'New',
    now: NOW + 2,
  });
  assert.equal(again.erasedAt, NOW + 1);
  assert.equal(again.displayName, null);
  await assert.rejects(
    markCustomerEmailVerified(db, { customerProfileId: p.id, now: NOW }),
    CustomerInputError,
  );
  await assert.rejects(
    issueCustomerLink(db, ENV, {
      customerProfileId: p.id,
      scope: 'customer:all',
      purpose: 'recovery',
      expiresAt: NOW + 1800,
      now: NOW,
    }),
    CustomerInputError,
  );
});

test('markCustomerEmailVerified links the person (created once), is idempotent, and leaves users alone', async () => {
  const db = await createMigratedD1();
  const p = await upsertCustomerProfile(db, { email: 'sam@example.org', displayName: 'Sam', now: NOW });
  const v1 = await markCustomerEmailVerified(db, { customerProfileId: p.id, now: NOW + 10 });
  const v2 = await markCustomerEmailVerified(db, { customerProfileId: p.id, now: NOW + 20 });
  assert.equal(v1.emailVerifiedAt, NOW + 10);
  assert.equal(v2.emailVerifiedAt, NOW + 10, 'first verification time is kept');
  assert.equal(v1.personId, v2.personId);
  const persons = db.sqlite.prepare('SELECT email_normalized, display_name FROM persons').all();
  assert.deepEqual(
    persons.map((r) => ({ ...r })),
    [{ email_normalized: 'sam@example.org', display_name: 'Sam' }],
  );
  const person = await findOrCreatePersonForVerifiedEmail(db, 'SAM@example.org', NOW + 30);
  assert.equal(person.id, v1.personId, 'Agent A gets the same person for the same verified email');
  assert.equal(person.emailVerifiedAt, NOW + 10);
  await assert.rejects(
    markCustomerEmailVerified(db, { customerProfileId: 'cus_missing', now: NOW }),
    CustomerInputError,
  );
});

test('issue → open → read → end: cookie flags, TTL capped by the token, token-free session', async () => {
  const db = await createMigratedD1();
  const p = await upsertCustomerProfile(db, { email: 'sam@example.org', now: NOW });
  const link = await issueCustomerLink(db, ENV, {
    customerProfileId: p.id,
    scope: 'order:ord_sample',
    purpose: 'order',
    expiresAt: NOW + 3600,
    now: NOW,
    ipHash: 'b'.repeat(64),
    openPath: '/tickets/open',
  });
  assert.equal(link.path, `/tickets/open?t=${link.token}`);
  assert.equal(link.token.length, 43);

  const opened = await openCustomerLink(db, ENV, { token: link.token, now: NOW + 3000, https: true });
  assert.ok(opened.ok);
  assert.equal(opened.purpose, 'order');
  assert.equal(opened.session.expiresAt, NOW + 3600, 'never past the token expiry');
  assert.match(
    opened.cookie,
    /^__gamo_customer=csn_[a-z0-9]+\.\d+\.[A-Za-z0-9_-]+; Path=\/; Max-Age=600; HttpOnly; SameSite=Lax; Secure$/,
  );
  assert.ok(!opened.cookie.includes(link.token), 'the cookie never carries the link token');
  const verified = db.sqlite
    .prepare('SELECT email_verified_at, person_id FROM customer_profiles WHERE id = ?')
    .get(p.id) as any;
  assert.equal(verified.email_verified_at, NOW + 3000, 'opening a link proves inbox control');
  assert.ok(verified.person_id);

  const session = await readCustomerSession(db, ENV, withCookie(opened.cookie), NOW + 3100);
  assert.deepEqual(session, {
    sessionId: opened.session.sessionId,
    customerProfileId: p.id,
    scope: 'order:ord_sample',
    expiresAt: NOW + 3600,
  });
  assert.equal(await readCustomerSession(db, ENV, withCookie(opened.cookie), NOW + 3600), null, 'expired');
  assert.equal(await readCustomerSession(db, ENV, new Request('https://x.test/'), NOW), null, 'no cookie');
  const tampered = opened.cookie.replace(/\.(\d+)\./, (_m, exp) => `.${Number(exp) + 999}.`);
  assert.equal(await readCustomerSession(db, ENV, withCookie(tampered), NOW + 3100), null, 'bad signature');
  assert.equal(
    await readCustomerSession(
      db,
      { ...ENV, CUSTOMER_LINK_SECRET: 'x'.repeat(40) },
      withCookie(opened.cookie),
      NOW + 3100,
    ),
    null,
    'other secret',
  );

  const ended = await endCustomerSession(db, ENV, withCookie(opened.cookie), NOW + 3200, false);
  assert.ok(ended.ended);
  assert.match(
    ended.cookie,
    /^__gamo_customer=; Path=\/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax$/,
  );
  assert.equal(await readCustomerSession(db, ENV, withCookie(opened.cookie), NOW + 3201), null, 'revoked');
});

test('a full 2 h session when the token lives longer; http (local) cookies are not Secure', async () => {
  const db = await createMigratedD1();
  const p = await upsertCustomerProfile(db, { email: 'sam@example.org', now: NOW });
  const link = await issueCustomerLink(db, ENV, {
    customerProfileId: p.id,
    scope: 'customer:all',
    purpose: 'recovery',
    expiresAt: NOW + 30 * 86400,
    now: NOW,
  });
  assert.equal(link.path, `/link?t=${link.token}`);
  const opened = await openCustomerLink(db, ENV, {
    token: link.token,
    now: NOW,
    https: false,
    markEmailVerified: false,
  });
  assert.ok(opened.ok);
  assert.equal(opened.session.expiresAt, NOW + CUSTOMER_SESSION_TTL_SECONDS);
  assert.ok(!opened.cookie.includes('Secure'));
  const row = db.sqlite
    .prepare('SELECT email_verified_at FROM customer_profiles WHERE id = ?')
    .get(p.id) as any;
  assert.equal(row.email_verified_at, null, 'markEmailVerified: false skips verification');
  assert.equal(await revokeCustomerSessions(db, p.id, NOW + 1), 1);
  assert.equal(await readCustomerSession(db, ENV, withCookie(opened.cookie), NOW + 2), null);
});

test('every failure has the same public message (invalid, expired, revoked, exhausted, erased)', async () => {
  const db = await createMigratedD1();
  const p = await upsertCustomerProfile(db, { email: 'sam@example.org', now: NOW });
  const issue = (extra: object = {}) =>
    issueCustomerLink(db, ENV, {
      customerProfileId: p.id,
      scope: 'transfer:tkt_sample',
      purpose: 'transfer',
      expiresAt: NOW + 600,
      now: NOW,
      ...extra,
    });
  const outcomes = [];
  outcomes.push(await openCustomerLink(db, ENV, { token: 'not-a-token', now: NOW, https: true }));
  outcomes.push(
    await openCustomerLink(db, ENV, { token: (await issue()).token, now: NOW + 601, https: true }),
  );
  const revoked = await issue();
  await new CustomerLinkTokens(db, SECRET).revoke(revoked.id, NOW);
  outcomes.push(await openCustomerLink(db, ENV, { token: revoked.token, now: NOW + 1, https: true }));
  const once = await issue({ maxUses: 1 });
  assert.ok((await openCustomerLink(db, ENV, { token: once.token, now: NOW + 1, https: true })).ok);
  outcomes.push(await openCustomerLink(db, ENV, { token: once.token, now: NOW + 2, https: true }));
  const erased = await issue();
  db.sqlite.prepare('UPDATE customer_profiles SET erased_at = ? WHERE id = ?').run(NOW + 3, p.id);
  outcomes.push(await openCustomerLink(db, ENV, { token: erased.token, now: NOW + 4, https: true }));
  for (const o of outcomes) assert.deepEqual(o, { ok: false, message: CUSTOMER_LINK_INVALID_MESSAGE });
});

test('CUSTOMER_LINK_SECRET: missing outside local throws SecretNotConfiguredError; local uses a dev key', async () => {
  const db = await createMigratedD1();
  const p = await upsertCustomerProfile(db, { email: 'sam@example.org', now: NOW });
  const input = {
    customerProfileId: p.id,
    scope: 'customer:all' as const,
    purpose: 'recovery' as const,
    expiresAt: NOW + 600,
    now: NOW,
  };
  for (const ENVIRONMENT of ['production', 'preview', undefined])
    await assert.rejects(issueCustomerLink(db, { ENVIRONMENT }, input), SecretNotConfiguredError);
  await assert.rejects(
    readCustomerSession(
      db,
      { ENVIRONMENT: 'preview', CUSTOMER_LINK_SECRET: 'short' },
      new Request('https://x.test'),
      NOW,
    ),
    SecretNotConfiguredError,
  );
  const local = { ENVIRONMENT: 'local' };
  const link = await issueCustomerLink(db, local, input);
  const opened = await openCustomerLink(db, local, { token: link.token, now: NOW + 1, https: false });
  assert.ok(opened.ok);
  assert.ok(await readCustomerSession(db, local, withCookie(opened.cookie), NOW + 2));
  const prod = await openCustomerLink(db, ENV, { token: link.token, now: NOW + 3, https: true });
  assert.equal(prod.ok, false, 'a token issued with the local key is useless with a real secret');
});
