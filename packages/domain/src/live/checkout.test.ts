import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allRows } from '../security/sql-database.ts';
import {
  CHECKOUT_RATE_LIMITS,
  checkoutLineItems,
  parseSelectionForm,
  quoteOrder,
  reviewLines,
  sellerLabelOf,
  startOnlineCheckout,
  validateDetailsStep,
} from './checkout.ts';
import { createEventCode } from './codes.ts';
import { readEventTicketing } from './event-ticketing.ts';
import { priceOrder } from './fees.ts';
import {
  PAID_ENV,
  PAID_NOW,
  paidTestDatabase,
  seedPaidEvent,
  type SeedPaidEventOptions,
} from './paid-testing.ts';
import { CHECKOUT_SESSION_SECONDS, PaidError, type FundsFlow } from './paid-types.ts';
import {
  StripeApiError,
  type OrderCheckoutInput,
  type PaymentRouting,
  type StripeCheckoutSession,
} from './payments/types.ts';
import { verifyOrderToken } from './tickets.ts';

async function setup(options: SeedPaidEventOptions = { flow: 'organizer_account' }) {
  const { d1, db } = await paidTestDatabase();
  const seed = seedPaidEvent(d1, options);
  return { d1, db, seed, exec: (sql: string) => d1.sqlite.exec(sql) };
}

function fakeRouting(flow: FundsFlow, chargeAccountId: string | null, behavior: 'ok' | Error = 'ok') {
  const calls: OrderCheckoutInput[] = [];
  const routing = {
    flow,
    seller: flow === 'organizer_account' ? 'organization' : 'gamo',
    chargeAccountId,
    gateway: {} as PaymentRouting['gateway'],
    async createCheckout(input: OrderCheckoutInput): Promise<StripeCheckoutSession> {
      calls.push(input);
      if (behavior !== 'ok') throw behavior;
      return {
        id: `cs_test_${calls.length}`,
        object: 'checkout.session',
        url: `https://checkout.stripe.com/c/pay/cs_test_${calls.length}`,
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
    async expireCheckout() {},
    async createCardPresentPayment() {
      throw new Error('unused');
    },
    async refund() {
      throw new Error('unused');
    },
  } satisfies PaymentRouting;
  return { routing, calls };
}

const buyer = {
  buyerName: 'Ruth Bekele',
  buyerEmail: 'ruth@example.org',
  termsVersion: '2026-10-19-draft.3',
};

test('parseSelectionForm reads the date, the code and qty:<type> fields', () => {
  const s = parseSelectionForm([
    ['occurrence', 'occ_1'],
    ['code', ' grace10 '],
    ['qty:tty_general_1', '2'],
    ['qty:tty_vip_1', '0'],
    ['price', '1'],
  ]);
  assert.deepEqual(s, {
    occurrenceId: 'occ_1',
    code: 'grace10',
    lines: [{ ticketTypeId: 'tty_general_1', quantity: 2 }],
  });
  assert.throws(
    () =>
      parseSelectionForm([
        ['occurrence', 'occ_1'],
        ['qty:tty_a', '0'],
      ]),
    (e: PaidError) => e.detail === 'lines',
  );
  assert.throws(
    () =>
      parseSelectionForm([
        ['occurrence', 'occ_1'],
        ['qty:tty_a', '-1'],
      ]),
    (e: PaidError) => e.detail === 'quantity',
  );
  assert.throws(
    () =>
      parseSelectionForm([
        ['occurrence', 'occ_1'],
        ['qty:tty_a', '1.5'],
      ]),
    (e: PaidError) => e.detail === 'quantity',
  );
  assert.throws(
    () =>
      parseSelectionForm([
        ['occurrence', 'occ_1'],
        ['qty:x', '1'],
      ]),
    (e: PaidError) => e.detail === 'ticket_type',
  );
  assert.throws(
    () => parseSelectionForm([['qty:tty_a', '1']]),
    (e: PaidError) => e.detail === 'occurrence',
  );
});

test('validateDetailsStep returns every error at once; the typo hint is only a hint', () => {
  const ticketing = { namesRequired: true, giftsEnabled: true, giftPresets: [500, 1000] };
  const bad = validateDetailsStep(
    {
      name: '',
      email: 'ruth@gmail.con',
      confirmEmail: 'ruth@gmail.com',
      attendeeNames: ['A'],
      giftChoice: '700',
    },
    { ticketing, ticketCount: 2 },
  );
  assert.equal(bad.ok, false);
  assert.deepEqual(!bad.ok && bad.errors, {
    name: 'required',
    confirmEmail: 'mismatch',
    attendee_1: 'required',
    gift: 'invalid',
  });
  assert.equal(bad.emailHint, 'ruth@gmail.com');
  const good = validateDetailsStep(
    {
      name: 'Ruth',
      email: ' Ruth@Gmail.con ',
      confirmEmail: 'ruth@gmail.con',
      attendeeNames: ['A', 'B'],
      giftChoice: 'custom',
      giftCustom: '12',
    },
    { ticketing, ticketCount: 2 },
  );
  assert.ok(good.ok);
  assert.deepEqual(good.ok && good.value, {
    buyerName: 'Ruth',
    buyerEmail: 'ruth@gmail.con',
    attendeeNames: ['A', 'B'],
    giftCents: 1200,
  });
  assert.equal(good.emailHint, 'ruth@gmail.com');
  const noGifts = validateDetailsStep(
    { name: 'Ruth', email: 'ruth@example.org', confirmEmail: 'ruth@example.org', giftChoice: '500' },
    { ticketing: { ...ticketing, namesRequired: false, giftsEnabled: false }, ticketCount: 1 },
  );
  assert.deepEqual(!noGifts.ok && noGifts.errors, { gift: 'invalid' });
  const invalid = validateDetailsStep(
    { name: 'R', email: 'nope', confirmEmail: 'nope' },
    { ticketing: { ...ticketing, namesRequired: false }, ticketCount: 1 },
  );
  assert.deepEqual(!invalid.ok && invalid.errors, { email: 'invalid' });
});

test('quoteOrder prices on the server with every review line and the seller', async () => {
  const t = await setup({ flow: 'gamo_collects', giftsEnabled: true });
  t.exec(
    `INSERT INTO fee_settings (id, fixed_cents, percent_bps, reason, effective_at) VALUES ('fee_test', 50, 0, 'test', ${PAID_NOW - 10})`,
  );
  await createEventCode(t.db, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    form: { code: 'FIVE', kind: 'promo', discountKind: 'amount', amountOff: '5' },
    now: PAID_NOW,
  });
  const q = await quoteOrder(
    t.db,
    PAID_ENV,
    {
      eventId: 'evt_1',
      occurrenceId: 'occ_1',
      lines: [{ ticketTypeId: 'tty_general_1', quantity: 2 }],
      code: 'five',
      giftCents: 1000,
      now: PAID_NOW,
    },
    { quoteOnly: true },
  );
  assert.equal(q.priced.totalCents, 4000 - 500 + 100 + 1000);
  assert.deepEqual(
    q.lines.map((l) => [l.kind, l.label, l.amountCents]),
    [
      ['ticket', 'General', 4000],
      ['discount', 'Discount', -500],
      ['fee', 'Gamo service fee', 100],
      ['gift', 'Gift to Grace Church 1', 1000],
    ],
  );
  assert.equal(q.sellerLabel, 'Gamo Studios on behalf of Grace Church 1');
  assert.equal(q.code, 'FIVE');
  // Without quoteOnly the buyer is required, as on Pay.
  await assert.rejects(
    quoteOrder(t.db, PAID_ENV, {
      eventId: 'evt_1',
      occurrenceId: 'occ_1',
      lines: [{ ticketTypeId: 'tty_general_1', quantity: 1 }],
      now: PAID_NOW,
    }),
    (e: PaidError) => e.detail === 'name',
  );
  assert.equal(sellerLabelOf('organization', 'Grace'), 'Grace');
  assert.equal((await readEventTicketing(t.db, 'evt_1'))?.giftsEnabled, true);
});

test('checkoutLineItems: totals always equal the order total, uneven discounts become one line', () => {
  const fee = { v: 1 as const, feeSettingId: 'f', fixedCents: 30, percentBps: 0, payer: 'buyer' as const };
  const lines = [
    { ticketTypeId: 'tty_a', name: 'General', unitPriceCents: 2000, quantity: 3, peoplePerTicket: 1 },
    { ticketTypeId: 'tty_b', name: 'VIP', unitPriceCents: 5000, quantity: 2, peoplePerTicket: 1 },
  ];
  const priced = priceOrder({
    lines,
    discount: { kind: 'amount', amountOffCents: 1000, percentOff: null, ticketTypeIds: null },
    fee,
    giftCents: 500,
    chargeFee: true,
  });
  const items = checkoutLineItems(priced, 'Grace');
  assert.equal(
    items.reduce((s, i) => s + i.unitAmountCents * i.quantity, 0),
    priced.totalCents,
  );
  assert.ok(items.some((i) => i.name === 'Gamo service fee'));
  assert.ok(items.some((i) => i.name === 'Gift to Grace'));
  assert.ok(items.some((i) => i.quantity === 1 && i.name.includes('×')));
  const even = priceOrder({
    lines,
    discount: { kind: 'percent', percentOff: 10, amountOffCents: null, ticketTypeIds: null },
    fee: { ...fee, payer: 'organizer' },
    giftCents: 0,
    chargeFee: true,
  });
  const evenItems = checkoutLineItems(even, 'Grace');
  assert.deepEqual(evenItems, [
    { name: 'General', unitAmountCents: 1800, quantity: 3 },
    { name: 'VIP', unitAmountCents: 4500, quantity: 2 },
  ]);
  assert.deepEqual(
    reviewLines(even, 'Grace').map((l) => l.kind),
    ['ticket', 'ticket', 'discount'],
  );
});

test('startOnlineCheckout (Mode A): reserves, creates the session with signed return link, stores session and payment', async () => {
  const t = await setup();
  const { routing, calls } = fakeRouting('organizer_account', 'acct_test_1');
  const res = await startOnlineCheckout(t.db, PAID_ENV, {
    input: {
      eventId: 'evt_1',
      occurrenceId: 'occ_1',
      lines: [{ ticketTypeId: 'tty_general_1', quantity: 2 }],
      ...buyer,
      now: PAID_NOW,
    },
    routing,
    origin: 'https://live.gamostudio.org/',
    eventTitle: 'Gospel Night 1',
    now: PAID_NOW,
  });
  assert.equal(res.kind, 'redirect');
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.expiresAt, PAID_NOW + CHECKOUT_SESSION_SECONDS);
  assert.equal(call.cancelUrl, 'https://live.gamostudio.org/events/gospel-night-1/tickets');
  assert.deepEqual(call.lines, [{ name: 'General', unitAmountCents: 2000, quantity: 2 }]);
  assert.equal(call.customerEmail, 'ruth@example.org');
  const token = call.successUrl.replace('https://live.gamostudio.org/orders/return/', '');
  assert.equal(await verifyOrderToken(PAID_ENV, token, PAID_NOW), res.orderId);
  const [o] = await allRows<{ checkout_session_id: string; status: string }>(t.db, {
    sql: 'SELECT checkout_session_id, status FROM orders WHERE id = ?1',
    params: [res.orderId],
  });
  assert.deepEqual({ ...o }, { checkout_session_id: 'cs_test_1', status: 'pending' });
  const pays = await allRows<Record<string, unknown>>(t.db, {
    sql: 'SELECT kind, provider_ref, stripe_account_id, amount_cents, status FROM payments WHERE order_id = ?1',
    params: [res.orderId],
  });
  assert.deepEqual(
    pays.map((p) => ({ ...p })),
    [
      {
        kind: 'checkout_session',
        provider_ref: 'cs_test_1',
        stripe_account_id: 'acct_test_1',
        amount_cents: 4000,
        status: 'pending',
      },
    ],
  );
});

test('a definite Stripe refusal releases the order; a network error leaves the hold to expire', async () => {
  const t = await setup();
  const args = (routing: PaymentRouting) => ({
    input: {
      eventId: 'evt_1',
      occurrenceId: 'occ_1',
      lines: [{ ticketTypeId: 'tty_general_1', quantity: 2 }],
      ...buyer,
      now: PAID_NOW,
    },
    routing,
    origin: 'https://live.gamostudio.org',
    eventTitle: 'Gospel Night 1',
    now: PAID_NOW,
  });
  await assert.rejects(
    startOnlineCheckout(
      t.db,
      PAID_ENV,
      args(
        fakeRouting('organizer_account', 'acct_test_1', new StripeApiError(400, 'parameter_invalid')).routing,
      ),
    ),
    (e: PaidError) => e.code === 'stripe_error' && e.detail === 'parameter_invalid',
  );
  const taken = async () =>
    (
      await allRows<{ online_taken: number }>(t.db, {
        sql: "SELECT online_taken FROM ticket_inventory WHERE ticket_type_id = 'tty_general_1'",
        params: [],
      })
    )[0].online_taken;
  assert.equal(await taken(), 0);
  await assert.rejects(
    startOnlineCheckout(
      t.db,
      PAID_ENV,
      args(fakeRouting('organizer_account', 'acct_test_1', new StripeApiError(503, null)).routing),
    ),
    (e: Error) => e instanceof StripeApiError,
  );
  assert.equal(await taken(), 2);
  await assert.rejects(
    startOnlineCheckout(
      t.db,
      PAID_ENV,
      args(fakeRouting('organizer_account', 'acct_test_1', new Error('network')).routing),
    ),
    /network/,
  );
  assert.equal(await taken(), 4);
  // A routing for another mode or account never charges: the order is released.
  await assert.rejects(
    startOnlineCheckout(t.db, PAID_ENV, args(fakeRouting('gamo_collects', null).routing)),
    (e: PaidError) => e.code === 'payments_unavailable' && e.detail === 'routing_mismatch',
  );
  assert.equal(await taken(), 4);
});

test('Mode B checkout charges on Gamo’s account and passes the fee as a line when passed on', async () => {
  const t = await setup({ flow: 'gamo_collects' });
  t.exec(
    `INSERT INTO fee_settings (id, fixed_cents, percent_bps, reason, effective_at) VALUES ('fee_test', 99, 0, 'test', ${PAID_NOW - 10})`,
  );
  const { routing, calls } = fakeRouting('gamo_collects', null);
  const res = await startOnlineCheckout(t.db, PAID_ENV, {
    input: {
      eventId: 'evt_1',
      occurrenceId: 'occ_1',
      lines: [{ ticketTypeId: 'tty_vip_1', quantity: 1 }],
      ...buyer,
      now: PAID_NOW,
    },
    routing,
    origin: 'https://live.gamostudio.org',
    eventTitle: 'Gospel Night 1',
    now: PAID_NOW,
  });
  assert.equal(res.kind, 'redirect');
  assert.deepEqual(calls[0].lines, [
    { name: 'VIP', unitAmountCents: 5000, quantity: 1 },
    { name: 'Gamo service fee', unitAmountCents: 99, quantity: 1 },
  ]);
  assert.equal(calls[0].gamoFeeCents, 99);
});

test('an order that costs nothing is paid at once without Stripe', async () => {
  const t = await setup({});
  await createEventCode(t.db, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    form: { code: 'FREEBIE', kind: 'promo', discountKind: 'percent', percentOff: '100' },
    now: PAID_NOW,
  });
  const { routing, calls } = fakeRouting('organizer_account', 'acct_test_1');
  const res = await startOnlineCheckout(t.db, PAID_ENV, {
    input: {
      eventId: 'evt_1',
      occurrenceId: 'occ_1',
      lines: [{ ticketTypeId: 'tty_general_1', quantity: 1 }],
      code: 'freebie',
      ...buyer,
      now: PAID_NOW,
    },
    routing,
    origin: 'https://live.gamostudio.org',
    eventTitle: 'Gospel Night 1',
    now: PAID_NOW,
  });
  assert.equal(res.kind, 'free');
  assert.equal(calls.length, 0);
  assert.equal(
    res.kind === 'free' && (await verifyOrderToken(PAID_ENV, res.orderToken, PAID_NOW)),
    res.orderId,
  );
  const [o] = await allRows<{ status: string; payment_method: string; total_cents: number }>(t.db, {
    sql: 'SELECT status, payment_method, total_cents FROM orders WHERE id = ?1',
    params: [res.orderId],
  });
  assert.deepEqual({ ...o }, { status: 'paid', payment_method: 'free', total_cents: 0 });
  assert.equal(
    (await allRows(t.db, { sql: 'SELECT id FROM tickets WHERE order_id = ?1', params: [res.orderId] }))
      .length,
    1,
  );
});

test('holding seats is rate limited per IP address (and per email), so a script cannot hold an event for nobody', async () => {
  const t = await setup();
  const { routing } = fakeRouting('organizer_account', 'acct_test_1');
  const start = (n: number) =>
    startOnlineCheckout(t.db, PAID_ENV, {
      input: {
        eventId: 'evt_1',
        occurrenceId: 'occ_1',
        lines: [{ ticketTypeId: 'tty_general_1', quantity: 1 }],
        ...buyer,
        buyerEmail: `buyer${n}@example.org`,
        now: PAID_NOW,
      },
      routing,
      origin: 'https://live.gamostudio.org',
      eventTitle: 'Gospel Night 1',
      ipHash: 'a'.repeat(64),
      now: PAID_NOW,
    });
  for (let n = 0; n < CHECKOUT_RATE_LIMITS.perIpPerTenMinutes; n += 1)
    assert.equal((await start(n)).kind, 'redirect');
  await assert.rejects(start(99), (e: unknown) => e instanceof PaidError && e.code === 'rate_limited');
});
