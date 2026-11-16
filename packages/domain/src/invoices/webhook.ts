/**
 * Stripe invoice webhook (served by apps/web `/api/webhook/stripe`). Test mode only: `livemode` events
 * are refused with 400 until live Stripe is approved.
 *
 *   return verifyAndHandleStripeWebhook(request, db, env, nowSeconds);   // a Response
 *
 * - `invoice.paid` (card, ACH and out-of-band alike) marks the matching invoice paid once, with
 *   `paid_method = 'stripe'` and `paid_at` from Stripe, then sends the receipt once. Replays, unknown
 *   invoices and every other event type answer 200 `{received:true, applied:false}`.
 * - A paid event for a VOID invoice leaves it void and writes an audit row for staff (money arrived).
 * - `invoice.payment_failed` changes nothing except an audit row (once per Stripe event id).
 * - No secrets, signatures or payloads are logged; failures name only an error code.
 */
import {
  parseInvoiceEvent,
  verifyStripeWebhookSignature,
  type StripeWebhookEvent,
} from '@studio-gamo/integrations/stripe';
import { errorResponse } from '../api/response.ts';
import { newPrefixedId } from '../security/ids.ts';
import { changesOf, type SqlDatabase } from '../security/sql-database.ts';
import { InvoiceError, InvoiceService, type InvoiceEnv } from './service.ts';
import { nextStatusForInvoiceEvent } from './stripe-invoicing.ts';
import type { InvoiceStatus } from './types.ts';

export const STRIPE_WEBHOOK_MAX_BYTES = 256 * 1024;

export interface StripeWebhookBody {
  received: true;
  applied: boolean;
}

export interface WebhookOptions {
  /** Epoch seconds; defaults to the wall clock. */
  now?: number;
  /** Injected fetch for the receipt email (tests). */
  fetchImpl?: typeof fetch;
}

async function audit(
  db: SqlDatabase,
  id: string,
  action: string,
  invoiceId: string,
  payload: Record<string, unknown>,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, payload_json, created_at)
       VALUES (?1, NULL, ?2, 'invoice', ?3, ?4, ?5) ON CONFLICT(id) DO NOTHING`,
    )
    .bind(id, action, invoiceId, JSON.stringify(payload), now)
    .run();
}

/**
 * Applies a signature-verified Stripe event. Throws `InvoiceError('LIVEMODE_REFUSED')` for a live event.
 */
export async function handleStripeInvoiceEvent(
  db: SqlDatabase,
  env: InvoiceEnv,
  event: StripeWebhookEvent,
  options: WebhookOptions = {},
): Promise<StripeWebhookBody> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (event.livemode === true) {
    throw new InvoiceError('LIVEMODE_REFUSED', 'Live-mode Stripe events are not accepted yet.');
  }
  const parsed = parseInvoiceEvent(event);
  if (!parsed) return { received: true, applied: false };

  const row = (await db
    .prepare('SELECT id, status, total_cents FROM invoices WHERE stripe_invoice_id = ?1')
    .bind(parsed.stripeInvoiceId)
    .first()) as { id: string; status: InvoiceStatus; total_cents: number } | null;
  if (!row) return { received: true, applied: false };

  if (parsed.status === 'payment_failed') {
    await audit(db, `audit_pf_${event.id}`, 'invoice.payment_failed', row.id, { eventId: event.id }, now);
    return { received: true, applied: false };
  }

  const next = nextStatusForInvoiceEvent(row.status, 'paid');
  if (row.status === 'void') {
    await audit(db, `audit_pv_${event.id}`, 'invoice.paid_event_on_void', row.id, { eventId: event.id }, now);
    return { received: true, applied: false };
  }
  if (next === row.status) return { received: true, applied: false };

  const paidAt = parsed.paidAt ? Math.floor(Date.parse(parsed.paidAt) / 1000) : now;
  const updated = await db
    .prepare(
      `UPDATE invoices SET status = 'paid', paid_at = ?2, paid_method = 'stripe', paid_reference = ?3
       WHERE id = ?1 AND status = ?4`,
    )
    .bind(row.id, Number.isFinite(paidAt) ? paidAt : now, parsed.stripeInvoiceId, row.status)
    .run();
  if (changesOf(updated) === 0) return { received: true, applied: false };

  if (parsed.amountPaid !== undefined && parsed.amountPaid !== Number(row.total_cents)) {
    await audit(
      db,
      newPrefixedId('audit'),
      'invoice.paid_amount_mismatch',
      row.id,
      { eventId: event.id, amountPaid: parsed.amountPaid, totalCents: Number(row.total_cents) },
      now,
    );
  }
  const service = new InvoiceService(db, env, { fetchImpl: options.fetchImpl, now: () => now });
  const invoice = await service.get(row.id);
  await service.sendReceipt(invoice, now);
  return { received: true, applied: true };
}

const json = (body: StripeWebhookBody) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

/**
 * The route body: 503 when `STRIPE_WEBHOOK_SECRET` is unset, 400 for a missing/invalid signature, an
 * oversized or malformed body or a live-mode event, otherwise 200 `{received:true, applied}`.
 */
export async function verifyAndHandleStripeWebhook(
  request: Request,
  db: SqlDatabase,
  env: InvoiceEnv,
  now: number = Math.floor(Date.now() / 1000),
  options: Omit<WebhookOptions, 'now'> = {},
): Promise<Response> {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret || secret.length < 8) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured');
    return errorResponse('WEBHOOK_NOT_CONFIGURED', 'Stripe webhooks are not available.', 503);
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > STRIPE_WEBHOOK_MAX_BYTES)
    return errorResponse('PAYLOAD_TOO_LARGE', 'The request is too large.', 400);
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return errorResponse('BAD_REQUEST', 'The request body could not be read.', 400);
  }
  if (raw.length > STRIPE_WEBHOOK_MAX_BYTES)
    return errorResponse('PAYLOAD_TOO_LARGE', 'The request is too large.', 400);
  const verified = await verifyStripeWebhookSignature(raw, request.headers.get('stripe-signature'), secret);
  if (!verified.valid || !verified.event) {
    return errorResponse('INVALID_SIGNATURE', 'The webhook signature is not valid.', 400);
  }
  try {
    return json(
      await handleStripeInvoiceEvent(db, env, verified.event, { now, fetchImpl: options.fetchImpl }),
    );
  } catch (err) {
    if (err instanceof InvoiceError) return errorResponse(err.code, err.message, err.status);
    console.error('[stripe-webhook] HANDLER_FAILED');
    return errorResponse('WEBHOOK_FAILED', 'The event could not be processed.', 503);
  }
}
