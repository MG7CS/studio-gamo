/**
 * Gamo Live ticket emails through the one outbox (design T-12, §4.2 step 6). Every message has an HTML
 * and a plain-text part, an idempotency key, and goes to `email_log`. The on-screen download never
 * depends on email: pages show `not_configured`, `failed`, `bounced` and `suppressed` honestly.
 *
 * Ticket email: manage link, inline QR PNG per ticket (first 10, Resend `content_id`), one PDF with all
 * tickets, the `.ics` file and the map link.
 *
 * Local only (`ENVIRONMENT=local`, simulated sends): each message is also written to the local test
 * inbox (`SESSION_KV`, 1 h TTL) so local browser tests can read codes and links. Never outside local.
 */
import type { GamoEnv } from '@gamo/config/env';
import {
  OutboxRecipientMismatchError,
  sendOutboxEmail,
  type OutboxOptions,
  type OutboxResult,
} from '../email-outbox.ts';
import { issueCustomerLink } from '../customers.ts';
import { formatScope, orderLinkExpiresAt } from '../../security/link-tokens.ts';
import { isLocalEnvironment } from '../../security/env-secret.ts';
import { allRows, type SqlDatabase } from '../../security/sql-database.ts';
import { normalizeEmail } from '../../security/pii-hash.ts';
import type { EmailAttachment } from '@studio-gamo/integrations/resend';
import { formatEventDateTime } from './events-time.ts';
import { buildCalendarIcs, mapSearchUrl } from './calendar.ts';
import { loadTicketRenderModels, type TicketRenderModel } from './render-model.ts';
import { bytesToBase64, renderQrPng } from './render-png.ts';
import { ticketsPdf } from './render-cache.ts';
import {
  isDeliverableEmail,
  loadEvent,
  loadOrder,
  maskEmail,
  type EventRow,
  type OrderRow,
  type TicketingEnv,
} from './orders-shared.ts';

export const INLINE_QR_LIMIT = 10;
const LOCAL_INBOX_PREFIX = 'local-test-inbox:';

export interface LiveEmail {
  kind: string;
  idempotencyKey: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  relatedType?: string;
  relatedId?: string;
  now: number;
}

interface KvLike {
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  get(key: string): Promise<string | null>;
  list(options: { prefix: string; limit?: number }): Promise<{ keys: Array<{ name: string }> }>;
}

function localInbox(env: TicketingEnv): KvLike | null {
  if (!isLocalEnvironment(env)) return null;
  const kv = (env.SESSION_KV ?? env.SESSION) as Partial<KvLike> | undefined;
  return kv && typeof kv.put === 'function' && typeof kv.list === 'function' ? (kv as KvLike) : null;
}

/** Sends through the outbox; a reused key for another recipient is reported as failed, never thrown. */
export async function sendLiveEmail(
  db: SqlDatabase,
  env: TicketingEnv,
  message: LiveEmail,
  options: OutboxOptions = {},
): Promise<OutboxResult> {
  if (!isDeliverableEmail(message.to))
    return { logId: null, status: 'failed', sentNow: false, deduplicated: false, attempts: 0 };
  let result: OutboxResult;
  try {
    result = await sendOutboxEmail(db, env as GamoEnv, { ...message, product: 'live' }, options);
  } catch (err) {
    if (err instanceof OutboxRecipientMismatchError)
      return { logId: null, status: 'failed', sentNow: false, deduplicated: false, attempts: 0 };
    throw err;
  }
  const inbox = result.mocked ? localInbox(env) : null;
  if (inbox) {
    const key = `${LOCAL_INBOX_PREFIX}${normalizeEmail(message.to)}:${String(Date.now()).padStart(15, '0')}:${message.kind}`;
    await inbox
      .put(
        key,
        JSON.stringify({ to: message.to, subject: message.subject, text: message.text, kind: message.kind }),
        {
          expirationTtl: 3600,
        },
      )
      .catch(() => console.warn('[ticketing] local test inbox write failed'));
  }
  return result;
}

/** Local test inbox (ENVIRONMENT=local only): newest first. Returns null outside local. */
export async function readLocalTestInbox(
  env: TicketingEnv,
  email: string,
): Promise<Array<{ to: string; subject: string; text: string; kind: string }> | null> {
  const inbox = localInbox(env);
  if (!inbox) return null;
  const listed = await inbox.list({ prefix: `${LOCAL_INBOX_PREFIX}${normalizeEmail(email)}:`, limit: 100 });
  const out = [];
  for (const k of listed.keys
    .map((x) => x.name)
    .sort()
    .reverse()) {
    const v = await inbox.get(k);
    if (v) out.push(JSON.parse(v) as { to: string; subject: string; text: string; kind: string });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return String(text ?? '').replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&#39;' : '&quot;',
  );
}

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#F9F6F0;font-family:Inter,Helvetica,Arial,sans-serif;color:#18181B"><div style="max-width:560px;margin:0 auto;padding:24px"><p style="font-size:12px;letter-spacing:2px;font-weight:700;color:#8F3B18;margin:0 0 8px">GAMO LIVE</p><h1 style="font-size:22px;font-weight:900;text-transform:uppercase;margin:0 0 16px">${escapeHtml(title)}</h1>${body}<p style="font-size:12px;color:#52525B;margin-top:32px">Gamo Studios is a Christian, mission-driven Public Benefit Corporation. Questions? Reply to this email or write to hello@gamostudio.org.</p></div></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#B34E24;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">${escapeHtml(label)}</a></p>`;
const para = (text: string) =>
  `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${escapeHtml(text)}</p>`;

function eventLines(event: EventRow): { when: string; where: string } {
  return {
    when: formatEventDateTime(Number(event.starts_at), event.timezone),
    where: [event.venue_name, event.address, event.city, event.state].filter(Boolean).join(', '),
  };
}

// ---------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------

/** Free RSVP: the 6-digit code and the confirm link (both expire with the 30-minute hold). */
export async function sendOrderVerificationEmail(
  db: SqlDatabase,
  env: TicketingEnv,
  input: { order: OrderRow; event: EventRow; code: string; confirmUrl: string; now: number },
  options?: OutboxOptions,
) {
  const { when, where } = eventLines(input.event);
  const subject = `Your code: ${input.code} — confirm your tickets for ${input.event.title}`;
  const html = layout(
    'Confirm your tickets',
    para(`Use this code to confirm your free tickets for ${input.event.title} (${when}, ${where}):`) +
      `<p style="font-size:32px;font-weight:900;letter-spacing:6px;margin:12px 0">${escapeHtml(input.code)}</p>` +
      para('Or confirm with one tap:') +
      button(input.confirmUrl, 'Confirm my tickets') +
      para(
        'The code and the button work for 30 minutes. If you did not ask for these tickets, ignore this email — nothing will be issued.',
      ),
  );
  const text = `Confirm your tickets for ${input.event.title}\n${when}\n${where}\n\nYour code: ${input.code}\n\nOr open this link to confirm: ${input.confirmUrl}\n\nThe code and link work for 30 minutes. If you did not ask for these tickets, ignore this email.`;
  return sendLiveEmail(
    db,
    env,
    {
      kind: 'order_verification',
      idempotencyKey: `order_verification:${input.order.id}`,
      to: input.order.purchaser_email,
      subject,
      html,
      text,
      relatedType: 'order',
      relatedId: input.order.id,
      now: input.now,
    },
    options,
  );
}

/** Sent instead of a code when the address already holds the most tickets allowed for the event. */
export async function sendTicketLimitEmail(
  db: SqlDatabase,
  env: TicketingEnv,
  input: { to: string; event: EventRow; attemptId: string; origin: string; now: number },
  options?: OutboxOptions,
) {
  const findUrl = `${input.origin}/tickets/find`;
  const html = layout(
    'You already have tickets',
    para(
      `Someone (probably you) asked for more tickets for ${input.event.title}. This email address already holds the most tickets allowed for this event, so no new tickets were reserved.`,
    ) +
      para('To see or download the tickets you already have, request a sign-in link:') +
      button(findUrl, 'Find my tickets'),
  );
  const text = `You already have tickets for ${input.event.title}. This address holds the most tickets allowed for this event, so no new tickets were reserved.\n\nFind your tickets: ${findUrl}`;
  return sendLiveEmail(
    db,
    env,
    {
      kind: 'order_verification',
      idempotencyKey: `ticket_limit:${input.attemptId}`,
      to: input.to,
      subject: `Your tickets for ${input.event.title}`,
      html,
      text,
      relatedType: 'event',
      relatedId: input.event.id,
      now: input.now,
    },
    options,
  );
}

async function eventChangeSequence(db: SqlDatabase, eventId: string): Promise<number> {
  const rows = await allRows<{ n: number }>(db, {
    sql: "SELECT count(*) AS n FROM event_changes WHERE event_id = ?1 AND kind IN ('rescheduled', 'venue_changed', 'cancelled')",
    params: [eventId],
  });
  return Number(rows[0]?.n ?? 0);
}

/** The order's `.ics` (UID per order, SEQUENCE = number of schedule/venue changes and cancellation). */
export async function orderCalendarFile(
  db: SqlDatabase,
  input: { order: Pick<OrderRow, 'id'>; event: EventRow; origin: string; now: number },
): Promise<string> {
  const host = new URL(input.origin).host;
  return buildCalendarIcs({
    uid: `order-${input.order.id}@${host}`,
    sequence: await eventChangeSequence(db, input.event.id),
    title: input.event.title,
    description: `Your Gamo Live tickets: ${input.origin}/tickets/orders/${input.order.id}`,
    location: [input.event.venue_name, input.event.address, input.event.city, input.event.state]
      .filter(Boolean)
      .join(', '),
    url: `${input.origin}/events/${input.event.slug}`,
    startsAt: Number(input.event.starts_at),
    endsAt: input.event.ends_at === null ? null : Number(input.event.ends_at),
    timezone: input.event.timezone,
    cancelled: input.event.cancelled_at !== null,
    now: input.now,
  });
}

function textBytes(s: string): string {
  return bytesToBase64(new TextEncoder().encode(s));
}

/**
 * The ticket email for an order (or for some of its tickets, e.g. a transfer recipient): manage link,
 * inline QRs, PDF, `.ics`. `scope` decides what the manage link opens.
 */
export async function sendTicketEmail(
  db: SqlDatabase,
  env: TicketingEnv,
  input: {
    orderId: string;
    origin: string;
    now: number;
    /** Default: the purchaser and every valid ticket of the order. */
    recipient?: { email: string; customerProfileId: string; ticketIds: string[] };
    /** Unique per send (default `ticket_confirmation:<orderId>`). */
    idempotencyKey?: string;
    kind?: 'ticket_confirmation' | 'ticket_transfer' | 'ticket_reissue' | 'ticket_recovery';
    intro?: string;
  },
  options?: OutboxOptions,
): Promise<OutboxResult | null> {
  const order = await loadOrder(db, input.orderId);
  if (!order) return null;
  const event = await loadEvent(db, order.event_id);
  if (!event) return null;
  let tickets = await loadTicketRenderModels(db, env, { orderId: order.id });
  const to = input.recipient?.email ?? order.purchaser_email;
  const profileId = input.recipient?.customerProfileId ?? order.customer_profile_id;
  if (input.recipient) tickets = tickets.filter((t) => input.recipient!.ticketIds.includes(t.ticketId));
  tickets = tickets.filter((t) => t.status === 'valid');
  if (!tickets.length || !profileId || !isDeliverableEmail(to)) return null;

  const scope = input.recipient
    ? input.recipient.ticketIds.length === 1
      ? formatScope('ticket', input.recipient.ticketIds[0])
      : formatScope('customer')
    : formatScope('order', order.id);
  const link = await issueCustomerLink(db, env, {
    product: 'live',
    customerProfileId: profileId,
    scope,
    purpose: input.recipient ? 'ticket' : 'order',
    expiresAt: orderLinkExpiresAt(
      { startsAt: Number(event.starts_at), endsAt: event.ends_at === null ? null : Number(event.ends_at) },
      input.now,
    ),
    now: input.now,
    openPath: '/link',
  });
  const manageUrl = `${input.origin}${link.path}`;
  const { when, where } = eventLines(event);
  const map = mapSearchUrl([event.venue_name, event.address, event.city, event.state]);

  const attachments: EmailAttachment[] = [];
  const inline = tickets.slice(0, INLINE_QR_LIMIT);
  const ticketBlocks: string[] = [];
  for (let i = 0; i < inline.length; i++) {
    const t = inline[i];
    const cid = `ticket-qr-${i + 1}`;
    attachments.push({
      filename: `ticket-${i + 1}-qr.png`,
      content: bytesToBase64(await renderQrPng(t.qrPayload!, 6)),
      contentType: 'image/png',
      contentId: cid,
    });
    ticketBlocks.push(
      `<div style="background:#fff;border-radius:16px;padding:16px;margin:12px 0;border:1px solid #EDE6DA"><p style="margin:0 0 4px;font-weight:800">${escapeHtml(t.holderName)}</p><p style="margin:0 0 8px;color:#52525B;font-size:14px">${escapeHtml([t.categoryName, t.categoryBadge, t.sectionName ? `Section ${t.sectionName}` : null].filter(Boolean).join(' · '))}</p><img src="cid:${cid}" width="220" height="220" alt="QR code for the ticket of ${escapeHtml(t.holderName)}" style="display:block;background:#fff"></div>`,
    );
  }
  const more = tickets.length - inline.length;
  attachments.push({
    filename: 'gamo-live-tickets.pdf',
    content: bytesToBase64(await ticketsPdf(env, tickets, `${event.title} — tickets`)),
    contentType: 'application/pdf',
  });
  attachments.push({
    filename: 'event.ics',
    content: textBytes(await orderCalendarFile(db, { order, event, origin: input.origin, now: input.now })),
    contentType: 'text/calendar',
  });

  const intro =
    input.intro ??
    `Here ${tickets.length === 1 ? 'is your ticket' : `are your ${tickets.length} tickets`} for ${event.title}.`;
  const html = layout(
    'Your tickets',
    para(intro) +
      para(`${when}`) +
      para(`${where}`) +
      `<p style="margin:0 0 12px"><a href="${escapeHtml(map)}" style="color:#8F3B18;font-weight:700">Open the map</a></p>` +
      para(`Order ${order.order_reference ?? order.order_number}`) +
      button(manageUrl, 'View and save my tickets') +
      ticketBlocks.join('') +
      (more > 0
        ? para(`${more} more ticket${more === 1 ? '' : 's'}: open the link above or the attached PDF.`)
        : '') +
      para(
        'Save the attached PDF or a screenshot of each QR code on your phone. Each ticket is personal and admits one entry at its first scan. Tickets cannot be resold; you can transfer a ticket from the link above.',
      ),
  );
  const text = [
    intro,
    when,
    where,
    `Map: ${map}`,
    `Order ${order.order_reference ?? order.order_number}`,
    '',
    `View, download or transfer your tickets: ${manageUrl}`,
    '',
    ...tickets.map(
      (t, i) =>
        `Ticket ${i + 1}: ${t.holderName} — ${t.categoryName}${t.sectionName ? `, Section ${t.sectionName}` : ''}`,
    ),
    '',
    'The PDF with all tickets and a calendar file are attached.',
    'Each ticket is personal and admits one entry at its first scan. No resale.',
  ].join('\n');
  return sendLiveEmail(
    db,
    env,
    {
      kind: input.kind ?? 'ticket_confirmation',
      idempotencyKey: input.idempotencyKey ?? `ticket_confirmation:${order.id}`,
      to,
      subject: `Your tickets — ${event.title}`,
      html,
      text,
      attachments,
      relatedType: 'order',
      relatedId: order.id,
      now: input.now,
    },
    options,
  );
}

/** `/tickets/find`: a `customer:all` link (30 minutes) listing the address's events. */
export async function sendRecoveryEmail(
  db: SqlDatabase,
  env: TicketingEnv,
  input: { to: string; linkUrl: string; events: string[]; attemptId: string; now: number },
  options?: OutboxOptions,
) {
  const html = layout(
    'Your Gamo Live tickets',
    para('You asked for a link to your tickets. It works for 30 minutes:') +
      button(input.linkUrl, 'Open my tickets') +
      (input.events.length ? para(`Events: ${input.events.join(' · ')}`) : '') +
      para(
        'If you did not ask for this, you can ignore this email. Nobody can open your tickets without this link.',
      ),
  );
  const text = `Open your Gamo Live tickets (link works for 30 minutes): ${input.linkUrl}\n\n${input.events.length ? `Events: ${input.events.join(' · ')}\n\n` : ''}If you did not ask for this, ignore this email.`;
  return sendLiveEmail(
    db,
    env,
    {
      kind: 'ticket_recovery',
      idempotencyKey: `ticket_recovery:${input.attemptId}`,
      to: input.to,
      subject: 'Your Gamo Live tickets',
      html,
      text,
      now: input.now,
    },
    options,
  );
}

/** To the previous holder after a transfer. */
export async function sendTransferNoticeEmail(
  db: SqlDatabase,
  env: TicketingEnv,
  input: {
    to: string;
    recipientEmail: string;
    eventTitle: string;
    ticketId: string;
    version: number;
    now: number;
  },
  options?: OutboxOptions,
) {
  const masked = maskEmail(input.recipientEmail);
  const html = layout(
    'Ticket transferred',
    para(
      `Your ticket for ${input.eventTitle} was transferred to ${masked}. Your old QR code no longer works.`,
    ) + para('If you did not do this, reply to this email straight away.'),
  );
  const text = `Your ticket for ${input.eventTitle} was transferred to ${masked}. Your old QR code no longer works.\nIf you did not do this, reply to this email straight away.`;
  return sendLiveEmail(
    db,
    env,
    {
      kind: 'ticket_transfer',
      idempotencyKey: `ticket_transfer_notice:${input.ticketId}:v${input.version}`,
      to: input.to,
      subject: `Ticket transferred — ${input.eventTitle}`,
      html,
      text,
      relatedType: 'ticket',
      relatedId: input.ticketId,
      now: input.now,
    },
    options,
  );
}

/** Refund or ticket cancellation notice to the purchaser. */
export async function sendRefundNoticeEmail(
  db: SqlDatabase,
  env: TicketingEnv,
  input: {
    order: OrderRow;
    eventTitle: string;
    ticketCount: number;
    amountCents: number;
    refundId: string;
    now: number;
  },
  options?: OutboxOptions,
) {
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    input.amountCents / 100,
  );
  const what =
    input.amountCents > 0
      ? `${input.ticketCount} ticket${input.ticketCount === 1 ? '' : 's'} for ${input.eventTitle} ${input.ticketCount === 1 ? 'was' : 'were'} refunded (${money}, test mode). The refund goes back to the card you used.`
      : `${input.ticketCount} ticket${input.ticketCount === 1 ? '' : 's'} for ${input.eventTitle} ${input.ticketCount === 1 ? 'was' : 'were'} cancelled.`;
  return sendLiveEmail(
    db,
    env,
    {
      kind: 'refund_notice',
      idempotencyKey: `refund_notice:${input.refundId}`,
      to: input.order.purchaser_email,
      subject: `${input.amountCents > 0 ? 'Refund' : 'Tickets cancelled'} — ${input.eventTitle}`,
      html: layout(
        input.amountCents > 0 ? 'Refund issued' : 'Tickets cancelled',
        para(what) + para('Those QR codes no longer work. Your other tickets are unchanged.'),
      ),
      text: `${what}\nThose QR codes no longer work. Your other tickets are unchanged.`,
      relatedType: 'order',
      relatedId: input.order.id,
      now: input.now,
    },
    options,
  );
}

/** Cancellation, reschedule or venue change: one email per address, with the updated `.ics`. */
export async function sendEventChangeEmail(
  db: SqlDatabase,
  env: TicketingEnv,
  input: {
    to: string;
    orderId: string;
    changeId: string;
    kind: 'cancelled' | 'rescheduled' | 'venue_changed';
    event: EventRow;
    origin: string;
    refundNote?: string;
    now: number;
  },
  options?: OutboxOptions,
) {
  const { when, where } = eventLines(input.event);
  const title =
    input.kind === 'cancelled'
      ? 'Event cancelled'
      : input.kind === 'rescheduled'
        ? 'New date and time'
        : 'New venue';
  const body =
    input.kind === 'cancelled'
      ? [`${input.event.title} has been cancelled. Your tickets are no longer valid.`, input.refundNote ?? '']
      : input.kind === 'rescheduled'
        ? [
            `${input.event.title} has moved to ${when}. Your tickets stay valid — you don't need to do anything.`,
            "Can't make the new date? Open your tickets to ask for a refund or cancel them.",
          ]
        : [
            `${input.event.title} has moved to a new venue: ${where}. Your tickets stay valid.`,
            "Can't make it there? Open your tickets to ask for a refund or cancel them.",
          ];
  const ics = await orderCalendarFile(db, {
    order: { id: input.orderId },
    event: input.event,
    origin: input.origin,
    now: input.now,
  });
  const map = mapSearchUrl([
    input.event.venue_name,
    input.event.address,
    input.event.city,
    input.event.state,
  ]);
  return sendLiveEmail(
    db,
    env,
    {
      kind: 'event_change',
      idempotencyKey: `event_change:${input.changeId}:${input.orderId}:${normalizeEmail(input.to)}`.slice(
        0,
        256,
      ),
      to: input.to,
      subject: `${title} — ${input.event.title}`,
      html: layout(
        title,
        body.filter(Boolean).map(para).join('') +
          (input.kind === 'venue_changed'
            ? `<p><a href="${escapeHtml(map)}" style="color:#8F3B18;font-weight:700">Open the map</a></p>`
            : '') +
          button(`${input.origin}/tickets/find`, 'Open my tickets') +
          para('The attached calendar file updates the entry in your calendar.'),
      ),
      text: `${body.filter(Boolean).join('\n')}\n\nOpen your tickets: ${input.origin}/tickets/find`,
      attachments: [{ filename: 'event.ics', content: textBytes(ics), contentType: 'text/calendar' }],
      relatedType: 'event_change',
      relatedId: input.changeId,
      now: input.now,
    },
    options,
  );
}

/** Waitlist double opt-in: the only mail sent before the address confirms. */
export async function sendWaitlistConfirmEmail(
  db: SqlDatabase,
  env: TicketingEnv,
  input: { to: string; entryId: string; event: EventRow; confirmUrl: string; windowKey: string; now: number },
  options?: OutboxOptions,
) {
  const text = `Someone (hopefully you) asked to join the waitlist for ${input.event.title}. If that was you, confirm here: ${input.confirmUrl}\n\nIf it was not you, ignore this email: you will not get any other message about this event.`;
  return sendLiveEmail(
    db,
    env,
    {
      kind: 'waitlist_available',
      idempotencyKey: `waitlist_confirm:${input.entryId}:${input.windowKey}`,
      to: input.to,
      subject: `Confirm your waitlist spot — ${input.event.title}`,
      html: layout(
        'Confirm your waitlist spot',
        para(`Someone (hopefully you) asked to join the waitlist for ${input.event.title}.`) +
          button(input.confirmUrl, 'Yes, add me to the waitlist') +
          para('If it was not you, ignore this email: you will not get any other message about this event.'),
      ),
      text,
      relatedType: 'event',
      relatedId: input.event.id,
      now: input.now,
    },
    options,
  );
}

/** Waitlist: tickets became available (first come, first served; nothing is reserved or charged). */
export async function sendWaitlistAvailableEmail(
  db: SqlDatabase,
  env: TicketingEnv,
  input: { to: string; entryId: string; event: EventRow; origin: string; now: number },
  options?: OutboxOptions,
) {
  const url = `${input.origin}/events/${input.event.slug}/register`;
  const text = `Tickets are available again for ${input.event.title}. They are not reserved for you — first come, first served.\n\nGet tickets: ${url}`;
  return sendLiveEmail(
    db,
    env,
    {
      kind: 'waitlist_available',
      idempotencyKey: `waitlist_available:${input.entryId}`,
      to: input.to,
      subject: `Tickets available — ${input.event.title}`,
      html: layout(
        'Tickets available',
        para(
          `Tickets are available again for ${input.event.title}. They are not reserved for you — first come, first served.`,
        ) + button(url, 'Get tickets'),
      ),
      text,
      relatedType: 'event',
      relatedId: input.event.id,
      now: input.now,
    },
    options,
  );
}

/** Staff alert (unfulfillable payment, amount mismatch, dispute, failed refund). No customer PII. */
export async function sendStaffAlertEmail(
  db: SqlDatabase,
  env: TicketingEnv,
  input: { key: string; subject: string; lines: string[]; now: number },
  options?: OutboxOptions,
) {
  const to =
    typeof env.PLATFORM_SUPPORT_EMAIL === 'string' && env.PLATFORM_SUPPORT_EMAIL
      ? env.PLATFORM_SUPPORT_EMAIL
      : 'hello@gamostudio.org';
  return sendLiveEmail(
    db,
    env,
    {
      kind: 'staff_alert',
      idempotencyKey: `staff_alert:${input.key}`.slice(0, 256),
      to,
      subject: `[Gamo Live] ${input.subject}`,
      html: layout(input.subject, input.lines.map(para).join('')),
      text: input.lines.join('\n'),
      now: input.now,
    },
    options,
  );
}

/** Latest delivery status of the order's ticket email, for honest display on the confirmation page. */
export async function orderEmailStatus(
  db: SqlDatabase,
  orderId: string,
): Promise<{ kind: string; status: string } | null> {
  const rows = await allRows<{ kind: string; status: string }>(db, {
    sql: "SELECT kind, status FROM email_log WHERE related_type = 'order' AND related_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1",
    params: [orderId],
  });
  return rows[0] ?? null;
}

export type { TicketRenderModel };
