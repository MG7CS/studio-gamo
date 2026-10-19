import type { APIRoute } from 'astro';
import { validateContract } from '@gamo/api-contracts/runtime';
import { requireSameOrigin } from '@gamo/auth';
import {
  TICKETING_FORMS,
  getRuntimeEnv,
  guardPublicForm,
  joinWaitlist,
  jsonResponse,
  nowSeconds,
  requestOrigin,
  ticketingDb,
  ticketingErrorResponse,
} from '@gamo/domain';
import { NO_STORE, validateJsonBody } from '../../../../lib/ticketing-api';

export const prerender = false;

const WAITLIST_MESSAGE =
  "Check your email and confirm to join the waitlist. If tickets become available we'll then email you — first come, first served.";

/** POST /api/events/{id}/waitlist — same answer whether or not the address was already waiting. */
export const POST: APIRoute = async (context) => {
  try {
    const eventId = validateContract('Identifier', context.params.id) as string;
    requireSameOrigin(context.request);
    const env = await getRuntimeEnv(context);
    const guard = await guardPublicForm({ request: context.request, env }, TICKETING_FORMS.waitlist);
    if (!guard.ok) return guard.response;
    validateJsonBody('WaitlistInput', guard.body.json);
    await joinWaitlist(ticketingDb(env as Record<string, unknown>), env as Record<string, unknown>, {
      origin: requestOrigin(context.request),
      eventId,
      categoryId: guard.body.get('categoryId') || null,
      email: guard.body.get('email') ?? '',
      quantity: Number(guard.body.get('quantity') ?? 1),
      now: nowSeconds(),
    });
    return jsonResponse({ message: WAITLIST_MESSAGE }, 202, undefined, NO_STORE);
  } catch (err) {
    return ticketingErrorResponse(err);
  }
};
