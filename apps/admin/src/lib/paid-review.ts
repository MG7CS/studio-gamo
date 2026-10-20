/**
 * The paid details of an event under review, in plain words (docs/LIVE_REQUIREMENTS.md §8 items 6 and 35): ticket
 * types with prices, capacities, door allocation and price deadlines; who pays the Gamo fee; the policies; gifts;
 * door sales; how many codes. Read with `paidEventReviewDetails`; this only words it.
 */
import { formatCents, type PaidEventReviewDetails } from '@gamo/domain';
import { formatWhen } from './format';

export interface PaidReviewText {
  feePayer: string;
  policies: string[];
  extras: string[];
  ticketTypes: Array<{
    id: string;
    name: string;
    price: string;
    lines: string[];
  }>;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function refundText(p: NonNullable<PaidEventReviewDetails['policies']>): string {
  if (p.refundPolicy === 'none') return 'Refunds: none';
  if (p.refundPolicy === 'until_start') return 'Refunds: any time before the start';
  return `Refunds: until ${p.refundHours ?? 0} hours before the start`;
}

const TYPE_STATUS: Record<string, string> = { on_sale: 'On sale', hidden: 'Hidden', ended: 'Ended' };

export function paidReviewText(details: PaidEventReviewDetails, timeZone: string): PaidReviewText {
  const p = details.policies;
  return {
    feePayer:
      details.feePayer === 'buyer'
        ? 'The buyer pays the Gamo fee (shown as its own line)'
        : details.feePayer === 'organizer'
          ? 'The organization absorbs the Gamo fee'
          : 'Not chosen yet (policies not saved)',
    policies: p
      ? [
          refundText(p),
          p.transfersAllowed
            ? `Transfers: allowed until ${p.transferCutoffHours} hours before the start`
            : 'Transfers: not allowed',
          `Re-entry: ${p.reentryAllowed ? 'allowed' : 'not allowed'}`,
          `Attendee names: ${p.namesRequired ? 'required' : 'not required'}`,
          `At most ${plural(p.maxTicketsPerOrder, 'ticket')} per order`,
          ...(p.entryNotes ? [`Entry notes: ${p.entryNotes}`] : []),
        ]
      : ['Policies not saved yet'],
    extras: [
      `Gifts to the organization: ${details.giftsEnabled ? 'offered' : 'off'}`,
      `Door sales: ${details.doorSalesEnabled ? 'on' : 'off'}`,
      `Codes: ${plural(details.codes.promo, 'promo code')}, ${plural(details.codes.access, 'presale access code')}`,
    ],
    ticketTypes: details.ticketTypes.map((t) => ({
      id: t.id,
      name: t.name,
      price: t.priceCents === 0 ? 'Free' : formatCents(t.priceCents, details.currency),
      lines: [
        [
          TYPE_STATUS[t.status] ?? t.status,
          t.capacity == null ? 'capacity: the event’s only' : `${t.capacity} per date`,
          t.peoplePerTicket > 1 ? `${t.peoplePerTicket} people per ticket` : null,
          `up to ${t.perOrderLimit} per order`,
        ]
          .filter(Boolean)
          .join(' · '),
        t.doorAllocation > 0 || t.doorUsesOnline
          ? `Door: ${t.doorAllocation} held for the door${t.doorUsesOnline ? ', may also sell the online pool' : ''}`
          : 'Door: online pool only, no door allocation',
        ...(t.salesStartAt || t.salesEndAt
          ? [
              `Sales ${t.salesStartAt ? `from ${formatWhen(t.salesStartAt, timeZone)}` : ''}${
                t.salesStartAt && t.salesEndAt ? ' ' : ''
              }${t.salesEndAt ? `until ${formatWhen(t.salesEndAt, timeZone)}` : ''}`,
            ]
          : []),
        ...t.priceDeadlines.map(
          (d) => `${formatCents(d.priceCents, details.currency)} until ${formatWhen(d.endsAt, timeZone)}`,
        ),
        ...(t.description ? [t.description] : []),
      ],
    })),
  };
}
