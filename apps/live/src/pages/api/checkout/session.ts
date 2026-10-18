import { readContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import { LiveService, getRuntimeEnv } from '@gamo/domain';
import { createStripeTestClient, StripeNotConfiguredError } from '@studio-gamo/integrations';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  let body: {
    eventId: string;
    tierIndex?: number;
    quantity?: number;
    customerEmail?: string;
    customerName?: string;
    idempotencyKey?: string;
  };
  try {
    body = (await readContract(context.request, 'CheckoutInput')) as typeof body;
  } catch {
    return Response.json({ error: 'Invalid checkout request.' }, { status: 400 });
  }

  try {
    const runtimeEnv = await getRuntimeEnv(context);
    // Fail closed before reserving inventory: without a real test-mode key, paid checkout is
    // unavailable everywhere except local development (which may simulate a session).
    const stripeClient = createStripeTestClient({
      secretKey: runtimeEnv.STRIPE_SECRET_KEY,
      allowMock: runtimeEnv.ENVIRONMENT === 'local',
    });
    if (!stripeClient.isConfigured()) {
      return Response.json({ error: 'Paid checkout is not available.' }, { status: 503 });
    }
    const db = getDb(runtimeEnv.DB);
    const liveService = new LiveService(db);

    const holdAndOrder = await liveService.createPaidTicketHoldAndOrder({
      eventId: body.eventId,
      tierIndex: body.tierIndex ?? 0,
      quantity: body.quantity ?? 1,
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      idempotencyKey: body.idempotencyKey,
    });

    if (holdAndOrder.gateBlocked) {
      return Response.json(
        { error: 'Checkout is disabled pending inventory, authorization and fulfillment verification.' },
        { status: 503 },
      );
    }

    const session = await stripeClient.createTestCheckoutSession({
      mode: 'payment',
      amountMinorUnits: holdAndOrder.totalCents,
      currency: 'usd',
      description: `${holdAndOrder.event.title} — ${holdAndOrder.tier.name} (x${body.quantity ?? 1})`,
      customerEmail: body.customerEmail,
      successUrl: `${new URL(context.request.url).origin}/my-tickets?order=${encodeURIComponent(holdAndOrder.orderNumber)}`,
      cancelUrl: `${new URL(context.request.url).origin}/events/${encodeURIComponent(holdAndOrder.event.slug)}`,
      metadata: {
        eventId: holdAndOrder.event.id,
        orderId: holdAndOrder.orderId,
        orderNumber: holdAndOrder.orderNumber,
      },
    });

    await liveService.attachCheckoutSessionToOrder(holdAndOrder.orderId, session.id);

    return Response.json(
      {
        success: true,
        sessionId: session.id,
        url: session.url,
        mock: session.mock,
        orderId: holdAndOrder.orderId,
        orderNumber: holdAndOrder.orderNumber,
        holdExpiresAt: holdAndOrder.holdExpiresAt.toISOString(),
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return Response.json({ error: 'Paid checkout is not available.' }, { status: 503 });
    }
    const msg = err instanceof Error ? err.message : '';
    if (msg.startsWith('CONFLICT:')) {
      return Response.json({ error: 'Requested ticket tier capacity is unavailable.' }, { status: 409 });
    }
    return Response.json({ error: 'Checkout processing failed.' }, { status: 500 });
  }
};
