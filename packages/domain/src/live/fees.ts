/**
 * Prices, discounts and the Gamo fee for one order (docs/LIVE_PAYMENTS.md §2). Pure: the caller supplies the unit
 * prices in force (price deadlines applied), the discount of a valid code and the fee snapshot.
 *
 * - The discount applies only to the ticket types it names; percent discounts round per line, amount discounts are
 *   capped at what they apply to and spread over the lines by the largest remainder, so lines add up exactly.
 * - The Gamo fee per line = quantity × fixed + percent of the discounted line amount (half up), never more than the
 *   discounted line amount, and 0 when `chargeFee` is false (cash, comp) or the line costs nothing.
 * - Passed on (`buyer`): the buyer pays the fee as its own line. Absorbed (`organizer`): the buyer does not see it and
 *   it is taken from what the organization receives.
 * - A gift is its own line, never part of the fee base.
 */
import { isCents } from './money.ts';
import {
  CURRENCY,
  PaidError,
  type DiscountInput,
  type FeeSetting,
  type FeeSnapshot,
  type FeePayer,
  type PriceOrderInput,
  type PricedLine,
  type PricedOrder,
} from './paid-types.ts';

/** The fee snapshot copied onto an order. */
export function feeSnapshotOf(setting: FeeSetting, payer: FeePayer): FeeSnapshot {
  return {
    v: 1,
    feeSettingId: setting.id,
    fixedCents: setting.fixedCents,
    percentBps: setting.percentBps,
    payer,
  };
}

/** Half-up rounding of a non-negative ratio, in integers only. */
function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** The Gamo fee on one line, given its discounted amount. */
export function lineFeeCents(fee: FeeSnapshot, quantity: number, discountedLineCents: number): number {
  if (discountedLineCents <= 0) return 0;
  const raw = quantity * fee.fixedCents + roundHalfUp(discountedLineCents * fee.percentBps, 10_000);
  return Math.min(raw, discountedLineCents);
}

function lineDiscounts(
  gross: readonly number[],
  applies: readonly boolean[],
  discount: DiscountInput | null,
): number[] {
  const out = gross.map(() => 0);
  if (!discount) return out;
  if (discount.kind === 'percent') {
    const pct = discount.percentOff ?? 0;
    if (!Number.isInteger(pct) || pct < 1 || pct > 100)
      throw new PaidError('invalid', { detail: 'percent_off' });
    gross.forEach((g, i) => {
      if (applies[i]) out[i] = Math.min(g, roundHalfUp(g * pct, 100));
    });
    return out;
  }
  const amount = discount.amountOffCents ?? 0;
  if (!isCents(amount, 1)) throw new PaidError('invalid', { detail: 'amount_off_cents' });
  const base = gross.reduce((sum, g, i) => sum + (applies[i] ? g : 0), 0);
  const total = Math.min(amount, base);
  if (total === 0) return out;
  // Largest remainder: floor shares, then give the leftover cents to the largest fractional parts (ties by order).
  const shares = gross.map((g, i) => (applies[i] ? (g * total) / base : 0));
  shares.forEach((s, i) => (out[i] = Math.floor(s)));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = shares
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .filter(({ i }) => applies[i])
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left === 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

/** Prices an order on the server. Throws `PaidError('invalid')` for malformed input. */
export function priceOrder(input: PriceOrderInput): PricedOrder {
  if (input.lines.length === 0) throw new PaidError('invalid', { detail: 'lines' });
  for (const line of input.lines) {
    if (!isCents(line.unitPriceCents, 0, 1_000_000)) throw new PaidError('invalid', { detail: 'unit_price' });
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50)
      throw new PaidError('invalid', { detail: 'quantity' });
    if (!Number.isInteger(line.peoplePerTicket) || line.peoplePerTicket < 1 || line.peoplePerTicket > 20)
      throw new PaidError('invalid', { detail: 'people_per_ticket' });
  }
  if (!isCents(input.giftCents, 0, 1_000_000)) throw new PaidError('invalid', { detail: 'gift' });
  const fee = input.fee;
  if (!isCents(fee.fixedCents, 0, 10_000) || !isCents(fee.percentBps, 0, 2000))
    throw new PaidError('invalid', { detail: 'fee' });

  const gross = input.lines.map((l) => l.unitPriceCents * l.quantity);
  const applies = input.lines.map(
    (l) => !input.discount?.ticketTypeIds || input.discount.ticketTypeIds.includes(l.ticketTypeId),
  );
  const discounts = lineDiscounts(gross, applies, input.discount);
  const lines: PricedLine[] = input.lines.map((line, i) => {
    const discounted = gross[i] - discounts[i];
    const feeCents = input.chargeFee ? lineFeeCents(fee, line.quantity, discounted) : 0;
    return {
      ...line,
      discountCents: discounts[i],
      feeCents,
      lineTotalCents: discounted + (fee.payer === 'buyer' ? feeCents : 0),
    };
  });
  const subtotalCents = gross.reduce((a, b) => a + b, 0);
  const discountCents = discounts.reduce((a, b) => a + b, 0);
  const feeCents = lines.reduce((a, l) => a + l.feeCents, 0);
  const passedOn = fee.payer === 'buyer' ? feeCents : 0;
  return {
    currency: CURRENCY,
    lines,
    subtotalCents,
    discountCents,
    feeCents,
    feePayer: fee.payer,
    giftCents: input.giftCents,
    totalCents: subtotalCents - discountCents + passedOn + input.giftCents,
    ticketNetCents: subtotalCents - discountCents - (fee.payer === 'organizer' ? feeCents : 0),
  };
}

/**
 * What the organizer editor shows per ticket type (requirement 5): the buyer's price and what the organization
 * receives per ticket, in both fee choices, before processing costs.
 */
export function feePreview(
  unitPriceCents: number,
  setting: FeeSetting,
): { passOn: { buyerPays: number; youReceive: number }; absorb: { buyerPays: number; youReceive: number } } {
  const fee = lineFeeCents(feeSnapshotOf(setting, 'buyer'), 1, unitPriceCents);
  return {
    passOn: { buyerPays: unitPriceCents + fee, youReceive: unitPriceCents },
    absorb: { buyerPays: unitPriceCents, youReceive: unitPriceCents - fee },
  };
}
