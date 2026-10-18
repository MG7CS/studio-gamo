/**
 * HMAC-signed, expiring cookie values (customer cookie from a link, scanner device cookie):
 *   <value>.<expiresAt>.<mac>    mac = base64url(HMAC-SHA256(secret, purpose|value|expiresAt))
 * `purpose` separates uses of one secret. The value itself is not secret (an id); never put PII in it.
 */
import { bytesToBase64Url, constantTimeEqual, hmacSha256, requireSecret } from './crypto.ts';

const VALUE = /^[A-Za-z0-9_-]{1,128}$/;
const PURPOSE = /^[a-z][a-z0-9_-]{0,31}$/;

async function mac(secret: string, purpose: string, value: string, expiresAt: number): Promise<string> {
  return bytesToBase64Url(await hmacSha256(secret, `${purpose}|${value}|${expiresAt}`));
}

export async function signValue(input: {
  value: string;
  expiresAt: number;
  secret: string | undefined;
  /** e.g. `customer-session`, `scanner-device`. */
  purpose: string;
  /** Variable name reported if the secret is missing (default SESSION_SECRET). */
  secretName?: string;
}): Promise<string> {
  const secret = requireSecret(input.secretName ?? 'SESSION_SECRET', input.secret);
  if (!VALUE.test(input.value) || !PURPOSE.test(input.purpose) || !Number.isInteger(input.expiresAt))
    throw new RangeError('signValue: invalid input');
  return `${input.value}.${input.expiresAt}.${await mac(secret, input.purpose, input.value, input.expiresAt)}`;
}

/** Returns the value when the signature is right and `now < expiresAt`; otherwise null. Never throws on bad input. */
export async function verifySignedValue(input: {
  signed: string | null | undefined;
  now: number;
  secret: string | undefined;
  purpose: string;
}): Promise<{ value: string; expiresAt: number } | null> {
  if (typeof input.signed !== 'string' || typeof input.secret !== 'string' || input.secret.trim().length < 32)
    return null;
  const parts = input.signed.split('.');
  if (parts.length !== 3) return null;
  const [value, expText, given] = parts;
  const expiresAt = Number(expText);
  if (!VALUE.test(value) || !/^[0-9]{1,12}$/.test(expText) || !PURPOSE.test(input.purpose)) return null;
  const expected = await mac(input.secret, input.purpose, value, expiresAt);
  if (!constantTimeEqual(expected, given)) return null;
  return expiresAt > input.now ? { value, expiresAt } : null;
}
