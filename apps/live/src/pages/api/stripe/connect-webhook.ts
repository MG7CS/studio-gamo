/**
 * POST /api/stripe/connect-webhook: Stripe's Connect (organizations' connected accounts) webhook endpoint (docs/LIVE_SCREENS.md §I.2 P9). The raw body and the
 * `Stripe-Signature` header go to the receiver (signature verified, each event recorded once, processed
 * idempotently); its status and body are the answer, never cached. No same-origin check: Stripe calls this, and the
 * signature is the authority. Other methods answer 405.
 */
import type { APIRoute } from 'astro';
import { openLive } from '../../../lib/registration';
import { handleWebhook, webhookMethodNotAllowed } from '../../../lib/checkout-stripe';

export const prerender = false;

export const POST: APIRoute = (astro) => handleWebhook(() => openLive(astro), astro.request, 'connect');

export const ALL: APIRoute = () => webhookMethodNotAllowed();
