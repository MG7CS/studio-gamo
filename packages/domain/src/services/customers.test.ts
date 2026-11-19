import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import {
  customerCookieName,
  CUSTOMER_LINK_INVALID_MESSAGE,
  endCustomerSession,
  issueCustomerLink,
  openCustomerLink,
  readCustomerSession,
  upsertCustomerProfile,
} from './customers.ts';
import { CustomerLinkTokens } from '../security/link-tokens.ts';

const SECRET = 'customer-link-secret-for-tests-000000000001';
const ENV = { ENVIRONMENT: 'production', CUSTOMER_LINK_SECRET: SECRET };
const NOW = 1_900_000_000;

const cookieValue = (setCookie: string) =>
  setCookie.split(';')[0].slice(customerCookieName('academy').length + 1);
const withCookie = (setCookie: string) =>
  new Request('https://academy.example.test/registrations', {
    headers: { cookie: `other=1; ${customerCookieName('academy')}=${cookieValue(setCookie)}` },
  });

test('issue → open → read → end: cookie flags, TTL capped by the token, token-free session', async () => {
  const db = await createMigratedD1();
  const p = await upsertCustomerProfile(db, { email: 'sam@example.org', now: NOW });
  const link = await issueCustomerLink(db, ENV, {
    product: 'academy',
    customerProfileId: p.id,
    scope: 'registration:acr_sample',
    purpose: 'registration',
    expiresAt: NOW + 3600,
    now: NOW,
    ipHash: 'b'.repeat(64),
    openPath: '/registrations/open',
  });
  assert.equal(link.path, `/registrations/open?t=${link.token}`);
  assert.equal(link.token.length, 43);

  const opened = await openCustomerLink(db, ENV, {
    product: 'academy',
    token: link.token,
    now: NOW + 3000,
    https: true,
  });
  assert.ok(opened.ok);
  assert.equal(opened.purpose, 'registration');
  assert.equal(opened.session.expiresAt, NOW + 3600, 'never past the token expiry');
  assert.match(
    opened.cookie,
    /^__gamo_customer_academy=csn_[a-z0-9]+\.\d+\.[A-Za-z0-9_-]+; Path=\/; Max-Age=600; HttpOnly; SameSite=Lax; Secure$/,
  );
  assert.ok(!opened.cookie.includes(link.token), 'the cookie never carries the link token');
  const verified = db.sqlite
    .prepare('SELECT email_verified_at, person_id FROM customer_profiles WHERE id = ?')
    .get(p.id) as any;
  assert.equal(verified.email_verified_at, NOW + 3000, 'opening a link proves inbox control');
  assert.ok(verified.person_id);

  const session = await readCustomerSession(db, ENV, withCookie(opened.cookie), NOW + 3100, 'academy');
  assert.deepEqual(session, {
    sessionId: opened.session.sessionId,
    customerProfileId: p.id,
    scope: 'registration:acr_sample',
    expiresAt: NOW + 3600,
  });
  assert.equal(
    await readCustomerSession(db, ENV, withCookie(opened.cookie), NOW + 3600, 'academy'),
    null,
    'expired',
  );
  assert.equal(
    await readCustomerSession(db, ENV, new Request('https://x.test/'), NOW, 'academy'),
    null,
    'no cookie',
  );
  const tampered = opened.cookie.replace(/\.(\d+)\./, (_m, exp) => `.${Number(exp) + 999}.`);
  assert.equal(
    await readCustomerSession(db, ENV, withCookie(tampered), NOW + 3100, 'academy'),
    null,
    'bad signature',
  );
  assert.equal(
    await readCustomerSession(
      db,
      { ...ENV, CUSTOMER_LINK_SECRET: 'x'.repeat(40) },
      withCookie(opened.cookie),
      NOW + 3100,
      'academy',
    ),
    null,
    'other secret',
  );

  const ended = await endCustomerSession(db, ENV, withCookie(opened.cookie), NOW + 3200, false, 'academy');
  assert.ok(ended.ended);
  assert.match(
    ended.cookie,
    /^__gamo_customer_academy=; Path=\/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax$/,
  );
  assert.equal(
    await readCustomerSession(db, ENV, withCookie(opened.cookie), NOW + 3201, 'academy'),
    null,
    'revoked',
  );
});

test('every failure has the same public message (invalid, expired, revoked, exhausted, erased)', async () => {
  const db = await createMigratedD1();
  const p = await upsertCustomerProfile(db, { email: 'sam@example.org', now: NOW });
  const issue = (extra: object = {}) =>
    issueCustomerLink(db, ENV, {
      product: 'academy',
      customerProfileId: p.id,
      scope: 'registration:acr_other',
      purpose: 'registration',
      expiresAt: NOW + 600,
      now: NOW,
      ...extra,
    });
  const outcomes = [];
  outcomes.push(
    await openCustomerLink(db, ENV, { product: 'academy', token: 'not-a-token', now: NOW, https: true }),
  );
  outcomes.push(
    await openCustomerLink(db, ENV, {
      product: 'academy',
      token: (await issue()).token,
      now: NOW + 601,
      https: true,
    }),
  );
  const revoked = await issue();
  await new CustomerLinkTokens(db, SECRET, 'academy').revoke(revoked.id, NOW);
  outcomes.push(
    await openCustomerLink(db, ENV, { product: 'academy', token: revoked.token, now: NOW + 1, https: true }),
  );
  const once = await issue({ maxUses: 1 });
  assert.ok(
    (await openCustomerLink(db, ENV, { product: 'academy', token: once.token, now: NOW + 1, https: true }))
      .ok,
  );
  outcomes.push(
    await openCustomerLink(db, ENV, { product: 'academy', token: once.token, now: NOW + 2, https: true }),
  );
  const erased = await issue();
  db.sqlite.prepare('UPDATE customer_profiles SET erased_at = ? WHERE id = ?').run(NOW + 3, p.id);
  outcomes.push(
    await openCustomerLink(db, ENV, { product: 'academy', token: erased.token, now: NOW + 4, https: true }),
  );
  for (const o of outcomes) assert.deepEqual(o, { ok: false, message: CUSTOMER_LINK_INVALID_MESSAGE });
});
