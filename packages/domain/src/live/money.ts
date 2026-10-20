/**
 * Money helpers for Gamo Live (docs/LIVE_PAYMENTS.md §2). Amounts are integer cents; the only currency is `usd`.
 */

/** "$12.50" from 1250; "−$3.00" for negatives. Never shows fractions of a cent. */
export function formatCents(cents: number, currency = 'usd'): string {
  if (!Number.isInteger(cents)) throw new RangeError('formatCents: cents must be an integer');
  if (currency !== 'usd') throw new RangeError('formatCents: only usd is supported');
  const sign = cents < 0 ? '−' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Parses what a person typed as dollars ("25", "25.5", "$1,025.50") into cents. Returns null for anything else,
 * including negative amounts and more than two decimals.
 */
export function parseDollarsToCents(input: unknown): number | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const text = String(input)
    .trim()
    .replace(/^\$/, '')
    .replace(/,(?=\d{3}(\D|$))/g, '');
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** True for a whole number of cents in [min, max]. */
export function isCents(value: unknown, min = 0, max = 100_000_000): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
