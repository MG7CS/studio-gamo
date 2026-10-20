/**
 * Pieces both funds-flow routings share (docs/LIVE_PAYMENTS.md §1, §3, §5): parameter checks, the metadata every
 * Stripe object carries, the idempotency keys, and expiring a Checkout Session that may already be closed.
 */
import { CURRENCY, PaidError } from '../paid-types.ts';
import {
  StripeApiError,
  type CheckoutSessionParams,
  type OrderCheckoutInput,
  type RequestOptions,
  type StripeGateway,
} from './types.ts';

/** Idempotency keys (docs/LIVE_PAYMENTS.md): one per order checkout, card-present payment, refund and payout. */
export const idempotencyKeys = {
  checkout: (orderId: string) => `checkout_${orderId}`,
  cardPresent: (orderId: string) => `card_present_${orderId}`,
  refund: (refundId: string) => `refund_${refundId}`,
  payout: (payoutId: string) => `payout_${payoutId}`,
  account: (organizationId: string, purpose: string) => `account_${organizationId}_${purpose}`,
} as const;

export function orderMetadata(orderId: string, orderReference: string): Record<string, string> {
  return { order_id: orderId, order_reference: orderReference };
}

/** The amount the buyer pays for a checkout (Σ unit × quantity). Throws on malformed lines. */
export function checkoutTotal(input: Pick<OrderCheckoutInput, 'lines'>): number {
  if (input.lines.length === 0) throw new PaidError('invalid', { detail: 'lines' });
  let total = 0;
  for (const line of input.lines) {
    if (!Number.isInteger(line.unitAmountCents) || line.unitAmountCents < 0)
      throw new PaidError('invalid', { detail: 'unit_amount' });
    if (!Number.isInteger(line.quantity) || line.quantity < 1)
      throw new PaidError('invalid', { detail: 'quantity' });
    total += line.unitAmountCents * line.quantity;
  }
  if (total <= 0) throw new PaidError('invalid', { detail: 'total' });
  return total;
}

export function checkFee(feeCents: number, totalCents: number): void {
  if (!Number.isInteger(feeCents) || feeCents < 0) throw new PaidError('invalid', { detail: 'fee' });
  // Stripe requires the application fee to be less than the charge.
  if (feeCents > 0 && feeCents >= totalCents)
    throw new PaidError('invalid', { detail: 'fee_not_below_total' });
}

export function baseCheckoutParams(input: OrderCheckoutInput): CheckoutSessionParams {
  return {
    lineItems: input.lines,
    currency: CURRENCY,
    customerEmail: input.customerEmail,
    clientReferenceId: input.orderId,
    metadata: orderMetadata(input.orderId, input.orderReference),
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    expiresAt: input.expiresAt,
  };
}

/** Expires an open session; a session that is already complete or expired is left as it is. */
export async function expireIfOpen(
  gateway: StripeGateway,
  sessionId: string,
  opts: RequestOptions,
): Promise<void> {
  try {
    await gateway.expireCheckoutSession(sessionId, opts);
  } catch (error) {
    if (!(error instanceof StripeApiError) || !error.definite) throw error;
    const session = await gateway.retrieveCheckoutSession(sessionId, opts);
    if (session.status === 'open') throw error;
  }
}
