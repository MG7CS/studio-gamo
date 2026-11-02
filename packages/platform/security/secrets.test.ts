import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SecretNotConfiguredError } from './crypto.ts';
import { clientIp, hashEmail, hashIp, hashPii, isPlausibleEmail, normalizeEmail } from './pii-hash.ts';
import {
  generateScannerPin,
  hashScannerPin,
  isWellFormedPin,
  PIN_PBKDF2_ITERATIONS,
  verifyScannerPin,
} from './pin.ts';
import { signValue, verifySignedValue } from './signed-value.ts';

const PII = 'pii-hash-secret-for-tests-only-000000001';
const PEPPER = 'scanner-session-secret-for-tests-0000001';

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

test('email normalisation keeps dots and plus-tags; plausibility check is simple', () => {
  assert.equal(normalizeEmail('  A.B+tag@Gmail.COM '), 'a.b+tag@gmail.com');
  assert.notEqual(normalizeEmail('ab@gmail.com'), normalizeEmail('a.b@gmail.com'));
  for (const ok of ['a@b.co', 'sample.parent+live@example.org']) assert.ok(isPlausibleEmail(ok), ok);
  for (const bad of ['', 'a', 'a@b', 'a b@c.org', 'a@@b.org', 'a@b..org', `${'x'.repeat(320)}@b.org`])
    assert.ok(!isPlausibleEmail(bad), bad);
});

test('clientIp trusts only cf-connecting-ip', () => {
  const req = (headers: Record<string, string>) => new Request('https://live.gamostudio.org/', { headers });
  assert.equal(clientIp(req({ 'cf-connecting-ip': '203.0.113.7' })), '203.0.113.7');
  assert.equal(clientIp(req({ 'cf-connecting-ip': '2001:db8::1' })), '2001:db8::1');
  assert.equal(clientIp(req({ 'x-forwarded-for': '198.51.100.1' })), null);
  assert.equal(clientIp(req({ 'cf-connecting-ip': '<script>' })), null);
  assert.equal(clientIp(req({})), null);
});

test('scanner PINs: 6 digits, uniform-looking, PBKDF2 with salt and pepper, constant-time verify', async () => {
  const pins = Array.from({ length: 2000 }, generateScannerPin);
  assert.ok(pins.every(isWellFormedPin));
  assert.ok(new Set(pins).size > 1900, 'no obvious repetition');
  const firstDigits = new Map<string, number>();
  for (const p of pins) firstDigits.set(p[0], (firstDigits.get(p[0]) ?? 0) + 1);
  assert.equal(firstDigits.size, 10, 'leading zeros and every digit occur');

  const stored = await hashScannerPin('012345', { pepper: PEPPER });
  assert.match(stored.hash, new RegExp(`^pbkdf2_sha256\\$${PIN_PBKDF2_ITERATIONS}\\$[0-9a-f]{64}$`));
  assert.match(stored.salt, /^[0-9a-f]{32}$/);
  assert.notEqual((await hashScannerPin('012345', { pepper: PEPPER })).hash, stored.hash, 'salted');
  assert.equal(await verifyScannerPin('012345', stored, { pepper: PEPPER }), true);
  assert.equal(await verifyScannerPin('012346', stored, { pepper: PEPPER }), false);
  assert.equal(await verifyScannerPin('012345', stored), false, 'the pepper is required');
  assert.equal(await verifyScannerPin('012345', stored, { pepper: PEPPER.replace('1', '2') }), false);
  for (const bad of ['12345', '1234567', 'abcdef', 12345, null])
    assert.equal(await verifyScannerPin(bad, stored, { pepper: PEPPER }), false, String(bad));
  assert.equal(await verifyScannerPin('012345', { hash: 'md5$x', salt: stored.salt }), false);
  assert.equal(
    await verifyScannerPin('012345', { hash: 'pbkdf2_sha256$999999999$aa', salt: stored.salt }),
    false,
  );
  assert.equal(await verifyScannerPin('012345', { hash: stored.hash, salt: 'zz' }), false);
  await assert.rejects(() => hashScannerPin('12a456'), RangeError);
  await assert.rejects(
    () => hashScannerPin('123456', { iterations: 200_000 }),
    RangeError,
    'Workers cap PBKDF2 at 100 000',
  );
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
    await verifySignedValue({ signed, now: 1, secret, purpose: 'scanner-device' }),
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
        secretName: 'SCANNER_SESSION_SECRET',
      }),
    (e: unknown) => e instanceof SecretNotConfiguredError && e.variable === 'SCANNER_SESSION_SECRET',
  );
});
