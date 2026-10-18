/**
 * Ticket QR payload (design §6):
 *
 *   GL1.<TICKET>.<V>.<MAC>
 *   GL1    format + key id ("GL" Gamo Live, digit = key generation; rotation adds GL2 while GL1 is still accepted)
 *   TICKET the 26 Crockford symbols of the ticket id (tickets.id = 'tkt_' + lower-case form)
 *   V      version, base 10, 1–999999 (bumped by transfer and reissue)
 *   MAC    26 Crockford symbols = first 128 bits of
 *          HMAC-SHA256(secret[keyId], keyId + "|" + ticketId + "|" + V + "|" + eventId + "|" + qr_salt)
 *
 * Only QR alphanumeric characters (0-9, A-Z, '.') → alphanumeric mode, ≤ 64 characters.
 * No personal data. Parsing never throws: every failure is a typed result.
 */
import { decodeBase32, encodeBase32, randomBase32 } from './base32.ts';
import { constantTimeEqual, hmacSha256, isUsableSecret, sha256Hex } from './crypto.ts';
import { isTicketId, qrPartToTicketId, ticketIdToQrPart } from './ids.ts';

export const TICKET_QR_MAX_LENGTH = 64;
export const TICKET_QR_MAX_VERSION = 999_999;
/** Key id issued for new tickets. */
export const CURRENT_QR_KEY_ID = 'GL1';

/** `GL1`…`GL9`. */
export type QrKeyId = `GL${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
/** Secrets by key id, e.g. `{ GL1: env.TICKET_QR_SECRET_GL1 }`. Missing/short entries are unusable. */
export type QrKeyring = Partial<Record<QrKeyId, string | undefined>>;

export function isQrKeyId(value: unknown): value is QrKeyId {
  return typeof value === 'string' && /^GL[1-9]$/.test(value);
}

/** Builds the keyring from the environment (`TICKET_QR_SECRET_GL1`, `TICKET_QR_SECRET_GL2`, …). */
export function qrKeyringFromEnv(env: Record<string, unknown>): QrKeyring {
  const ring: QrKeyring = {};
  for (let n = 1; n <= 9; n++) {
    const id = `GL${n}` as QrKeyId;
    const value = env[`TICKET_QR_SECRET_${id}`];
    if (isUsableSecret(value)) ring[id] = value;
  }
  return ring;
}

export interface TicketQrFields {
  /** `tkt_` + 26 symbols (`newTicketId()`). */
  ticketId: string;
  version: number;
  eventId: string;
  /** tickets.qr_salt (`newQrSalt()`). */
  salt: string;
}

export type SignTicketQrResult =
  | { ok: true; payload: string; keyId: QrKeyId; mac: string; macDigest: string }
  | { ok: false; reason: 'not_configured' | 'invalid_fields' };

export type ParsedTicketQr = { keyId: QrKeyId; ticketId: string; version: number; mac: string };

export type ParseTicketQrResult =
  ({ ok: true } & ParsedTicketQr) | { ok: false; reason: 'empty' | 'too_long' | 'legacy' | 'malformed' };

export type VerifyTicketQrResult = { ok: true } | { ok: false; reason: 'unknown_key' | 'bad_signature' };

const PAYLOAD = /^(GL[1-9])\.([0-9A-HJKMNP-TV-Z]{26})\.([1-9][0-9]{0,5})\.([0-9A-HJKMNP-TV-Z]{26})$/;

function validFields(f: TicketQrFields): boolean {
  return (
    isTicketId(f.ticketId) &&
    Number.isInteger(f.version) &&
    f.version >= 1 &&
    f.version <= TICKET_QR_MAX_VERSION &&
    typeof f.eventId === 'string' &&
    f.eventId.length > 0 &&
    !f.eventId.includes('|') &&
    typeof f.salt === 'string' &&
    f.salt.length >= 16 &&
    !f.salt.includes('|')
  );
}

async function computeMac(secret: string, keyId: QrKeyId, f: TicketQrFields): Promise<string> {
  const digest = await hmacSha256(secret, `${keyId}|${f.ticketId}|${f.version}|${f.eventId}|${f.salt}`);
  return encodeBase32(digest.slice(0, 16));
}

/** A per-ticket salt (130 random bits) for `tickets.qr_salt`. A new salt is optional on reissue: the version bump already changes the MAC. */
export function newQrSalt(): string {
  return randomBase32(26).toLowerCase();
}

/** SHA-256 hex of the MAC: stored as `tickets.qr_signature_hash` and shipped in offline manifests. */
export async function macDigest(mac: string): Promise<string> {
  return sha256Hex(mac);
}

/** Signs a ticket. `keyId` defaults to `CURRENT_QR_KEY_ID`; its secret must be ≥ 32 characters. */
export async function signTicketQr(
  fields: TicketQrFields,
  keyring: QrKeyring,
  keyId: QrKeyId = CURRENT_QR_KEY_ID,
): Promise<SignTicketQrResult> {
  if (!validFields(fields) || !isQrKeyId(keyId)) return { ok: false, reason: 'invalid_fields' };
  const secret = keyring[keyId];
  if (!isUsableSecret(secret)) return { ok: false, reason: 'not_configured' };
  const mac = await computeMac(secret, keyId, fields);
  const payload = `${keyId}.${ticketIdToQrPart(fields.ticketId)}.${fields.version}.${mac}`;
  return { ok: true, payload, keyId, mac, macDigest: await macDigest(mac) };
}

/** True for tokens issued before 0013 (`gamt_<event8>_<hex32>`, free RSVPs; read-only legacy path). */
export function isLegacyTicketToken(value: unknown): boolean {
  return typeof value === 'string' && /^gamt_[A-Za-z0-9_-]{1,8}_[0-9a-f]{32}$/.test(value);
}

/**
 * Parses a scanned payload (surrounding whitespace ignored, case-insensitive). Does not verify the MAC:
 * load the ticket by `ticketId`, then call `verifyTicketQrMac` with its event id and salt.
 */
export function parseTicketQr(input: unknown): ParseTicketQrResult {
  if (typeof input !== 'string') return { ok: false, reason: 'malformed' };
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (trimmed.length > TICKET_QR_MAX_LENGTH) return { ok: false, reason: 'too_long' };
  if (isLegacyTicketToken(trimmed)) return { ok: false, reason: 'legacy' };
  const match = PAYLOAD.exec(trimmed.toUpperCase());
  if (!match) return { ok: false, reason: 'malformed' };
  const [, keyId, ticketPart, versionText, mac] = match;
  const ticketId = qrPartToTicketId(ticketPart);
  // The MAC must decode to exactly 16 bytes with zero padding (one canonical spelling).
  if (!ticketId || !isQrKeyId(keyId) || !decodeBase32(mac, 16)) return { ok: false, reason: 'malformed' };
  return { ok: true, keyId, ticketId, version: Number(versionText), mac };
}

/**
 * Constant-time MAC check against the ticket's stored event id and salt. The version is the one
 * in the payload; compare it with `tickets.version` separately (a lower one is `stale_version`).
 */
export async function verifyTicketQrMac(
  parsed: ParsedTicketQr,
  stored: { eventId: string; salt: string },
  keyring: QrKeyring,
): Promise<VerifyTicketQrResult> {
  const secret = keyring[parsed.keyId];
  if (!isUsableSecret(secret)) return { ok: false, reason: 'unknown_key' };
  const fields: TicketQrFields = {
    ticketId: parsed.ticketId,
    version: parsed.version,
    eventId: stored.eventId,
    salt: stored.salt,
  };
  if (!validFields(fields)) return { ok: false, reason: 'bad_signature' };
  const expected = await computeMac(secret, parsed.keyId, fields);
  return constantTimeEqual(expected, parsed.mac) ? { ok: true } : { ok: false, reason: 'bad_signature' };
}

/** Offline check (scanner manifest): constant-time compare of sha256(MAC) with the manifest entry. */
export async function macMatchesDigest(mac: string, expectedDigest: string): Promise<boolean> {
  return constantTimeEqual(await macDigest(mac), String(expectedDigest).toLowerCase());
}
