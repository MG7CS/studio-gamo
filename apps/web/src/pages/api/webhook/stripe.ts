import type { APIRoute } from 'astro';
import { errorResponse, getRuntimeEnv } from '@gamo/domain';
import { verifyAndHandleStripeWebhook } from '@gamo/domain/invoices';
import { databaseOf, noStore } from '../../../lib/forms-api';

export const prerender = false;

/**
 * POST /api/webhook/stripe — Stripe-signed invoice events (invoice.paid marks the invoice paid once and sends
 * the receipt; invoice.payment_failed is recorded for staff). Authenticated by the signature over the raw body,
 * so there is no same-origin or Turnstile check. The domain handler reads the body untouched, answers 503 when
 * STRIPE_WEBHOOK_SECRET is unset, 400 for a bad signature or live-mode event, else 200 `{received, applied}`.
 */
export const POST: APIRoute = async (context) => {
  try {
    const env = await getRuntimeEnv(context);
    const db = databaseOf(env);
    if (!db)
      return noStore(errorResponse('UNAVAILABLE', 'Webhook processing is temporarily unavailable.', 503));
    return noStore(await verifyAndHandleStripeWebhook(context.request, db, env));
  } catch {
    console.error('[stripe-webhook] ROUTE_FAILED');
    return noStore(errorResponse('UNAVAILABLE', 'Webhook processing is temporarily unavailable.', 503));
  }
};
