/**
 * Mode A: the organization's own Stripe account (Connect direct charges). Every request carries the connected
 * account (`Stripe-Account`); the Gamo fee, when above 0, is an application fee; refunds that give the fee share
 * back pass `refund_application_fee`. The organization is the seller of record. (docs/LIVE_PAYMENTS.md §1,
 * docs/LIVE_REQUIREMENTS.md §8 item 32)
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

export function createModeARouting(gateway: StripeGateway, connectedAccountId: string): PaymentRouting {
  if (!connectedAccountId) throw new Error('createModeARouting: connected account required');
  const account = connectedAccountId;
  return {
    flow: 'organizer_account',
    seller: 'organization',
    chargeAccountId: account,
    gateway,

    async createCheckout(input) {
      checkFee(input.gamoFeeCents, checkoutTotal(input));
      return gateway.createCheckoutSession(
        {
          ...baseCheckoutParams(input),
          ...(input.gamoFeeCents > 0 ? { applicationFeeCents: input.gamoFeeCents } : {}),
        },
        { account, idempotencyKey: idempotencyKeys.checkout(input.orderId) },
      );
    },

    expireCheckout: (sessionId) => expireIfOpen(gateway, sessionId, { account }),

    async createCardPresentPayment(input) {
      checkFee(input.gamoFeeCents, input.amountCents);
      return gateway.createPaymentIntent(
        {
          amountCents: input.amountCents,
          currency: CURRENCY,
          cardPresent: true,
          metadata: orderMetadata(input.orderId, input.orderReference),
          description: input.description,
          ...(input.gamoFeeCents > 0 ? { applicationFeeCents: input.gamoFeeCents } : {}),
        },
        { account, idempotencyKey: idempotencyKeys.cardPresent(input.orderId) },
      );
    },

    refund: (input) =>
      gateway.createRefund(
        {
          paymentIntentId: input.paymentIntentId,
          amountCents: input.amountCents,
          metadata: { order_id: input.orderId, refund_id: input.refundId },
          refundApplicationFee: input.refundFee,
        },
        { account, idempotencyKey: idempotencyKeys.refund(input.refundId) },
      ),
  };
}
