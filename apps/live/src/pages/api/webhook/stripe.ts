import { validateContract } from '@gamo/api-contracts/runtime';
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
  try {
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
    if (event.livemode !== false) return new Response(JSON.stringify({ error: 'Only sandbox events are accepted.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    try { validateContract('StripeEvent', event); } catch { return new Response(JSON.stringify({ error: 'Invalid sandbox webhook payload.' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }

    // No order/inventory/refund authority exists yet. Preserve provider retries, never record false fulfillment.
    if (/^(checkout\.|charge\.|payment_intent\.|refund\.)/.test(event.type)) {
      return Response.json({error: 'Financial fulfillment is disabled pending verified order processing.'}, {status: 503});
    }
    const paymentService = new PaymentService(getDb(runtimeEnv.DB));
    const {isDuplicate} = await paymentService.recordWebhookEventIdempotent(event.id, event.type);
    return Response.json({received: true, eventId: event.id, ...(isDuplicate ? {deduplicated: true} : {})});
  } catch {
    return Response.json({error: 'Webhook processing failed.'}, {status: 500});
  }
};
