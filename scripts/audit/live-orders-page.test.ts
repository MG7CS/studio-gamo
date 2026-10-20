/** The Orders tab of a paid event: filters and counts, the CSV, one order's refunds and emails (O3, O4). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PaidError,
  listEventOrders,
  listTicketTypes,
  loadPaidOrder,
  requestRefund,
} from '../../packages/domain/index.ts';
import {
  ORDER_FLASH,
  filterOf,
  orderDetailView,
  orderErrorText,
  ordersCsvResponse,
  ordersHref,
  ordersPageView,
  parseOrdersQuery,
  runOrderAction,
  sendOrderConfirmation,
} from '../../apps/live/src/lib/orders-page.ts';
import { ENV, NOW, formOf, paidSetup } from './live-paid-fixtures.ts';

const ORIGIN = 'https://live.example.org';

test('the list filters come from the address; unknown values are dropped', () => {
  const q = parseOrdersQuery(new URLSearchParams('q=ruth&status=paid&type=tty_x&channel=moon&method=cash'), [
    'tty_x',
  ]);
  assert.deepEqual(q, {
    q: 'ruth',
    status: 'paid',
    ticketTypeId: 'tty_x',
    channel: null,
    method: 'cash',
    refundRequested: false,
  });
  assert.equal(parseOrdersQuery(new URLSearchParams('refund=requested'), []).refundRequested, true);
  assert.equal(
    ordersHref('evt_1', { ...q, refundRequested: true }, {}),
    '/organizer/events/evt_1/orders?q=ruth&status=paid&type=tty_x&method=cash&refund=requested',
  );
  assert.equal(
    ordersHref('evt_1', q, { status: null }),
    '/organizer/events/evt_1/orders?q=ruth&type=tty_x&method=cash',
  );
  assert.deepEqual(filterOf({ q: '', status: null, ticketTypeId: null, channel: null, method: null }), {
    q: null,
    status: null,
    ticketTypeId: null,
    channel: null,
    method: null,
    refundRequested: false,
  });
});

test('every chip and summary count equals the length of the list its link opens', async () => {
  const { db, seeded, buy, comp } = await paidSetup();
  await buy('ruth@example.org');
  await buy('naomi@example.org', 1, false);
  await comp();
  const types = await listTicketTypes(db, seeded.organizationId, seeded.eventId);
  const view = await ordersPageView(db, {
    organizationId: seeded.organizationId,
    eventId: seeded.eventId,
    types,
    params: new URLSearchParams(''),
  });
  assert.equal(view.rows.length, 3);
  assert.equal(view.csvHref, `/organizer/events/${seeded.eventId}/orders.csv`);
  const lengthOf = async (href: string) => {
    const params = new URL(href, ORIGIN).searchParams;
    const q = parseOrdersQuery(
      params,
      types.map((t) => t.id),
    );
    return (await listEventOrders(db, seeded.organizationId, seeded.eventId, filterOf(q))).length;
  };
  for (const card of view.summary) assert.equal(card.value, await lengthOf(card.href), card.label);
  for (const group of view.groups)
    for (const chip of group.items)
      if (chip.count != null)
        assert.equal(chip.count, await lengthOf(chip.href), `${group.label}: ${chip.label}`);
  const status = view.groups.find((g) => g.label === 'Status')!;
  assert.deepEqual(
    status.items.map((i) => i.label),
    ['All', 'Waiting for payment', 'Paid'],
  );
  const filtered = await ordersPageView(db, {
    organizationId: seeded.organizationId,
    eventId: seeded.eventId,
    types,
    params: new URLSearchParams('method=comp'),
  });
  assert.equal(filtered.rows.length, 1);
  assert.ok(filtered.filtered);
  assert.equal(filtered.csvHref, `/organizer/events/${seeded.eventId}/orders.csv?method=comp`);
});

test('the CSV is private, never cached, an attachment, and filtered like the list', async () => {
  const { db, seeded, buy, comp } = await paidSetup();
  await buy('ruth@example.org');
  await comp();
  const res = await ordersCsvResponse(db, {
    organizationId: seeded.organizationId,
    eventId: seeded.eventId,
    slug: 'gospel-night-1',
    timeZone: 'America/Phoenix',
    types: [],
    params: new URLSearchParams('method=card_online'),
  });
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="orders-gospel-night-1.csv"');
  const lines = (await res.text()).trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /card_online/);
});

test('order detail: the whole refund and each ticket’s share; another event’s order is not found', async () => {
  const { db, seeded, buy } = await paidSetup();
  const orderId = await buy('ruth@example.org', 2);
  const view = await orderDetailView(db, {
    organizationId: seeded.organizationId,
    eventId: seeded.eventId,
    orderId,
  });
  assert.ok(view);
  assert.equal(view.whole.amountCents, view.order.totalCents);
  assert.equal(view.refundableTickets.length, 2);
  assert.equal(
    view.refundableTickets.reduce((a, t) => a + t.amountCents, 0),
    view.order.totalCents - view.order.giftCents,
  );
  assert.equal(view.cash, false);
  assert.equal(
    await orderDetailView(db, { organizationId: seeded.organizationId, eventId: 'evt_other', orderId }),
    null,
  );
  assert.equal(
    await orderDetailView(db, { organizationId: 'org_other', eventId: seeded.eventId, orderId }),
    null,
  );
});

test('refunding chosen tickets, then the rest, through the stand-in; the buyer is emailed', async () => {
  const { db, seeded, buy } = await paidSetup();
  const orderId = await buy('ruth@example.org', 2);
  const run = (entries: Array<[string, string]>) =>
    runOrderAction({
      db,
      env: ENV,
      organizationId: seeded.organizationId,
      orderId,
      form: formOf(entries),
      origin: ORIGIN,
      now: NOW,
    });
  const view = (await orderDetailView(db, {
    organizationId: seeded.organizationId,
    eventId: seeded.eventId,
    orderId,
  }))!;
  const first = view.refundableTickets[0];
  assert.deepEqual(
    await run([
      ['action', 'refund'],
      ['scope', 'chosen'],
      ['ticket', first.id],
    ]),
    { kind: 'done', flash: 'refunded' },
  );
  let order = await loadPaidOrder(db, orderId);
  assert.equal(order?.status, 'partially_refunded');
  assert.equal(order?.amountRefundedCents, first.amountCents);
  assert.deepEqual(
    await run([
      ['action', 'refund'],
      ['scope', 'all'],
    ]),
    { kind: 'done', flash: 'refunded' },
  );
  order = await loadPaidOrder(db, orderId);
  assert.equal(order?.status, 'refunded');
  const nothing = await run([
    ['action', 'refund'],
    ['scope', 'all'],
  ]);
  assert.equal(nothing.kind, 'error');
  for (const key of ['refunded', 'resent', 'approved', 'declined']) assert.ok(ORDER_FLASH[key]);
});

test('a buyer’s request: approve refunds it; decline keeps the tickets; resend emails the confirmation', async () => {
  const { db, seeded, buy } = await paidSetup({ refundPolicy: 'until_start' });
  const orderId = await buy('ruth@example.org', 2);
  const view = (await orderDetailView(db, {
    organizationId: seeded.organizationId,
    eventId: seeded.eventId,
    orderId,
  }))!;
  const run = (entries: Array<[string, string]>) =>
    runOrderAction({
      db,
      env: ENV,
      organizationId: seeded.organizationId,
      orderId,
      form: formOf(entries),
      origin: ORIGIN,
      now: NOW,
    });
  const a = await requestRefund(db, ENV, {
    orderId,
    ticketIds: [view.refundableTickets[0].id],
    reason: 'Sick',
    now: NOW,
  });
  assert.deepEqual(
    await run([
      ['action', 'decline'],
      ['refund', a.refundId],
      ['note', 'Sorry'],
    ]),
    {
      kind: 'done',
      flash: 'declined',
    },
  );
  const b = await requestRefund(db, ENV, { orderId, ticketIds: [view.refundableTickets[0].id], now: NOW });
  assert.deepEqual(
    await run([
      ['action', 'approve'],
      ['refund', b.refundId],
    ]),
    { kind: 'done', flash: 'approved' },
  );
  assert.equal((await loadPaidOrder(db, orderId))?.status, 'partially_refunded');
  assert.deepEqual(await run([['action', 'resend']]), { kind: 'done', flash: 'resent' });
  assert.equal(
    await sendOrderConfirmation(db, ENV, { organizationId: 'org_other', orderId, origin: ORIGIN }),
    false,
  );
});

test('a cash order is explained as refunded at the door; errors are plain words', () => {
  assert.match(orderErrorText(new PaidError('invalid', { detail: 'cash_refund_at_door' })), /cash drawer/);
  assert.match(orderErrorText(new PaidError('payments_unavailable')), /Nothing was refunded/);
  assert.match(orderErrorText(new PaidError('rate_limited')), /could not be done/);
});
