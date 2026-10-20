/**
 * Plain-text emails for paid orders (docs/LIVE_REQUIREMENTS.md §8.2 items 13–19, docs/LIVE_SCREENS.md §I.6): order
 * confirmation, payment received but tickets not issued, ticket transferred (new and previous holder), refund
 * requested (to the owners), refund issued, refund declined, event canceled with refund, event changed, find my
 * tickets, door tickets. Templates only: they return a `LiveEmail` for `sendLiveEmail` (mail.ts); links are built by
 * the caller from the Live origin. Every person-supplied string goes through `cleanEmailText`.
 *
 * Wording rules: the seller is named on every receipt (the organization in Mode A; "Gamo Studios on behalf of
 * <organization>" in Mode B); a gift names the organization that receives it; nothing calls money paid to Gamo a
 * donation, and no tax claim is made.
 */
import { formatCents } from './money.ts';
import { cleanEmailText, type LiveEmail } from './mail.ts';
import type { Seller } from './paid-types.ts';

const NAME_MAX = 120;
const TITLE_MAX = 160;
const LABEL_MAX = 240;
const MESSAGE_MAX = 1000;

const footer =
  '\n\nGamo Live · live.gamostudio.org\nQuestions? Reply to this email or write to hello@gamostudio.org.';

// Control, bidi and zero-width characters, and anything that could split an address list or header.
const STRIP_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2069],
  [0xfeff, 0xfeff],
];
const ADDRESS_STRIP = new RegExp(
  `[${STRIP_RANGES.map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join('')}\\s,;<>]`,
  'g',
);
const addressOf = (to: string) => String(to ?? '').replace(ADDRESS_STRIP, '');

/** "Saturday, December 5, 2026, 7:00 PM MST" in the event's own time zone. */
export function whenLabel(startsAt: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short',
    }).format(new Date(startsAt * 1000));
  } catch {
    return new Date(startsAt * 1000).toUTCString();
  }
}

/** Who sold the tickets, as printed on receipts. */
export function sellerText(seller: Seller, organizationName: string): string {
  const org = cleanEmailText(organizationName, NAME_MAX);
  return seller === 'gamo' ? `Gamo Studios on behalf of ${org}` : org;
}

export interface PaidMailEvent {
  title: string;
  startsAt: number;
  timezone: string;
  venueName: string | null;
  venueAddress: string | null;
  organizationName: string;
}

export interface ReceiptLine {
  label: string;
  amountCents: number;
}

interface SafeEvent {
  title: string;
  when: string;
  venue: string;
  org: string;
}

function safeEvent(e: PaidMailEvent): SafeEvent {
  const venue = [e.venueName, e.venueAddress].filter(Boolean).join(', ');
  return {
    title: cleanEmailText(e.title, TITLE_MAX),
    when: cleanEmailText(whenLabel(e.startsAt, e.timezone), LABEL_MAX),
    venue: cleanEmailText(venue, LABEL_MAX),
    org: cleanEmailText(e.organizationName, NAME_MAX),
  };
}

const hi = (name: string | null | undefined) => {
  const n = cleanEmailText(name, NAME_MAX);
  return n ? `Hi ${n},` : 'Hello,';
};

const eventBlock = (e: SafeEvent) => `${e.title}\n${e.when}${e.venue ? `\n${e.venue}` : ''}`;

function receiptBlock(lines: readonly ReceiptLine[], totalCents: number): string {
  const rows = lines.map((l) => `  ${cleanEmailText(l.label, LABEL_MAX)}: ${formatCents(l.amountCents)}`);
  return `${rows.join('\n')}\n  Total paid: ${formatCents(totalCents)}`;
}

const ref = (reference: string) => cleanEmailText(reference, 20);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ── Buyers ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function orderConfirmationEmail(input: {
  to: string;
  name: string | null;
  event: PaidMailEvent;
  reference: string;
  seller: Seller;
  lines: readonly ReceiptLine[];
  totalCents: number;
  ticketCount: number;
  orderUrl: string;
  entryNotes?: string | null;
}): LiveEmail {
  const e = safeEvent(input.event);
  const notes = cleanEmailText(input.entryNotes, 280, { multiline: true });
  return {
    to: addressOf(input.to),
    subject: `Your tickets: ${e.title}`,
    text:
      `${hi(input.name)}\n\nThank you. Your order ${ref(input.reference)} is confirmed: ${plural(input.ticketCount, 'ticket')}.\n\n` +
      `${eventBlock(e)}\n\nReceipt\n${receiptBlock(input.lines, input.totalCents)}\n` +
      `Sold by ${sellerText(input.seller, input.event.organizationName)}.\n\n` +
      `Your tickets, with their QR codes and a calendar file, are on your order page:\n${input.orderUrl}\n\n` +
      (notes ? `Entry notes from the organizer:\n${notes}\n\n` : '') +
      'Keep this link private: anyone with it can show your tickets.' +
      footer,
  };
}

export function paymentNotFulfilledEmail(input: {
  to: string;
  name: string | null;
  event: PaidMailEvent;
  reference: string;
  amountCents: number;
}): LiveEmail {
  const e = safeEvent(input.event);
  return {
    to: addressOf(input.to),
    subject: `We could not issue your tickets: ${e.title}`,
    text:
      `${hi(input.name)}\n\nYour payment for order ${ref(input.reference)} arrived after the seats it was holding ` +
      `were no longer available, so no tickets were issued for ${e.title} (${e.when}).\n\n` +
      `A full refund of ${formatCents(input.amountCents)} is on its way to the card you paid with. ` +
      'Banks usually show it within 5 to 10 business days. We are sorry for the trouble.' +
      footer,
  };
}

export function ticketTransferredToEmail(input: {
  to: string;
  toName: string;
  fromName: string | null;
  event: PaidMailEvent;
  ticketType: string;
  ticketUrl: string;
}): LiveEmail {
  const e = safeEvent(input.event);
  const from = cleanEmailText(input.fromName, NAME_MAX);
  return {
    to: addressOf(input.to),
    subject: `A ticket for you: ${e.title}`,
    text:
      `${hi(input.toName)}\n\n${from ? `${from} passed` : 'Someone passed'} a ${cleanEmailText(input.ticketType, 60)} ` +
      `ticket on to you.\n\n${eventBlock(e)}\n\nYour ticket and its QR code:\n${input.ticketUrl}\n\n` +
      'Keep this link private: anyone with it can show your ticket. Transfers never carry a price on Gamo Live.' +
      footer,
  };
}

export function ticketTransferredFromEmail(input: {
  to: string;
  name: string | null;
  toName: string;
  event: PaidMailEvent;
  ticketType: string;
}): LiveEmail {
  const e = safeEvent(input.event);
  return {
    to: addressOf(input.to),
    subject: `Ticket transferred: ${e.title}`,
    text:
      `${hi(input.name)}\n\nYour ${cleanEmailText(input.ticketType, 60)} ticket for ${e.title} (${e.when}) now belongs to ` +
      `${cleanEmailText(input.toName, NAME_MAX)}. Its old QR code no longer works.\n\n` +
      'If you did not do this, reply to this email.' +
      footer,
  };
}

export function refundIssuedEmail(input: {
  to: string;
  name: string | null;
  event: PaidMailEvent;
  reference: string;
  amountCents: number;
  ticketCount: number;
  orderUrl: string | null;
}): LiveEmail {
  const e = safeEvent(input.event);
  return {
    to: addressOf(input.to),
    subject: `Refund on its way: ${e.title}`,
    text:
      `${hi(input.name)}\n\nA refund of ${formatCents(input.amountCents)} for order ${ref(input.reference)} ` +
      `(${e.title}, ${e.when}) is on its way to the card you paid with` +
      (input.ticketCount > 0 ? `; ${plural(input.ticketCount, 'ticket')} no longer work.` : '.') +
      ' Banks usually show it within 5 to 10 business days.' +
      (input.orderUrl ? `\n\nYour order page:\n${input.orderUrl}` : '') +
      footer,
  };
}

export function refundDeclinedEmail(input: {
  to: string;
  name: string | null;
  event: PaidMailEvent;
  reference: string;
  note: string | null;
  orderUrl: string | null;
  /** Who decided: the organizer (default) or Gamo Studios, when Gamo sold the ticket on the organizer's behalf. */
  decidedBy?: 'organizer' | 'gamo';
}): LiveEmail {
  const e = safeEvent(input.event);
  const note = cleanEmailText(input.note, MESSAGE_MAX, { multiline: true });
  if (input.decidedBy === 'gamo')
    return {
      to: addressOf(input.to),
      subject: `Refund request declined: ${e.title}`,
      text:
        `${hi(input.name)}\n\nGamo Studios, which sold your tickets on behalf of ${e.org}, declined your refund request for order ${ref(input.reference)} (${e.title}, ${e.when}). ` +
        'Your tickets still work.' +
        (note ? `\n\nA note from Gamo Studios:\n${note}` : '') +
        (input.orderUrl ? `\n\nYour order page:\n${input.orderUrl}` : '') +
        footer,
    };
  return {
    to: addressOf(input.to),
    subject: `Refund request declined: ${e.title}`,
    text:
      `${hi(input.name)}\n\n${e.org} declined your refund request for order ${ref(input.reference)} (${e.title}, ${e.when}). ` +
      'Your tickets still work.' +
      (note ? `\n\nA note from the organizer (written by the organizer, not by Gamo):\n${note}` : '') +
      (input.orderUrl ? `\n\nYour order page:\n${input.orderUrl}` : '') +
      footer,
  };
}

export function eventCanceledRefundEmail(input: {
  to: string;
  name: string | null;
  event: PaidMailEvent;
  reference: string;
  amountCents: number;
  /** A cash order: the organizer gives the money back in person. */
  cash: boolean;
  message?: string | null;
}): LiveEmail {
  const e = safeEvent(input.event);
  const message = cleanEmailText(input.message, MESSAGE_MAX, { multiline: true });
  const refund = input.cash
    ? `You paid in cash, so ${e.org} will give back ${formatCents(input.amountCents)} in person; reply to this email if you need help reaching them.`
    : input.amountCents > 0
      ? `A full refund of ${formatCents(input.amountCents)} is on its way to the card you paid with. Banks usually show it within 5 to 10 business days.`
      : 'Nothing was charged for this order.';
  return {
    to: addressOf(input.to),
    subject: `Canceled: ${e.title}`,
    text:
      `${hi(input.name)}\n\n${e.org} canceled ${e.title} (${e.when}). Your tickets for order ${ref(input.reference)} ` +
      `no longer work.\n\n${refund}` +
      (message
        ? `\n\nA message from the organizer (written by the organizer, not by Gamo):\n${message}`
        : '') +
      footer,
  };
}

export function eventChangedEmail(input: {
  to: string;
  name: string | null;
  /** The event with its new details. */
  event: PaidMailEvent;
  /** What changed, in plain words ("The date and time", "The venue"). */
  changes: readonly string[];
  orderUrl: string;
  /** Until when a refund may be asked for under the order's policy, or null. */
  refundUntil: number | null;
}): LiveEmail {
  const e = safeEvent(input.event);
  const changes = input.changes.map((c) => `- ${cleanEmailText(c, 120)}`).join('\n');
  return {
    to: addressOf(input.to),
    subject: `Updated details: ${e.title}`,
    text:
      `${hi(input.name)}\n\n${e.org} changed the details of ${e.title}. Your tickets stay valid.\n\n` +
      (changes ? `What changed:\n${changes}\n\n` : '') +
      `New details:\n${eventBlock(e)}\n\n` +
      `Your order page has the updated calendar file:\n${input.orderUrl}` +
      (input.refundUntil != null
        ? `\n\nIf you can no longer come, you can ask for a refund from your order page until ${cleanEmailText(whenLabel(input.refundUntil, input.event.timezone), LABEL_MAX)}.`
        : '') +
      footer,
  };
}

export function findTicketsEmail(input: {
  to: string;
  links: ReadonlyArray<{
    eventTitle: string;
    startsAt: number;
    timezone: string;
    reference: string | null;
    url: string;
  }>;
}): LiveEmail {
  const rows = input.links
    .map(
      (l) =>
        `${cleanEmailText(l.eventTitle, TITLE_MAX)} (${cleanEmailText(whenLabel(l.startsAt, l.timezone), LABEL_MAX)})` +
        `${l.reference ? `, order ${ref(l.reference)}` : ''}\n${l.url}`,
    )
    .join('\n\n');
  return {
    to: addressOf(input.to),
    subject: 'Your Gamo Live tickets',
    text:
      `Hello,\n\nSomeone (hopefully you) asked for the tickets bought with or sent to this address. Here they are:\n\n${rows}\n\n` +
      'Keep these links private: anyone with them can show your tickets. If you did not ask, you can ignore this email.' +
      footer,
  };
}

export function doorTicketsEmail(input: {
  to: string;
  name: string | null;
  event: PaidMailEvent;
  reference: string;
  seller: Seller;
  lines: readonly ReceiptLine[];
  totalCents: number;
  ticketCount: number;
  orderUrl: string;
}): LiveEmail {
  const e = safeEvent(input.event);
  return {
    to: addressOf(input.to),
    subject: `Your tickets: ${e.title}`,
    text:
      `${hi(input.name)}\n\nThank you for coming. You were admitted at the door with ${plural(input.ticketCount, 'ticket')} ` +
      `(order ${ref(input.reference)}).\n\n${eventBlock(e)}\n\nReceipt\n${receiptBlock(input.lines, input.totalCents)}\n` +
      `Sold by ${sellerText(input.seller, input.event.organizationName)}.\n\nYour order page:\n${input.orderUrl}` +
      footer,
  };
}

// ── Organizers ─────────────────────────────────────────────────────────────────────────────────────────────────

export function refundRequestedEmail(input: {
  to: string;
  ownerName: string | null;
  event: PaidMailEvent;
  reference: string;
  amountCents: number;
  ticketCount: number;
  reason: string | null;
  reviewUrl: string;
}): LiveEmail {
  const e = safeEvent(input.event);
  const reason = cleanEmailText(input.reason, 500, { multiline: true });
  return {
    to: addressOf(input.to),
    subject: `Refund requested: ${e.title}`,
    text:
      `${hi(input.ownerName)}\n\nA buyer asked for a refund on order ${ref(input.reference)} for ${e.title} (${e.when}): ` +
      `${plural(input.ticketCount, 'ticket')}, ${formatCents(input.amountCents)}.` +
      (reason ? `\n\nTheir reason (written by the buyer, not by Gamo):\n${reason}` : '') +
      `\n\nApprove or decline it here:\n${input.reviewUrl}` +
      footer,
  };
}
