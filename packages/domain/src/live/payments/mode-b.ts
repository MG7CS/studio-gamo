/**
 * Mode B: Gamo collects (Connect separate charges and transfers). Charges are made on Gamo's own account with a
 * `transfer_group` of the order id; Gamo records what it owes in the ledger and pays it out later with
 * `POST /v1/transfers` to the organization's connected account (owner approval each time, `payouts.ts`). Gamo is the
 * seller of record "on behalf of" the organization and owns refunds and disputes; no application fee and no
 * `Stripe-Account`. (docs/LIVE_PAYMENTS.md §1, docs/LIVE_REQUIREMENTS.md §8 item 32)
 */
import { CURRENCY } from '../paid-types.ts';
import {
  baseCheckoutParams,
  checkFee,
  checkoutTotal,
  expireIfOpen,
  idempotencyKeys,
  orderMetadata,
} from './shared.ts';
import type { PaymentRouting, StripeGateway } from './types.ts';

/**
 * `payoutAccountId` is where Gamo later pays the organization; charges and refunds never need it, so an order's
 * refund works even after the organization changed or removed its payout account. New sales are gated on it being
 * ready in `organizationPaymentsStatus`.
 */
export function createModeBRouting(gateway: StripeGateway, payoutAccountId: string | null): PaymentRouting {
  void payoutAccountId;
  const own = { account: null };
  return {
    flow: 'gamo_collects',
    seller: 'gamo',
    chargeAccountId: null,
    gateway,

    async createCheckout(input) {
      checkFee(input.gamoFeeCents, checkoutTotal(input));
      return gateway.createCheckoutSession(
        { ...baseCheckoutParams(input), transferGroup: input.orderId },
        { ...own, idempotencyKey: idempotencyKeys.checkout(input.orderId) },
      );
    },

    expireCheckout: (sessionId) => expireIfOpen(gateway, sessionId, own),

    async createCardPresentPayment(input) {
      checkFee(input.gamoFeeCents, input.amountCents);
      return gateway.createPaymentIntent(
        {
          amountCents: input.amountCents,
          currency: CURRENCY,
          cardPresent: true,
          metadata: orderMetadata(input.orderId, input.orderReference),
          description: input.description,
          transferGroup: input.orderId,
        },
        { ...own, idempotencyKey: idempotencyKeys.cardPresent(input.orderId) },
      );
    },

    refund: (input) =>
      gateway.createRefund(
        {
          paymentIntentId: input.paymentIntentId,
          amountCents: input.amountCents,
          metadata: { order_id: input.orderId, refund_id: input.refundId },
        },
        { ...own, idempotencyKey: idempotencyKeys.refund(input.refundId) },
      ),
  };
}
