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

/** RFC 5322 addr-spec subset, ASCII only: dot-atom local part, LDH domain labels with at least one dot. */
export const EMAIL_ADDR_SPEC = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/**
 * Strict address check used wherever an address is validated, rate-limited, stored, suppressed or sent to:
 * ASCII addr-spec only (no display names like `x<a@b.com>`, no commas or spaces, no zero-width or other
 * non-ASCII characters, no `..`, no leading/trailing dot in the local part, labels not starting or ending
 * with `-`), local part <= 64, labels <= 63, total <= 254 (RFC 5321).
 */
export function isPlausibleEmail(email: string): boolean {
  const e = normalizeEmail(email);
  if (e.length < 3 || e.length > 254 || !EMAIL_ADDR_SPEC.test(e) || e.includes('..')) return false;
  const at = e.lastIndexOf('@');
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.')) return false;
  return domain
    .split('.')
    .every((l) => l.length >= 1 && l.length <= 63 && !l.startsWith('-') && !l.endsWith('-'));
}

/** `email_log.recipient_hash`, `email_suppressions.email_hash`, email rate-limit buckets. */
export async function hashEmail(email: string, secret: string | undefined): Promise<string> {
  return hashPii(`email:${normalizeEmail(email)}`, secret);
}

/**
 * Rotating through a /64 is free for an IPv6 user, so IPv6 addresses are masked to their /64 before hashing
 * and IPv4-mapped IPv6 (`::ffff:a.b.c.d`) counts as the IPv4 address. Anything unparseable is hashed as typed.
 */
export function ipBucketKey(ip: string): string {
  const v = ip.trim().toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v);
  if (mapped) return mapped[1];
  if (!v.includes(':')) return v;
  let text = v;
  const tail = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (tail) {
    const [a, b, c, d] = tail.slice(1).map(Number);
    text = text.slice(0, tail.index) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const halves = text.split('::');
  if (halves.length > 2) return v;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length;
    if (missing < 0) return v;
    groups = [...head, ...Array<string>(missing).fill('0'), ...rest];
  } else {
    groups = head;
  }
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return v;
  return (
    groups
      .slice(0, 4)
      .map((g) => g.padStart(4, '0'))
      .join(':') + '::/64'
  );
}

/** `*.ip_hash` columns and IP rate-limit buckets (IPv6 masked to /64, see `ipBucketKey`). */
export async function hashIp(ip: string, secret: string | undefined): Promise<string> {
  return hashPii(`ip:${ipBucketKey(ip)}`, secret);
}

/** The client IP Cloudflare reports (`cf-connecting-ip`), or null. No other header is trusted. */
export function clientIp(request: Request): string | null {
  const value = request.headers.get('cf-connecting-ip')?.trim();
  if (!value || value.length > 45 || !/^[0-9a-fA-F:.]+$/.test(value)) return null;
  return value;
}
