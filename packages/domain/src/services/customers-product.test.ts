/** Customer links and sessions belong to one product (D-116): cross-product use fails both ways. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import {
  customerCookieName,
  issueCustomerLink,
  openCustomerLink,
  readCustomerSession,
  upsertCustomerProfile,
} from './customers.ts';
import { CustomerLinkTokens, hashLinkToken } from '../security/link-tokens.ts';

const SECRET = 'customer-link-secret-for-tests-000000000001';
const ENV = { ENVIRONMENT: 'production', CUSTOMER_LINK_SECRET: SECRET };
const NOW = 1_900_000_000;

test('an Academy link never opens in Live and a Live link never opens in Academy; the cookies are separate', async () => {
  const db = await createMigratedD1();
  const p = await upsertCustomerProfile(db, { email: 'both@example.org', now: NOW });
  const base = {
    customerProfileId: p.id,
    scope: 'customer:all' as const,
    purpose: 'recovery' as const,
    expiresAt: NOW + 600,
    now: NOW,
  };
  const academy = await issueCustomerLink(db, ENV, { ...base, product: 'academy' });
  const live = await issueCustomerLink(db, ENV, { ...base, product: 'live' });
  for (const [token, wrong] of [
    [academy.token, 'live'],
    [live.token, 'academy'],
  ] as const) {
    const refused = await openCustomerLink(db, ENV, { token, now: NOW + 1, https: true, product: wrong });
    assert.equal(refused.ok, false, `${wrong} refuses the other product's link`);
  }
  assert.notEqual(
    await hashLinkToken(academy.token, SECRET, 'academy'),
    await hashLinkToken(academy.token, SECRET, 'live'),
  );

  // The refused attempts used nothing up: the right product still opens it.
  const opened = await openCustomerLink(db, ENV, {
    token: academy.token,
    now: NOW + 2,
    https: true,
    product: 'academy',
  });
  assert.ok(opened.ok);
  if (!opened.ok) return;
  assert.match(opened.cookie, new RegExp(`^${customerCookieName('academy')}=`));
  const value = opened.cookie.split(';')[0].split('=').slice(1).join('=');
  const asCookie = (name: string) =>
    new Request('https://x.example.test/', { headers: { cookie: `${name}=${value}` } });
  assert.ok(await readCustomerSession(db, ENV, asCookie(customerCookieName('academy')), NOW + 3, 'academy'));
  // Renamed to Live's cookie, or read as Live: refused.
  assert.equal(
    await readCustomerSession(db, ENV, asCookie(customerCookieName('live')), NOW + 3, 'live'),
    null,
  );
  assert.equal(
    await readCustomerSession(db, ENV, asCookie(customerCookieName('academy')), NOW + 3, 'live'),
    null,
  );

  // Rows issued before migration 0017 (product NULL) are refused.
  const legacy = await new CustomerLinkTokens(db, SECRET, 'live').issue(base);
  (db as unknown as { sqlite: { prepare(s: string): { run(...a: unknown[]): void } } }).sqlite
    .prepare('UPDATE customer_access_tokens SET product = NULL WHERE id = ?')
    .run(legacy.id);
  const refused = await openCustomerLink(db, ENV, {
    token: legacy.token,
    now: NOW + 4,
    https: true,
    product: 'live',
  });
  assert.equal(refused.ok, false);
});
