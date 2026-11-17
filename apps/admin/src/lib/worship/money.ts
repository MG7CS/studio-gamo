/**
 * Offer pay: staff type dollars, the system stores integer USD cents. No floating point is involved, so
 * "19.99" is exactly 1999. The cap stops a typo (an extra zero) from becoming an offer.
 */

/** The largest offer staff can send from the screen or the API: $5,000.00. Raise it here, not at call sites. */
export const MAX_OFFER_CENTS = 500_000;

/**
 * Parses a dollar amount typed by staff: digits with an optional `$`, optional thousands commas and up to
 * two decimals (`150`, `$150.5`, `1,200.00`). Returns integer cents, or null when the text is not an amount.
 * Zero and over-cap checks belong to `validateOfferCents`.
 */
export function dollarsToCents(input: unknown): number | null {
  if (typeof input !== 'string') return null;
  const text = input.trim().replace(/^\$\s*/, '');
  const match = /^(\d{1,3}(?:,\d{3})+|\d{1,7})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const whole = Number(match[1]!.replace(/,/g, ''));
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const cents = whole * 100 + fraction;
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Reads a cents value from JSON (a number) or a form (digits as text). Anything else is null. */
export function parseCents(input: unknown): number | null {
  if (typeof input === 'number') return Number.isSafeInteger(input) ? input : null;
  if (typeof input === 'string' && /^\d{1,9}$/.test(input.trim())) return Number(input.trim());
  return null;
}

/** An offer must be a positive whole number of cents and at most `MAX_OFFER_CENTS`. */
export function validateOfferCents(cents: number | null): cents is number {
  return cents !== null && Number.isSafeInteger(cents) && cents > 0 && cents <= MAX_OFFER_CENTS;
}

/** `150000` becomes `$1,500.00`. */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${whole}.${String(abs % 100).padStart(2, '0')}`;
}
