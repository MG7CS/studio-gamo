/**
 * Ticket issuance (design §5.2, §5.3): one batch per order that
 *   [re-holds items whose hold expired] → moves the order (conditional) → converts holds → inserts one
 *   ticket per seat (`insertTicketStatement`, idempotent per (order item, seq); signed QR per ticket).
 * Replays, double confirmations and concurrent webhooks issue exactly one set of tickets: the order
 * transition and the ticket inserts are conditional, and the ticket trigger refuses any ticket whose
 * hold is not converted.
 *
 * Also: confirming free RSVPs (code or emailed link) and `issueDoorTickets` for the scanner (Agent C).
 */
import { runBatch, allRows, type SqlDatabase, type SqlStatementSpec } from '../../security/sql-database.ts';
import { newOrderReference, newPrefixedId, newTicketId } from '../../security/ids.ts';
import { CURRENT_QR_KEY_ID, newQrSalt, signTicketQr } from '../../security/ticket-qr.ts';
import { checkRateLimit, rateLimitBucket } from '../../security/rate-limit.ts';
import { markCustomerEmailVerified, upsertCustomerProfile } from '../customers.ts';
import {
  buildHoldBatch,
  convertOrderHoldsStatement,
  insertHoldStatement,
  insertTicketStatement,
  ticketingErrorCode,
  SOLD_OUT_CODES,
  transitionOrderStatement,
  type OrderTransitionSet,
} from '../../ticketing/sql.ts';
import { HOLD_DURATION_SECONDS, policySnapshotJson } from '../../types/policy.ts';
import type { OrderStatus } from '../../types/enums.ts';
import type { DoorIssueInput, DoorIssueResult } from './scanning-door-sales.ts';
import {
  codeMatches,
  extendUnverifiedHold,
  readConfirmToken,
  VERIFICATION_CODE_ATTEMPTS,
} from './checkout.ts';
import { sendTicketEmail } from './email.ts';
import { loadTicketRenderModels } from './render-model.ts';
import {
  TicketingError,
  keyHash,
  loadCategories,
  loadEvent,
  loadOrder,
  loadOrderBy,
  isDeliverableEmail,
  loadOrderItems,
  loadPolicy,
  loadSections,
  orderAttendeeNames,
  ticketQrKeyring,
  isEventCancelled,
  type OrderRow,
  type TicketingEnv,
} from './orders-shared.ts';

export type IssueOutcome =
  | { ok: true; issued: number; alreadyIssued: boolean }
  | { ok: false; reason: 'unfulfillable' | 'wrong_state'; code?: string };

interface HoldState {
  item_id: string;
  quantity: number;
  active: number;
}

/**
 * Builds and runs the issuance batch. `from` are the order statuses this issuance may move from;
 * `to` the fulfilled status. Re-holds expired items (late webhook / late confirmation) inside the same
 * batch, so either every ticket is issued or nothing changes.
 */
export async function issueOrderTickets(
  db: SqlDatabase,
  env: TicketingEnv,
  input: {
    orderId: string;
    from: readonly OrderStatus[];
    to: 'paid' | 'confirmed';
    set?: OrderTransitionSet;
    extra?: SqlStatementSpec[];
    now: number;
  },
): Promise<IssueOutcome> {
  const keyring = ticketQrKeyring(env);
  for (let attempt = 0; attempt < 2; attempt++) {
    const order = await loadOrder(db, input.orderId);
    if (!order) return { ok: false, reason: 'wrong_state' };
    const fulfilled = ['paid', 'confirmed', 'partially_refunded', 'refunded', 'disputed'].includes(
      order.status,
    );
    if (!fulfilled && !input.from.includes(order.status as OrderStatus))
      return { ok: false, reason: 'wrong_state' };
    const items = await loadOrderItems(db, order.id);
    const sections = await loadSections(db, order.event_id);
    const holdStates = await allRows<HoldState>(db, {
      sql: "SELECT oi.id AS item_id, oi.quantity, coalesce((SELECT sum(h.quantity) FROM ticket_holds h WHERE h.order_item_id = oi.id AND h.status IN ('held', 'converted')), 0) AS active FROM order_items oi WHERE oi.order_id = ?1",
      params: [order.id],
    });
    const existing = await allRows<{ order_item_id: string; seq: number }>(db, {
      sql: 'SELECT order_item_id, seq FROM tickets WHERE order_id = ?1 AND order_item_id IS NOT NULL',
      params: [order.id],
    });
    const has = new Set(existing.map((t) => `${t.order_item_id}#${t.seq}`));
    const specs: SqlStatementSpec[] = [];
    if (!fulfilled) {
      for (const [index, item] of items.entries()) {
        const state = holdStates.find((s) => s.item_id === item.id);
        if (state && Number(state.active) >= Number(item.quantity)) continue;
        specs.push(
          insertHoldStatement({
            id: newPrefixedId('hold'),
            orderId: order.id,
            orderItemId: item.id,
            eventId: order.event_id,
            categoryId: item.tier_id,
            sectionId: item.section_id,
            customerProfileId: order.customer_profile_id,
            purchaserEmail: order.purchaser_email,
            quantity: Number(item.quantity) - Number(state?.active ?? 0),
            idempotencyKey: `${order.idempotency_key}#${index}#${newPrefixedId('r', 16)}`,
            expiresAt: input.now + HOLD_DURATION_SECONDS,
            now: input.now,
          }),
        );
      }
      specs.push(
        transitionOrderStatement({
          orderId: order.id,
          from: input.from,
          to: input.to,
          now: input.now,
          set: { confirmedAt: input.now, ...input.set },
        }),
      );
      specs.push(convertOrderHoldsStatement({ orderId: order.id, now: input.now }));
    }
    const names = orderAttendeeNames(order);
    let position = 0;
    let toIssue = 0;
    for (const item of items) {
      const section = sections.find((s) => s.id === item.section_id) ?? null;
      for (let seq = 1; seq <= Number(item.quantity); seq++) {
        const holder = names[position] || order.purchaser_name;
        position++;
        if (has.has(`${item.id}#${seq}`)) continue;
        const ticketId = newTicketId();
        const salt = newQrSalt();
        const signed = await signTicketQr(
          { ticketId, version: 1, eventId: order.event_id, salt },
          keyring,
          CURRENT_QR_KEY_ID,
        );
        if (!signed.ok) throw new TicketingError('UNAVAILABLE', 'Tickets are temporarily unavailable.');
        specs.push(
          insertTicketStatement({
            id: ticketId,
            orderId: order.id,
            orderItemId: item.id,
            eventId: order.event_id,
            categoryId: item.tier_id,
            sectionId: item.section_id,
            customerProfileId: order.customer_profile_id,
            holderName: holder,
            holderEmail: order.purchaser_email,
            seq,
            qrKeyId: signed.keyId,
            qrSalt: salt,
            qrSignatureHash: signed.macDigest,
            zoneCode: section?.zone_code ?? null,
            gateLabel: section?.gate_label ?? null,
            now: input.now,
          }),
        );
        toIssue++;
      }
    }
    if (fulfilled && toIssue === 0) return { ok: true, issued: 0, alreadyIssued: true };
    specs.push(...(input.extra ?? []));
    try {
      const results = await runBatch(db, specs);
      const issued = results.filter(
        (rows, i) => specs[i].sql.startsWith('INSERT INTO tickets') && rows.length > 0,
      ).length;
      return { ok: true, issued, alreadyIssued: fulfilled };
    } catch (err) {
      const code = ticketingErrorCode(err);
      if (
        code &&
        (SOLD_OUT_CODES.includes(code) ||
          ['EVENT_NOT_ON_SALE', 'CATEGORY_NOT_ON_SALE', 'SECTION_NOT_ON_SALE'].includes(code))
      )
        return { ok: false, reason: 'unfulfillable', code };
      // A hold expired between the read and the batch: read again once.
      if (code === 'TICKET_NOT_SOLD' && attempt === 0) continue;
      if (code === 'TICKET_NOT_SOLD' || code === 'HOLD_EXCEEDS_ITEM')
        return { ok: false, reason: 'wrong_state', code };
      throw err;
    }
  }
  return { ok: false, reason: 'wrong_state' };
}

// ---------------------------------------------------------------------------------------------
// Free RSVP confirmation
// ---------------------------------------------------------------------------------------------

export type ConfirmResult = { orderId: string; issued: number; alreadyConfirmed: boolean };

/** Confirms a free order whose email ownership was just proven (code or link). Idempotent. */
export async function confirmFreeOrder(
  db: SqlDatabase,
  env: TicketingEnv,
  input: { orderId: string; now: number; origin: string },
): Promise<ConfirmResult> {
  const order = await loadOrder(db, input.orderId);
  if (!order || order.order_kind !== 'free')
    throw new TicketingError(
      'INVALID_CODE',
      'That code is not right. Check the latest email from Gamo Live and try again.',
    );
  const event = await loadEvent(db, order.event_id);
  if (!event) throw new TicketingError('NOT_FOUND', 'This event is no longer available.');
  const already = ['confirmed', 'partially_refunded', 'refunded'].includes(order.status);
  if (!already) {
    if (isEventCancelled(event))
      throw new TicketingError('CLOSED', 'This event has been cancelled, so no tickets were issued.');
    if (input.now >= Number(event.starts_at))
      throw new TicketingError('CLOSED', 'This event has already started, so registration is closed.');
  }
  if (order.customer_profile_id)
    await markCustomerEmailVerified(db, { customerProfileId: order.customer_profile_id, now: input.now });
  const outcome = await issueOrderTickets(db, env, {
    orderId: order.id,
    from: ['pending_verification', 'expired'],
    to: 'confirmed',
    set: { emailVerifiedAt: input.now },
    now: input.now,
  });
  if (!outcome.ok) {
    if (outcome.reason === 'unfulfillable')
      throw new TicketingError(
        'SOLD_OUT',
        'Your reservation expired and the last tickets have gone since. Join the waitlist on the event page.',
      );
    throw new TicketingError(
      'EXPIRED',
      'This reservation is no longer open. Please start again from the event page.',
    );
  }
  if (outcome.issued > 0)
    await sendTicketEmail(db, env, { orderId: order.id, origin: input.origin, now: input.now }).catch(() =>
      console.error('[ticketing] ticket email failed'),
    );
  return { orderId: order.id, issued: outcome.issued, alreadyConfirmed: outcome.alreadyIssued };
}

/**
 * Code entry on `/tickets/confirm`. Wrong codes are limited per order (5 per 30 minutes); a token for an
 * order that does not exist (ticket-limit case) behaves exactly like a wrong code.
 */
export async function confirmOrderByCode(
  db: SqlDatabase,
  env: TicketingEnv,
  input: { confirmToken: string; code: string; now: number; origin: string },
): Promise<ConfirmResult> {
  const orderId = await readConfirmToken(env, input.confirmToken, input.now);
  if (!orderId)
    throw new TicketingError(
      'EXPIRED',
      'This confirmation page has expired. Please start again from the event page.',
    );
  const limit = await checkRateLimit(db, {
    bucket: rateLimitBucket('live.order-confirm', 'key', await keyHash(orderId)),
    limit: VERIFICATION_CODE_ATTEMPTS,
    windowSeconds: HOLD_DURATION_SECONDS,
    now: input.now,
  });
  if (!limit.allowed)
    throw new TicketingError(
      'RATE_LIMITED',
      'Too many wrong codes. Use the "Confirm my tickets" button in the email instead, or start again later.',
      { retryAfterSeconds: limit.retryAfterSeconds },
    );
  await extendUnverifiedHold(db, orderId, input.now);
  if (!(await codeMatches(env, orderId, input.code)) || !(await loadOrder(db, orderId)))
    throw new TicketingError(
      'INVALID_CODE',
      'That code is not right. Check the latest email from Gamo Live and try again.',
      {
        fields: [{ field: 'code', message: 'That code is not right. Check the latest email and try again.' }],
      },
    );
  return confirmFreeOrder(db, env, { orderId, now: input.now, origin: input.origin });
}

// ---------------------------------------------------------------------------------------------
// Door sales (called by Agent C's scanner UI)
// ---------------------------------------------------------------------------------------------

export interface DoorTicketInput {
  eventId: string;
  categoryId: string;
  sectionId?: string | null;
  quantity: number;
  holderName?: string | null;
  holderEmail?: string | null;
  method: 'free_issue' | 'cash_recorded';
  /** Total cash recorded (0 for free issue); must divide evenly by `quantity`. */
  amountCents: number;
  actorUserId?: string | null;
  scannerSessionId?: string | null;
  /**
   * Unique per form submission (CLEANUP_LOG D-179): a replay returns the same order and tickets and issues nothing
   * new. Scoped to the event. Without a key every call issues new tickets.
   */
  idempotencyKey?: string;
  /** Site origin for the ticket email (the manage link); the email is sent only with this and a holder email. */
  origin?: string;
  now: number;
}

export interface DoorTicketResult {
  orderId: string;
  orderReference: string;
  tickets: Array<{ ticketId: string; qrPayload: string; holderName: string }>;
  /** True when a ticket email was queued (holder email and origin given, first issue only). */
  emailQueued: boolean;
  /** True when this call returned an earlier issue for the same idempotency key. */
  replayed: boolean;
}

async function existingDoorIssue(
  db: SqlDatabase,
  env: TicketingEnv,
  orderKey: string,
  input: DoorTicketInput,
  quantity: number,
): Promise<DoorTicketResult | null> {
  const prior = await loadOrderBy(db, 'idempotency_key', orderKey);
  if (!prior) return null;
  const items = await loadOrderItems(db, prior.id);
  if (
    prior.event_id !== input.eventId ||
    items.length !== 1 ||
    items[0].tier_id !== input.categoryId ||
    Number(prior.quantity) !== quantity
  )
    throw new TicketingError(
      'CONFLICT',
      'This door sale was already recorded with different details. Start a new sale.',
    );
  const models = await loadTicketRenderModels(db, env, { orderId: prior.id });
  return {
    orderId: prior.id,
    orderReference: prior.order_reference ?? prior.order_number,
    tickets: models.map((m) => ({
      ticketId: m.ticketId,
      qrPayload: m.qrPayload ?? '',
      holderName: m.holderName,
    })),
    emailQueued: false,
    replayed: true,
  };
}

/**
 * Issues tickets at the door in ONE batch (order `source='door'`, confirmed; hold → converted → tickets).
 * Refused unless the event's policy enables door sales with this method. No card payments at the door.
 */
export async function issueDoorTickets(
  db: SqlDatabase,
  env: TicketingEnv,
  input: DoorTicketInput,
): Promise<DoorTicketResult> {
  if (!input.actorUserId && !input.scannerSessionId)
    throw new TicketingError('FORBIDDEN', 'Door sales need a signed-in organizer or an unlocked scanner.');
  const event = await loadEvent(db, input.eventId);
  if (!event || event.status !== 'approved')
    throw new TicketingError('NOT_FOUND', 'This event is not available.');
  if (isEventCancelled(event)) throw new TicketingError('CLOSED', 'This event has been cancelled.');
  const end = Number(event.ends_at ?? Number(event.starts_at) + 6 * 3600);
  if (input.now > end) throw new TicketingError('CLOSED', 'This event has ended.');
  const orderKey = input.idempotencyKey ? `door:${event.id}:${input.idempotencyKey}`.slice(0, 200) : null;
  if (orderKey) {
    const replay = await existingDoorIssue(db, env, orderKey, input, Math.floor(Number(input.quantity)));
    if (replay) return replay;
  }
  const policy = await loadPolicy(db, event.id);
  if (!policy.doorSalesEnabled || !policy.doorSalesMethods.includes(input.method))
    throw new TicketingError(
      'FORBIDDEN',
      'Door sales with this method are turned off for this event. Change it in the event policies.',
    );
  const quantity = Math.floor(Number(input.quantity));
  if (quantity < 1 || quantity > policy.maxTicketsPerOrder)
    throw new TicketingError('VALIDATION', `Choose from 1 to ${policy.maxTicketsPerOrder} tickets.`);
  const amount = input.method === 'free_issue' ? 0 : Math.floor(Number(input.amountCents));
  if (!Number.isInteger(amount) || amount < 0 || amount % quantity !== 0)
    throw new TicketingError(
      'VALIDATION',
      'Enter the cash amount for all tickets (it must split evenly per ticket).',
    );
  const categories = await loadCategories(db, event.id);
  if (!categories.some((c) => c.id === input.categoryId))
    throw new TicketingError('VALIDATION', 'Choose a ticket type.');
  const sections = await loadSections(db, event.id);
  const section = input.sectionId
    ? sections.find((s) => s.id === input.sectionId && s.tier_id === input.categoryId)
    : null;
  if (input.sectionId && !section)
    throw new TicketingError('VALIDATION', 'Choose a section of that ticket type.');

  const email = input.holderEmail?.trim() ? input.holderEmail.trim().toLowerCase() : null;
  const profile = email ? await upsertCustomerProfile(db, { email, now: input.now }) : null;
  const orderId = newPrefixedId('ord');
  const itemId = newPrefixedId('oit');
  const holdId = newPrefixedId('hold');
  const reference = newOrderReference();
  const holderName = input.holderName?.replace(/\s+/g, ' ').trim() || 'Door guest';
  const purchaserEmail = email ?? `door-${orderId.slice(4, 14).toLowerCase()}@door.invalid`;
  const keyring = ticketQrKeyring(env);
  const specs: SqlStatementSpec[] = buildHoldBatch({
    order: {
      id: orderId,
      reference,
      eventId: event.id,
      customerProfileId: profile?.id ?? null,
      purchaserUserId: input.actorUserId ?? null,
      purchaserName: holderName,
      purchaserEmail,
      kind: amount > 0 ? 'paid' : 'free',
      status: amount > 0 ? 'paid' : 'confirmed',
      source: 'door',
      idempotencyKey: orderKey ?? `door_${orderId}`,
      holdExpiresAt: input.now + HOLD_DURATION_SECONDS,
      policySnapshotJson: policySnapshotJson(policy),
      paymentStatus: amount > 0 ? 'paid' : 'no_payment_required',
      paymentMethod: amount > 0 ? 'cash_recorded' : 'none',
      now: input.now,
    },
    items: [
      {
        item: {
          id: itemId,
          categoryId: input.categoryId,
          sectionId: section?.id ?? null,
          quantity,
          unitPriceCents: amount / quantity,
        },
        holdId,
      },
    ],
  });
  specs.push(convertOrderHoldsStatement({ orderId, now: input.now }));
  const tickets: DoorTicketResult['tickets'] = [];
  for (let seq = 1; seq <= quantity; seq++) {
    const ticketId = newTicketId();
    const salt = newQrSalt();
    const signed = await signTicketQr({ ticketId, version: 1, eventId: event.id, salt }, keyring);
    if (!signed.ok) throw new TicketingError('UNAVAILABLE', 'Tickets are temporarily unavailable.');
    specs.push(
      insertTicketStatement({
        id: ticketId,
        orderId,
        orderItemId: itemId,
        eventId: event.id,
        categoryId: input.categoryId,
        sectionId: section?.id ?? null,
        customerProfileId: profile?.id ?? null,
        holderName,
        holderEmail: purchaserEmail,
        seq,
        qrKeyId: signed.keyId,
        qrSalt: salt,
        qrSignatureHash: signed.macDigest,
        zoneCode: section?.zone_code ?? null,
        gateLabel: section?.gate_label ?? null,
        now: input.now,
      }),
    );
    tickets.push({ ticketId, qrPayload: signed.payload, holderName });
  }
  specs.push({
    sql: 'UPDATE ticket_orders SET confirmed_at = ?2 WHERE id = ?1',
    params: [orderId, input.now],
  });
  try {
    await runBatch(db, specs);
  } catch (err) {
    const code = ticketingErrorCode(err);
    if (code === 'DUPLICATE_ORDER' && orderKey) {
      // Two submissions of the same sale raced: the other one won; return its tickets.
      const replay = await existingDoorIssue(db, env, orderKey, input, quantity);
      if (replay) return replay;
    }
    if (code && SOLD_OUT_CODES.includes(code))
      throw new TicketingError('SOLD_OUT', 'Not enough tickets are left for this ticket type.');
    if (code === 'CATEGORY_NOT_ON_SALE' || code === 'SECTION_NOT_ON_SALE')
      throw new TicketingError('NOT_ON_SALE', 'That ticket type is not on sale.');
    throw err;
  }
  let emailQueued = false;
  if (profile && email && input.origin && isDeliverableEmail(email)) {
    const r = await sendTicketEmail(db, env, { orderId, origin: input.origin, now: input.now }).catch(
      () => null,
    );
    emailQueued = r !== null;
  }
  return { orderId, orderReference: reference, tickets, emailQueued, replayed: false };
}

/**
 * `issueDoorTickets` in the shape of Agent C's `DoorIssuer` seam (`scanning-door-sales.ts`): a drop-in for
 * `issueDoorTicketsLocal`. The signing keyring comes from the environment (`input.keyring` is not used);
 * `issuedBy` selects the acting organizer or scanner session; a replayed `idempotencyKey` returns the original sale.
 */
export async function issueDoorTicketsForScanner(
  db: SqlDatabase,
  env: Record<string, unknown>,
  input: DoorIssueInput,
): Promise<DoorIssueResult> {
  const r = await issueDoorTickets(db, env, {
    eventId: input.eventId,
    categoryId: input.categoryId,
    sectionId: input.sectionId ?? null,
    quantity: input.quantity,
    holderName: input.holderName ?? null,
    holderEmail: input.holderEmail ?? null,
    method: input.method,
    amountCents:
      input.method === 'free_issue' ? 0 : Math.floor(input.unitPriceCents) * Math.floor(input.quantity),
    actorUserId: input.issuedBy.type === 'organizer' ? input.issuedBy.userId : null,
    scannerSessionId: input.issuedBy.type === 'scanner' ? input.issuedBy.sessionId : null,
    idempotencyKey: input.idempotencyKey,
    origin: typeof env.PUBLIC_SITE_URL_LIVE === 'string' ? env.PUBLIC_SITE_URL_LIVE : undefined,
    now: input.now,
  });
  const models = await loadTicketRenderModels(db, env, { orderId: r.orderId });
  return {
    orderId: r.orderId,
    orderReference: r.orderReference,
    emailQueued: r.emailQueued,
    tickets: r.tickets.map((t) => {
      const m = models.find((x) => x.ticketId === t.ticketId);
      return {
        ticketId: t.ticketId,
        payload: t.qrPayload,
        holderName: t.holderName,
        category: m?.categoryName ?? 'Ticket',
        section: m?.sectionName ?? null,
      };
    }),
  };
}

export type { OrderRow };
