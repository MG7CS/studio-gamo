import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eventCanceledRefundEmail,
  findTicketsEmail,
  orderConfirmationEmail,
  refundDeclinedEmail,
  sellerText,
  ticketTransferredToEmail,
} from './paid-mail.ts';

const event = {
  title: 'Gospel Night',
  startsAt: Date.UTC(2026, 11, 5, 2) / 1000,
  timezone: 'America/Phoenix',
  venueName: 'Grace Hall',
  venueAddress: '1 Main St',
  organizationName: 'Grace Church',
};

test('receipts name the seller and the gift receiver, and never call anything a donation', () => {
  assert.equal(sellerText('organization', 'Grace Church'), 'Grace Church');
  assert.equal(sellerText('gamo', 'Grace Church'), 'Gamo Studios on behalf of Grace Church');
  const mail = orderConfirmationEmail({
    to: 'ruth@example.org',
    name: 'Ruth',
    event,
    reference: 'GL-7K4M-92QX',
    seller: 'gamo',
    lines: [
      { label: 'General × 2', amountCents: 4000 },
      { label: 'Gift to Grace Church', amountCents: 500 },
    ],
    totalCents: 4500,
    ticketCount: 2,
    orderUrl: 'https://live.test/orders/ord_x',
  });
  assert.match(mail.text, /Gift to Grace Church: \$5\.00/);
  assert.match(mail.text, /Total paid: \$45\.00/);
  assert.match(mail.text, /Sold by Gamo Studios on behalf of Grace Church\./);
  assert.match(mail.text, /Friday, December 4, 2026,? (at )?7:00 PM MST/);
  assert.match(mail.text, /calendar file/);
  assert.doesNotMatch(mail.text, /donat|tax-deductible|charit/i);
});

test('person-supplied text is cleaned: no header breaks, no clickable links', () => {
  const mail = ticketTransferredToEmail({
    to: 'abel@example.org\r\nBcc: x@evil.test',
    toName: 'Abel\nBcc: x',
    fromName: 'Visit evil.com now',
    event,
    ticketType: 'General',
    ticketUrl: 'https://live.test/orders/tkt_x',
  });
  assert.equal(mail.to, 'abel@example.orgBcc:x@evil.test');
  assert.doesNotMatch(mail.text, /evil\.com/);
  assert.doesNotMatch(mail.subject, /[\r\n]/);
  const declined = refundDeclinedEmail({
    to: 'r@example.org',
    name: null,
    event,
    reference: 'GL-1',
    note: 'see https://x.io',
    orderUrl: null,
  });
  assert.doesNotMatch(declined.text, /https:\/\/x/);
  const canceled = eventCanceledRefundEmail({
    to: 'r@example.org',
    name: 'R',
    event,
    reference: 'GL-1',
    amountCents: 4000,
    cash: false,
  });
  assert.match(canceled.text, /full refund of \$40\.00/);
  const find = findTicketsEmail({
    to: 'r@example.org',
    links: [
      {
        eventTitle: 'Gospel Night',
        startsAt: event.startsAt,
        timezone: event.timezone,
        reference: 'GL-1',
        url: 'https://live.test/orders/a',
      },
    ],
  });
  assert.match(find.text, /https:\/\/live\.test\/orders\/a/);
});
