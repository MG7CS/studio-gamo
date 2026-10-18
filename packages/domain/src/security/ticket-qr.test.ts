import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeBase32 } from './base32.ts';
import { newTicketId } from './ids.ts';
import {
  isLegacyTicketToken,
  macDigest,
  macMatchesDigest,
  newQrSalt,
  parseTicketQr,
  qrKeyringFromEnv,
  signTicketQr,
  TICKET_QR_MAX_LENGTH,
  verifyTicketQrMac,
  type ParsedTicketQr,
  type QrKeyring,
  type TicketQrFields,
} from './ticket-qr.ts';

const KEYRING: QrKeyring = { GL1: 'k1-'.padEnd(40, 'a'), GL2: 'k2-'.padEnd(40, 'b') };
const fields = (over: Partial<TicketQrFields> = {}): TicketQrFields => ({
  ticketId: newTicketId(),
  version: 1,
  eventId: 'evt_sample_concert',
  salt: newQrSalt(),
  ...over,
});

async function signed(f: TicketQrFields, keyId: 'GL1' | 'GL2' = 'GL1') {
  const r = await signTicketQr(f, KEYRING, keyId);
  assert.ok(r.ok);
  return r;
}

async function verify(payload: string, stored: { eventId: string; salt: string }, ring = KEYRING) {
  const parsed = parseTicketQr(payload);
  assert.ok(parsed.ok, `parse ${payload}`);
  return verifyTicketQrMac(parsed as ParsedTicketQr, stored, ring);
}

test('payload is GL1.<26>.<V>.<26>, QR-alphanumeric only, at most 64 characters', async () => {
  for (const version of [1, 9, 10, 999_999]) {
    const f = fields({ version });
    const r = await signed(f);
    assert.match(r.payload, /^GL1\.[0-9A-HJKMNP-TV-Z]{26}\.[1-9][0-9]*\.[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.match(r.payload, /^[0-9A-Z .$%*+\-/:]+$/, 'QR alphanumeric mode characters only');
    assert.ok(r.payload.length <= TICKET_QR_MAX_LENGTH, `${r.payload.length}`);
    assert.equal(r.payload.split('.')[1], f.ticketId.slice(4).toUpperCase());
    assert.equal(r.macDigest, await macDigest(r.mac));
    assert.match(r.macDigest, /^[0-9a-f]{64}$/);
    assert.deepEqual(await verify(r.payload, f), { ok: true });
  }
});

test('changing any signed field, the version, the salt, the event or the key invalidates the MAC', async () => {
  const f = fields();
  const r = await signed(f);
  assert.deepEqual(await verify(r.payload, { eventId: 'evt_other', salt: f.salt }), {
    ok: false,
    reason: 'bad_signature',
  });
  assert.deepEqual(await verify(r.payload, { eventId: f.eventId, salt: newQrSalt() }), {
    ok: false,
    reason: 'bad_signature',
  });
  const [kid, ticket, version, mac] = r.payload.split('.');
  assert.deepEqual(await verify([kid, ticket, String(Number(version) + 1), mac].join('.'), f), {
    ok: false,
    reason: 'bad_signature',
  });
  const otherTicket = newTicketId().slice(4).toUpperCase();
  assert.deepEqual(await verify([kid, otherTicket, version, mac].join('.'), f), {
    ok: false,
    reason: 'bad_signature',
  });
  assert.deepEqual(await verify(['GL2', ticket, version, mac].join('.'), f), {
    ok: false,
    reason: 'bad_signature',
  });
  // Flip one MAC symbol (keeping canonical padding by changing a leading symbol).
  const flipped = (mac[0] === '0' ? '1' : '0') + mac.slice(1);
  assert.deepEqual(await verify([kid, ticket, version, flipped].join('.'), f), {
    ok: false,
    reason: 'bad_signature',
  });
  // Version bump re-signs to a different MAC.
  const v2 = await signed({ ...f, version: 2 });
  assert.notEqual(v2.mac, r.mac);
  assert.deepEqual(await verify(v2.payload, f), { ok: true });
});

test('key rotation: GL2 payloads verify with GL2, GL1 stays accepted, unknown keys are reported', async () => {
  const f = fields();
  const g1 = await signed(f, 'GL1');
  const g2 = await signed(f, 'GL2');
  assert.ok(g2.payload.startsWith('GL2.'));
  assert.notEqual(g1.mac, g2.mac);
  assert.deepEqual(await verify(g1.payload, f), { ok: true });
  assert.deepEqual(await verify(g2.payload, f), { ok: true });
  assert.deepEqual(await verify(g2.payload, f, { GL1: KEYRING.GL1 }), { ok: false, reason: 'unknown_key' });
  const g3 = parseTicketQr(g1.payload.replace(/^GL1/, 'GL3'));
  assert.ok(g3.ok);
  assert.deepEqual(await verifyTicketQrMac(g3 as ParsedTicketQr, f, KEYRING), {
    ok: false,
    reason: 'unknown_key',
  });
});

test('signing fails closed without a usable key or with invalid fields', async () => {
  assert.deepEqual(await signTicketQr(fields(), {}), { ok: false, reason: 'not_configured' });
  assert.deepEqual(await signTicketQr(fields(), { GL1: 'short' }), { ok: false, reason: 'not_configured' });
  for (const bad of [
    { ticketId: 'tkt_ord_1_0' },
    { version: 0 },
    { version: 1_000_000 },
    { version: 1.5 },
    { eventId: '' },
    { eventId: 'a|b' },
    { salt: 'short' },
  ])
    assert.deepEqual(
      await signTicketQr(fields(bad), KEYRING),
      { ok: false, reason: 'invalid_fields' },
      JSON.stringify(bad),
    );
  assert.deepEqual(
    qrKeyringFromEnv({ TICKET_QR_SECRET_GL1: 'x'.repeat(32), TICKET_QR_SECRET_GL2: 'short' }),
    {
      GL1: 'x'.repeat(32),
    },
  );
});

test('parsing never throws and types every failure', async () => {
  const r = await signed(fields());
  assert.deepEqual(
    { ...parseTicketQr(`  ${r.payload.toLowerCase()}\n`), mac: undefined },
    { ...parseTicketQr(r.payload), mac: undefined },
    'whitespace and case are tolerated',
  );
  const cases: Array<[unknown, string]> = [
    ['', 'empty'],
    ['   ', 'empty'],
    [null, 'malformed'],
    [42, 'malformed'],
    [{}, 'malformed'],
    ['x'.repeat(65), 'too_long'],
    ['gamt_evt12345_' + 'a'.repeat(32), 'legacy'],
    ['GL1.ABC.1.DEF', 'malformed'],
    [r.payload.replace('.1.', '.01.'), 'malformed'],
    [r.payload.replace('.1.', '.0.'), 'malformed'],
    [r.payload.replace(/^GL1/, 'GL0'), 'malformed'],
    [r.payload.replace(/^GL1/, 'XX1'), 'malformed'],
    [r.payload + '.', 'malformed'],
    [r.payload.replace(/.$/, 'U'), 'malformed'],
    // Non-canonical MAC padding (last symbol with low bits set) is rejected.
    [r.payload.slice(0, -1) + (r.payload.endsWith('Z') ? 'Y' : 'Z'), 'malformed'],
  ];
  for (const [input, reason] of cases)
    assert.deepEqual(parseTicketQr(input), { ok: false, reason }, String(input));
});

test('legacy tokens are detected; offline digests match only the current MAC', async () => {
  assert.equal(isLegacyTicketToken('gamt_evt_1234_' + '0123456789abcdef'.repeat(2)), true);
  assert.equal(isLegacyTicketToken('gamt_x_' + 'z'.repeat(32)), false);
  assert.equal(isLegacyTicketToken('GL1.X'), false);
  const r = await signed(fields());
  assert.equal(await macMatchesDigest(r.mac, r.macDigest), true);
  assert.equal(await macMatchesDigest(r.mac, r.macDigest.toUpperCase()), true);
  assert.equal(await macMatchesDigest(encodeBase32(new Uint8Array(16)), r.macDigest), false);
});
