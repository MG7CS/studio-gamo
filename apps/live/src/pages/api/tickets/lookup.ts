import type { APIRoute } from 'astro';
import { requireSameOrigin } from '@gamo/auth';
import {
  TICKETING_FORMS,
  getRuntimeEnv,
  guardPublicForm,
  jsonResponse,
  nowSeconds,
  requestOrigin,
  requestTicketRecovery,
  ticketingDb,
  ticketingErrorResponse,
} from '@gamo/domain';
import { NO_STORE, validateJsonBody } from '../../../lib/ticketing-api';

export const prerender = false;

/** POST /api/tickets/lookup — email a link to my tickets; always the same answer. */
export const POST: APIRoute = async (context) => {
  try {
    requireSameOrigin(context.request);
    const env = await getRuntimeEnv(context);
    const guard = await guardPublicForm({ request: context.request, env }, TICKETING_FORMS.recovery);
    if (!guard.ok) return guard.response;
    validateJsonBody('RecoveryInput', guard.body.json);
    const result = await requestTicketRecovery(
      ticketingDb(env as Record<string, unknown>),
      env as Record<string, unknown>,
      {
        email: guard.body.get('email') ?? '',
        ipHash: guard.ipHash,
        origin: requestOrigin(context.request),
        now: nowSeconds(),
      },
    );
    return jsonResponse({ message: result.message }, 202, undefined, NO_STORE);
  } catch (err) {
    return ticketingErrorResponse(err);
  }
};
