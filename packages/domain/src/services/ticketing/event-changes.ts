/**
 * Event changes after tickets exist (design §5.5), each recorded in `event_changes` and `email_log`:
 *
 * - cancel: event closed (`cancelled_at`), open holds released, every valid ticket voided
 *   (`event_cancelled`), paid orders refunded in full (test API; a failed refund is left `approved` and
 *   staff are alerted), every ticket email notified.
 * - reschedule / venue change: tickets stay valid with the same version; everyone is emailed with the
 *   updated `.ics` (same UID, higher SEQUENCE); buyers may then cancel or refund their own tickets from
 *   the manage page (`refundAfterChange`) unless the order's policy is "no refunds".
 *
 * Notifications are sent in chunks with one idempotency key per (change, order, address), so a retry after
 * a partial failure (`resendChangeNotifications`) only sends what is missing.
 */
import { allRows, runBatch, type SqlDatabase } from '../../security/sql-database.ts';
import { newPrefixedId } from '../../security/ids.ts';
import { voidEventTicketsStatement } from '../../ticketing/sql.ts';
import { zonedLocalToUtc, isValidTimeZone, utcToZonedLocal } from './events-time.ts';
import { sendEventChangeEmail } from './email.ts';
import { singleLine } from './calendar.ts';
import { refundTickets } from './refunds.ts';
import { getOrderView, type CustomerIdentity } from './orders.ts';
import {
  TicketingError,
  auditLogStatement,
  loadEvent,
  type EventRow,
  type TicketingEnv,
} from './orders-shared.ts';

export const CHANGE_NOTIFY_CHUNK = 50;

type ChangeKind = 'cancelled' | 'rescheduled' | 'venue_changed';

async function recipients(
  db: SqlDatabase,
  eventId: string,
): Promise<Array<{ order_id: string; email: string }>> {
  return allRows(db, {
    sql: `SELECT DISTINCT order_id, email FROM (
            SELECT t.order_id, lower(t.holder_email) AS email FROM tickets t WHERE t.event_id = ?1 AND (t.status = 'valid' OR t.void_reason = 'event_cancelled')
            UNION SELECT o.id, lower(o.purchaser_email) FROM ticket_orders o WHERE o.event_id = ?1 AND o.status IN ('paid', 'confirmed', 'partially_refunded', 'disputed', 'refunded')
          ) WHERE email NOT LIKE '%.invalid' ORDER BY order_id, email`,
    params: [eventId],
  });
}

/** Sends (or re-sends what is missing for) one change. Marks `notified_at` when every address succeeded. */
export async function resendChangeNotifications(
  db: SqlDatabase,
  env: TicketingEnv,
  input: { changeId: string; origin: string; now: number; refundNote?: string },
): Promise<{ sent: number; failed: number }> {
  const rows = await allRows<{ event_id: string; kind: ChangeKind }>(db, {
    sql: 'SELECT event_id, kind FROM event_changes WHERE id = ?1',
    params: [input.changeId],
  });
  const change = rows[0];
  if (!change) return { sent: 0, failed: 0 };
  const event = await loadEvent(db, change.event_id);
  if (!event) return { sent: 0, failed: 0 };
  const list = await recipients(db, event.id);
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < list.length; i += CHANGE_NOTIFY_CHUNK) {
    const chunk = list.slice(i, i + CHANGE_NOTIFY_CHUNK);
    const results = await Promise.all(
      chunk.map((r) =>
        sendEventChangeEmail(db, env, {
          to: r.email,
          orderId: r.order_id,
          changeId: input.changeId,
          kind: change.kind,
          event,
          origin: input.origin,
          refundNote: input.refundNote,
          now: input.now,
        }).catch(() => null),
      ),
    );
    for (const r of results)
      if (r && ['sent', 'delivered', 'suppressed'].includes(r.status)) sent++;
      else failed++;
  }
  if (failed === 0)
    await db
      .prepare('UPDATE event_changes SET notified_at = ?2 WHERE id = ?1 AND notified_at IS NULL')
      .bind(input.changeId, input.now)
      .run();
  return { sent, failed };
}

function snapshot(e: EventRow) {
  return {
    startsAt: Number(e.starts_at),
    endsAt: e.ends_at === null ? null : Number(e.ends_at),
    timezone: e.timezone,
    venueName: e.venue_name,
    address: e.address,
    city: e.city,
    state: e.state,
    status: e.status,
  };
}

async function editableEvent(db: SqlDatabase, eventId: string): Promise<EventRow> {
  const event = await loadEvent(db, eventId);
  if (!event) throw new TicketingError('NOT_FOUND', 'Event not found.');
  if (event.cancelled_at !== null) throw new TicketingError('CONFLICT', 'This event is already cancelled.');
  return event;
}

/** Cancels the event. The caller has checked `manage_ticketing` and `approve_refunds`. */
export async function cancelEvent(
  db: SqlDatabase,
  env: TicketingEnv,
  input: {
    eventId: string;
    reason: string;
    actorUserId: string;
    origin: string;
    now: number;
    fetchImpl?: typeof fetch;
  },
): Promise<{
  changeId: string;
  ticketsVoided: number;
  ordersRefunded: number;
  refundsPending: number;
  notified: number;
}> {
  const reason = String(input.reason ?? '').trim();
  if (reason.length < 3 || reason.length > 500)
    throw new TicketingError(
      'VALIDATION',
      'Tell attendees why the event is cancelled (3 to 500 characters).',
      { fields: [{ field: 'reason', message: 'Give a reason (3 to 500 characters).' }] },
    );
  const event = await editableEvent(db, input.eventId);
  const changeId = newPrefixedId('evc');
  // 1. The cancellation first, in one batch (CLEANUP_LOG D-176): the event is closed, open holds are released
  //    and every valid ticket is voided. A payment that completes afterwards finds no sellable event, so it
  //    becomes paid_unfulfillable and is refunded by the webhook. Only the request whose UPDATE changed the
  //    event goes on to notify: a second concurrent cancel stops here.
  const [cancelled, , voided] = await runBatch(db, [
    {
      sql: "UPDATE events SET cancelled_at = ?2, status = 'canceled' WHERE id = ?1 AND cancelled_at IS NULL RETURNING id",
      params: [event.id, input.now],
    },
    {
      sql: "UPDATE ticket_holds SET status = 'released', released_at = ?2 WHERE event_id = ?1 AND status = 'held' AND order_item_id IS NOT NULL RETURNING id",
      params: [event.id, input.now],
    },
    voidEventTicketsStatement({ eventId: event.id, now: input.now }),
    {
      sql: "UPDATE ticket_orders SET status = 'cancelled', cancelled_at = ?2, updated_at = ?2 WHERE event_id = ?1 AND status IN ('pending_verification', 'pending_payment', 'confirmed') AND total_cents = 0",
      params: [event.id, input.now],
    },
    {
      sql: "INSERT INTO event_changes (id, event_id, kind, before_json, after_json, created_by_user_id, created_at) SELECT ?1, ?2, 'cancelled', ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM events WHERE id = ?2 AND cancelled_at = ?6) AND NOT EXISTS (SELECT 1 FROM event_changes WHERE event_id = ?2 AND kind = 'cancelled')",
      params: [
        changeId,
        event.id,
        JSON.stringify(snapshot(event)),
        JSON.stringify({ status: 'canceled', reason }),
        input.actorUserId,
        input.now,
      ],
    },
    {
      sql: "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, payload_json, created_at) SELECT ?1, ?2, 'event.cancel', 'event', ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM event_changes WHERE id = ?6)",
      params: [
        newPrefixedId('aud'),
        input.actorUserId,
        event.id,
        JSON.stringify({ changeId, reason: reason.slice(0, 200) }),
        input.now,
        changeId,
      ],
    },
  ]);
  if (cancelled.length === 0)
    throw new TicketingError('CONFLICT', 'This event was just cancelled by someone else.');

  // 2. Then refund every paid order whose tickets were voided by the cancellation.
  const paidOrders = await allRows<{ id: string }>(db, {
    sql: "SELECT DISTINCT o.id FROM ticket_orders o JOIN tickets t ON t.order_id = o.id WHERE o.event_id = ?1 AND o.total_cents > 0 AND o.status IN ('paid', 'confirmed', 'partially_refunded') AND t.status = 'voided' AND t.void_reason = 'event_cancelled' AND t.refunded_at IS NULL",
    params: [event.id],
  });
  let ordersRefunded = 0;
  let refundsPending = 0;
  for (const o of paidOrders) {
    try {
      const r = await refundTickets(db, env, {
        orderId: o.id,
        reason: `Event cancelled: ${reason}`.slice(0, 500),
        actorUserId: input.actorUserId,
        now: input.now,
        origin: input.origin,
        notify: false,
        fetchImpl: input.fetchImpl,
      });
      if (r.status === 'processed') ordersRefunded++;
      if (r.status === 'refund_pending') refundsPending++;
    } catch {
      refundsPending++;
    }
  }
  const note = paidOrders.length
    ? 'Paid tickets are refunded in full to the card used (test mode). It can take a few days to appear.'
    : undefined;
  const { sent } = await resendChangeNotifications(db, env, {
    changeId,
    origin: input.origin,
    now: input.now,
    refundNote: note,
  });
  return { changeId, ticketsVoided: voided.length, ordersRefunded, refundsPending, notified: sent };
}

export interface RescheduleInput {
  eventId: string;
  startDate: string;
  startTime: string;
  endDate?: string | null;
  endTime?: string | null;
  timezone: string;
  actorUserId: string;
  origin: string;
  now: number;
}

/** Moves the event in time (tickets stay valid). The caller has checked `edit_content`. */
export async function rescheduleEvent(
  db: SqlDatabase,
  env: TicketingEnv,
  input: RescheduleInput,
): Promise<{ changeId: string; notified: number }> {
  const event = await editableEvent(db, input.eventId);
  if (!isValidTimeZone(input.timezone))
    throw new TicketingError('VALIDATION', 'Choose the time zone of the venue.', {
      fields: [{ field: 'timezone', message: 'Choose the time zone of the venue.' }],
    });
  const start = zonedLocalToUtc({ date: input.startDate, time: input.startTime, zone: input.timezone });
  if (!start.ok)
    throw new TicketingError('VALIDATION', 'Enter the new start date and time.', {
      fields: [{ field: 'startDate', message: 'Enter the new start date and time.' }],
    });
  if (start.epochSeconds <= input.now)
    throw new TicketingError('VALIDATION', 'The new start must be in the future.', {
      fields: [{ field: 'startDate', message: 'The new start must be in the future.' }],
    });
  let endsAt: number | null = null;
  if (input.endDate && input.endTime) {
    const end = zonedLocalToUtc({ date: input.endDate, time: input.endTime, zone: input.timezone });
    if (!end.ok || end.epochSeconds <= start.epochSeconds)
      throw new TicketingError('VALIDATION', 'The end must be after the start.', {
        fields: [{ field: 'endDate', message: 'The end must be after the start.' }],
      });
    endsAt = end.epochSeconds;
  }
  if (
    start.epochSeconds === Number(event.starts_at) &&
    endsAt === (event.ends_at === null ? null : Number(event.ends_at)) &&
    input.timezone === event.timezone
  )
    throw new TicketingError('VALIDATION', 'That is the current date and time. Change it, or go back.');
  const local = utcToZonedLocal(start.epochSeconds, input.timezone);
  const changeId = newPrefixedId('evc');
  await runBatch(db, [
    {
      sql: 'UPDATE events SET starts_at = ?2, ends_at = ?3, timezone = ?4, start_date_local = ?5, start_time_local = ?6, rescheduled_from_starts_at = coalesce(rescheduled_from_starts_at, ?7) WHERE id = ?1',
      params: [
        event.id,
        start.epochSeconds,
        endsAt,
        input.timezone,
        local.date,
        local.time,
        Number(event.starts_at),
      ],
    },
    {
      sql: "INSERT INTO event_changes (id, event_id, kind, before_json, after_json, created_by_user_id, created_at) VALUES (?1, ?2, 'rescheduled', ?3, ?4, ?5, ?6)",
      params: [
        changeId,
        event.id,
        JSON.stringify(snapshot(event)),
        JSON.stringify({ startsAt: start.epochSeconds, endsAt, timezone: input.timezone }),
        input.actorUserId,
        input.now,
      ],
    },
    auditLogStatement({
      actorUserId: input.actorUserId,
      action: 'event.reschedule',
      entityType: 'event',
      entityId: event.id,
      payload: { changeId },
      now: input.now,
    }),
  ]);
  const { sent } = await resendChangeNotifications(db, env, {
    changeId,
    origin: input.origin,
    now: input.now,
  });
  return { changeId, notified: sent };
}

/** Moves the event to another venue (tickets stay valid). The caller has checked `edit_content`. */
export async function changeEventVenue(
  db: SqlDatabase,
  env: TicketingEnv,
  input: {
    eventId: string;
    venueName: string;
    address: string | null;
    city: string;
    state: string;
    actorUserId: string;
    origin: string;
    now: number;
  },
): Promise<{ changeId: string; notified: number }> {
  const event = await editableEvent(db, input.eventId);
  const venueName = singleLine(input.venueName);
  const city = singleLine(input.city);
  const state = singleLine(input.state);
  const fields = [];
  if (venueName.length < 2 || venueName.length > 200)
    fields.push({ field: 'venueName', message: 'Enter the new venue name.' });
  if (city.length < 2) fields.push({ field: 'city', message: 'Enter the city.' });
  if (state.length < 2) fields.push({ field: 'state', message: 'Enter the state.' });
  if (fields.length) throw new TicketingError('VALIDATION', fields[0].message, { fields });
  const changeId = newPrefixedId('evc');
  const address = singleLine(input.address).slice(0, 300) || null;
  await runBatch(db, [
    {
      sql: 'UPDATE events SET venue_name = ?2, address = ?3, city = ?4, state = ?5 WHERE id = ?1',
      params: [event.id, venueName, address, city, state],
    },
    {
      sql: "INSERT INTO event_changes (id, event_id, kind, before_json, after_json, created_by_user_id, created_at) VALUES (?1, ?2, 'venue_changed', ?3, ?4, ?5, ?6)",
      params: [
        changeId,
        event.id,
        JSON.stringify(snapshot(event)),
        JSON.stringify({ venueName, address, city, state }),
        input.actorUserId,
        input.now,
      ],
    },
    auditLogStatement({
      actorUserId: input.actorUserId,
      action: 'event.venue_change',
      entityType: 'event',
      entityId: event.id,
      payload: { changeId },
      now: input.now,
    }),
  ]);
  const { sent } = await resendChangeNotifications(db, env, {
    changeId,
    origin: input.origin,
    now: input.now,
  });
  return { changeId, notified: sent };
}

/**
 * "Can't make the new date/venue": after a reschedule or venue change, the buyer may cancel (free) or
 * refund (paid, test) their own tickets until the new start, unless the order's policy is "no refunds".
 */
export async function refundAfterChange(
  db: SqlDatabase,
  env: TicketingEnv,
  input: {
    orderId: string;
    ticketIds: string[];
    identity: CustomerIdentity | null;
    origin: string;
    now: number;
    fetchImpl?: typeof fetch;
  },
) {
  const view = await getOrderView(db, { orderId: input.orderId, session: input.identity, now: input.now });
  if (!view)
    throw new TicketingError(
      'NOT_FOUND',
      'We could not find that order. Open the latest link from your email.',
    );
  if (!view.changeRefundOpen)
    throw new TicketingError(
      'FORBIDDEN',
      'Refunds for this order follow the event refund policy. Contact the organizer.',
    );
  const own = view.tickets.filter((t) => t.state === 'valid').map((t) => t.id);
  const chosen = input.ticketIds.length ? input.ticketIds.filter((id) => own.includes(id)) : own;
  if (!chosen.length) throw new TicketingError('VALIDATION', 'Choose at least one of your valid tickets.');
  return refundTickets(db, env, {
    orderId: input.orderId,
    ticketIds: chosen,
    reason: 'Buyer cannot attend after an event change',
    actorUserId: null,
    actorLabel: 'customer',
    now: input.now,
    origin: input.origin,
    fetchImpl: input.fetchImpl,
  });
}
