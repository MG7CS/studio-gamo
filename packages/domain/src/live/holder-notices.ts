/**
 * Telling ticket holders that a paid event changed (docs/LIVE_REQUIREMENTS.md §8.2 item 17): the venue changed, the
 * tickets stay valid, and each holder may ask for a refund under the event's policy. Used by the organizer's editor when
 * a change goes live at once, and by the admin when it approves a change that waited for review.
 */
import { allRows, type SqlDatabase } from '../security/sql-database.ts';
import { CANCEL_EMAIL_LIMIT, type EventFormValues } from './events.ts';
import { sendLiveEmail } from './mail.ts';
import { listEventOrders } from './orders.ts';
import { eventChangedEmail } from './paid-mail.ts';
import { PaidError, type PaidEnv } from './paid-types.ts';
import { loadPaidOrder, orderTokenFor, policyForOrder, refundDeadline, type PaidOrder } from './tickets.ts';

type Place = Pick<EventFormValues, 'venueName' | 'address' | 'city' | 'state'>;

/** What changed for ticket holders between two versions of an event's live details (the date is locked once sold). */
export function holderChanges(before: Place, after: Place): string[] {
  const venue = (v: Place) =>
    [v.venueName, v.address, v.city, v.state].map((x) => String(x ?? '').trim()).join('|');
  return venue(before) === venue(after) ? [] : ['The venue'];
}

const mailEventOf = (o: PaidOrder) => ({
  title: o.eventTitle,
  startsAt: o.startsAt,
  timezone: o.timezone,
  venueName: o.venueName,
  venueAddress: o.venueAddress,
  organizationName: o.organizationName,
});

/**
 * Emails every holder of a paid (or partly refunded) order of the event: what changed, the order link and the refund
 * deadline when the policy still allows one. At most `CANCEL_EMAIL_LIMIT` per call; the rest are counted, not lost.
 * `origin` is the Live site's origin (the order links point there).
 */
export async function notifyHoldersOfChange(
  db: SqlDatabase,
  env: PaidEnv & Record<string, unknown>,
  input: { organizationId: string; eventId: string; changes: readonly string[]; origin: string; now: number },
): Promise<{ emailed: number; notEmailed: number }> {
  const rows = (
    await Promise.all(
      (['paid', 'partially_refunded'] as const).map((status) =>
        listEventOrders(db, input.organizationId, input.eventId, { status }),
      ),
    )
  ).flat();
  let emailed = 0;
  let notEmailed = 0;
  for (const row of rows) {
    if (!row.buyerEmail) continue;
    if (emailed + notEmailed >= CANCEL_EMAIL_LIMIT) {
      notEmailed++;
      continue;
    }
    try {
      const order = await loadPaidOrder(db, row.id);
      const token = order ? await orderTokenFor(db, env, order.id) : null;
      if (!order || !token) throw new PaidError('not_found');
      const deadline = refundDeadline(await policyForOrder(db, order), order.startsAt);
      await sendLiveEmail(
        env,
        eventChangedEmail({
          to: row.buyerEmail,
          name: order.buyerName,
          event: mailEventOf(order),
          changes: input.changes,
          orderUrl: `${input.origin.replace(/\/+$/, '')}/orders/${encodeURIComponent(token)}`,
          refundUntil: deadline != null && deadline > input.now ? deadline : null,
        }),
      );
      emailed++;
    } catch {
      notEmailed++;
    }
  }
  return { emailed, notEmailed };
}

/** An event's organization, admission and the place ticket holders see (for comparing before and after a decision). */
export async function eventPlace(
  db: SqlDatabase,
  eventId: string,
): Promise<(Place & { organizationId: string | null; admission: string }) | null> {
  const [row] = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT e.organization_id, e.admission, COALESCE(e.venue_name, v.name) AS venue_name,
                 COALESCE(e.venue_address, v.address) AS address, v.city, v.state
            FROM events e JOIN venues v ON v.id = e.venue_id WHERE e.id = ?1`,
    params: [eventId],
  });
  if (!row) return null;
  return {
    organizationId: (row.organization_id as string | null) ?? null,
    admission: String(row.admission),
    venueName: String(row.venue_name ?? ''),
    address: String(row.address ?? ''),
    city: String(row.city ?? ''),
    state: String(row.state ?? ''),
  };
}
