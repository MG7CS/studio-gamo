import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SecretNotConfiguredError } from './crypto.ts';
import { hashEmail, hashIp, hashPii } from './pii-hash.ts';
import { signValue, verifySignedValue } from './signed-value.ts';

const PII = 'pii-hash-secret-for-tests-only-000000001';

test('pii hashing: keyed, deterministic, domain-separated, fails closed without a secret', async () => {
  const a = await hashPii('203.0.113.7', PII);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await hashPii('203.0.113.7', PII));
  assert.notEqual(a, await hashPii('203.0.113.7', PII.replace('1', '2')));
  assert.equal(
    await hashEmail('  Sample.Parent+Live@Example.ORG ', PII),
    await hashEmail('sample.parent+live@example.org', PII),
  );
  assert.notEqual(
    await hashEmail('x@example.org', PII),
    await hashIp('x@example.org', PII),
    'email and IP hashes never collide',
  );
  await assert.rejects(() => hashPii('x', undefined), SecretNotConfiguredError);
  await assert.rejects(() => hashEmail('x@example.org', 'short'), SecretNotConfiguredError);
});

test('signed values: tamper-evident, expiring, purpose-bound', async () => {
  const secret = 's'.repeat(32);
  const signed = await signValue({
    value: 'csess_abc',
    expiresAt: 2000,
    secret,
    purpose: 'customer-session',
  });
  assert.match(signed, /^csess_abc\.2000\.[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(await verifySignedValue({ signed, now: 1999, secret, purpose: 'customer-session' }), {
    value: 'csess_abc',
    expiresAt: 2000,
  });
  assert.equal(
    await verifySignedValue({ signed, now: 2000, secret, purpose: 'customer-session' }),
    null,
    'expired',
  );
  assert.equal(
    await verifySignedValue({ signed, now: 1, secret, purpose: 'other-purpose' }),
    null,
    'other purpose',
  );
  assert.equal(
    await verifySignedValue({ signed, now: 1, secret: 't'.repeat(32), purpose: 'customer-session' }),
    null,
  );
  assert.equal(
    await verifySignedValue({
      signed: signed.replace('2000', '9000'),
      now: 1,
      secret,
      purpose: 'customer-session',
    }),
    null,
  );
  assert.equal(
    await verifySignedValue({
      signed: signed.replace('csess_abc', 'csess_abd'),
      now: 1,
      secret,
      purpose: 'customer-session',
    }),
    null,
  );
  for (const bad of [null, '', 'a.b', 'a.b.c.d', 'x.notanumber.y'])
    assert.equal(await verifySignedValue({ signed: bad, now: 1, secret, purpose: 'customer-session' }), null);
  assert.equal(
    await verifySignedValue({ signed, now: 1, secret: 'short', purpose: 'customer-session' }),
    null,
  );
  await assert.rejects(() => signValue({ value: 'a b', expiresAt: 1, secret, purpose: 'p' }), RangeError);
  await assert.rejects(
    () =>
      signValue({
        value: 'a',
        expiresAt: 1,
        secret: undefined,
        purpose: 'p',
        secretName: 'CUSTOMER_SESSION_SECRET',
      }),
    (e: unknown) => e instanceof SecretNotConfiguredError && e.variable === 'CUSTOMER_SESSION_SECRET',
  );
});
