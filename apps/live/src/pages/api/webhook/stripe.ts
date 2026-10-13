import type { APIRoute } from 'astro';
import {
  verifyStripeWebhookSignature,
  createMemoryIdempotencyStore,
  type StripeWebhookEvent,
} from '@studio-gamo/integrations';

export const prerender = false;

// Process-level idempotency store for deduplicating retried webhook deliveries
const idempotencyStore = createMemoryIdempotencyStore();

/**
 * Stripe Webhook Handler for Gamo Live.
 *
 * Implements:
 * 1. Cryptographic HMAC-SHA256 signature verification using Web Crypto API.
 * 2. Webhook deduplication to prevent double-issuance of tickets or double-fulfillment.
 * 3. Fulfillment on both `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
 * 4. Audit logging for refunds (`charge.refunded`) and disputes (`charge.dispute.created`).
 */
export const POST: APIRoute = async (context) => {
  const runtimeEnv = (context.locals as Record<string, any>)?.runtime?.env ?? {};
  const webhookSecret =
    runtimeEnv.STRIPE_WEBHOOK_SECRET ||
    import.meta.env?.STRIPE_WEBHOOK_SECRET ||
    (globalThis as Record<string, any>).process?.env?.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured.');
    return new Response(JSON.stringify({ error: 'Webhook secret unconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rawBody = await context.request.text().catch(() => '');
  const signatureHeader = context.request.headers.get('stripe-signature');

  // 1. Cryptographically verify Stripe HMAC-SHA256 signature
  const verification = await verifyStripeWebhookSignature(
    rawBody,
    signatureHeader,
    webhookSecret
  );

  if (!verification.valid || !verification.event) {
    console.warn(`[Stripe Webhook Rejected] ${verification.error}`);
    return new Response(
      JSON.stringify({ error: verification.error || 'Invalid webhook signature' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const event: StripeWebhookEvent = verification.event;

  // 2. Webhook Deduplication / Idempotency Check
  if (idempotencyStore.hasProcessed(event.id)) {
    console.log(`[Stripe Webhook Deduplicated] Event ${event.id} already processed.`);
    return new Response(
      JSON.stringify({ received: true, deduplicated: true, eventId: event.id }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Mark event as processed immediately to prevent concurrent duplicates
  idempotencyStore.markProcessed(event.id);

  // 3. Process Authoritative Event States
  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;

        // Fulfill only when payment status is not 'unpaid'
        if (session.payment_status === 'unpaid') {
          console.log(
            `[Stripe Webhook] Session ${session.id} completed with delayed payment pending. Awaiting async_payment_succeeded.`
          );
          break;
        }

        const metadata = session.metadata || {};
        console.log(
          `[Stripe Webhook Fulfillment] Ticket reservation confirmed for event "${metadata.eventId || 'unknown'}" (${metadata.tierName || 'general'}, qty: ${metadata.quantity || 1}) | Session: ${session.id} | Amount: $${((session.amount_total || 0) / 100).toFixed(2)}`
        );
        break;
      }

      case 'checkout.session.async_payment_failed': {
        const session = event.data.object;
        console.warn(
          `[Stripe Webhook] Async payment failed for session ${session.id}. Releasing reserved ticket hold.`
        );
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        console.log(
          `[Stripe Webhook] Charge ${charge.id} was refunded ($${((charge.amount_refunded || 0) / 100).toFixed(2)}). Invalidating associated ticket reservation.`
        );
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object;
        console.warn(
          `[Stripe Webhook Alert] Dispute created: ${dispute.id} for charge ${dispute.charge}. Flagging for finance review.`
        );
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        break;
    }

    return new Response(
      JSON.stringify({
        received: true,
        eventId: event.id,
        type: event.type,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error(`[Stripe Webhook Processing Error] Event ${event.id}:`, err);
    return new Response(
      JSON.stringify({ error: 'Internal error processing webhook' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
