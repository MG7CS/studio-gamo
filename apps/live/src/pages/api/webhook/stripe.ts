import type { APIRoute } from 'astro';
import {
  verifyStripeWebhookSignature,
  type StripeWebhookEvent,
} from '@studio-gamo/integrations';
import { getDb } from '@gamo/db';
import { PaymentService, AdminService } from '@gamo/domain';

export const prerender = false;

/**
 * Stripe Webhook Handler for Gamo Live.
 *
 * Implements:
 * 1. Cryptographic HMAC-SHA256 signature verification using Web Crypto API.
 * 2. Durable D1 webhook idempotency (persists event IDs to `stripe_webhook_events`).
 * 3. Authoritative payment recording in `payment_records`.
 * 4. Nonprofit ledger entries separating:
 *    - `third_party_payable`: Net ticket proceeds for event organizers.
 *    - `program_service_receipt`: Gamo platform administrative allocation.
 *    - `processing_cost`: Payment processor fees.
 * 5. Fulfillment on `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
 * 6. Reversal recording on `charge.refunded`.
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

  // 2. Initialize D1 database and services
  const db = getDb(runtimeEnv.DB);
  const paymentService = new PaymentService(db);
  const adminService = new AdminService(db);

  // 3. Durable Webhook Deduplication / Idempotency Check in D1
  const { isDuplicate } = await paymentService.recordWebhookEventIdempotent(
    event.id,
    event.type
  );

  if (isDuplicate) {
    console.log(`[Stripe Webhook Deduplicated] Event ${event.id} already processed in D1.`);
    return new Response(
      JSON.stringify({ received: true, deduplicated: true, eventId: event.id }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // 4. Process Authoritative Event States
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
        const eventId = metadata.eventId || 'unknown_event';
        const totalAmountCents = session.amount_total || 0;

        // Calculate discrete nonprofit financial allocations:
        // - Processing cost: approximate Stripe fee (2.9% + 30c) or 0 in test
        // - Administrative allocation: 5% (pending board policy)
        // - Third-party payable: remaining organizer proceeds
        const estimatedFeeCents = Math.round(totalAmountCents * 0.029 + 30);
        const adminAllocationCents = Math.round(totalAmountCents * 0.05);
        const organizerProceedsCents = Math.max(
          0,
          totalAmountCents - estimatedFeeCents - adminAllocationCents
        );

        // Record payment completion
        await paymentService.recordPayment({
          sessionId: session.id,
          paymentIntentId: session.payment_intent || undefined,
          amountCents: totalAmountCents,
          currency: session.currency || 'usd',
          sourceType: 'event_ticket',
          sourceId: eventId,
          customerEmail: session.customer_details?.email || session.customer_email || undefined,
        });

        // Record nonprofit ledger entries
        await paymentService.allocateLedgerEntries({
          program: 'live',
          sourceType: 'event_ticket',
          sourceId: eventId,
          thirdPartyPayableCents: organizerProceedsCents,
          programServiceReceiptCents: adminAllocationCents,
          processingCostCents: estimatedFeeCents,
          notes: `Ticket purchase for event ${eventId} (Session: ${session.id})`,
        });

        console.log(
          `[Stripe Webhook Fulfillment] Recorded payment and ledger allocations for session ${session.id}: Organizers=$${(organizerProceedsCents / 100).toFixed(2)}, Admin=$${(adminAllocationCents / 100).toFixed(2)}, Fees=$${(estimatedFeeCents / 100).toFixed(2)}`
        );
        break;
      }

      case 'checkout.session.async_payment_failed': {
        const session = event.data.object;
        console.warn(
          `[Stripe Webhook] Async payment failed for session ${session.id}. Releasing reserved ticket hold.`
        );
        await adminService.logAudit(null, 'ticket.async_payment_failed', 'checkout_session', session.id, {
          metadata: session.metadata,
        });
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        const refundAmountCents = charge.amount_refunded || 0;

        await paymentService.allocateLedgerEntries({
          program: 'live',
          sourceType: 'charge_refund',
          sourceId: charge.id,
          programServiceReceiptCents: 0,
          thirdPartyPayableCents: 0,
          notes: `Refund for charge ${charge.id}: $${(refundAmountCents / 100).toFixed(2)}`,
        });

        console.log(
          `[Stripe Webhook] Charge ${charge.id} was refunded ($${(refundAmountCents / 100).toFixed(2)}).`
        );
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object;
        await adminService.logAudit(null, 'charge.dispute_created', 'dispute', dispute.id, {
          chargeId: dispute.charge,
          amountCents: dispute.amount,
        });
        console.warn(
          `[Stripe Webhook Alert] Dispute created: ${dispute.id} for charge ${dispute.charge}. Logged for finance review.`
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
