/**
 * Crockford base32 (https://www.crockford.com/base32.html), without check symbols.
 * Output is upper case. Decoding is case-insensitive and strict: the look-alike letters
 * I, L, O and U are rejected (not aliased), as is any non-zero padding in the last symbol,
 * so every value has exactly one accepted spelling.
 */

export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const DECODE: Record<string, number> = Object.fromEntries(
  [...CROCKFORD_ALPHABET].map((char, index) => [char, index]),
);

/** Packs bytes 5 bits at a time; the final symbol is zero-padded. */
export function encodeBase32(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += CROCKFORD_ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

/**
 * Decodes Crockford base32. Returns null for an invalid character, non-zero padding bits,
 * or (when `expectedBytes` is given) a different decoded length.
 */
export function decodeBase32(text: string, expectedBytes?: number): Uint8Array | null {
  if (typeof text !== 'string') return null;
  const upper = text.toUpperCase();
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of upper) {
    const value = DECODE[char];
    if (value === undefined) return null;
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits >= 5 || buffer !== 0) return null;
  if (expectedBytes !== undefined && out.length !== expectedBytes) return null;
  return Uint8Array.from(out);
}

/** True when every character is a (case-insensitive) Crockford symbol. */
export function isBase32(text: string): boolean {
  return typeof text === 'string' && text.length > 0 && /^[0-9A-HJKMNP-TV-Z]+$/i.test(text);
}

/** `length` independent random symbols (5 random bits each, exactly uniform). */
export function randomBase32(length: number): string {
  if (!Number.isInteger(length) || length < 1 || length > 1024)
    throw new RangeError('randomBase32: bad length');
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += CROCKFORD_ALPHABET[b & 31];
  return out;
}
