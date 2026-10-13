import type { APIRoute } from 'astro';
import { createStripeTestClient } from '@studio-gamo/integrations';
import { getDb } from '@gamo/db';
import { LiveService } from '@gamo/domain';
import { getEvent as getStaticEvent } from '../../../data/events';

export const prerender = false;

/**
 * Creates a Stripe test-mode Checkout Session for Gamo Live ticket reservations.
 *
 * ORGANIZATIONAL & SECURITY POLICY:
 * 1. Strictly test-mode keys only (`sk_test_`). Live processing is actively blocked.
 * 2. Prices are resolved authoritatively from server-side database records.
 *    Browser-supplied prices or fee deductions are rejected.
 */
export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => ({}));
    const { eventId, tierIndex = 0, quantity = 1, customerEmail } = body;

    if (!eventId) {
      return new Response(JSON.stringify({ error: 'eventId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const qty = Math.max(1, Math.min(10, Number(quantity) || 1));
    const runtimeEnv = (context.locals as Record<string, any>)?.runtime?.env ?? {};
    const db = getDb(runtimeEnv.DB);
    const liveService = new LiveService(db);

    // 1. Authoritatively resolve event and tier from D1 or static fallback
    let eventTitle = 'Gamo Live Event';
    let tierName = 'General Admission';
    let unitAmountMinorUnits = 2500; // $25.00 default fallback

    const d1Event = await liveService.getEvent(eventId);
    if (d1Event) {
      eventTitle = d1Event.title;
      const tier = d1Event.tiers[tierIndex] || d1Event.tiers[0];
      if (tier) {
        tierName = tier.name;
        unitAmountMinorUnits = tier.priceCents;
      }
    } else {
      const staticEvent = getStaticEvent(eventId);
      if (staticEvent) {
        eventTitle = staticEvent.title;
        const tier = staticEvent.tiers[tierIndex] || staticEvent.tiers[0];
        if (tier) {
          tierName = tier.name;
          unitAmountMinorUnits = tier.priceCents;
        }
      }
    }

    const totalMinorUnits = unitAmountMinorUnits * qty;

    // 2. Initialize test-mode Stripe client
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
      description: `${eventTitle} — ${tierName} (Qty: ${qty})`,
      customerEmail: customerEmail || undefined,
      successUrl: `${origin}/ticket?event=${eventId}&session_id={CHECKOUT_SESSION_ID}&q=${qty}`,
      cancelUrl: `${origin}/events/${eventId}/tickets`,
      metadata: {
        eventId,
        tierName,
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
