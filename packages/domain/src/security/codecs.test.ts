import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CROCKFORD_ALPHABET, decodeBase32, encodeBase32, isBase32, randomBase32 } from './base32.ts';
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
import {
  isOrderReference,
  isTicketId,
  newOrderReference,
  newPrefixedId,
  newTicketId,
  normalizeOrderReference,
  qrPartToTicketId,
  REFERENCE_ALPHABET,
  ticketIdToQrPart,
} from './ids.ts';

test('base32: known vectors, round trips, upper-case output', () => {
  assert.equal(encodeBase32(new Uint8Array([])), '');
  assert.equal(encodeBase32(new Uint8Array([0])), '00');
  assert.equal(encodeBase32(new Uint8Array([0xff])), 'ZW');
  assert.equal(encodeBase32(new TextEncoder().encode('foobar')), 'CSQPYRK1E8');
  for (let n = 0; n < 40; n++) {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    const text = encodeBase32(bytes);
    assert.equal(text, text.toUpperCase());
    assert.deepEqual(decodeBase32(text), bytes);
    assert.deepEqual(decodeBase32(text.toLowerCase()), bytes, 'decode is case-insensitive');
  }
});

test('base32: rejects invalid characters, look-alikes and non-canonical padding', () => {
  for (const bad of ['I0', 'L0', 'O0', 'U0', 'A-', 'ab c', '*', 'ÄB'])
    assert.equal(decodeBase32(bad), null, bad);
  assert.equal(decodeBase32('ZZ'), null, 'last symbol has non-zero padding bits');
  assert.equal(decodeBase32('Z'), null, 'a lone symbol cannot encode a byte');
  assert.equal(decodeBase32('000'), null, 'three symbols are never produced');
  assert.equal(decodeBase32('ZW', 2), null, 'length mismatch');
  assert.equal(isBase32('7K4M92QX'), true);
  assert.equal(isBase32('7K4M-92QX'), false);
  assert.equal(isBase32(''), false);
  assert.equal(CROCKFORD_ALPHABET.length, 32);
  const r = randomBase32(26);
  assert.match(r, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.throws(() => randomBase32(0), RangeError);
});

test('ids: ticket ids carry 26 random symbols and map to and from the QR part', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const id = newTicketId();
    assert.match(id, /^tkt_[0-9a-hjkmnp-tv-z]{26}$/);
    assert.ok(isTicketId(id));
    const part = ticketIdToQrPart(id)!;
    assert.equal(part, id.slice(4).toUpperCase());
    assert.equal(qrPartToTicketId(part), id);
    assert.equal(qrPartToTicketId(part.toLowerCase()), id);
    seen.add(id);
  }
  assert.equal(seen.size, 200);
  assert.equal(isTicketId('tkt_ord_1_0'), false, 'legacy deterministic ids are not QR-addressable');
  assert.equal(ticketIdToQrPart('tkt_short'), null);
  assert.equal(qrPartToTicketId('IIIIIIIIIIIIIIIIIIIIIIIIII'), null);
});

test('ids: prefixed ids validate the prefix', () => {
  assert.match(newPrefixedId('ord'), /^ord_[0-9a-hjkmnp-tv-z]{26}$/);
  assert.match(newPrefixedId('scan', 16), /^scan_[0-9a-z]{16}$/);
  for (const bad of ['', 'Ord', '1ab', 'a_b', 'abcdefghijklmnopq'])
    assert.throws(() => newPrefixedId(bad), RangeError, bad);
  assert.throws(() => newPrefixedId('ord', 8), RangeError);
});

test('ids: order references are GL-XXXX-XXXX without ambiguous symbols and normalise typed input', () => {
  for (let i = 0; i < 300; i++) {
    const ref = newOrderReference();
    assert.match(ref, /^GL-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/);
    assert.ok(!/[01ILOU]/.test(ref.slice(3)), ref);
    assert.ok(isOrderReference(ref));
  }
  assert.equal(REFERENCE_ALPHABET.length, 30);
  assert.equal(normalizeOrderReference(' gl 7k4m 92qx '), 'GL-7K4M-92QX');
  assert.equal(normalizeOrderReference('GL-7K4M92QX'), 'GL-7K4M-92QX');
  assert.equal(normalizeOrderReference('GL-7K4M-92Q'), null);
  assert.equal(normalizeOrderReference('GL-0K4M-92QX'), null, '0 is never issued');
  assert.equal(normalizeOrderReference('GA-7K4M-92QX'), null);
  assert.match(newOrderReference('GA'), /^GA-/);
  assert.throws(() => newOrderReference('gl'), RangeError);
});

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
