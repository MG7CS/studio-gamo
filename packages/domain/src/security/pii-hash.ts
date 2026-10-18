/**
 * Keyed hashes for personal data we must match on but not store in clear (IPs, emails in logs,
 * suppressions, rate-limit buckets). HMAC-SHA256 hex with PII_HASH_SECRET (≥ 32 characters),
 * which is separate from SESSION_SECRET. Use the same helper everywhere so hashes line up.
 */
import { hmacSha256Hex, requireSecret } from './crypto.ts';

/** HMAC-SHA256 hex of `value`. Throws `SecretNotConfiguredError('PII_HASH_SECRET')` without a usable secret. */
export async function hashPii(value: string, secret: string | undefined): Promise<string> {
  return hmacSha256Hex(requireSecret('PII_HASH_SECRET', secret), value);
}

/**
 * Normalises an email for identity and matching: trim + lower-case. Dots and plus-tags are kept
 * (`a.b+c@gmail.com` stays as typed): treating them as equal would merge different people on many providers.
 */
export function normalizeEmail(input: string): string {
  return String(input).trim().toLowerCase();
}

/** A deliberately simple syntax check (one `@`, a dot in the domain, no spaces, ≤ 320 chars). */
export function isPlausibleEmail(email: string): boolean {
  const e = normalizeEmail(email);
  return e.length >= 3 && e.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !e.includes('..');
}

/** `email_log.recipient_hash`, `email_suppressions.email_hash`, email rate-limit buckets. */
export async function hashEmail(email: string, secret: string | undefined): Promise<string> {
  return hashPii(`email:${normalizeEmail(email)}`, secret);
}

/** `*.ip_hash` columns and IP rate-limit buckets. */
export async function hashIp(ip: string, secret: string | undefined): Promise<string> {
  return hashPii(`ip:${ip.trim().toLowerCase()}`, secret);
}

/** The client IP Cloudflare reports (`cf-connecting-ip`), or null. No other header is trusted. */
export function clientIp(request: Request): string | null {
  const value = request.headers.get('cf-connecting-ip')?.trim();
  if (!value || value.length > 45 || !/^[0-9a-fA-F:.]+$/.test(value)) return null;
  return value;
}
