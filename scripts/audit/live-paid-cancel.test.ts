/** Canceling a paid event: open checkouts expire, paid orders are refunded in full, buyers are told (§8.2 item 17). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPaidOrder } from '../../packages/domain/index.ts';
import {
  cancelDateAndNotify,
  cancelEventAndNotify,
  paidCancelText,
  refundCanceledOrders,
} from '../../apps/live/src/lib/organizer-events.ts';
import { ENV, NOW, paidSetup } from './live-paid-fixtures.ts';

const live = (db: unknown) => ({ db, env: ENV }) as never;
const base = (db: unknown, seeded: { organizationId: string; eventId: string }) => ({
  live: live(db),
  organizationId: seeded.organizationId,
  organizationName: 'Grace Church 1',
  eventId: seeded.eventId,
  eventTitle: 'Gospel Night 1',
  timezone: 'America/Phoenix',
  message: 'We are sorry.',
  now: NOW,
});

test('canceling a paid event refunds the card order in full, cancels the open checkout and tells every buyer', async () => {
  const { db, seeded, buy, comp } = await paidSetup();
  const paid = await buy('ruth@example.org');
  const open = await buy('naomi@example.org', 1, false);
  await comp();
  const notice = await cancelEventAndNotify(base(db, seeded));
  const refunded = await loadPaidOrder(db, paid);
  assert.equal(refunded?.status, 'refunded');
  assert.equal(refunded?.amountRefundedCents, refunded?.totalCents);
  assert.equal((await loadPaidOrder(db, open))?.status, 'canceled');
  // The card buyer and the comp guest are both emailed (local email logs); only the card order had money to return.
  assert.equal(
    notice.text,
    'The event is canceled. 1 paid order was refunded in full. 2 buyers were emailed.',
  );
  assert.equal(notice.tone, 'info');
});

test('canceling one date of a paid event refunds that date’s orders the same way', async () => {
  const { db, seeded, buy } = await paidSetup();
  const paid = await buy('ruth@example.org');
  const notice = await cancelDateAndNotify({ ...base(db, seeded), occurrenceId: seeded.occurrenceId });
  assert.equal((await loadPaidOrder(db, paid))?.status, 'refunded');
  assert.match(notice.text, /^That date is canceled\. 1 paid order was refunded in full\./);
});

test('the paid part of the notice is plain words; nothing to do adds nothing', async () => {
  const { db } = await paidSetup();
  const empty = await refundCanceledOrders(
    { live: live(db), message: '', now: NOW },
    { ordersToRefund: [], checkoutsToExpire: [] },
  );
  assert.equal(paidCancelText(empty), '');
  assert.equal(
    paidCancelText({ refunded: 2, cash: 1, attention: 1, emailed: 3, notEmailed: 1, checkoutsLeft: 0 }),
    '2 paid orders were refunded in full. 1 cash order needs its money given back in person at the door. ' +
      '1 paid order could not be refunded here; open the Orders tab to refund it. 3 buyers were emailed. ' +
      '1 buyer could not be emailed; download the orders list and tell them directly.',
  );
  // An order or checkout that cannot be found is never counted as refunded.
  const unknown = await refundCanceledOrders(
    { live: live(db), message: '', now: NOW },
    {
      ordersToRefund: [
        { orderId: 'ord_missing', buyerEmail: null, buyerName: null, paymentMethod: 'cash', startsAt: NOW },
      ],
      checkoutsToExpire: [{ orderId: 'ord_missing', checkoutSessionId: 'cs_missing', stripeAccountId: null }],
    },
  );
  assert.equal(unknown.checkoutsLeft, 1);
  assert.equal(unknown.refunded + unknown.cash, 0);
});
