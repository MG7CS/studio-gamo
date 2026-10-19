import type { APIRoute } from 'astro';
import {
  errorResponse,
  getRuntimeEnv,
  handleStripeWebhook,
  nowSeconds,
  readBoundedBody,
  requestOrigin,
  ticketingDb,
  ticketingErrorResponse,
} from '@gamo/domain';

export const prerender = false;

const MAX_BYTES = 256 * 1024;

/** POST /api/webhook/stripe — signed Stripe test events (design §5.2). */
export const POST: APIRoute = async (context) => {
  try {
    const env = await getRuntimeEnv(context);
    const read = await readBoundedBody(context.request, MAX_BYTES);
    if (!read.ok) return errorResponse('BAD_REQUEST', 'Invalid webhook payload.', 400);
    let rawBody: string;
    try {
      rawBody = new TextDecoder('utf-8', { fatal: true }).decode(read.bytes);
    } catch {
      return errorResponse('BAD_REQUEST', 'Invalid webhook payload.', 400);
    }
    const signature = context.request.headers.get('stripe-signature');
    // Reject unsigned requests before touching the database.
    if (!signature) return errorResponse('BAD_REQUEST', 'Invalid webhook signature.', 400);
    const result = await handleStripeWebhook(
      ticketingDb(env as Record<string, unknown>),
      env as Record<string, unknown>,
      {
        rawBody,
        signature,
        ctx: { now: nowSeconds(), origin: requestOrigin(context.request) },
      },
    );
    if (result.status !== 200) {
      const code =
        result.status === 503
          ? 'UNAVAILABLE'
          : result.status === 409
            ? 'CONFLICT'
            : result.status === 500
              ? 'INTERNAL_ERROR'
              : 'BAD_REQUEST';
      return errorResponse(
        code,
        String(result.body.error ?? 'Webhook processing failed.'),
        result.status,
        undefined,
        { 'Cache-Control': 'no-store' },
      );
    }
    return Response.json(result.body, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return ticketingErrorResponse(err);
  }
};
