import type { APIRoute } from 'astro';
import { validateContract } from '@gamo/api-contracts/runtime';
import { requireSameOrigin } from '@gamo/auth';
import {
  TICKETING_FORMS,
  confirmOrderByCode,
  getRuntimeEnv,
  guardPublicForm,
  isHttps,
  jsonResponse,
  nowSeconds,
  openOrderSession,
  requestOrigin,
  ticketingDb,
  ticketingErrorResponse,
} from '@gamo/domain';
import { NO_STORE } from '../../../lib/ticketing-api';

export const prerender = false;

/** POST /api/orders/confirm — confirm a free order with the emailed 6-digit code. */
export const POST: APIRoute = async (context) => {
  try {
    requireSameOrigin(context.request);
    const env = await getRuntimeEnv(context);
    const guard = await guardPublicForm({ request: context.request, env }, TICKETING_FORMS.confirm);
    if (!guard.ok) return guard.response;
    if (guard.body.json) validateContract('ConfirmOrderInput', guard.body.json);
    const db = ticketingDb(env as Record<string, unknown>);
    const now = nowSeconds();
    const origin = requestOrigin(context.request);
    const result = await confirmOrderByCode(db, env as Record<string, unknown>, {
      confirmToken: guard.body.get('confirmToken') ?? guard.body.get('t') ?? '',
      code: guard.body.get('code') ?? '',
      now,
      origin,
    });
    const response = jsonResponse(
      {
        orderId: result.orderId,
        ticketsIssued: result.issued,
        alreadyConfirmed: result.alreadyConfirmed,
        orderUrl: `/tickets/orders/${result.orderId}`,
      },
      200,
      undefined,
      NO_STORE,
    );
    const cookie = await openOrderSession(db, env as Record<string, unknown>, {
      orderId: result.orderId,
      ipHash: guard.ipHash,
      https: isHttps(context.request),
      now,
    });
    if (cookie) response.headers.append('Set-Cookie', cookie);
    return response;
  } catch (err) {
    return ticketingErrorResponse(err);
  }
};
