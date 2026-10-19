/**
 * Transfers and reissues (design §5.3): both bump the ticket version with a new salt, so every old QR
 * image (screenshots, printed PDFs, emails) stops scanning. `bumpTicketVersionStatement` is conditional on
 * the version the caller saw, so of two concurrent transfers of one ticket exactly one wins.
 *
 * Transfer (customer, current holder only): within the order's policy snapshot — transfers allowed, before
 * the cutoff, fewer than the maximum transfers, not already scanned in today. New holder name and email;
 * the recipient gets a customer profile, a manage link and the ticket; the previous holder is told.
 * Reissue (organizer/staff with `manage_ticketing`, reason required): same holder, new code.
 */
import { runBatch, type SqlDatabase } from '../../security/sql-database.ts';
import { CURRENT_QR_KEY_ID, newQrSalt, signTicketQr } from '../../security/ticket-qr.ts';
import { isPlausibleEmail, normalizeEmail } from '../../security/pii-hash.ts';
import { upsertCustomerProfile } from '../customers.ts';
import { bumpTicketVersionStatement } from '../../ticketing/sql.ts';
import { venueDayKey } from './events-time.ts';
import { sendTicketEmail, sendTransferNoticeEmail } from './email.ts';
import { sessionHoldsTicket, type CustomerIdentity } from './orders.ts';
import {
  TicketingError,
  accessLogStatement,
  auditLogStatement,
  emailsEqual,
  isEventCancelled,
  loadEvent,
  loadOrder,
  loadTicket,
  orderPolicy,
  ticketQrKeyring,
  type TicketingEnv,
} from './orders-shared.ts';

async function newSignature(env: TicketingEnv, ticket: { id: string; event_id: string }, version: number) {
  const salt = newQrSalt();
  const signed = await signTicketQr(
    { ticketId: ticket.id, version, eventId: ticket.event_id, salt },
    ticketQrKeyring(env),
    CURRENT_QR_KEY_ID,
  );
  if (!signed.ok)
    throw new TicketingError('UNAVAILABLE', 'Tickets are temporarily unavailable. Please try again shortly.');
  return { salt, signed };
}

export interface TransferInput {
  ticketId: string;
  identity: CustomerIdentity | null;
  toName: string;
  toEmail: string;
  toEmailConfirm: string;
  ipHash: string | null;
  origin: string;
  now: number;
}

export async function transferTicket(
  db: SqlDatabase,
  env: TicketingEnv,
  input: TransferInput,
): Promise<{ ticketId: string; version: number }> {
  const ticket = await loadTicket(db, input.ticketId);
  if (!ticket || !sessionHoldsTicket(input.identity, ticket))
    throw new TicketingError(
      'NOT_FOUND',
      'We could not find that ticket. Open the latest link from your email.',
    );
  if (!ticket.order_item_id)
    throw new TicketingError('CONFLICT', 'This older registration cannot be transferred.');
  const fields = [];
  const toName = String(input.toName ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const toEmail = normalizeEmail(input.toEmail ?? '');
  if (toName.length < 2 || toName.length > 120)
    fields.push({ field: 'toName', message: "Enter the new holder's full name." });
  if (!isPlausibleEmail(toEmail))
    fields.push({
      field: 'toEmail',
      message: "Enter the new holder's email address, like name@example.org.",
    });
  else if (!emailsEqual(input.toEmail, input.toEmailConfirm))
    fields.push({
      field: 'toEmailConfirm',
      message: 'The two email addresses are different. Type the same address in both boxes.',
    });
  else if (toEmail === normalizeEmail(ticket.holder_email))
    fields.push({
      field: 'toEmail',
      message: 'That is the current holder. Enter the email of the person you are giving the ticket to.',
    });
  if (fields.length) throw new TicketingError('VALIDATION', fields[0].message, { fields });

  const order = await loadOrder(db, ticket.order_id);
  const event = await loadEvent(db, ticket.event_id);
  if (!order || !event) throw new TicketingError('NOT_FOUND', 'We could not find that ticket.');
  const policy = orderPolicy(order);
  if (ticket.status !== 'valid')
    throw new TicketingError('CONFLICT', 'This ticket is no longer valid, so it cannot be transferred.');
  if (isEventCancelled(event)) throw new TicketingError('CLOSED', 'This event has been cancelled.');
  if (!policy.transferAllowed)
    throw new TicketingError('FORBIDDEN', 'The organizer does not allow transfers for this event.');
  if (input.now >= Number(event.starts_at) - policy.transferCutoffHours * 3600)
    throw new TicketingError('CLOSED', 'Transfers for this event are closed.');
  if (Number(ticket.transfer_count) >= policy.maxTransfersPerTicket)
    throw new TicketingError('FORBIDDEN', 'This ticket has been transferred the most times allowed.');
  const day = venueDayKey(input.now, event.timezone);
  const scanned = await db
    .prepare('SELECT 1 FROM ticket_presence WHERE ticket_id = ?1 AND day_key = ?2 AND entry_count > 0')
    .bind(ticket.id, day)
    .first();
  if (scanned)
    throw new TicketingError(
      'CONFLICT',
      'This ticket was already scanned in today, so it cannot be transferred.',
    );

  const recipient = await upsertCustomerProfile(db, { email: toEmail, now: input.now });
  if (recipient.erasedAt !== null)
    throw new TicketingError('VALIDATION', 'Please use another email address for the new holder.');
  const version = Number(ticket.version) + 1;
  const { salt, signed } = await newSignature(env, ticket, version);
  const [bumped] = await runBatch(db, [
    bumpTicketVersionStatement({
      ticketId: ticket.id,
      expectedVersion: Number(ticket.version),
      qrSalt: salt,
      qrKeyId: signed.keyId,
      qrSignatureHash: signed.macDigest,
      now: input.now,
      transfer: {
        holderName: toName,
        holderEmail: toEmail,
        customerProfileId: recipient.id,
        previousEmail: ticket.holder_email,
      },
    }),
    accessLogStatement({
      eventId: ticket.event_id,
      ticketId: ticket.id,
      orderId: ticket.order_id,
      actorType: 'customer',
      actorId: input.identity!.customerProfileId,
      action: 'transfer',
      ipHash: input.ipHash,
      now: input.now,
    }),
  ]);
  if (bumped.length === 0)
    throw new TicketingError(
      'CONFLICT',
      'This ticket was just changed. Reload the page to see its current state.',
    );

  await sendTicketEmail(db, env, {
    orderId: ticket.order_id,
    origin: input.origin,
    now: input.now,
    recipient: { email: toEmail, customerProfileId: recipient.id, ticketIds: [ticket.id] },
    idempotencyKey: `ticket_transfer:${ticket.id}:v${version}`,
    kind: 'ticket_transfer',
    intro: `${shortSender(ticket.holder_name)} transferred a ticket for ${event.title} to you.`,
  }).catch(() => console.error('[ticketing] transfer email failed'));
  await sendTransferNoticeEmail(db, env, {
    to: ticket.holder_email,
    recipientEmail: toEmail,
    eventTitle: event.title,
    ticketId: ticket.id,
    version,
    now: input.now,
  }).catch(() => undefined);
  return { ticketId: ticket.id, version };
}

function shortSender(name: string): string {
  return (
    String(name ?? '')
      .trim()
      .split(/\s+/)[0] || 'Someone'
  );
}

/** Organizer/staff reissue: the caller has checked `manage_ticketing`. */
export async function reissueTicket(
  db: SqlDatabase,
  env: TicketingEnv,
  input: {
    ticketId: string;
    reason: string;
    actorUserId: string;
    actorType: 'organizer' | 'staff';
    ipHash?: string | null;
    origin: string;
    now: number;
    notify?: boolean;
  },
): Promise<{ ticketId: string; version: number }> {
  const reason = String(input.reason ?? '').trim();
  if (reason.length < 3 || reason.length > 500)
    throw new TicketingError('VALIDATION', 'Give a reason for the reissue (3 to 500 characters).', {
      fields: [{ field: 'reason', message: 'Give a reason (3 to 500 characters).' }],
    });
  const ticket = await loadTicket(db, input.ticketId);
  if (!ticket || !ticket.order_item_id) throw new TicketingError('NOT_FOUND', 'Ticket not found.');
  if (ticket.status !== 'valid') throw new TicketingError('CONFLICT', 'Only valid tickets can be reissued.');
  const version = Number(ticket.version) + 1;
  const { salt, signed } = await newSignature(env, ticket, version);
  const [bumped] = await runBatch(db, [
    bumpTicketVersionStatement({
      ticketId: ticket.id,
      expectedVersion: Number(ticket.version),
      qrSalt: salt,
      qrKeyId: signed.keyId,
      qrSignatureHash: signed.macDigest,
      now: input.now,
    }),
    accessLogStatement({
      eventId: ticket.event_id,
      ticketId: ticket.id,
      orderId: ticket.order_id,
      actorType: input.actorType,
      actorId: input.actorUserId,
      action: 'reissue',
      ipHash: input.ipHash,
      now: input.now,
    }),
    auditLogStatement({
      actorUserId: input.actorUserId,
      action: 'ticket.reissue',
      entityType: 'ticket',
      entityId: ticket.id,
      payload: { reason: reason.slice(0, 200), version },
      now: input.now,
    }),
  ]);
  if (bumped.length === 0)
    throw new TicketingError('CONFLICT', 'This ticket was just changed. Reload the page and try again.');
  if (input.notify !== false && ticket.customer_profile_id)
    await sendTicketEmail(db, env, {
      orderId: ticket.order_id,
      origin: input.origin,
      now: input.now,
      recipient: {
        email: ticket.holder_email,
        customerProfileId: ticket.customer_profile_id,
        ticketIds: [ticket.id],
      },
      idempotencyKey: `ticket_reissue:${ticket.id}:v${version}`,
      kind: 'ticket_reissue',
      intro: 'Your ticket was reissued by the organizer. Use this new code — the old one no longer works.',
    }).catch(() => console.error('[ticketing] reissue email failed'));
  return { ticketId: ticket.id, version };
}
