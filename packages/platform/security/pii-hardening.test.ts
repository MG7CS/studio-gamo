/** Strict email syntax (D-117) and IPv6 /64 bucketing (D-118). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashIp, ipBucketKey, isPlausibleEmail, clientIp } from './pii-hash.ts';

const SECRET = 'pii-hardening-test-secret-0123456789abcdef';

test('isPlausibleEmail refuses display names, commas, zero-width and non-ASCII characters', () => {
  for (const bad of [
    'x<a@b.com>',
    'Name <a@b.com>',
    'a@b.com, c@d.com',
    'a@b.com;c@d.com',
    'a​@b.com',
    'a@b​.com',
    'a@b.com​',
    'josé@b.com',
    'a@b.cоm',
    'a b@c.com',
    'a..b@c.com',
    '.a@c.com',
    'a.@c.com',
    'a@c',
    'a@-c.com',
    'a@c-.com',
    'a@c..com',
    `${'a'.repeat(65)}@c.com`,
    `a@${'b'.repeat(64)}.com`,
    `a@${'b.'.repeat(130)}com`,
    '"a"@b.com',
    'a@b.com\r\nBcc: x@y.com',
  ])
    assert.equal(isPlausibleEmail(bad), false, JSON.stringify(bad));
  for (const good of [
    'sam@example.org',
    'Sam.O+tag@Example.ORG',
    "o'brien@example.org",
    'a_b-c@sub.example.org',
  ])
    assert.equal(isPlausibleEmail(good), true, good);
});

test('IPv6 addresses share one bucket per /64; IPv4-mapped IPv6 is the IPv4 address', async () => {
  const a = '2001:db8:1:2:aaaa:bbbb:cccc:dddd';
  const b = '2001:0db8:0001:0002:1:2:3:4';
  assert.equal(ipBucketKey(a), ipBucketKey(b));
  assert.equal(ipBucketKey(a), '2001:0db8:0001:0002::/64');
  assert.notEqual(ipBucketKey(a), ipBucketKey('2001:db8:1:3::1'));
  assert.equal(ipBucketKey('2001:db8::1'), '2001:0db8:0000:0000::/64');
  assert.equal(ipBucketKey('::1'), '0000:0000:0000:0000::/64');
  assert.equal(ipBucketKey('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(ipBucketKey('203.0.113.7'), '203.0.113.7');
  assert.equal(await hashIp(a, SECRET), await hashIp(b, SECRET));
  assert.equal(await hashIp('::ffff:203.0.113.7', SECRET), await hashIp('203.0.113.7', SECRET));
  assert.notEqual(await hashIp('203.0.113.7', SECRET), await hashIp('203.0.113.8', SECRET));
  assert.equal(ipBucketKey('not-an-ip:zz'), 'not-an-ip:zz');
  assert.equal(clientIp(new Request('https://x.test/', { headers: { 'cf-connecting-ip': a } })), a);
});
