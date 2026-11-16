/**
 * Invoice numbers: `GS-YYYY-NNNN`, sequential per year, restarting at 0001 each January.
 * Pure helpers; the database assigns the sequence inside a transaction (UNIQUE number column).
 */

export const INVOICE_NUMBER_PREFIX = 'GS';
const MIN_YEAR = 2000;
const MAX_YEAR = 9999;
const MAX_SEQUENCE = 999_999;
const NUMBER_PATTERN = /^GS-(\d{4})-(\d{4,6})$/;

export interface ParsedInvoiceNumber {
  year: number;
  sequence: number;
}

/** `formatInvoiceNumber(2026, 1)` -> `GS-2026-0001`. Pads to 4 digits; 5 and 6 digits when needed. */
export function formatInvoiceNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new RangeError('Invoice year must be an integer from 2000 to 9999.');
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
    throw new RangeError('Invoice sequence must be an integer from 1 to 999999.');
  }
  return `${INVOICE_NUMBER_PREFIX}-${year}-${String(sequence).padStart(4, '0')}`;
}

/** Parses a canonical invoice number; `null` for anything else (including non-canonical padding). */
export function parseInvoiceNumber(value: string): ParsedInvoiceNumber | null {
  const match = NUMBER_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const sequence = Number(match[2]);
  if (year < MIN_YEAR || sequence < 1) return null;
  return formatInvoiceNumber(year, sequence) === value ? { year, sequence } : null;
}

export const isValidInvoiceNumber = (value: string): boolean => parseInvoiceNumber(value) !== null;

/**
 * The invoice year for `now`. UTC by default so numbering is deterministic on Workers; pass an IANA
 * zone to number by local calendar year instead (decide once, then keep it).
 */
export function invoiceYear(now: Date, timeZone = 'UTC'): number {
  if (timeZone === 'UTC') return now.getUTCFullYear();
  const year = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(now);
  return Number(year);
}

/**
 * The next number given the highest number issued so far (`null` when none). A different or
 * unparseable previous year restarts at 0001, so the first invoice of a new year rolls over.
 */
export function nextInvoiceNumber(lastNumber: string | null, now: Date, timeZone = 'UTC'): string {
  const year = invoiceYear(now, timeZone);
  const last = lastNumber ? parseInvoiceNumber(lastNumber) : null;
  return formatInvoiceNumber(year, last && last.year === year ? last.sequence + 1 : 1);
}
