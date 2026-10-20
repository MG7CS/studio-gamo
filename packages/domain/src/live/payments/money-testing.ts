/**
 * Test fixtures for the payments, reports and payouts tests (never imported by app code): a paid order written
 * straight to the database with its ledger rows, as `markOrderPaid` would leave it, and a stand-in delivery wired to
 * the real webhook receiver.
 */
import { runBatch, type SqlDatabase } from '../../security/sql-database.ts';
import { ledgerForPaidOrder } from '../ledger.ts';
import { PAID_ENV } from '../paid-testing.ts';
import type { FeePayer, FundsFlow, OrderChannel, PaymentMethod, StripeEventHandlers } from '../paid-types.ts';
import { receiveStripeWebhook } from '../webhooks.ts';
import type { StandinDelivery } from './standin.ts';

export interface TestOrder {
  orderId: string;
  organizationId?: string;
  eventId?: string;
  occurrenceId?: string;
  ticketTypeId?: string;
  name?: string;
  flow: FundsFlow | null;
  method: PaymentMethod;
  channel?: OrderChannel;
  quantity: number;
  unitCents: number;
  discountCents?: number;
  feeCents?: number;
  feePayer?: FeePayer;
  giftCents?: number;
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  stripeAccountId?: string | null;
  isPreview?: boolean;
  paidAt: number;
}

/** Inserts a paid order with one line and writes its ledger rows. Returns the total. */
export async function insertPaidOrder(db: SqlDatabase, o: TestOrder): Promise<number> {
  const subtotal = o.quantity * o.unitCents;
  const discount = o.discountCents ?? 0;
  const fee = o.feeCents ?? 0;
  const feePayer = o.feePayer ?? 'buyer';
  const gift = o.giftCents ?? 0;
  const total = subtotal - discount + (feePayer === 'buyer' ? fee : 0) + gift;
  const org = o.organizationId ?? 'org_1';
  const event = o.eventId ?? 'evt_1';
  const seller = o.flow === 'gamo_collects' ? 'gamo' : 'organization';
  await runBatch(db, [
    {
      sql:
        'INSERT INTO orders (id, reference, event_id, occurrence_id, organization_id, channel, payment_method, status, is_preview, ' +
        'funds_flow, seller, stripe_account_id, subtotal_cents, discount_cents, fee_cents, fee_payer, gift_cents, total_cents, ' +
        "policy_snapshot, fee_snapshot, payment_intent_id, checkout_session_id, comp_reason, created_at, paid_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'paid', ?8, " +
        "?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, '{}', '{}', ?18, ?19, ?20, ?21, ?21, ?21)",
      params: [
        o.orderId,
        `GL-${o.orderId.slice(-4).toUpperCase().padStart(4, 'X')}-TEST`,
        event,
        o.occurrenceId ?? 'occ_1',
        org,
        o.channel ?? (o.method === 'card_online' ? 'online' : 'door'),
        o.method,
        o.isPreview ? 1 : 0,
        o.flow,
        seller,
        o.stripeAccountId ?? null,
        subtotal,
        discount,
        fee,
        feePayer,
        gift,
        total,
        o.paymentIntentId ?? null,
        o.checkoutSessionId ?? null,
        o.method === 'comp' ? 'Volunteer' : null,
        o.paidAt,
      ],
    },
    {
      sql:
        'INSERT INTO order_items (id, order_id, ticket_type_id, name, unit_price_cents, quantity, discount_cents, fee_cents, line_total_cents) ' +
        'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)',
      params: [
        `oit_${o.orderId}`,
        o.orderId,
        o.ticketTypeId ?? 'tty_general_1',
        o.name ?? 'General',
        o.unitCents,
        o.quantity,
        discount,
        fee,
        subtotal - discount + (feePayer === 'buyer' ? fee : 0),
      ],
    },
    ...ledgerForPaidOrder({
      orderId: o.orderId,
      organizationId: org,
      eventId: event,
      fundsFlow: o.flow,
      paymentMethod: o.method,
      isPreview: o.isPreview ?? false,
      subtotalCents: subtotal,
      discountCents: discount,
      feeCents: fee,
      feePayer,
      giftCents: gift,
      currency: 'usd',
      occurredAt: o.paidAt,
    }),
  ]);
  return total;
}

/** A stand-in delivery into the real webhook receiver; records each answer. */
export function webhookDelivery(db: SqlDatabase, handlers: StripeEventHandlers, now: () => number) {
  const received: {
    endpoint: 'platform' | 'connect';
    status: number;
    body: string;
    type: string;
    account: string | null;
  }[] = [];
  const deliver: StandinDelivery = async (rawBody, signatureHeader, endpoint) => {
    const answer = await receiveStripeWebhook({
      db,
      env: PAID_ENV,
      rawBody,
      signatureHeader,
      endpoint,
      now: now(),
      handlers,
    });
    const parsed = JSON.parse(rawBody) as { type: string; account?: string };
    received.push({
      endpoint,
      status: answer.status,
      body: rawBody,
      type: parsed.type,
      account: parsed.account ?? null,
    });
    return { status: answer.status };
  };
  return { deliver, received };
}
