/**
 * Ticket transfers (docs/LIVE_REQUIREMENTS.md §8.2 item 15, owner decision 11: transfers allowed, resale not). Where
 * the policy that applies to the order allows it and before its cutoff, the current holder names a new holder; the
 * ticket's credential version and salt are bumped in one conditional UPDATE guarded on the version the holder saw
 * (so a transfer racing a scan or another transfer loses cleanly), the old QR stops working, and both people are
 * emailed. A `ticket_transfers` row records it; it has no price column and never will.
 *
 * Who may transfer: the buyer from the order page (tickets never transferred yet), or the current holder from their
 * ticket link (which names the current version). Rate limits: 10 per hour per link, 3 per day per recipient.
 */
import { randomBase32 } from '../security/base32.ts';
import { resolveEnvSecret } from '../security/env-secret.ts';
import { newPrefixedId } from '../security/ids.ts';
import { hashEmail, hashPii, isPlausibleEmail, normalizeEmail } from '../security/pii-hash.ts';
import { checkRateLimits, rateLimitBucket } from '../security/rate-limit.ts';
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import type { LiveEmail } from './mail.ts';
import { PaidError, type PaidEnv, type PolicySnapshot } from './paid-types.ts';
import { ticketTransferredFromEmail, ticketTransferredToEmail } from './paid-mail.ts';
import {
  loadPaidOrder,
  loadTicket,
  orderLinkExpiresAt,
  policyForOrder,
  signTicketToken,
  transferDeadline,
  type OrderTicket,
  type PaidOrder,
} from './tickets.ts';

export const HOLDER_NAME_MAX = 100;

/** How the person reached the transfer form: the buyer's order link, or the holder's ticket link. */
export type TransferAccess = { kind: 'order'; orderId: string } | { kind: 'ticket'; version: number };

export type TransferBlockReason =
  | 'not_allowed'
  | 'cutoff_passed'
  | 'checked_in'
  | 'not_valid'
  | 'already_transferred'
  | 'refund_open'
  | 'order_status'
  | 'disputed';

export interface TransferOption {
  allowed: boolean;
  reason: TransferBlockReason | null;
  /** Until when a transfer is accepted (exclusive), or null when the policy allows none. */
  deadline: number | null;
}

/** Whether a ticket may be transferred now through this kind of link (pure). */
export function transferOption(
  order: Pick<PaidOrder, 'status' | 'disputed' | 'startsAt'>,
  ticket: Pick<OrderTicket, 'status' | 'checkedInAt' | 'transferCount'>,
  policy: PolicySnapshot,
  access: TransferAccess['kind'],
  refundOpen: boolean,
  now: number,
): TransferOption {
  const deadline = transferDeadline(policy, order.startsAt);
  const block = (reason: TransferBlockReason): TransferOption => ({ allowed: false, reason, deadline });
  if (order.status !== 'paid' && order.status !== 'partially_refunded') return block('order_status');
  if (order.disputed) return block('disputed');
  if (ticket.status !== 'valid') return block('not_valid');
  if (ticket.checkedInAt != null) return block('checked_in');
  if (access === 'order' && ticket.transferCount > 0) return block('already_transferred');
  if (refundOpen) return block('refund_open');
  if (deadline == null) return block('not_allowed');
  if (now >= deadline) return block('cutoff_passed');
  return { allowed: true, reason: null, deadline };
}

/** True when the ticket is in a refund that is asked for or in flight. */
export async function ticketHasOpenRefund(
  db: SqlDatabase,
  orderId: string,
  ticketId: string,
): Promise<boolean> {
  const rows = await allRows(db, {
    sql: `SELECT 1 AS ok FROM refunds r, json_each(r.ticket_ids) j
           WHERE r.order_id = ?1 AND r.status IN ('requested', 'pending') AND j.value = ?2 LIMIT 1`,
    params: [orderId, ticketId],
  });
  return rows.length > 0;
}

export interface TransferInput {
  ticketId: string;
  access: TransferAccess;
  toName: string;
  toEmail: string;
  confirmEmail: string;
  now: number;
  /** Builds the new holder's ticket link from its token (the caller knows the Live origin). */
  ticketUrl: (token: string) => string;
}

export interface TransferResult {
  ticketId: string;
  version: number;
  /** The new holder's email, then the previous holder's (when there is an address). */
  emails: LiveEmail[];
}

/** Transfers one ticket to a new holder. Throws `PaidError` with a field name in `detail` for form errors. */
export async function transferTicket(
  db: SqlDatabase,
  env: PaidEnv,
  input: TransferInput,
): Promise<TransferResult> {
  const toName = String(input.toName ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const toEmail = normalizeEmail(String(input.toEmail ?? ''));
  if (toName.length < 1 || toName.length > HOLDER_NAME_MAX)
    throw new PaidError('invalid', { detail: 'toName' });
  if (!isPlausibleEmail(toEmail)) throw new PaidError('invalid', { detail: 'toEmail' });
  if (normalizeEmail(String(input.confirmEmail ?? '')) !== toEmail)
    throw new PaidError('invalid', { detail: 'confirmEmail' });

  const ticket = await loadTicket(db, input.ticketId);
  if (!ticket) throw new PaidError('not_found');
  if (input.access.kind === 'order' && ticket.orderId !== input.access.orderId)
    throw new PaidError('not_found');
  if (input.access.kind === 'ticket' && ticket.credentialVersion !== input.access.version)
    throw new PaidError('stale', { detail: 'replaced' });
  const order = await loadPaidOrder(db, ticket.orderId);
  if (!order) throw new PaidError('not_found');

  const currentEmail = normalizeEmail(ticket.holderEmail ?? order.buyerEmail ?? '');
  if (currentEmail && currentEmail === toEmail) throw new PaidError('invalid', { detail: 'same_email' });

  const policy = await policyForOrder(db, order);
  const option = transferOption(
    order,
    ticket,
    policy,
    input.access.kind,
    await ticketHasOpenRefund(db, order.id, ticket.id),
    input.now,
  );
  if (!option.allowed) {
    if (option.reason === 'not_allowed' || option.reason === 'cutoff_passed')
      throw new PaidError('policy_forbids', { detail: option.reason });
    throw new PaidError('invalid', { detail: option.reason ?? 'transfer' });
  }

  const piiSecret = resolveEnvSecret(env as Record<string, unknown>, 'PII_HASH_SECRET');
  const toHash = await hashEmail(toEmail, piiSecret);
  const linkKey =
    input.access.kind === 'order' ? `transfer:order:${order.id}` : `transfer:ticket:${ticket.id}`;
  const limit = await checkRateLimits(
    db,
    [
      {
        bucket: rateLimitBucket('live.transfer', 'key', await hashPii(linkKey, piiSecret)),
        limit: 10,
        windowSeconds: 3600,
      },
      { bucket: rateLimitBucket('live.transfer', 'email', toHash), limit: 3, windowSeconds: 86_400 },
    ],
    input.now,
  );
  if (!limit.allowed) throw new PaidError('rate_limited', { retryAfterSeconds: limit.retryAfterSeconds });

  const fromName = ticket.holderName ?? order.buyerName;
  const fromHash = currentEmail ? await hashEmail(currentEmail, piiSecret) : null;
  const versionFrom = ticket.credentialVersion;
  const versionTo = versionFrom + 1;
  const rows = await runBatch(db, [
    {
      sql: `UPDATE tickets SET holder_name = ?3, holder_email = ?4, email_hash = ?5, credential_version = ?6,
                   credential_salt = ?7, transfer_count = transfer_count + 1, updated_at = ?8
             WHERE id = ?1 AND credential_version = ?2 AND status = 'valid' AND checked_in_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM refunds r, json_each(r.ticket_ids) j
                                WHERE r.order_id = tickets.order_id AND r.status IN ('requested', 'pending')
                                  AND j.value = tickets.id)
         RETURNING id`,
      params: [ticket.id, versionFrom, toName, toEmail, toHash, versionTo, randomBase32(26), input.now],
    },
    {
      sql: `INSERT INTO ticket_transfers (id, ticket_id, from_name, from_email_hash, to_name, to_email_hash, version_from, version_to, created_at)
            SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 WHERE changes() = 1`,
      params: [
        newPrefixedId('trf'),
        ticket.id,
        fromName,
        fromHash,
        toName,
        toHash,
        versionFrom,
        versionTo,
        input.now,
      ],
    },
  ]);
  if (rows[0].length === 0) throw new PaidError('stale');

  const expiresAt = (await orderLinkExpiresAt(db, order.id)) ?? order.startsAt;
  const token = await signTicketToken(env, ticket.id, versionTo, expiresAt);
  const event = {
    title: order.eventTitle,
    startsAt: order.startsAt,
    timezone: order.timezone,
    venueName: order.venueName,
    venueAddress: order.venueAddress,
    organizationName: order.organizationName,
  };
  const emails: LiveEmail[] = [
    ticketTransferredToEmail({
      to: toEmail,
      toName,
      fromName,
      event,
      ticketType: ticket.typeName,
      ticketUrl: input.ticketUrl(token),
    }),
  ];
  if (currentEmail)
    emails.push(
      ticketTransferredFromEmail({
        to: currentEmail,
        name: fromName,
        toName,
        event,
        ticketType: ticket.typeName,
      }),
    );
  return { ticketId: ticket.id, version: versionTo, emails };
}

/** A ticket's transfer history for the organizer's order detail (names only; email hashes are never shown). */
export async function ticketTransferHistory(
  db: SqlDatabase,
  orderId: string,
): Promise<Array<{ ticketId: string; fromName: string | null; toName: string | null; at: number }>> {
  const rows = await allRows<{
    ticket_id: string;
    from_name: string | null;
    to_name: string | null;
    created_at: number;
  }>(db, {
    sql: `SELECT f.ticket_id, f.from_name, f.to_name, f.created_at FROM ticket_transfers f
              JOIN tickets t ON t.id = f.ticket_id WHERE t.order_id = ?1 ORDER BY f.created_at, f.rowid`,
    params: [orderId],
  });
  return rows.map((r) => ({
    ticketId: r.ticket_id,
    fromName: r.from_name,
    toName: r.to_name,
    at: Number(r.created_at),
  }));
}
