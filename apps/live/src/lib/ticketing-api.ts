/**
 * Shared handlers for the Gamo Live ticketing JSON routes (design §5). Each route: same-origin check
 * (state-changing), public-form guard (Turnstile + rate limits) or session auth, contract validation of
 * JSON bodies, then the domain service. Errors via `ticketingErrorResponse`.
 */
import type { APIContext } from 'astro';
import { validateContract } from '@gamo/api-contracts/runtime';
import {
  requireProductAuth,
  requireSameOrigin,
  hasEventPermission,
  type EventPermission,
  type SessionData,
} from '@gamo/auth';
import { getDb } from '@gamo/db';
import type { GamoEnv } from '@gamo/config/env';
import {
  TICKETING_FORMS,
  TicketingError,
  getRuntimeEnv,
  guardPublicForm,
  isHttps,
  jsonResponse,
  nowSeconds,
  parseOrderRequest,
  placeOrder,
  requestOrigin,
  ticketingDb,
  ticketingErrorResponse,
  type PlaceOrderResult,
} from '@gamo/domain';

export const NO_STORE = { 'Cache-Control': 'private, no-store' };

/** Validates a JSON body against its contract (form bodies are validated by the domain service). */
export function validateJsonBody(
  name: Parameters<typeof validateContract>[0],
  json: Record<string, unknown> | undefined,
) {
  if (json) validateContract(name, json);
}

export function orderResultResponse(result: PlaceOrderResult): Response {
  if (result.type === 'verify')
    return jsonResponse(
      {
        status: 'verification_required',
        confirmToken: result.confirmToken,
        expiresAt: result.expiresAt,
        message:
          'Check your email: we sent a 6-digit code and a button to confirm your tickets. Both work for 30 minutes.',
      },
      202,
      undefined,
      NO_STORE,
    );
  const headers: Record<string, string> = { ...NO_STORE };
  const response = jsonResponse(
    {
      status: 'checkout',
      orderId: result.orderId,
      orderReference: result.orderReference,
      checkoutUrl: result.checkoutUrl,
      mock: result.mock,
      holdExpiresAt: result.holdExpiresAt,
    },
    200,
    undefined,
    headers,
  );
  if (result.cookie) response.headers.append('Set-Cookie', result.cookie);
  return response;
}

/** POST handler body for the order form (free RSVP route: allow 'free'; checkout route: 'any'). */
export async function handleOrderPost(
  context: APIContext,
  input: { eventId: string | null; allow: 'free' | 'any'; contract: 'OrderInput' | 'TicketCheckoutInput' },
): Promise<Response> {
  try {
    requireSameOrigin(context.request);
    const env = (await getRuntimeEnv(context)) as GamoEnv & Record<string, unknown>;
    const guard = await guardPublicForm({ request: context.request, env }, TICKETING_FORMS.order);
    if (!guard.ok) return guard.response;
    validateJsonBody(input.contract, guard.body.json);
    const eventId = input.eventId ?? guard.body.get('eventId') ?? '';
    validateContract('Identifier', eventId);
    const db = ticketingDb(env);
    const result = await placeOrder(db, env, {
      request: parseOrderRequest(eventId, guard.body),
      allow: input.allow,
      ipHash: guard.ipHash,
      origin: requestOrigin(context.request),
      https: isHttps(context.request),
      now: nowSeconds(),
    });
    return orderResultResponse(result);
  } catch (err) {
    return ticketingErrorResponse(err);
  }
}

/** Organizer/staff routes: a verified Live session with the given event permissions. */
export async function requireEventAuthority(
  context: APIContext,
  eventId: string,
  permissions: EventPermission[],
): Promise<{ auth: SessionData; env: GamoEnv & Record<string, unknown> }> {
  const env = (await getRuntimeEnv(context)) as GamoEnv & Record<string, unknown>;
  const db = getDb(env.DB);
  const auth = await requireProductAuth(context.request, db, 'live', {
    secret: env.SESSION_SECRET,
    product: 'live',
    env,
  });
  for (const p of permissions)
    if (!(await hasEventPermission(db, auth, eventId, p)))
      throw new TicketingError(
        'FORBIDDEN',
        `You need the "${p.replace('_', ' ')}" permission for this event.`,
      );
  return { auth, env };
}
