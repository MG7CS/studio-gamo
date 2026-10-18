/**
 * Door-staff scanner PINs (design T-09): 6 digits, PBKDF2-HMAC-SHA256 (100 000 iterations, the
 * Workers maximum and the value the admin password code uses), random 16-byte salt.
 * Pass SCANNER_SESSION_SECRET as `pepper` so a database copy alone cannot be brute-forced offline;
 * online guessing is stopped by the 5-attempt lock on `scanner_sessions`.
 */
import { bytesToHex, constantTimeEqual, hexToBytes, hmacSha256, randomBytes } from './crypto.ts';

export const SCANNER_PIN_LENGTH = 6;
export const PIN_PBKDF2_ITERATIONS = 100_000;
export const PIN_MAX_FAILED_ATTEMPTS = 5;
export const PIN_LOCK_SECONDS = 15 * 60;

/** A uniformly random 6-digit PIN (leading zeros allowed). */
export function generateScannerPin(): string {
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000; // rejection bound for uniformity
  for (;;) {
    const [n] = crypto.getRandomValues(new Uint32Array(1));
    if (n < limit) return String(n % 1_000_000).padStart(SCANNER_PIN_LENGTH, '0');
  }
}

export function isWellFormedPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^[0-9]{6}$/.test(pin);
}

export interface StoredPin {
  /** `pbkdf2_sha256$<iterations>$<hash hex>` → `scanner_sessions.pin_hash`. */
  hash: string;
  /** Salt hex → `scanner_sessions.pin_salt`. */
  salt: string;
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number, pepper?: string) {
  const password = pepper ? await hmacSha256(pepper, `scanner-pin|${pin}`) : new TextEncoder().encode(pin);
  const material = new Uint8Array(password.length);
  material.set(password);
  const key = await crypto.subtle.importKey('raw', material, { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function hashScannerPin(
  pin: string,
  options: { pepper?: string; iterations?: number } = {},
): Promise<StoredPin> {
  if (!isWellFormedPin(pin)) throw new RangeError('hashScannerPin: a PIN is 6 digits');
  const iterations = options.iterations ?? PIN_PBKDF2_ITERATIONS;
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > PIN_PBKDF2_ITERATIONS)
    throw new RangeError('hashScannerPin: iterations out of range');
  const salt = randomBytes(16);
  return {
    hash: `pbkdf2_sha256$${iterations}$${await derive(pin, salt, iterations, options.pepper)}`,
    salt: bytesToHex(salt),
  };
}

/** Constant-time check. Malformed input or storage returns false (never throws). */
export async function verifyScannerPin(
  pin: unknown,
  stored: StoredPin,
  options: { pepper?: string } = {},
): Promise<boolean> {
  if (!isWellFormedPin(pin)) return false;
  const parts = typeof stored?.hash === 'string' ? stored.hash.split('$') : [];
  if (parts.length !== 3 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > PIN_PBKDF2_ITERATIONS) return false;
  const salt = hexToBytes(String(stored.salt));
  if (!salt || salt.length < 16) return false;
  return constantTimeEqual(await derive(pin, salt, iterations, options.pepper), parts[2]);
}
