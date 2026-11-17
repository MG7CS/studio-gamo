/**
 * Money for the invoice screens. Every amount is an integer number of USD cents; dollars exist only in
 * text typed into (or shown beside) a field. Nothing here uses floating point on the way in.
 */

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** `12550` -> `$125.50`. Only for integer cents (anything else shows an em dash). */
export function formatUsd(cents: number): string {
  if (!Number.isSafeInteger(cents)) return '—';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${USD.format(Math.trunc(abs / 100) + (abs % 100) / 100)}`;
}

const DOLLARS = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/**
 * Text typed as dollars -> integer cents, or `null` when it is not a plain non-negative amount
 * ("125", "125.5", "$1,250.00"). Negative numbers, exponents, more than two decimals and anything
 * that does not fit a safe integer are refused.
 */
export function dollarsToCents(input: string): number | null {
  const m = DOLLARS.exec(input.trim());
  if (!m) return null;
  const whole = Number((m[1] as string).replace(/,/g, ''));
  const frac = (m[2] ?? '').padEnd(2, '0');
  const cents = whole * 100 + Number(frac === '' ? '0' : frac);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** `12550` -> `125.50` for a text input's value. */
export function centsToDollarsInput(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) return '';
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
