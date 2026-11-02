/**
 * Small Web Crypto helpers shared by the security primitives. Runs in Workers and Node 22.
 * Nothing here logs or returns secret material.
 */

const encoder = new TextEncoder();

/** A fresh ArrayBuffer-backed copy (Web Crypto's BufferSource typing rejects shared buffers). */
function toBytes(input: string | Uint8Array): Uint8Array<ArrayBuffer> {
  if (typeof input === 'string') {
    const encoded = encoder.encode(input);
    const out = new Uint8Array(encoded.length);
    out.set(encoded);
    return out;
  }
  const out = new Uint8Array(input.length);
  out.set(input);
  return out;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(length) || length < 1 || length > 65536)
    throw new RangeError('randomBytes: bad length');
  return crypto.getRandomValues(new Uint8Array(length));
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/** Decodes lower- or upper-case hex; null when malformed. */
export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Strict base64url (no padding); null when malformed. */
export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    // Reject non-canonical encodings (trailing bits set), so one token has exactly one spelling.
    return bytesToBase64Url(out) === text ? out : null;
  } catch {
    return null;
  }
}

export async function sha256(input: string | Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', toBytes(input)));
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  return bytesToHex(await sha256(input));
}

export async function hmacSha256(
  secret: string,
  message: string | Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    'raw',
    toBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, toBytes(message)));
}

export async function hmacSha256Hex(secret: string, message: string | Uint8Array): Promise<string> {
  return bytesToHex(await hmacSha256(secret, message));
}

/**
 * Compares two strings without an early exit on the first differing character.
 * Different lengths return false (lengths of MACs/hashes compared here are public).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Minimum length for every HMAC secret (design §10). */
export const MIN_SECRET_LENGTH = 32;

/** Thrown when a required secret is missing or too short. Carries the variable NAME only. */
export class SecretNotConfiguredError extends Error {
  readonly code = 'NOT_CONFIGURED';
  constructor(readonly variable: string) {
    super(`${variable} is not configured`);
    this.name = 'SecretNotConfiguredError';
  }
}

export function isUsableSecret(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= MIN_SECRET_LENGTH;
}

/** Returns the secret, or throws `SecretNotConfiguredError(name)` (callers answer 503). */
export function requireSecret(name: string, value: unknown): string {
  if (!isUsableSecret(value)) throw new SecretNotConfiguredError(name);
  return value;
}
