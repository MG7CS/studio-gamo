import type { APIRoute } from 'astro';
import { handleOrderPost } from '../../../lib/ticketing-api';

export const prerender = false;

/**
 * POST /api/checkout/session — paid checkout, Stripe test mode only (design T-04/T-05). 503 unless
 * local/preview with STRIPE_TEST_CHECKOUT=true and a test key; production always 503.
 */
export const POST: APIRoute = (context) =>
  handleOrderPost(context, { eventId: null, allow: 'any', contract: 'TicketCheckoutInput' });
