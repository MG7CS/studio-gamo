/**
 * Identifiers. Ticket ids carry the 130 random bits the QR code encodes (design §6); other ids
 * are prefixed random strings; order references are short, human-readable and unambiguous.
 */
import { randomBase32 } from './base32.ts';

/** `tkt_` + 26 lower-case Crockford symbols = 130 random bits. */
export function newTicketId(): string {
  return `tkt_${randomBase32(26).toLowerCase()}`;
}

const TICKET_ID = /^tkt_[0-9a-hjkmnp-tv-z]{26}$/;

/** True for ids produced by `newTicketId()` (legacy `tkt_<order>_<n>` ids are not QR-addressable). */
export function isTicketId(value: unknown): value is string {
  return typeof value === 'string' && TICKET_ID.test(value);
}

/** The QR form of a ticket id: the 26 symbols in upper case. Null for any other id. */
export function ticketIdToQrPart(ticketId: string): string | null {
  return isTicketId(ticketId) ? ticketId.slice(4).toUpperCase() : null;
}

/** Inverse of `ticketIdToQrPart` (case-insensitive). Null when the part is not 26 valid symbols. */
export function qrPartToTicketId(part: string): string | null {
  const id = `tkt_${String(part).toLowerCase()}`;
  return isTicketId(id) ? id : null;
}

const PREFIX = /^[a-z][a-z0-9]{0,15}$/;

/**
 * `<prefix>_<26 lower-case Crockford symbols>` (130 random bits), e.g. `ord_…`, `oit_…`, `hold_…`.
 * Prefixes are 1–16 lower-case letters/digits starting with a letter.
 */
export function newPrefixedId(prefix: string, randomSymbols = 26): string {
  if (!PREFIX.test(prefix)) throw new RangeError('newPrefixedId: invalid prefix');
  if (!Number.isInteger(randomSymbols) || randomSymbols < 16 || randomSymbols > 52)
    throw new RangeError('newPrefixedId: 16–52 random symbols');
  return `${prefix}_${randomBase32(randomSymbols).toLowerCase()}`;
}

/** Order-reference alphabet: Crockford minus 0 and 1 (no 0/O, 1/I/L or U confusion). 30 symbols. */
export const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomReferenceSymbols(count: number): string {
  let out = '';
  while (out.length < count) {
    for (const b of crypto.getRandomValues(new Uint8Array(count * 2))) {
      // 240 = 8 × 30: rejection sampling keeps every symbol equally likely.
      if (b < 240 && out.length < count) out += REFERENCE_ALPHABET[b % 30];
    }
  }
  return out;
}

const REFERENCE = /^([A-Z]{2})-([2-9A-HJKMNP-TV-Z]{4})-([2-9A-HJKMNP-TV-Z]{4})$/;

/**
 * Human reference such as `GL-7K4M-92QX` (~39 random bits). Not a credential: it only helps
 * people and staff find an order. Unique index on insert; on the (rare) collision retry.
 */
export function newOrderReference(prefix = 'GL'): string {
  if (!/^[A-Z]{2}$/.test(prefix)) throw new RangeError('newOrderReference: two upper-case letters');
  return `${prefix}-${randomReferenceSymbols(4)}-${randomReferenceSymbols(4)}`;
}

export function isOrderReference(value: unknown, prefix = 'GL'): value is string {
  if (typeof value !== 'string') return false;
  const match = REFERENCE.exec(value);
  return match !== null && match[1] === prefix;
}

/**
 * Normalises what a person typed ("gl 7k4m 92qx", "GL-7K4M92QX") to `GL-7K4M-92QX`, or null.
 * The look-alikes O→0 and I/L→1 are not mapped because 0 and 1 are never issued.
 */
export function normalizeOrderReference(input: string, prefix = 'GL'): string | null {
  const compact = String(input).toUpperCase().replace(/[\s-]/g, '');
  if (!compact.startsWith(prefix) || compact.length !== prefix.length + 8) return null;
  const body = compact.slice(prefix.length);
  const candidate = `${prefix}-${body.slice(0, 4)}-${body.slice(4)}`;
  return isOrderReference(candidate, prefix) ? candidate : null;
}
