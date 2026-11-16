import type { APIRoute } from 'astro';
import {
  applyProviderEvent,
  errorResponse,
  getRuntimeEnv,
  handleApiError,
  verifyResendWebhook,
} from '@gamo/domain';
import { asSqlDatabase } from '@gamo/domain/security';

export const prerender = false;

/** POST /api/webhook/resend — Svix-signed Resend events update email_log and suppressions for every program's mail. */
export const POST: APIRoute = async (context) => {
  try {
    const env = await getRuntimeEnv(context);
    const secret = typeof env.RESEND_WEBHOOK_SECRET === 'string' ? env.RESEND_WEBHOOK_SECRET : '';
    if (!secret.trim()) {
      console.error('[email] RESEND_WEBHOOK_SECRET is not configured');
      return errorResponse('UNAVAILABLE', 'Webhook processing is not configured.', 503);
    }
    const verified = await verifyResendWebhook(context.request, secret);
    if (!verified.ok) {
      const status = verified.reason === 'not_configured' ? 503 : 400;
      return errorResponse(status === 503 ? 'UNAVAILABLE' : 'BAD_REQUEST', 'Invalid webhook.', status);
    }
    const payload = verified.payload as {
      type?: unknown;
      data?: { email_id?: unknown; bounce?: { type?: unknown } };
    } | null;
    if (!payload || typeof payload.type !== 'string' || typeof payload.data !== 'object')
      return errorResponse('BAD_REQUEST', 'Invalid webhook.', 400);
    let db;
    try {
      db = asSqlDatabase(env.DB);
    } catch {
      console.error('[email] DB binding unavailable');
      return errorResponse('UNAVAILABLE', 'Webhook processing is temporarily unavailable.', 503);
    }
    const result = await applyProviderEvent(db, {
      type: payload.type,
      providerMessageId: typeof payload.data?.email_id === 'string' ? payload.data.email_id : '',
      bounceType: typeof payload.data?.bounce?.type === 'string' ? payload.data.bounce.type : null,
      now: Math.floor(Date.now() / 1000),
    });
    return Response.json(
      { received: true, applied: result.applied },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
};
