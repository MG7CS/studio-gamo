import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  bytesToHex,
  constantTimeEqual,
  hexToBytes,
  hmacSha256Hex,
  isUsableSecret,
  requireSecret,
  SecretNotConfiguredError,
  sha256Hex,
} from './crypto.ts';

test('crypto helpers: hex, base64url, hashes, constant-time compare, secrets', async () => {
  const bytes = new Uint8Array([0, 1, 254, 255]);
  assert.equal(bytesToHex(bytes), '0001feff');
  assert.deepEqual(hexToBytes('0001FEFF'), bytes);
  assert.equal(hexToBytes('abc'), null);
  assert.equal(hexToBytes('zz'), null);
  assert.equal(bytesToBase64Url(new Uint8Array([251, 255])), '-_8');
  assert.deepEqual(base64UrlToBytes('-_8'), new Uint8Array([251, 255]));
  assert.equal(base64UrlToBytes('-_9'), null, 'non-canonical trailing bits');
  assert.equal(base64UrlToBytes('a+b='), null);
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  // RFC 4231 test case 2.
  assert.equal(
    await hmacSha256Hex('Jefe', 'what do ya want for nothing?'),
    '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
  );
  assert.equal(constantTimeEqual('abc', 'abc'), true);
  assert.equal(constantTimeEqual('abc', 'abd'), false);
  assert.equal(constantTimeEqual('abc', 'abcd'), false);
  assert.equal(constantTimeEqual('', ''), true);
  assert.equal(constantTimeEqual(1 as unknown as string, '1'), false);
  assert.equal(isUsableSecret('x'.repeat(31)), false);
  assert.equal(isUsableSecret(' '.repeat(40)), false);
  assert.equal(isUsableSecret('x'.repeat(32)), true);
  assert.throws(
    () => requireSecret('PII_HASH_SECRET', 'short'),
    (e: unknown) =>
      e instanceof SecretNotConfiguredError &&
      e.variable === 'PII_HASH_SECRET' &&
      !e.message.includes('short'),
  );
});
