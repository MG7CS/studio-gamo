/**
 * Find my tickets (docs/LIVE_REQUIREMENTS.md §8.2 item 14): a person types an email; the page always answers the same
 * way ("if that address has tickets, we sent the links"), so it never reveals who bought what. When the address has
 * paid orders (as the buyer) or tickets transferred to it, one email carries their signed links (order links for the
 * buyer's orders, ticket links for transferred tickets). Rate limited: 10 per IP per 15 minutes, 3 per email per hour.
 */
import { resolveEnvSecret } from '../security/env-secret.ts';
import { hashEmail, isPlausibleEmail, normalizeEmail } from '../security/pii-hash.ts';
import { checkRateLimits, rateLimitBucket, type RateLimitRule } from '../security/rate-limit.ts';
import { allRows, type SqlDatabase } from '../security/sql-database.ts';
import type { LiveEmail } from './mail.ts';
import type { PaidEnv } from './paid-types.ts';
import { findTicketsEmail } from './paid-mail.ts';
import { ORDER_LINK_GRACE_SECONDS, signOrderToken, signTicketToken } from './tickets.ts';

/** At most this many links in one email (the most recent first). */
export const FIND_TICKETS_MAX_LINKS = 20;

export interface FindMyTicketsResult {
  /** The page shows the same message whatever this is, except when rate limited. */
  rateLimited: boolean;
  retryAfterSeconds: number;
  /** The email to send, or null (unknown address, nothing current, bad input or rate limited). */
  email: LiveEmail | null;
}

interface LinkRow {
  kind: 'order' | 'ticket';
  id: string;
  version: number | null;
  reference: string | null;
  title: string;
  timezone: string;
  starts_at: number;
  last_at: number;
}

/**
 * Looks up the address and returns the email to send, if any. `orderUrl` builds a link from a token (the caller knows
 * the Live origin). The answer shape is the same for every address.
 */
export async function findMyTickets(
  db: SqlDatabase,
  env: PaidEnv,
  input: { email: string; ipHash?: string | null; now: number; orderUrl: (token: string) => string },
): Promise<FindMyTicketsResult> {
  const email = normalizeEmail(String(input.email ?? ''));
  const nothing = { rateLimited: false, retryAfterSeconds: 0, email: null };
  const secret = resolveEnvSecret(env as Record<string, unknown>, 'PII_HASH_SECRET');
  const rules: RateLimitRule[] = [];
  if (input.ipHash)
    rules.push({
      bucket: rateLimitBucket('live.find-tickets', 'ip', input.ipHash),
      limit: 10,
      windowSeconds: 900,
    });
  const emailHash = isPlausibleEmail(email) ? await hashEmail(email, secret) : null;
  if (emailHash)
    rules.push({
      bucket: rateLimitBucket('live.find-tickets', 'email', emailHash),
      limit: 3,
      windowSeconds: 3600,
    });
  if (rules.length) {
    const limit = await checkRateLimits(db, rules, input.now);
    if (!limit.allowed) return { rateLimited: true, retryAfterSeconds: limit.retryAfterSeconds, email: null };
  }
  if (!emailHash) return nothing;

  const lastOf = `(SELECT MAX(COALESCE(x.ends_at, x.starts_at)) FROM event_occurrences x WHERE x.event_id = r.event_id)`;
  const rows = await allRows<LinkRow>(db, {
    sql: `SELECT 'order' AS kind, r.id, NULL AS version, r.reference, e.title, e.timezone, o.starts_at, ${lastOf} AS last_at
            FROM orders r JOIN events e ON e.id = r.event_id JOIN event_occurrences o ON o.id = r.occurrence_id
           WHERE r.email_hash = ?1 AND r.is_preview = 0
             AND r.status IN ('paid', 'partially_refunded', 'refunded', 'paid_unfulfilled')
          UNION ALL
          SELECT 'ticket' AS kind, t.id, t.credential_version AS version, NULL AS reference, e.title, e.timezone, o.starts_at, ${lastOf} AS last_at
            FROM tickets t JOIN orders r ON r.id = t.order_id JOIN events e ON e.id = t.event_id
            JOIN event_occurrences o ON o.id = t.occurrence_id
           WHERE t.email_hash = ?1 AND t.transfer_count > 0 AND t.status = 'valid'
             AND (r.email_hash IS NULL OR r.email_hash <> ?1)
           ORDER BY starts_at DESC
           LIMIT ?2`,
    params: [emailHash, FIND_TICKETS_MAX_LINKS * 2],
  });
  const links = [];
  for (const r of rows) {
    const expiresAt = Number(r.last_at) + ORDER_LINK_GRACE_SECONDS;
    if (expiresAt <= input.now) continue;
    const token =
      r.kind === 'order'
        ? await signOrderToken(env, r.id, expiresAt)
        : await signTicketToken(env, r.id, Number(r.version), expiresAt);
    links.push({
      eventTitle: r.title,
      startsAt: Number(r.starts_at),
      timezone: r.timezone,
      reference: r.reference,
      url: input.orderUrl(token),
    });
    if (links.length >= FIND_TICKETS_MAX_LINKS) break;
  }
  if (links.length === 0) return nothing;
  return { rateLimited: false, retryAfterSeconds: 0, email: findTicketsEmail({ to: email, links }) };
}
