import type { APIRoute } from 'astro';
import { readContract, validateContract } from '@gamo/api-contracts/runtime';
import { requireSameOrigin } from '@gamo/auth';
import {
  TicketingError,
  getRuntimeEnv,
  jsonResponse,
  nowSeconds,
  requestCustomer,
  requestOrigin,
  ticketingDb,
  ticketingErrorResponse,
  transferTicket,
} from '@gamo/domain';
import { clientIp, hashIp, resolveEnvSecret } from '@gamo/domain/security';
import { NO_STORE } from '../../../../lib/ticketing-api';

export const prerender = false;

/** POST /api/tickets/{id}/transfer — the current holder (customer session) transfers one ticket. */
export const POST: APIRoute = async (context) => {
  try {
    const ticketId = validateContract('Identifier', context.params.id) as string;
    const env = (await getRuntimeEnv(context)) as Record<string, unknown>;
    const db = ticketingDb(env);
    const now = nowSeconds();
    const identity = await requestCustomer(db, env, context.request, now);
    if (!identity)
      throw new TicketingError(
        'UNAUTHENTICATED',
        'Open the link from your ticket email first, then try again.',
      );
    requireSameOrigin(context.request);
    const body = (await readContract(context.request, 'TransferInput')) as {
      toName: string;
      toEmail: string;
      toEmailConfirm: string;
    };
    const result = await transferTicket(db, env, {
      ticketId,
      identity,
      ...body,
      ipHash: await hashIp(clientIp(context.request) ?? 'unknown', resolveEnvSecret(env, 'PII_HASH_SECRET')),
      origin: requestOrigin(context.request),
      now,
    });
    return jsonResponse(result, 200, undefined, NO_STORE);
  } catch (err) {
    return ticketingErrorResponse(err);
  }
};
