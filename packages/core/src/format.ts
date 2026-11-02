/** Display formatting shared by all apps. Amounts are integer minor units (cents). */

const usd = (fractionDigits: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

const USD_CENTS = usd(2);
const USD_WHOLE = usd(0);

/** `1500` → `$15.00`; with `{ whole: true }` → `$15`. */
export function formatUsd(cents: number, options: { whole?: boolean } = {}): string {
  return (options.whole ? USD_WHOLE : USD_CENTS).format(cents / 100);
}
