import type { APIRoute } from 'astro';
import { createStripeTestClient } from '@studio-gamo/integrations';
import { getEvent } from '../../../data/events';

export const prerender = false;

/**
 * Creates a Stripe test-mode Checkout Session for Gamo Live ticket reservations.
 *
 * ORGANIZATIONAL POLICY:
 * In accordance with docs/GAMO_NONPROFIT_MODEL.md, all charges must strictly run in
 * Stripe test mode (sk_test_ / rk_test_). Live processing is disallowed until 501(c)(3)
 * legal status and board authorization are completed.
 */
export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => ({}));
    const { eventId, tierIndex = 0, quantity = 1, customerEmail } = body;

    const event = getEvent(eventId);
    if (!event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tier = event.tiers[tierIndex] || event.tiers[0];
    const qty = Math.max(1, Math.min(10, Number(quantity) || 1));
    const totalMinorUnits = tier.priceCents * qty;

    const runtimeEnv = (context.locals as Record<string, any>)?.runtime?.env ?? {};
    const secretKey =
      runtimeEnv.STRIPE_SECRET_KEY ||
      import.meta.env?.STRIPE_SECRET_KEY ||
      (globalThis as Record<string, any>).process?.env?.STRIPE_SECRET_KEY;

    const client = createStripeTestClient({ secretKey });

    const origin = new URL(context.request.url).origin;
    const session = await client.createTestCheckoutSession({
      mode: 'payment',
      amountMinorUnits: totalMinorUnits,
      currency: 'usd',
      description: `${event.title} — ${tier.name} (Qty: ${qty})`,
      customerEmail: customerEmail || undefined,
      successUrl: `${origin}/ticket?event=${event.id}&session_id={CHECKOUT_SESSION_ID}&q${tierIndex}=${qty}`,
      cancelUrl: `${origin}/events/${event.id}/tickets`,
      metadata: {
        eventId: event.id,
        tierName: tier.name,
        tierIndex: tierIndex.toString(),
        quantity: qty.toString(),
        program: 'gamo-live',
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        sessionId: session.id,
        url: session.url,
        mock: session.mock,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error('[Stripe Checkout Error]', err);
    return new Response(
      JSON.stringify({
        error: err?.message || 'Failed to initialize checkout session',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
