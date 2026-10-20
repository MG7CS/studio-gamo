import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cashSessionSummary, closeCashSession, openCashSession } from './cash-sessions.ts';
import {
  cancelWaitingSale,
  createEventStaffLink,
  DOOR_TOTAL_FILTERS,
  doorCashRefund,
  doorFilterQuery,
  doorSaleStatus,
  doorTotals,
  listDoorTickets,
  parseDoorFilter,
  sellComp,
  sellForCash,
  simulateReaderTap,
  startPhoneSale,
  startReaderSale,
  type DoorTotalKey,
} from './door-sales.ts';
import { markOrderPaid, reserveOrder } from './orders.ts';
import { paidTestDatabase, PAID_ENV, PAID_NOW, seedPaidEvent } from './paid-testing.ts';
import { PaidError } from './paid-types.ts';
import { StripeApiError, type PaymentRouting, type StripeGateway } from './payments/types.ts';
import type { StaffActor } from './staff-links.ts';

const NOW = PAID_NOW;

interface Call {
  method: string;
  args: unknown[];
}

/** A recording fake routing and gateway (no network). */
function fakeRouting(
  accountId: string | null,
  options: { livemode?: boolean; readerError?: StripeApiError } = {},
) {
  const calls: Call[] = [];
  let n = 0;
  const gateway = {
    kind: 'standin',
    livemode: options.livemode ?? false,
    async processPaymentIntentOnReader(readerId: string, piId: string, opts: { account?: string | null }) {
      calls.push({ method: 'processPaymentIntentOnReader', args: [readerId, piId, opts.account] });
      if (options.readerError) throw options.readerError;
      return { id: readerId, object: 'terminal.reader', action: { status: 'in_progress' } };
    },
    async cancelReaderAction(readerId: string, opts: { account?: string | null }) {
      calls.push({ method: 'cancelReaderAction', args: [readerId, opts.account] });
      return { id: readerId };
    },
    async cancelPaymentIntent(id: string, opts: { account?: string | null }) {
      calls.push({ method: 'cancelPaymentIntent', args: [id, opts.account] });
      return { id, status: 'canceled' };
    },
    async retrievePaymentIntent(id: string) {
      return { id, status: 'canceled' };
    },
    async presentPaymentMethod(readerId: string, opts: { account?: string | null }) {
      calls.push({ method: 'presentPaymentMethod', args: [readerId, opts.account] });
      return { id: readerId };
    },
  } as unknown as StripeGateway;
  const routing: PaymentRouting = {
    flow: 'organizer_account',
    seller: 'organization',
    chargeAccountId: accountId,
    gateway,
    async createCheckout(input) {
      calls.push({ method: 'createCheckout', args: [input] });
      return {
        id: `cs_test_${++n}`,
        object: 'checkout.session',
        url: `https://checkout.example/cs_test_${n}`,
        status: 'open',
        payment_status: 'unpaid',
        amount_total: input.lines.reduce((s, l) => s + l.unitAmountCents * l.quantity, 0),
        currency: 'usd',
        client_reference_id: input.orderId,
        payment_intent: null,
        expires_at: input.expiresAt,
        metadata: { order_id: input.orderId },
        livemode: false,
      };
    },
    async expireCheckout(sessionId) {
      calls.push({ method: 'expireCheckout', args: [sessionId] });
    },
    async createCardPresentPayment(input) {
      calls.push({ method: 'createCardPresentPayment', args: [input] });
      return {
        id: `pi_test_${++n}`,
        object: 'payment_intent',
        amount: input.amountCents,
        amount_received: 0,
        currency: 'usd',
        status: 'requires_payment_method',
        latest_charge: null,
        metadata: { order_id: input.orderId },
        livemode: false,
      };
    },
    async refund() {
      throw new Error('not used');
    },
  };
  return { routing, calls };
}

async function setup() {
  const { d1, db } = await paidTestDatabase();
  const seed = seedPaidEvent(d1, { flow: 'organizer_account' });
  const staff = (id: string, perms: { checkIn: boolean; sell: boolean; comp: boolean }): StaffActor => ({
    kind: 'staff',
    staffLinkId: id,
    organizationId: seed.organizationId,
    scopeId: seed.eventId,
    label: id,
    permissions: perms,
  });
  d1.sqlite.exec(`
    INSERT INTO staff_links (id, organization_id, event_id, label, token_hash, pin_hash, pin_salt, can_check_in, can_sell, can_comp, expires_at)
      VALUES ('stf_box', 'org_1', 'evt_1', 'Box office', 'h1', 'p', 's', 1, 1, 0, ${NOW + 90 * 86_400}),
             ('stf_scan', 'org_1', 'evt_1', 'Scanner', 'h2', 'p', 's', 1, 0, 0, ${NOW + 90 * 86_400});
  `);
  return {
    d1,
    db,
    seed,
    seller: staff('stf_box', { checkIn: true, sell: true, comp: false }),
    scanner: staff('stf_scan', { checkIn: true, sell: false, comp: false }),
    organizer: {
      kind: 'organizer',
      organizerId: seed.organizerId,
      organizationId: seed.organizationId,
    } as StaffActor,
  };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (error) {
    assert.ok(error instanceof PaidError, String(error));
    return error.code;
  }
  return 'ok';
}

const doorTaken = (
  d1: { sqlite: { prepare(sql: string): { get(...a: unknown[]): unknown } } },
  typeId: string,
) =>
  (
    d1.sqlite.prepare('SELECT door_taken FROM ticket_inventory WHERE ticket_type_id = ?').get(typeId) as {
      door_taken: number;
    }
  ).door_taken;

function insertReader(
  d1: { sqlite: { exec(sql: string): void } },
  id: string,
  org: string,
  account: string | null,
) {
  d1.sqlite.exec(`
    INSERT INTO terminal_locations (id, organization_id, stripe_location_id, stripe_account_id) VALUES ('tml_${id}', '${org}', 'tml_stripe_${id}', ${account ? `'${account}'` : 'NULL'});
    INSERT INTO readers (id, organization_id, location_id, label, stripe_reader_id, stripe_account_id, status)
      VALUES ('${id}', '${org}', 'tml_${id}', 'Reader ${id}', 'tmr_${id}', ${account ? `'${account}'` : 'NULL'}, 'online');
  `);
}

test('staff link for an event expires 12 hours after its last date', async () => {
  const { db, seed } = await setup();
  const link = await createEventStaffLink(db, PAID_ENV, {
    organizationId: seed.organizationId,
    eventId: seed.eventId,
    label: 'North door',
    permissions: ['check_in', 'sell'],
    createdBy: seed.organizerId,
    now: NOW,
  });
  assert.equal(link.expiresAt, NOW + 30 * 86_400 + 3 * 3600 + 12 * 3600);
  assert.equal(
    await code(
      createEventStaffLink(db, PAID_ENV, {
        organizationId: 'org_other',
        eventId: seed.eventId,
        label: 'x',
        permissions: ['check_in'],
        createdBy: seed.organizerId,
        now: NOW,
      }),
    ),
    'not_found',
  );
});

test('cash sale: drawer open, change due, people admitted, close shows expected vs counted', async () => {
  const { d1, db, seed, seller } = await setup();
  await openCashSession(db, { occurrenceId: seed.occurrenceId, actor: seller, floatCents: 5000, now: NOW });
  const sale = await sellForCash(db, PAID_ENV, {
    actor: seller,
    occurrenceId: seed.occurrenceId,
    lines: [{ ticketTypeId: seed.generalTypeId, quantity: 2 }],
    receivedCents: 5000,
    buyerEmail: 'guest@example.org',
    now: NOW,
  });
  assert.equal(sale.totalCents, 4000); // cash: no Gamo fee
  assert.equal(sale.changeDueCents, 1000);
  assert.equal(sale.admittedCount, 2);
  assert.equal(sale.emailTicketsTo, 'guest@example.org');
  const tickets = d1.sqlite
    .prepare('SELECT checked_in_at, checked_in_by FROM tickets WHERE order_id = ?')
    .all(sale.orderId) as Array<{ checked_in_at: number; checked_in_by: string }>;
  assert.equal(tickets.length, 2);
  assert.ok(tickets.every((t) => t.checked_in_at === NOW && t.checked_in_by === 'staff:stf_box'));
  const order = d1.sqlite
    .prepare(
      'SELECT channel, payment_method, staff_link_id, cash_session_id, status FROM orders WHERE id = ?',
    )
    .get(sale.orderId) as Record<string, string>;
  assert.deepEqual(
    { ...order },
    {
      channel: 'door',
      payment_method: 'cash',
      staff_link_id: 'stf_box',
      cash_session_id: sale.cashSessionId,
      status: 'paid',
    },
  );
  const closed = await closeCashSession(db, {
    sessionId: sale.cashSessionId,
    actor: seller,
    countedCents: 8900,
    now: NOW + 60,
  });
  assert.equal(closed.expectedCents, 9000);
  assert.equal(closed.differenceCents, -100);
  // Closed: no more cash sales for this actor until a new drawer is opened.
  assert.equal(
    await code(
      sellForCash(db, PAID_ENV, {
        actor: seller,
        occurrenceId: seed.occurrenceId,
        lines: [{ ticketTypeId: seed.generalTypeId, quantity: 1 }],
        receivedCents: 2000,
        now: NOW + 120,
      }),
    ),
    'session_closed',
  );
});

test('cash received below the total is refused and frees the seats', async () => {
  const { d1, db, seed, seller } = await setup();
  await openCashSession(db, { occurrenceId: seed.occurrenceId, actor: seller, floatCents: 0, now: NOW });
  assert.equal(
    await code(
      sellForCash(db, PAID_ENV, {
        actor: seller,
        occurrenceId: seed.occurrenceId,
        lines: [{ ticketTypeId: seed.vipTypeId, quantity: 1 }],
        receivedCents: 4999,
        now: NOW,
      }),
    ),
    'invalid',
  );
  assert.equal(doorTaken(d1, seed.vipTypeId), 0);
  const [s] = d1.sqlite.prepare('SELECT id FROM cash_sessions').all() as Array<{ id: string }>;
  assert.equal((await cashSessionSummary(db, s.id)).salesCents, 0);
});

test('permissions: a check-in-only link cannot sell; comp needs the comp permission and a reason', async () => {
  const { d1, db, seed, seller, scanner, organizer } = await setup();
  const lines = [{ ticketTypeId: seed.generalTypeId, quantity: 1 }];
  assert.equal(
    await code(
      sellForCash(db, PAID_ENV, {
        actor: scanner,
        occurrenceId: seed.occurrenceId,
        lines,
        receivedCents: 2000,
        now: NOW,
      }),
    ),
    'forbidden',
  );
  assert.equal(
    await code(
      sellComp(db, PAID_ENV, {
        actor: seller,
        occurrenceId: seed.occurrenceId,
        lines,
        reason: 'Pastor',
        now: NOW,
      }),
    ),
    'forbidden',
  );
  assert.equal(
    await code(
      sellComp(db, PAID_ENV, {
        actor: organizer,
        occurrenceId: seed.occurrenceId,
        lines,
        reason: ' ',
        now: NOW,
      }),
    ),
    'invalid',
  );
  const comp = await sellComp(db, PAID_ENV, {
    actor: organizer,
    occurrenceId: seed.occurrenceId,
    lines,
    reason: 'Guest speaker',
    now: NOW,
  });
  assert.equal(comp.totalCents, 0);
  assert.equal(comp.admittedCount, 1);
  const o = d1.sqlite
    .prepare('SELECT payment_method, comp_reason FROM orders WHERE id = ?')
    .get(comp.orderId) as Record<string, string>;
  assert.deepEqual({ ...o }, { payment_method: 'comp', comp_reason: 'Guest speaker' });
  // Another organization's staff cannot sell here.
  const outsider: StaffActor = { kind: 'organizer', organizerId: 'usr_x', organizationId: 'org_x' };
  assert.equal(
    await code(
      sellComp(db, PAID_ENV, {
        actor: outsider,
        occurrenceId: seed.occurrenceId,
        lines,
        reason: 'x',
        now: NOW,
      }),
    ),
    'forbidden',
  );
});

test('door sales need the event switch and the platform switch', async () => {
  const { d1, db, seed, organizer } = await setup();
  const lines = [{ ticketTypeId: seed.generalTypeId, quantity: 1 }];
  d1.sqlite.exec('UPDATE payment_settings SET door_sales_enabled = 0');
  assert.equal(
    await code(
      sellComp(db, PAID_ENV, {
        actor: organizer,
        occurrenceId: seed.occurrenceId,
        lines,
        reason: 'x',
        now: NOW,
      }),
    ),
    'not_on_sale',
  );
  d1.sqlite.exec(
    'UPDATE payment_settings SET door_sales_enabled = 1; UPDATE event_ticketing SET door_sales_enabled = 0',
  );
  assert.equal(
    await code(
      sellComp(db, PAID_ENV, {
        actor: organizer,
        occurrenceId: seed.occurrenceId,
        lines,
        reason: 'x',
        now: NOW,
      }),
    ),
    'not_on_sale',
  );
});

test('a cash sale racing an online sale for the last seat: exactly one wins', async () => {
  const { d1, db, seed, seller } = await setup();
  d1.sqlite.exec(`UPDATE ticket_inventory SET capacity = 1 WHERE ticket_type_id = '${seed.generalTypeId}'`);
  await openCashSession(db, { occurrenceId: seed.occurrenceId, actor: seller, floatCents: 0, now: NOW });
  const lines = [{ ticketTypeId: seed.generalTypeId, quantity: 1 }];
  const results = await Promise.allSettled([
    sellForCash(db, PAID_ENV, {
      actor: seller,
      occurrenceId: seed.occurrenceId,
      lines,
      receivedCents: 2000,
      now: NOW,
    }),
    reserveOrder(db, PAID_ENV, {
      eventId: seed.eventId,
      occurrenceId: seed.occurrenceId,
      channel: 'online',
      paymentMethod: 'card_online',
      lines,
      buyerName: 'Online Buyer',
      buyerEmail: 'online@example.org',
      termsVersion: '2026-10-19-draft.3',
      now: NOW,
    }),
  ]);
  const won = results.filter((r) => r.status === 'fulfilled');
  const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  assert.equal(won.length, 1);
  assert.equal(lost.length, 1);
  assert.ok(
    lost[0].reason instanceof PaidError && lost[0].reason.code === 'sold_out',
    String(lost[0].reason),
  );
});

test("a second door link cannot refund another drawer's cash sale; the organizer can", async () => {
  const { d1, db, seed, seller, organizer } = await setup();
  d1.sqlite
    .exec(`INSERT INTO staff_links (id, organization_id, event_id, label, token_hash, pin_hash, pin_salt, can_check_in, can_sell, can_comp, expires_at)
      VALUES ('stf_north', 'org_1', 'evt_1', 'North door', 'h3', 'p', 's', 1, 1, 0, ${NOW + 90 * 86_400})`);
  const north: StaffActor = { ...seller, staffLinkId: 'stf_north', label: 'stf_north' } as StaffActor;
  await openCashSession(db, { occurrenceId: seed.occurrenceId, actor: seller, floatCents: 0, now: NOW });
  await openCashSession(db, { occurrenceId: seed.occurrenceId, actor: north, floatCents: 0, now: NOW });
  await openCashSession(db, {
    occurrenceId: seed.occurrenceId,
    actor: organizer,
    floatCents: 5000,
    now: NOW,
  });
  const sale = await sellForCash(db, PAID_ENV, {
    actor: seller,
    occurrenceId: seed.occurrenceId,
    lines: [{ ticketTypeId: seed.generalTypeId, quantity: 1 }],
    receivedCents: 2000,
    now: NOW,
  });
  const refundBy = (actor: StaffActor) =>
    doorCashRefund(db, {
      actor,
      orderId: sale.orderId,
      ticketIds: sale.ticketIds,
      reason: 'Mistake',
      now: NOW + 5,
    });
  assert.equal(await code(refundBy(north)), 'forbidden');
  assert.equal(await code(refundBy(organizer)), 'ok');
});

test('cash refund needs a reason, goes into the open drawer and reduces expected', async () => {
  const { db, seed, seller } = await setup();
  const session = await openCashSession(db, {
    occurrenceId: seed.occurrenceId,
    actor: seller,
    floatCents: 1000,
    now: NOW,
  });
  const sale = await sellForCash(db, PAID_ENV, {
    actor: seller,
    occurrenceId: seed.occurrenceId,
    lines: [{ ticketTypeId: seed.generalTypeId, quantity: 2 }],
    receivedCents: 4000,
    now: NOW,
  });
  // Door sales admit at once; the door refunds those admitted tickets all the same.
  assert.equal(
    await code(
      doorCashRefund(db, {
        actor: seller,
        orderId: sale.orderId,
        ticketIds: [sale.ticketIds[0]],
        reason: '',
        now: NOW + 10,
      }),
    ),
    'invalid',
  );
  const refund = await doorCashRefund(db, {
    actor: seller,
    orderId: sale.orderId,
    ticketIds: [sale.ticketIds[0]],
    reason: 'Bought one too many',
    now: NOW + 10,
  });
  assert.equal(refund.amountCents, 2000);
  assert.equal(refund.cashSessionId, session.id);
  const summary = await cashSessionSummary(db, session.id);
  assert.equal(summary.refundsCents, 2000);
  assert.equal(summary.expectedCents, 1000 + 4000 - 2000);
  // After the close, refunds into that drawer are refused.
  await closeCashSession(db, { sessionId: session.id, actor: seller, countedCents: 3000, now: NOW + 20 });
  assert.equal(
    await code(
      doorCashRefund(db, {
        actor: seller,
        orderId: sale.orderId,
        ticketIds: [sale.ticketIds[1]],
        reason: 'x',
        now: NOW + 30,
      }),
    ),
    'session_closed',
  );
});

test("buyer's phone: checkout QR, status pending, cancel expires the session and frees the seats", async () => {
  const { d1, db, seed, seller } = await setup();
  const { routing, calls } = fakeRouting(seed.connectedAccountId);
  const started = await startPhoneSale(db, PAID_ENV, {
    actor: seller,
    occurrenceId: seed.occurrenceId,
    lines: [{ ticketTypeId: seed.vipTypeId, quantity: 2 }],
    routing,
    successUrl: 'https://live.example/door/done',
    cancelUrl: 'https://live.example/door',
    now: NOW,
  });
  assert.match(started.checkoutUrl, /^https:\/\/checkout\.example\//);
  assert.equal(doorTaken(d1, seed.vipTypeId), 2);
  const checkout = calls.find((c) => c.method === 'createCheckout')!.args[0] as {
    lines: Array<{ unitAmountCents: number; quantity: number }>;
  };
  assert.equal(
    checkout.lines.reduce((s, l) => s + l.unitAmountCents * l.quantity, 0),
    started.totalCents,
  );
  const status = await doorSaleStatus(db, { orderId: started.orderId, actor: seller, now: NOW + 5 });
  assert.equal(status.state, 'pending');
  assert.equal(status.method, 'phone_qr');

  const released = await cancelWaitingSale(db, {
    orderId: started.orderId,
    actor: seller,
    routing,
    now: NOW + 10,
  });
  assert.equal(released.released, true);
  assert.deepEqual(calls.at(-1), { method: 'expireCheckout', args: ['cs_test_1'] });
  assert.equal(doorTaken(d1, seed.vipTypeId), 0);
  assert.equal(
    (await doorSaleStatus(db, { orderId: started.orderId, actor: seller, now: NOW + 11 })).state,
    'canceled',
  );
});

test('card reader: the payment goes to the chosen reader on the right account; busy and cancel', async () => {
  const { d1, db, seed, seller } = await setup();
  insertReader(d1, 'rdr_a', seed.organizationId, seed.connectedAccountId);
  const { routing, calls } = fakeRouting(seed.connectedAccountId);
  const started = await startReaderSale(db, PAID_ENV, {
    actor: seller,
    occurrenceId: seed.occurrenceId,
    lines: [{ ticketTypeId: seed.generalTypeId, quantity: 1 }],
    readerId: 'rdr_a',
    routing,
    now: NOW,
  });
  const sent = calls.find((c) => c.method === 'processPaymentIntentOnReader')!;
  assert.deepEqual(sent.args, ['tmr_rdr_a', started.paymentIntentId, seed.connectedAccountId]);
  const order = d1.sqlite
    .prepare('SELECT payment_intent_id, reader_id FROM orders WHERE id = ?')
    .get(started.orderId) as Record<string, string>;
  assert.deepEqual({ ...order }, { payment_intent_id: started.paymentIntentId, reader_id: 'rdr_a' });
  const status = await doorSaleStatus(db, { orderId: started.orderId, actor: seller, now: NOW + 1 });
  assert.equal(status.reader?.actionStatus, 'in_progress');

  // The reader is busy with this sale.
  assert.equal(
    await code(
      startReaderSale(db, PAID_ENV, {
        actor: seller,
        occurrenceId: seed.occurrenceId,
        lines: [{ ticketTypeId: seed.generalTypeId, quantity: 1 }],
        readerId: 'rdr_a',
        routing,
        now: NOW + 2,
      }),
    ),
    'reader_unavailable',
  );
  await simulateReaderTap(db, { orderId: started.orderId, actor: seller, routing });
  assert.deepEqual(calls.at(-1), {
    method: 'presentPaymentMethod',
    args: ['tmr_rdr_a', seed.connectedAccountId],
  });
  const live = fakeRouting(seed.connectedAccountId, { livemode: true });
  assert.equal(
    await code(simulateReaderTap(db, { orderId: started.orderId, actor: seller, routing: live.routing })),
    'forbidden',
  );

  const released = await cancelWaitingSale(db, {
    orderId: started.orderId,
    actor: seller,
    routing,
    now: NOW + 3,
  });
  assert.equal(released.released, true);
  assert.deepEqual(
    calls.slice(-2).map((c) => c.method),
    ['cancelReaderAction', 'cancelPaymentIntent'],
  );
  const reader = d1.sqlite
    .prepare("SELECT action_status, action_order_id FROM readers WHERE id = 'rdr_a'")
    .get() as Record<string, unknown>;
  assert.deepEqual({ ...reader }, { action_status: 'idle', action_order_id: null });
  assert.equal(doorTaken(d1, seed.generalTypeId), 0);
});

test('a reader offline at Stripe frees the seats and the reader', async () => {
  const { d1, db, seed, seller } = await setup();
  insertReader(d1, 'rdr_a', seed.organizationId, seed.connectedAccountId);
  const { routing } = fakeRouting(seed.connectedAccountId, {
    readerError: new StripeApiError(400, 'terminal_reader_offline'),
  });
  const error = await startReaderSale(db, PAID_ENV, {
    actor: seller,
    occurrenceId: seed.occurrenceId,
    lines: [{ ticketTypeId: seed.generalTypeId, quantity: 1 }],
    readerId: 'rdr_a',
    routing,
    now: NOW,
  }).catch((e: unknown) => e);
  assert.ok(
    error instanceof PaidError &&
      error.code === 'reader_unavailable' &&
      error.detail === 'terminal_reader_offline',
  );
  assert.equal(doorTaken(d1, seed.generalTypeId), 0);
  const reader = d1.sqlite
    .prepare("SELECT action_status, action_failure FROM readers WHERE id = 'rdr_a'")
    .get() as Record<string, unknown>;
  assert.deepEqual({ ...reader }, { action_status: 'failed', action_failure: 'terminal_reader_offline' });
});

test("another organization's reader, or a reader on another account, is refused", async () => {
  const { d1, db, seed, seller } = await setup();
  seedPaidEvent(d1, {}, '2');
  insertReader(d1, 'rdr_other', 'org_2', 'acct_test_2');
  insertReader(d1, 'rdr_gamo', seed.organizationId, null);
  const { routing, calls } = fakeRouting(seed.connectedAccountId);
  for (const readerId of ['rdr_other', 'rdr_gamo']) {
    assert.equal(
      await code(
        startReaderSale(db, PAID_ENV, {
          actor: seller,
          occurrenceId: seed.occurrenceId,
          lines: [{ ticketTypeId: seed.generalTypeId, quantity: 1 }],
          readerId,
          routing,
          now: NOW,
        }),
      ),
      'reader_unavailable',
    );
  }
  assert.equal(calls.length, 0);
  assert.equal(doorTaken(d1, seed.generalTypeId), 0);
});

test('door-day totals equal the lengths of their lists', async () => {
  const { d1, db, seed, seller, organizer } = await setup();
  await openCashSession(db, { occurrenceId: seed.occurrenceId, actor: seller, floatCents: 0, now: NOW });
  await sellForCash(db, PAID_ENV, {
    actor: seller,
    occurrenceId: seed.occurrenceId,
    lines: [{ ticketTypeId: seed.generalTypeId, quantity: 2 }],
    receivedCents: 4000,
    now: NOW,
  });
  await sellComp(db, PAID_ENV, {
    actor: organizer,
    occurrenceId: seed.occurrenceId,
    lines: [{ ticketTypeId: seed.vipTypeId, quantity: 1 }],
    reason: 'Volunteer',
    now: NOW,
  });
  // One online order of three tickets, paid through its Checkout Session (not checked in).
  const online = await reserveOrder(db, PAID_ENV, {
    eventId: seed.eventId,
    occurrenceId: seed.occurrenceId,
    channel: 'online',
    paymentMethod: 'card_online',
    lines: [{ ticketTypeId: seed.generalTypeId, quantity: 3 }],
    buyerName: 'Online Buyer',
    buyerEmail: 'online@example.org',
    termsVersion: '2026-10-19-draft.3',
    now: NOW,
  });
  d1.sqlite.exec(`UPDATE orders SET checkout_session_id = 'cs_online' WHERE id = '${online.orderId}'`);
  const paid = await markOrderPaid(db, PAID_ENV, {
    orderId: online.orderId,
    amountCents: online.priced.totalCents,
    currency: 'usd',
    providerRef: 'cs_online',
    stripeAccountId: online.stripeAccountId,
    now: NOW,
  });
  assert.equal(paid.outcome, 'paid');

  const totals = await doorTotals(db, {
    organizationId: seed.organizationId,
    occurrenceId: seed.occurrenceId,
  });
  assert.deepEqual(totals, {
    soldOnline: 3,
    doorCash: 2,
    doorPhone: 0,
    doorReader: 0,
    doorComp: 1,
    checkedIn: 3,
    toArrive: 3,
  });
  for (const key of Object.keys(DOOR_TOTAL_FILTERS) as DoorTotalKey[]) {
    const filter = parseDoorFilter(new URLSearchParams(doorFilterQuery(DOOR_TOTAL_FILTERS[key])));
    const list = await listDoorTickets(db, {
      organizationId: seed.organizationId,
      occurrenceId: seed.occurrenceId,
      filter,
    });
    assert.equal(list.length, totals[key], key);
  }
  // Another organization sees nothing.
  const other = await doorTotals(db, { organizationId: 'org_other', occurrenceId: seed.occurrenceId });
  assert.ok(Object.values(other).every((n) => n === 0));
});
