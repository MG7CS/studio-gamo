import type { APIRoute } from 'astro';
import {
  applyProviderEvent,
  getRuntimeEnv,
  nowSeconds,
  ticketingDb,
  verifyResendWebhook,
  ticketingErrorResponse,
} from '@gamo/domain';

export const prerender = false;

/** POST /api/webhook/resend — Svix-signed Resend events update email_log and suppressions. */
export const POST: APIRoute = async (context) => {
  try {
    const env = await getRuntimeEnv(context);
    const secret = typeof env.RESEND_WEBHOOK_SECRET === 'string' ? env.RESEND_WEBHOOK_SECRET : '';
    if (!secret.trim()) {
      console.error('[ticketing] RESEND_WEBHOOK_SECRET is not configured');
      return Response.json(
        { success: false, error: { code: 'UNAVAILABLE', message: 'Webhook processing is not configured.' } },
        { status: 503 },
      );
    }
    const verified = await verifyResendWebhook(context.request, secret);
    if (!verified.ok) {
      const status = verified.reason === 'not_configured' ? 503 : 400;
      return Response.json(
        {
          success: false,
          error: { code: status === 503 ? 'UNAVAILABLE' : 'BAD_REQUEST', message: 'Invalid webhook.' },
        },
        { status },
      );
    }
    const payload = verified.payload as {
      type?: unknown;
      data?: { email_id?: unknown; bounce?: { type?: unknown } };
    } | null;
    if (!payload || typeof payload.type !== 'string' || typeof payload.data !== 'object')
      return Response.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid webhook.' } },
        { status: 400 },
      );
    const result = await applyProviderEvent(ticketingDb(env as Record<string, unknown>), {
      type: payload.type,
      providerMessageId: typeof payload.data?.email_id === 'string' ? payload.data.email_id : '',
      bounceType: typeof payload.data?.bounce?.type === 'string' ? payload.data.bounce.type : null,
      now: nowSeconds(),
    });
    return Response.json(
      { received: true, applied: result.applied },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return ticketingErrorResponse(err);
  }
};
