import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allRows, runBatch } from '../security/sql-database.ts';
import type { LiveEmail } from './mail.ts';
import { createOrderEventHandlers, type OrderEventDeps } from './order-events.ts';
import { markOrderPaid, releaseOrder, reserveOrder } from './orders.ts';
import {
  PAID_ENV,
  PAID_NOW,
  paidTestDatabase,
  seedPaidEvent,
  type SeedPaidEventOptions,
} from './paid-testing.ts';
import { PaidError, type FundsFlow, type ReserveOrderInput, type StripeEvent } from './paid-types.ts';
import {
  StripeApiError,
  type RoutingRefundInput,
  type PaymentRouting,
  type StripeGateway,
  type StripeRefund,
} from './payments/types.ts';
import {
  approveRefund,
  declineRefund,
  recordCashRefund,
  refundDirect,
  refundOrderInFull,
  requestRefund,
} from './refunds.ts';
import { checkInTicket, loadOrderTickets, ticketCredential } from './tickets.ts';

const START = PAID_NOW + 30 * 86_400;

/** A fake routing: records refunds, answers with the chosen Stripe status (or throws). */
function fakeRouting(flow: FundsFlow, account: string | null) {
  const calls: RoutingRefundInput[] = [];
  let answer: StripeRefund['status'] | Error = 'succeeded';
  const notUsed = () => Promise.reject(new Error('not used'));
  const routing: PaymentRouting & {
    calls: RoutingRefundInput[];
    answer(a: StripeRefund['status'] | Error): void;
  } = {
    flow,
    seller: flow === 'gamo_collects' ? 'gamo' : 'organization',
    chargeAccountId: flow === 'organizer_account' ? account : null,
    gateway: {} as StripeGateway,
    createCheckout: notUsed,
    expireCheckout: notUsed,
    createCardPresentPayment: notUsed,
    refund: async (input) => {
      calls.push(input);
      if (answer instanceof Error) throw answer;
      return {
        id: `re_${input.refundId}`,
        object: 'refund',
        amount: input.amountCents,
        currency: 'usd',
        payment_intent: input.paymentIntentId,
        status: answer,
        metadata: { refund_id: input.refundId, order_id: input.orderId },
      };
    },
    calls,
    answer(a) {
      answer = a;
    },
  };
  return routing;
}

async function setup(options: SeedPaidEventOptions = { flow: 'organizer_account' }) {
  const { d1, db } = await paidTestDatabase();
  const seed = seedPaidEvent(d1, options);
  const flow = options.flow ?? 'organizer_account';
  const exec = (sql: string) => d1.sqlite.exec(sql);
  const one = async <T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]) =>
    (await allRows<T>(db, { sql, params }))[0];
  const all = async <T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]) =>
    allRows<T>(db, { sql, params });
  const routing = fakeRouting(flow, seed.connectedAccountId);
  const reserve = (extra: Partial<ReserveOrderInput> = {}) =>
    reserveOrder(db, PAID_ENV, {
      eventId: seed.eventId,
      occurrenceId: seed.occurrenceId,
      channel: 'online',
      paymentMethod: 'card_online',
      lines: [{ ticketTypeId: seed.generalTypeId, quantity: 2 }],
      buyerName: 'Ruth Bekele',
      buyerEmail: 'ruth@example.org',
      now: PAID_NOW,
      ...extra,
    });
  const paidOrder = async (extra: Partial<ReserveOrderInput> = {}) => {
    const r = await reserve(extra);
    exec(`UPDATE orders SET checkout_session_id = 'cs_test_${r.orderId}' WHERE id = '${r.orderId}'`);
    const paid = await markOrderPaid(db, PAID_ENV, {
      orderId: r.orderId,
      amountCents: r.priced.totalCents,
      currency: 'usd',
      providerRef: `cs_test_${r.orderId}`,
      stripeAccountId: r.stripeAccountId,
      paymentIntentId: `pi_test_${r.orderId}`,
      now: PAID_NOW + 60,
    });
    assert.equal(paid.outcome, 'paid');
    return { ...r, tickets: await loadOrderTickets(db, r.orderId) };
  };
  const order = async (id: string) => ({
    ...(await one<{ status: string; amount_refunded_cents: number; disputed: number }>(
      'SELECT status, amount_refunded_cents, disputed FROM orders WHERE id = ?1',
      id,
    )),
  });
  const ticketStatuses = async (orderId: string) =>
    (
      await all<{ status: string }>('SELECT status FROM tickets WHERE order_id = ?1 ORDER BY seq', orderId)
    ).map((r) => r.status);
  const ledger = async (orderId: string) =>
    (
      await all<{ entry_type: string; amount_cents: number }>(
        "SELECT entry_type, amount_cents FROM ledger_entries WHERE order_id = ?1 AND entry_type NOT IN ('ticket_sale', 'gift', 'gamo_fee') ORDER BY rowid",
        orderId,
      )
    ).map((r) => ({ ...r }));
  const sent: LiveEmail[] = [];
  const deps: OrderEventDeps = {
    markOrderPaid,
    releaseOrder,
    routingForOrder: async () => routing,
    sendEmail: async (_env, email) => {
      sent.push(email);
    },
    orderUrl: (_env, token) => `https://live.test/orders/${token}`,
  };
  const handlers = createOrderEventHandlers(deps);
  const account = flow === 'organizer_account' ? (seed.connectedAccountId ?? undefined) : undefined;
  const deliver = (type: string, object: Record<string, unknown>, now = PAID_NOW + 600) => {
    const event: StripeEvent = {
      id: `evt_${Math.random()}`,
      type,
      created: now,
      livemode: false,
      account,
      data: { object },
    };
    const handler = handlers[type];
    assert.ok(handler, type);
    return handler(event, { db, env: PAID_ENV, now, endpoint: account ? 'connect' : 'platform' });
  };
  return {
    d1,
    db,
    seed,
    exec,
    one,
    all,
    routing,
    reserve,
    paidOrder,
    order,
    ticketStatuses,
    ledger,
    sent,
    deliver,
  };
}

const organizer = { kind: 'organizer' as const, organizationId: 'org_1' };

async function rejects(promise: Promise<unknown>, code: string, detail?: string) {
  await assert.rejects(promise, (e: unknown) => {
    assert.ok(e instanceof PaidError, String(e));
    assert.equal(e.code, code);
    if (detail !== undefined) assert.equal(e.detail, detail);
    return true;
  });
}

// ── Buyer requests and organizer decisions ─────────────────────────────────────────────────────────────────────

test('a refund within the policy: requested by the buyer, approved by the organizer, ticket stops working', async () => {
  const t = await setup();
  const o = await t.paidOrder();
  const [a] = o.tickets;
  const req = await requestRefund(t.db, PAID_ENV, {
    orderId: o.orderId,
    ticketIds: [a.id],
    reason: 'Sick',
    now: PAID_NOW,
  });
  assert.equal(req.amountCents, 2000);
  assert.deepEqual(req.owners, [{ email: 'owner1@example.org', name: 'Owner 1' }]);
  await rejects(
    requestRefund(t.db, PAID_ENV, { orderId: o.orderId, ticketIds: [a.id], now: PAID_NOW }),
    'invalid',
    'ticketIds',
  );
  await rejects(
    approveRefund(t.db, PAID_ENV, {
      refundId: req.refundId,
      actor: { kind: 'admin' },
      routing: t.routing,
      now: PAID_NOW,
    }),
    'forbidden',
  );
  const done = await approveRefund(t.db, PAID_ENV, {
    refundId: req.refundId,
    actor: organizer,
    routing: t.routing,
    now: PAID_NOW + 10,
  });
  assert.equal(done.status, 'succeeded');
  assert.equal(t.routing.calls.length, 1);
  assert.equal(t.routing.calls[0].amountCents, 2000);
  assert.equal(t.routing.calls[0].paymentIntentId, `pi_test_${o.orderId}`);
  assert.deepEqual(await t.order(o.orderId), {
    status: 'partially_refunded',
    amount_refunded_cents: 2000,
    disputed: 0,
  });
  assert.deepEqual(await t.ticketStatuses(o.orderId), ['refunded', 'valid']);
  assert.deepEqual(await t.ledger(o.orderId), [{ entry_type: 'refund', amount_cents: -2000 }]);
  const code = await ticketCredential(PAID_ENV, a);
  const scan = await checkInTicket(t.db, PAID_ENV, {
    occurrenceId: t.seed.occurrenceId,
    code,
    by: 'x',
    now: START - 600,
  });
  assert.deepEqual(scan, { outcome: 'refunded' });
});

test('outside the policy: after the deadline, or none; declined requests keep the tickets', async () => {
  const t = await setup();
  const o = await t.paidOrder();
  await rejects(
    requestRefund(t.db, PAID_ENV, {
      orderId: o.orderId,
      ticketIds: [o.tickets[0].id],
      now: START - 47 * 3600,
    }),
    'policy_forbids',
    'deadline_passed',
  );
  const req = await requestRefund(t.db, PAID_ENV, {
    orderId: o.orderId,
    ticketIds: [o.tickets[0].id],
    now: START - 49 * 3600,
  });
  const declined = await declineRefund(t.db, {
    refundId: req.refundId,
    actor: organizer,
    note: 'Sorry',
    now: PAID_NOW,
  });
  assert.equal(declined.status, 'declined');
  assert.deepEqual(await t.ticketStatuses(o.orderId), ['valid', 'valid']);
  const none = await setup({ flow: 'organizer_account', refundPolicy: 'none' });
  const n = await none.paidOrder();
  await rejects(
    requestRefund(none.db, PAID_ENV, { orderId: n.orderId, ticketIds: [n.tickets[0].id], now: PAID_NOW }),
    'policy_forbids',
    'policy_none',
  );
});

test('a policy change better for the buyer applies to an existing order; a worse one does not', async () => {
  const t = await setup({ flow: 'organizer_account', refundPolicy: 'none' });
  const o = await t.paidOrder();
  t.exec(
    `UPDATE event_ticketing SET refund_policy = 'until_start', refund_hours = NULL WHERE event_id = 'evt_1'`,
  );
  const req = await requestRefund(t.db, PAID_ENV, {
    orderId: o.orderId,
    ticketIds: [o.tickets[0].id],
    now: START - 60,
  });
  assert.equal(req.amountCents, 2000);
  const w = await setup({ flow: 'organizer_account', refundPolicy: 'until_start' });
  const p = await w.paidOrder();
  w.exec(`UPDATE event_ticketing SET refund_policy = 'none', refund_hours = NULL WHERE event_id = 'evt_1'`);
  const ok = await requestRefund(w.db, PAID_ENV, {
    orderId: p.orderId,
    ticketIds: [p.tickets[0].id],
    now: START - 60,
  });
  assert.equal(ok.amountCents, 2000);
});

// ── Races ──────────────────────────────────────────────────────────────────────────────────────────────────────

test('two refunds for the same ticket: one wins, Stripe is asked once', async () => {
  const t = await setup();
  const o = await t.paidOrder();
  const id = o.tickets[0].id;
  const direct = () =>
    refundDirect(t.db, PAID_ENV, {
      orderId: o.orderId,
      ticketIds: [id],
      includeGift: false,
      actor: organizer,
      routing: t.routing,
      now: PAID_NOW,
    });
  const results = await Promise.allSettled([direct(), direct()]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.ok(lost.reason instanceof PaidError);
  assert.equal(t.routing.calls.length, 1);
  assert.equal((await t.order(o.orderId))!.amount_refunded_cents, 2000);
});

test('a refund racing a check-in: exactly one wins', async () => {
  for (const refundFirst of [true, false]) {
    const t = await setup();
    const o = await t.paidOrder();
    const ticket = o.tickets[0];
    const code = await ticketCredential(PAID_ENV, ticket);
    const scan = () =>
      checkInTicket(t.db, PAID_ENV, { occurrenceId: t.seed.occurrenceId, code, by: 's', now: START - 600 });
    const refund = () =>
      refundDirect(t.db, PAID_ENV, {
        orderId: o.orderId,
        ticketIds: [ticket.id],
        includeGift: false,
        actor: organizer,
        routing: t.routing,
        now: START - 600,
      });
    const [first, second] = await Promise.allSettled(refundFirst ? [refund(), scan()] : [scan(), refund()]);
    const refundResult = refundFirst ? first : second;
    const scanResult = (refundFirst ? second : first) as PromiseFulfilledResult<
      Awaited<ReturnType<typeof scan>>
    >;
    const refunded = refundResult.status === 'fulfilled';
    const admitted = scanResult.value.outcome === 'admitted';
    assert.notEqual(refunded, admitted, `refundFirst=${refundFirst}`);
  }
});

test('door sales: a checked-in ticket is refundable in cash only when the door says so', async () => {
  const t = await setup();
  const r = await t.reserve({ channel: 'door', paymentMethod: 'cash', buyerName: null, buyerEmail: null });
  const paid = await markOrderPaid(t.db, PAID_ENV, {
    orderId: r.orderId,
    amountCents: 4000,
    currency: 'usd',
    providerRef: null,
    stripeAccountId: null,
    admit: true,
    admittedBy: 'stf_door',
    now: START - 600,
  });
  assert.equal(paid.outcome, 'paid');
  t.exec(
    `INSERT INTO cash_sessions (id, event_id, occurrence_id, organizer_id, float_cents, opened_at) VALUES ('csh_1', 'evt_1', 'occ_1', 'usr_1', 5000, ${START - 3600})`,
  );
  const tickets = await loadOrderTickets(t.db, r.orderId);
  const input = {
    orderId: r.orderId,
    ticketIds: [tickets[0].id],
    cashSessionId: 'csh_1',
    reason: 'Left early',
    now: START,
  };
  await rejects(recordCashRefund(t.db, input), 'invalid', 'ticketIds');
  const cash = await recordCashRefund(t.db, { ...input, includeCheckedIn: true });
  assert.equal(cash.amountCents, 2000);
  await runBatch(t.db, [
    ...cash.statements,
    {
      sql: `INSERT INTO cash_movements (id, cash_session_id, kind, order_id, refund_id, amount_cents, reason) VALUES ('cmv_1', 'csh_1', 'refund', ?1, ?2, ?3, 'Left early')`,
      params: [r.orderId, cash.refundId, cash.amountCents],
    },
  ]);
  assert.deepEqual(await t.ticketStatuses(r.orderId), ['refunded', 'valid']);
  assert.deepEqual(await t.order(r.orderId), {
    status: 'partially_refunded',
    amount_refunded_cents: 2000,
    disputed: 0,
  });
  assert.deepEqual(await t.ledger(r.orderId), [
    { entry_type: 'cash_sale', amount_cents: 4000 },
    { entry_type: 'cash_refund', amount_cents: -2000 },
  ]);
  // The same statements again (a double submit) roll back: the ticket is no longer valid.
  const again = await recordCashRefund(t.db, {
    ...input,
    ticketIds: [tickets[1].id],
    includeCheckedIn: true,
  });
  t.exec(`UPDATE tickets SET status = 'voided' WHERE id = '${tickets[1].id}'`);
  await assert.rejects(runBatch(t.db, again.statements));
  assert.equal((await t.order(r.orderId))!.amount_refunded_cents, 2000);
});

test('direct refunds: the admin only where Gamo is the seller; a definite Stripe refusal gives the tickets back', async () => {
  const a = await setup();
  const oa = await a.paidOrder();
  await rejects(
    refundDirect(a.db, PAID_ENV, {
      orderId: oa.orderId,
      ticketIds: 'all',
      includeGift: true,
      actor: { kind: 'admin' },
      routing: a.routing,
      now: PAID_NOW,
    }),
    'forbidden',
  );
  a.routing.answer(new StripeApiError(400, 'charge_already_refunded'));
  await rejects(
    refundDirect(a.db, PAID_ENV, {
      orderId: oa.orderId,
      ticketIds: 'all',
      includeGift: true,
      actor: organizer,
      routing: a.routing,
      now: PAID_NOW,
    }),
    'stripe_error',
  );
  assert.deepEqual(await a.ticketStatuses(oa.orderId), ['valid', 'valid']);
  assert.equal(
    (await a.one<{ status: string }>('SELECT status FROM refunds WHERE order_id = ?1', oa.orderId))!.status,
    'failed',
  );

  const b = await setup({ flow: 'gamo_collects', giftsEnabled: true });
  const ob = await b.paidOrder({ giftCents: 500 });
  const done = await refundDirect(b.db, PAID_ENV, {
    orderId: ob.orderId,
    ticketIds: 'all',
    includeGift: true,
    actor: { kind: 'admin' },
    routing: b.routing,
    now: PAID_NOW,
  });
  assert.equal(done.amountCents, 4500);
  assert.deepEqual(await b.order(ob.orderId), {
    status: 'refunded',
    amount_refunded_cents: 4500,
    disputed: 0,
  });
  assert.deepEqual(await b.ledger(ob.orderId), [
    { entry_type: 'refund', amount_cents: -4000 },
    { entry_type: 'gift_refund', amount_cents: -500 },
  ]);
});

test('canceling the event refunds each order in full once', async () => {
  const t = await setup();
  const o = await t.paidOrder();
  const first = await refundOrderInFull(t.db, PAID_ENV, {
    orderId: o.orderId,
    reason: 'event_canceled',
    routing: t.routing,
    now: PAID_NOW,
  });
  assert.equal(first.outcome, 'refunded');
  const second = await refundOrderInFull(t.db, PAID_ENV, {
    orderId: o.orderId,
    reason: 'event_canceled',
    routing: t.routing,
    now: PAID_NOW,
  });
  assert.equal(second.outcome, 'nothing');
  assert.equal(t.routing.calls.length, 1);
  assert.deepEqual(await t.order(o.orderId), {
    status: 'refunded',
    amount_refunded_cents: 4000,
    disputed: 0,
  });
});

// ── Webhooks ───────────────────────────────────────────────────────────────────────────────────────────────────

test('charge.refunded and the refund path never double count, in either order and delivered twice', async () => {
  const t = await setup();
  const o = await t.paidOrder();
  const pi = `pi_test_${o.orderId}`;
  t.routing.answer('pending');
  const r = await refundDirect(t.db, PAID_ENV, {
    orderId: o.orderId,
    ticketIds: [o.tickets[0].id],
    includeGift: false,
    actor: organizer,
    routing: t.routing,
    now: PAID_NOW,
  });
  assert.equal(r.status, 'pending');
  assert.equal((await t.order(o.orderId))!.amount_refunded_cents, 0);
  const stripeRefund = {
    id: `re_${r.refundId}`,
    object: 'refund',
    amount: 2000,
    status: 'succeeded',
    payment_intent: pi,
    metadata: { refund_id: r.refundId, order_id: o.orderId },
  };
  const charge = {
    id: 'ch_1',
    object: 'charge',
    payment_intent: pi,
    amount_refunded: 2000,
    refunds: { data: [stripeRefund] },
  };
  assert.equal(await t.deliver('charge.refunded', charge), 'processed');
  assert.equal(await t.deliver('refund.updated', stripeRefund), 'processed');
  assert.equal(await t.deliver('charge.refunded', charge), 'processed');
  assert.equal(await t.deliver('refund.updated', stripeRefund), 'processed');
  assert.deepEqual(await t.order(o.orderId), {
    status: 'partially_refunded',
    amount_refunded_cents: 2000,
    disputed: 0,
  });
  assert.deepEqual(await t.ledger(o.orderId), [{ entry_type: 'refund', amount_cents: -2000 }]);
  // A refund made in the Stripe dashboard is recorded once too.
  const outside = {
    id: 're_dashboard',
    object: 'refund',
    amount: 2000,
    status: 'succeeded',
    payment_intent: pi,
    metadata: {},
  };
  assert.equal(await t.deliver('refund.created', outside), 'processed');
  assert.equal(
    await t.deliver('charge.refunded', {
      ...charge,
      amount_refunded: 4000,
      refunds: { data: [stripeRefund, outside] },
    }),
    'processed',
  );
  assert.deepEqual(await t.order(o.orderId), {
    status: 'refunded',
    amount_refunded_cents: 4000,
    disputed: 0,
  });
  assert.deepEqual(await t.ticketStatuses(o.orderId), ['refunded', 'refunded']);
});

test('webhooks out of order: a Gamo refund before its payment is retried, unknown ones ignored; a payment delivered twice emails once', async () => {
  const t = await setup();
  const r = await t.reserve();
  const pi = `pi_test_${r.orderId}`;
  const refund = {
    id: 're_early',
    object: 'refund',
    amount: 4000,
    status: 'succeeded',
    payment_intent: pi,
    metadata: { order_id: r.orderId },
  };
  // Events that name a Gamo order not yet paid are early: retried.
  assert.equal(await t.deliver('refund.created', refund), 'retry');
  assert.equal(
    await t.deliver('charge.refunded', {
      payment_intent: pi,
      amount_refunded: 4000,
      metadata: { order_id: r.orderId },
    }),
    'retry',
  );
  // Events for payments Gamo knows nothing about (an organization's other sales on its own account) are ignored, so
  // they can never keep Stripe retrying and get the endpoint disabled.
  assert.equal(await t.deliver('refund.created', { ...refund, id: 're_other', metadata: {} }), 'ignored');
  assert.equal(
    await t.deliver('charge.refunded', { payment_intent: 'pi_other', amount_refunded: 4000 }),
    'ignored',
  );
  assert.equal(
    await t.deliver('charge.dispute.created', {
      id: 'dp_x',
      amount: 4000,
      status: 'needs_response',
      payment_intent: 'pi_other',
    }),
    'ignored',
  );
  t.exec(`UPDATE orders SET checkout_session_id = 'cs_test_${r.orderId}' WHERE id = '${r.orderId}'`);
  const session = {
    id: `cs_test_${r.orderId}`,
    object: 'checkout.session',
    payment_status: 'paid',
    amount_total: 4000,
    currency: 'usd',
    client_reference_id: r.orderId,
    payment_intent: pi,
    metadata: { order_id: r.orderId },
  };
  assert.equal(
    await t.deliver('checkout.session.completed', { ...session, payment_status: 'unpaid' }),
    'ignored',
  );
  assert.equal(await t.deliver('checkout.session.completed', session), 'processed');
  assert.equal(await t.deliver('checkout.session.completed', session), 'processed');
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent[0].to, 'ruth@example.org');
  assert.match(t.sent[0].text, /Sold by Grace Church 1/);
  assert.match(t.sent[0].text, /https:\/\/live\.test\/orders\/ord_/);
  assert.equal((await t.order(r.orderId))!.status, 'paid');
  // Unknown orders are ignored for checkout events.
  assert.equal(
    await t.deliver('checkout.session.completed', {
      ...session,
      client_reference_id: 'ord_unknown',
      metadata: {},
    }),
    'ignored',
  );
  // A payment that arrives before its session id was stored is retried (not dropped), with no tickets yet.
  const early = await t.reserve();
  assert.equal(
    await t.deliver('checkout.session.completed', {
      ...session,
      id: 'cs_test_not_stored_yet',
      client_reference_id: early.orderId,
      metadata: { order_id: early.orderId },
    }),
    'retry',
  );
  assert.equal((await t.order(early.orderId))!.status, 'pending');
  // A wrong amount never issues tickets.
  const r2 = await t.reserve();
  t.exec(`UPDATE orders SET checkout_session_id = 'cs_test_${r2.orderId}' WHERE id = '${r2.orderId}'`);
  assert.equal(
    await t.deliver('checkout.session.completed', {
      ...session,
      id: `cs_test_${r2.orderId}`,
      amount_total: 1,
      metadata: { order_id: r2.orderId },
    }),
    'processed',
  );
  assert.equal((await t.order(r2.orderId))!.status, 'pending');
});

test('payment completed after expiry: paid when the seats are still there, else unfulfilled and refunded once', async () => {
  for (const seatsGone of [false, true]) {
    const t = await setup();
    const r = await t.reserve();
    t.exec(`UPDATE orders SET checkout_session_id = 'cs_test_${r.orderId}' WHERE id = '${r.orderId}'`);
    const session = {
      id: `cs_test_${r.orderId}`,
      payment_status: 'paid',
      amount_total: 4000,
      currency: 'usd',
      client_reference_id: r.orderId,
      payment_intent: `pi_test_${r.orderId}`,
      metadata: { order_id: r.orderId },
    };
    assert.equal(
      await t.deliver('checkout.session.expired', { ...session, payment_status: 'unpaid' }),
      'processed',
    );
    assert.equal((await t.order(r.orderId))!.status, 'expired');
    if (seatsGone)
      t.exec(`UPDATE ticket_inventory SET online_taken = 100 WHERE ticket_type_id = 'tty_general_1'`);
    assert.equal(await t.deliver('checkout.session.completed', session), 'processed');
    assert.equal(await t.deliver('checkout.session.completed', session), 'processed');
    const after = await t.order(r.orderId);
    if (!seatsGone) {
      assert.equal(after!.status, 'paid');
      assert.equal(t.routing.calls.length, 0);
      continue;
    }
    assert.deepEqual(after, { status: 'paid_unfulfilled', amount_refunded_cents: 4000, disputed: 0 });
    assert.equal(t.routing.calls.length, 1);
    assert.equal(t.routing.calls[0].amountCents, 4000);
    assert.equal(t.sent.length, 1);
    assert.match(t.sent[0].subject, /could not issue/);
    assert.deepEqual(await t.ledger(r.orderId), []);
  }
});

test('a dispute opened then won: tickets voided while open, money back and tickets valid when won', async () => {
  const t = await setup();
  const o = await t.paidOrder();
  const pi = `pi_test_${o.orderId}`;
  const [a] = o.tickets;
  await checkInTicket(t.db, PAID_ENV, {
    occurrenceId: t.seed.occurrenceId,
    code: await ticketCredential(PAID_ENV, a),
    by: 's',
    now: START - 600,
  });
  const dispute = {
    id: 'dp_1',
    object: 'dispute',
    amount: 4000,
    currency: 'usd',
    reason: 'fraudulent',
    status: 'needs_response',
    payment_intent: pi,
  };
  assert.equal(await t.deliver('charge.dispute.created', dispute), 'processed');
  assert.equal(await t.deliver('charge.dispute.created', dispute), 'processed');
  assert.equal(
    await t.deliver('charge.dispute.updated', { ...dispute, status: 'under_review' }),
    'processed',
  );
  assert.equal((await t.order(o.orderId))!.disputed, 1);
  assert.deepEqual(await t.ticketStatuses(o.orderId), ['valid', 'voided']);
  assert.deepEqual(await t.ledger(o.orderId), [{ entry_type: 'dispute', amount_cents: -4000 }]);
  await rejects(
    refundDirect(t.db, PAID_ENV, {
      orderId: o.orderId,
      ticketIds: 'all',
      includeGift: false,
      actor: organizer,
      routing: t.routing,
      now: PAID_NOW,
    }),
    'invalid',
    'disputed',
  );
  assert.equal(await t.deliver('charge.dispute.closed', { ...dispute, status: 'won' }), 'processed');
  assert.equal(await t.deliver('charge.dispute.closed', { ...dispute, status: 'won' }), 'processed');
  assert.equal(
    await t.deliver('charge.dispute.created', dispute),
    'processed',
    'a late created does not reopen',
  );
  assert.equal((await t.order(o.orderId))!.disputed, 0);
  assert.deepEqual(await t.ticketStatuses(o.orderId), ['valid', 'valid']);
  assert.deepEqual(await t.ledger(o.orderId), [
    { entry_type: 'dispute', amount_cents: -4000 },
    { entry_type: 'dispute_reversal', amount_cents: 4000 },
  ]);
  const row = await t.one<{ outcome: string }>(
    'SELECT outcome FROM disputes WHERE stripe_dispute_id = ?1',
    'dp_1',
  );
  assert.equal(row!.outcome, 'won');
});
