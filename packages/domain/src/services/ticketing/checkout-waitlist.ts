/**
 * Waitlist (design §7 "Waitlist"): a sold-out buyer leaves an email; when held tickets are released
 * (expiry, cancelled checkout, refund, cancellation) the earliest CONFIRMED entries whose quantity now fits are
 * emailed "tickets available". First come, first served: nothing is reserved and nobody is charged.
 *
 * Double opt-in (CLEANUP_LOG D-180): joining only sends one confirmation email with a link; the entry stays
 * inactive (`removed`, which the schema's status list allows without a migration) until the link is confirmed, so
 * nobody can enrol a stranger's address and make us mail them repeatedly. Joining answers identically for every
 * address.
 */
import { allRows, type SqlDatabase } from '../../security/sql-database.ts';
import { newPrefixedId } from '../../security/ids.ts';
import { CustomerLinkTokens, formatScope, parseScope } from '../../security/link-tokens.ts';
import { issueCustomerLink, upsertCustomerProfile } from '../customers.ts';
import { sendWaitlistAvailableEmail, sendWaitlistConfirmEmail } from './email.ts';
import { TicketingError, loadEvent, requireTicketingSecret, type TicketingEnv } from './orders-shared.ts';

const CONFIRM_LINK_SECONDS = 3 * 24 * 60 * 60;

export async function joinWaitlist(
  db: SqlDatabase,
  env: TicketingEnv,
  input: {
    eventId: string;
    categoryId: string | null;
    email: string;
    quantity: number;
    origin: string;
    now: number;
  },
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
  requireTicketingSecret(env, 'CUSTOMER_LINK_SECRET');
  const profile = await upsertCustomerProfile(db, { email: input.email, now: input.now });
  if (profile.erasedAt === null) {
    const existing = (
      await allRows<{ id: string; status: string }>(db, {
        sql: "SELECT id, status FROM waitlist_entries WHERE event_id = ?1 AND coalesce(tier_id, '') = coalesce(?2, '') AND customer_profile_id = ?3",
        params: [event.id, input.categoryId, profile.id],
      })
    )[0];
    if (existing?.status !== 'waiting') {
      let entryId = existing?.id;
      if (entryId)
        await db
          .prepare(
            "UPDATE waitlist_entries SET quantity = ?2, status = 'removed', notified_at = NULL, updated_at = ?3 WHERE id = ?1",
          )
          .bind(entryId, quantity, input.now)
          .run();
      else {
        entryId = newPrefixedId('wl');
        await db
          .prepare(
            "INSERT INTO waitlist_entries (id, event_id, tier_id, customer_profile_id, quantity, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'removed', ?6, ?6) ON CONFLICT DO NOTHING",
          )
          .bind(entryId, event.id, input.categoryId, profile.id, quantity, input.now)
          .run();
      }
      const link = await issueCustomerLink(db, env, {
        product: 'live',
        customerProfileId: profile.id,
        scope: formatScope('registration', entryId),
        purpose: 'registration',
        expiresAt: input.now + CONFIRM_LINK_SECONDS,
        now: input.now,
        openPath: '/waitlist/confirm',
      });
      await sendWaitlistConfirmEmail(db, env, {
        to: profile.emailNormalized,
        entryId,
        event,
        confirmUrl: `${input.origin}${link.path}`,
        // One confirmation mail per entry per day: repeated sign-ups cannot be used to flood an address.
        windowKey: String(Math.floor(input.now / 86400)),
        now: input.now,
      }).catch(() => console.error('[ticketing] waitlist confirmation email failed'));
    }
  }
  // Same answer whether or not the address was already on the list.
  return { joined: true };
}

/** Confirms a waitlist entry from its emailed link (called by the POST on `/waitlist/confirm`). */
export async function confirmWaitlistEntry(
  db: SqlDatabase,
  env: TicketingEnv,
  input: { token: string; now: number },
): Promise<{ ok: boolean; eventTitle?: string }> {
  const consumed = await new CustomerLinkTokens(
    db,
    requireTicketingSecret(env, 'CUSTOMER_LINK_SECRET'),
    'live',
  ).consume(String(input.token ?? ''), input.now);
  if (!consumed.ok) return { ok: false };
  const scope = parseScope(consumed.record.scope);
  if (scope?.kind !== 'registration') return { ok: false };
  const row = (await db
    .prepare(
      "UPDATE waitlist_entries SET status = 'waiting', updated_at = ?2 WHERE id = ?1 AND customer_profile_id = ?3 AND status IN ('removed', 'waiting') RETURNING event_id",
    )
    .bind(scope.id, input.now, consumed.record.customerProfileId)
    .first()) as { event_id: string } | null;
  if (!row) return { ok: false };
  const event = await loadEvent(db, row.event_id);
  return { ok: true, eventTitle: event?.title };
}

/**
 * Emails confirmed entries whose quantity fits what is free now. Returns how many were notified. An entry is
 * claimed first (so two releases never email one person twice) and handed back to `waiting` if the email did
 * not go out; one failing send never stops the rest.
 */
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
    const claimed = await db
      .prepare(
        "UPDATE waitlist_entries SET status = 'notified', notified_at = ?2, updated_at = ?2 WHERE id = ?1 AND status = 'waiting' RETURNING id",
      )
      .bind(c.id, input.now)
      .first();
    if (!claimed) continue;
    let sent: boolean;
    try {
      const r = await sendWaitlistAvailableEmail(db, env, {
        to: c.email,
        entryId: `${c.id}:${input.now}`,
        event,
        origin: input.origin,
        now: input.now,
      });
      sent = ['sent', 'delivered', 'suppressed'].includes(r.status);
    } catch {
      sent = false;
    }
    if (sent) notified++;
    else
      await db
        .prepare(
          "UPDATE waitlist_entries SET status = 'waiting', notified_at = NULL, updated_at = ?2 WHERE id = ?1 AND status = 'notified'",
        )
        .bind(c.id, input.now)
        .run()
        .catch(() => undefined);
  }
  return notified;
}
