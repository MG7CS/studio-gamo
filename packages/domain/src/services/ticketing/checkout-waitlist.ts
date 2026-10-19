/**
 * Waitlist (design §7 "Waitlist"): a sold-out buyer leaves an email; when held tickets are released
 * (expiry, cancelled checkout, refund, cancellation) the earliest entries whose quantity now fits are
 * emailed "tickets available". First come, first served: nothing is reserved and nobody is charged.
 */
import { allRows, type SqlDatabase } from '../../security/sql-database.ts';
import { newPrefixedId } from '../../security/ids.ts';
import { upsertCustomerProfile } from '../customers.ts';
import { sendWaitlistAvailableEmail } from './email.ts';
import { TicketingError, loadEvent, type TicketingEnv } from './orders-shared.ts';

export async function joinWaitlist(
  db: SqlDatabase,
  input: { eventId: string; categoryId: string | null; email: string; quantity: number; now: number },
): Promise<{ joined: true }> {
  const event = await loadEvent(db, input.eventId);
  if (!event || event.status !== 'approved' || event.cancelled_at !== null)
    throw new TicketingError('NOT_FOUND', 'This event is not available.');
  const quantity = Math.floor(Number(input.quantity) || 1);
  if (quantity < 1 || quantity > 20)
    throw new TicketingError('VALIDATION', 'Choose from 1 to 20 tickets.', {
      fields: [{ field: 'waitlist_quantity', message: 'Choose from 1 to 20 tickets.' }],
    });
  if (input.categoryId) {
    const ok = await allRows(db, {
      sql: 'SELECT 1 FROM ticket_tiers WHERE id = ?1 AND event_id = ?2',
      params: [input.categoryId, event.id],
    });
    if (!ok.length) throw new TicketingError('VALIDATION', 'Please reload the page and try again.');
  }
  const profile = await upsertCustomerProfile(db, { email: input.email, now: input.now });
  if (profile.erasedAt === null)
    await db
      .prepare(
        "INSERT INTO waitlist_entries (id, event_id, tier_id, customer_profile_id, quantity, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'waiting', ?6, ?6) ON CONFLICT DO UPDATE SET quantity = excluded.quantity, status = 'waiting', updated_at = excluded.updated_at WHERE waitlist_entries.status IN ('waiting', 'notified', 'removed')",
      )
      .bind(newPrefixedId('wl'), event.id, input.categoryId, profile.id, quantity, input.now)
      .run();
  // Same answer whether or not the address was already on the list.
  return { joined: true };
}

/** Emails waiting entries whose quantity fits what is free now. Returns how many were notified. */
export async function notifyWaitlist(
  db: SqlDatabase,
  env: TicketingEnv,
  input: { eventId: string; now: number; origin: string; limit?: number },
): Promise<number> {
  const event = await loadEvent(db, input.eventId);
  if (
    !event ||
    event.status !== 'approved' ||
    event.cancelled_at !== null ||
    input.now >= Number(event.starts_at)
  )
    return 0;
  const candidates = await allRows<{ id: string; email: string; quantity: number }>(db, {
    sql: `SELECT w.id, p.email_normalized AS email, w.quantity FROM waitlist_entries w
      JOIN customer_profiles p ON p.id = w.customer_profile_id AND p.erased_at IS NULL
      WHERE w.event_id = ?1 AND w.status = 'waiting' AND (
        (w.tier_id IS NULL AND EXISTS (SELECT 1 FROM ticket_tiers t WHERE t.event_id = w.event_id AND t.status = 'active' AND (t.capacity - t.reserved_count) / t.seats_per_ticket >= w.quantity))
        OR EXISTS (SELECT 1 FROM ticket_tiers t WHERE t.id = w.tier_id AND t.status = 'active' AND (t.capacity - t.reserved_count) / t.seats_per_ticket >= w.quantity))
      ORDER BY w.created_at, w.id LIMIT ?2`,
    params: [event.id, input.limit ?? 20],
  });
  let notified = 0;
  for (const c of candidates) {
    // Claim the entry first so two releases never email the same person twice.
    const claimed = await db
      .prepare(
        "UPDATE waitlist_entries SET status = 'notified', notified_at = ?2, updated_at = ?2 WHERE id = ?1 AND status = 'waiting' RETURNING id",
      )
      .bind(c.id, input.now)
      .first();
    if (!claimed) continue;
    await sendWaitlistAvailableEmail(db, env, {
      to: c.email,
      entryId: `${c.id}:${input.now}`,
      event,
      origin: input.origin,
      now: input.now,
    });
    notified++;
  }
  return notified;
}
