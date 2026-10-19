/**
 * Ticket recovery (design §4.2 "Manage / recover"): `/tickets/find` takes an email and ALWAYS answers the
 * same ("If we have tickets for that address, we've emailed a link. It expires in 30 minutes."). When the
 * address has tickets, it gets a `customer:all` link (30 minutes) that opens the same tickets (same
 * versions) — recovery never issues new ones. Every lookup that finds an order is written to
 * `ticket_access_log`. Turnstile and the per-IP / per-email limits run in the route (guardPublicForm).
 */
import { allRows, runBatch, type SqlDatabase } from '../../security/sql-database.ts';
import { isPlausibleEmail, normalizeEmail } from '../../security/pii-hash.ts';
import { newPrefixedId } from '../../security/ids.ts';
import { formatScope, recoveryLinkExpiresAt } from '../../security/link-tokens.ts';
import { findCustomerProfileByEmail, issueCustomerLink, upsertCustomerProfile } from '../customers.ts';
import { sendRecoveryEmail } from './email.ts';
import { accessLogStatement, requireTicketingSecret, type TicketingEnv } from './orders-shared.ts';

export const RECOVERY_RESPONSE_MESSAGE =
  "If we have tickets for that address, we've emailed a link. It expires in 30 minutes. Check your spam folder if it doesn't arrive within a few minutes.";

export async function requestTicketRecovery(
  db: SqlDatabase,
  env: TicketingEnv,
  input: { email: string; ipHash: string | null; origin: string; now: number },
): Promise<{ message: string; sent: boolean }> {
  requireTicketingSecret(env, 'CUSTOMER_LINK_SECRET');
  const email = normalizeEmail(input.email ?? '');
  if (!isPlausibleEmail(email)) return { message: RECOVERY_RESPONSE_MESSAGE, sent: false };
  let profile = await findCustomerProfileByEmail(db, email);
  const rows = await allRows<{ id: string; event_id: string; title: string }>(db, {
    sql: `SELECT DISTINCT o.id, o.event_id, e.title FROM ticket_orders o JOIN events e ON e.id = o.event_id
           WHERE o.status IN ('paid', 'confirmed', 'partially_refunded', 'refunded', 'disputed', 'cancelled')
             AND ((?1 IS NOT NULL AND (o.customer_profile_id = ?1 OR EXISTS (SELECT 1 FROM tickets t WHERE t.order_id = o.id AND t.customer_profile_id = ?1)))
                  OR (o.customer_profile_id IS NULL AND lower(o.purchaser_email) = ?2))
           ORDER BY e.starts_at DESC LIMIT 50`,
    params: [profile?.id ?? null, email],
  });
  if (rows.length === 0) return { message: RECOVERY_RESPONSE_MESSAGE, sent: false };
  // Pre-0013 RSVPs have no customer profile yet: create one so the link has an owner.
  if (!profile) profile = await upsertCustomerProfile(db, { email, now: input.now });
  if (profile.erasedAt !== null) return { message: RECOVERY_RESPONSE_MESSAGE, sent: false };
  const link = await issueCustomerLink(db, env, {
    product: 'live',
    customerProfileId: profile.id,
    scope: formatScope('customer'),
    purpose: 'recovery',
    expiresAt: recoveryLinkExpiresAt(input.now),
    now: input.now,
    ipHash: input.ipHash,
    openPath: '/link',
  });
  await runBatch(
    db,
    rows.map((r) =>
      accessLogStatement({
        eventId: r.event_id,
        orderId: r.id,
        actorType: 'customer',
        actorId: profile!.id,
        action: 'lookup',
        ipHash: input.ipHash,
        now: input.now,
      }),
    ),
  );
  const result = await sendRecoveryEmail(db, env, {
    to: email,
    linkUrl: `${input.origin}${link.path}`,
    events: [...new Set(rows.map((r) => r.title))].slice(0, 10),
    attemptId: newPrefixedId('rec'),
    now: input.now,
  });
  return { message: RECOVERY_RESPONSE_MESSAGE, sent: result.status === 'sent' };
}
