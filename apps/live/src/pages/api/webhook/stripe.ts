import { validateContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import {
  verifyStripeWebhookSignature,
  type StripeWebhookEvent,
} from '@studio-gamo/integrations';
import { getDb } from '@gamo/db';
import { PaymentService, LiveService, getRuntimeEnv } from '@gamo/domain';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const webhookSecret =
      runtimeEnv.STRIPE_WEBHOOK_SECRET ||
      import.meta.env?.STRIPE_WEBHOOK_SECRET ||
      (globalThis as Record<string, any>).process?.env?.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: 'Webhook secret unconfigured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rawBody = await context.request.text().catch(() => '');
    const signatureHeader = context.request.headers.get('stripe-signature');

    const verification = await verifyStripeWebhookSignature(
      rawBody,
      signatureHeader,
      webhookSecret
    );

    if (!verification.valid || !verification.event) {
      return new Response(
        JSON.stringify({ error: verification.error || 'Invalid webhook signature' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const event: StripeWebhookEvent = verification.event;
    if (event.livemode !== false) {
      return new Response(JSON.stringify({ error: 'Only sandbox events are accepted.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      validateContract('StripeEvent', event);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid sandbox webhook payload.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = getDb(runtimeEnv.DB);
    if (/^(checkout\.|charge\.|payment_intent\.|refund\.)/.test(event.type)) {
      const liveService = new LiveService(db);
      const fulfillment = await liveService.fulfillWebhookFinancialEvent(event);
      if (fulfillment.gateBlocked) {
        return Response.json(
          { error: 'Financial fulfillment is disabled pending verified order processing.' },
          { status: 503 }
        );
      }

      const paymentService = new PaymentService(db);
      const { isDuplicate } = await paymentService.recordWebhookEventIdempotent(event.id, event.type);
      return Response.json({
        received: true,
        eventId: event.id,
        type: event.type,
        orderId: fulfillment.orderId,
        ticketsIssued: fulfillment.ticketsIssued,
        ...(isDuplicate || fulfillment.deduplicated ? { deduplicated: true } : {}),
      });
    }

    const paymentService = new PaymentService(db);
    const { isDuplicate } = await paymentService.recordWebhookEventIdempotent(event.id, event.type);
    return Response.json({
      received: true,
      eventId: event.id,
      ...(isDuplicate ? { deduplicated: true } : {}),
    });
  } catch {
    return Response.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
};
