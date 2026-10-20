import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allRows } from '../security/sql-database.ts';
import { createEventCode } from './codes.ts';
import {
  issueCompOrder,
  listEventOrders,
  markOrderPaid,
  orderCounts,
  ordersCsv,
  getOrderDetail,
  releaseExpiredOrders,
  releaseOrder,
  reserveOrder,
  voidPreviewOrder,
} from './orders.ts';
import {
  PAID_ENV,
  PAID_NOW,
  paidTestDatabase,
  seedPaidEvent,
  type SeedPaidEventOptions,
} from './paid-testing.ts';
import { ORDER_HOLD_SECONDS, PaidError, type ReserveOrderInput } from './paid-types.ts';

async function setup(options: SeedPaidEventOptions = { flow: 'organizer_account' }) {
  const { d1, db } = await paidTestDatabase();
  const seed = seedPaidEvent(d1, options);
  const exec = (sql: string) => d1.sqlite.exec(sql);
  const one = async <T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]) =>
    (await allRows<T>(db, { sql, params }))[0];
  const all = async <T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]) =>
    allRows<T>(db, { sql, params });
  const online = (extra: Partial<ReserveOrderInput> = {}): ReserveOrderInput => ({
    eventId: seed.eventId,
    occurrenceId: seed.occurrenceId,
    channel: 'online',
    paymentMethod: 'card_online',
    lines: [{ ticketTypeId: seed.generalTypeId, quantity: 2 }],
    buyerName: 'Ruth Bekele',
    buyerEmail: 'Ruth@Example.org',
    now: PAID_NOW,
    ...extra,
  });
  const inv = (typeId: string) =>
    one<{ online_taken: number; door_taken: number }>(
      'SELECT online_taken, door_taken FROM ticket_inventory WHERE ticket_type_id = ?1 AND occurrence_id = ?2',
      typeId,
      seed.occurrenceId,
    );
  const people = async () =>
    (await one<{ people_taken: number }>(
      'SELECT people_taken FROM occurrence_inventory WHERE occurrence_id = ?1',
      seed.occurrenceId,
    ))!.people_taken;
  return { d1, db, seed, exec, one, all, online, inv, people };
}

async function rejects(promise: Promise<unknown>, code: string, detail?: string) {
  await assert.rejects(promise, (e: unknown) => {
    assert.ok(e instanceof PaidError, String(e));
    assert.equal(e.code, code);
    if (detail !== undefined) assert.equal(e.detail, detail);
    return true;
  });
}

const sessionFor = async (
  t: Awaited<ReturnType<typeof setup>>,
  orderId: string,
  session = `cs_test_${orderId}`,
) => {
  t.exec(`UPDATE orders SET checkout_session_id = '${session}' WHERE id = '${orderId}'`);
  return session;
};

test('Mode A: a pending online order holds the seats, snapshots the seller and the account, keeps the email lower case', async () => {
  const t = await setup();
  const r = await reserveOrder(t.db, PAID_ENV, t.online());
  assert.equal(r.status, 'pending');
  assert.equal(r.seller, 'organization');
  assert.equal(r.fundsFlow, 'organizer_account');
  assert.equal(r.stripeAccountId, 'acct_test_1');
  assert.equal(r.holdExpiresAt, PAID_NOW + ORDER_HOLD_SECONDS);
  assert.equal(r.priced.totalCents, 4000);
  assert.match(r.reference, /^GL-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal((await t.inv(t.seed.generalTypeId))!.online_taken, 2);
  assert.equal(await t.people(), 2);
  const o = await t.one<Record<string, unknown>>('SELECT * FROM orders WHERE id = ?1', r.orderId);
  assert.equal(o!.buyer_email, 'ruth@example.org');
  assert.match(String(o!.email_hash), /^[0-9a-f]{64}$/);
  assert.equal(o!.seller, 'organization');
  assert.equal(o!.stripe_account_id, 'acct_test_1');
  const policy = JSON.parse(String(o!.policy_snapshot));
  assert.equal(policy.refundPolicy, 'until_hours_before');
  assert.equal(policy.refundHours, 48);
  const fee = JSON.parse(String(o!.fee_snapshot));
  assert.deepEqual([fee.feeSettingId, fee.payer], ['fee_initial', 'buyer']);
  const items = await t.all('SELECT * FROM order_items WHERE order_id = ?1', r.orderId);
  assert.equal(items.length, 1);
  assert.equal(items[0].unit_price_cents, 2000);
});

test('Mode B: Gamo is the seller and the charge is on Gamo’s own account', async () => {
  const t = await setup({ flow: 'gamo_collects' });
  const r = await reserveOrder(t.db, PAID_ENV, t.online());
  assert.equal(r.seller, 'gamo');
  assert.equal(r.fundsFlow, 'gamo_collects');
  assert.equal(r.stripeAccountId, null);
  const o = await t.one('SELECT seller, stripe_account_id, funds_flow FROM orders WHERE id = ?1', r.orderId);
  assert.deepEqual({ ...o }, { seller: 'gamo', stripe_account_id: null, funds_flow: 'gamo_collects' });
});

test('card sales are refused with the reason when payments are not available', async () => {
  const none = await setup({});
  await rejects(reserveOrder(none.db, PAID_ENV, none.online()), 'payments_unavailable', 'mode_not_chosen');
  const notReady = await setup({ flow: 'organizer_account', accountReady: false });
  await rejects(
    reserveOrder(notReady.db, PAID_ENV, notReady.online()),
    'payments_unavailable',
    'account_not_ready',
  );
  const missing = await setup({ flow: 'gamo_collects' });
  missing.exec("DELETE FROM organization_payments WHERE organization_id = 'org_1'");
  await rejects(
    reserveOrder(missing.db, PAID_ENV, missing.online()),
    'payments_unavailable',
    'account_missing',
  );
  const t = await setup();
  await rejects(
    reserveOrder(t.db, { ENVIRONMENT: 'local' }, t.online()),
    'payments_unavailable',
    'stripe_not_configured',
  );
  await rejects(
    reserveOrder(t.db, { ENVIRONMENT: 'local', STRIPE_SECRET_KEY: 'sk_test_123' }, t.online()),
    'payments_unavailable',
    'webhook_missing',
  );
  await rejects(
    reserveOrder(
      t.db,
      { ENVIRONMENT: 'local', STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_WEBHOOK_SECRET: 'whsec_platform' },
      t.online(),
    ),
    'payments_unavailable',
    'connect_webhook_missing',
  );
  // Nothing was reserved by any of them.
  assert.equal((await t.inv(t.seed.generalTypeId))!.online_taken, 0);
});

test('cash and comp do not need card payments; cash at the door holds nothing and admits on payment', async () => {
  const t = await setup({});
  const r = await reserveOrder(t.db, PAID_ENV, {
    ...t.online({ channel: 'door', paymentMethod: 'cash', buyerName: null, buyerEmail: null, giftCents: 0 }),
  });
  assert.equal(r.holdExpiresAt, null);
  assert.equal(r.fundsFlow, null);
  assert.equal(r.priced.feeCents, 0);
  assert.equal((await t.inv(t.seed.generalTypeId))!.door_taken, 2);
  const paid = await markOrderPaid(t.db, PAID_ENV, {
    orderId: r.orderId,
    amountCents: 4000,
    currency: 'usd',
    providerRef: null,
    stripeAccountId: null,
    admit: true,
    admittedBy: 'stf_door',
    now: PAID_NOW + 5,
  });
  assert.equal(paid.outcome, 'paid');
  const tickets = await t.all<{ checked_in_at: number; checked_in_by: string; holder_name: string | null }>(
    'SELECT checked_in_at, checked_in_by, holder_name FROM tickets WHERE order_id = ?1',
    r.orderId,
  );
  assert.equal(tickets.length, 2);
  assert.ok(tickets.every((x) => x.checked_in_at === PAID_NOW + 5 && x.checked_in_by === 'stf_door'));
  const ledger = await t.all<{ entry_type: string; amount_cents: number; held_by: string }>(
    'SELECT entry_type, amount_cents, held_by FROM ledger_entries WHERE order_id = ?1',
    r.orderId,
  );
  assert.deepEqual(
    ledger.map((l) => ({ ...l })),
    [{ entry_type: 'cash_sale', amount_cents: 4000, held_by: 'organization' }],
  );
  const pay = await t.all('SELECT kind, status FROM payments WHERE order_id = ?1', r.orderId);
  assert.deepEqual(
    pay.map((p) => ({ ...p })),
    [{ kind: 'cash', status: 'succeeded' }],
  );
});

test('a hidden type needs an access code that names it', async () => {
  const t = await setup();
  t.exec(`UPDATE ticket_types SET status = 'hidden' WHERE id = '${t.seed.vipTypeId}'`);
  const vip = { lines: [{ ticketTypeId: t.seed.vipTypeId, quantity: 1 }] };
  await rejects(reserveOrder(t.db, PAID_ENV, t.online(vip)), 'not_on_sale', 'hidden');
  await createEventCode(t.db, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    form: { code: 'presale', kind: 'access', ticketTypeIds: [t.seed.vipTypeId] },
    now: PAID_NOW,
  });
  const r = await reserveOrder(t.db, PAID_ENV, t.online({ ...vip, code: ' Presale ' }));
  assert.equal(r.priced.totalCents, 5000);
  const ended = await setup();
  ended.exec(`UPDATE ticket_types SET status = 'ended' WHERE id = '${ended.seed.generalTypeId}'`);
  await rejects(reserveOrder(ended.db, PAID_ENV, ended.online()), 'not_on_sale', 'ended');
});

test('sales windows: not started and closed are refused online; past dates are closed', async () => {
  const t = await setup();
  t.exec(`UPDATE ticket_types SET sales_start_at = ${PAID_NOW + 60} WHERE id = '${t.seed.generalTypeId}'`);
  await rejects(reserveOrder(t.db, PAID_ENV, t.online()), 'not_on_sale', 'sales_not_started');
  t.exec(
    `UPDATE ticket_types SET sales_start_at = NULL, sales_end_at = ${PAID_NOW} WHERE id = '${t.seed.generalTypeId}'`,
  );
  await rejects(reserveOrder(t.db, PAID_ENV, t.online()), 'not_on_sale', 'sales_ended');

  const past = await setup({ flow: 'organizer_account', startsAt: PAID_NOW - 3600 });
  await rejects(reserveOrder(past.db, PAID_ENV, past.online()), 'closed_past');
  // The door may still sell during the check-in window (12 hours after the start).
  const door = await reserveOrder(past.db, PAID_ENV, past.online({ channel: 'door', paymentMethod: 'cash' }));
  assert.equal(door.status, 'pending');
  const long = await setup({ flow: 'organizer_account', startsAt: PAID_NOW - 13 * 3600 });
  await rejects(
    reserveOrder(long.db, PAID_ENV, long.online({ channel: 'door', paymentMethod: 'cash' })),
    'closed_past',
  );
});

test('per-type and per-order limits', async () => {
  const t = await setup();
  await rejects(
    reserveOrder(t.db, PAID_ENV, t.online({ lines: [{ ticketTypeId: t.seed.vipTypeId, quantity: 5 }] })),
    'limit_exceeded',
    t.seed.vipTypeId,
  );
  t.exec("UPDATE event_ticketing SET max_tickets_per_order = 3 WHERE event_id = 'evt_1'");
  await rejects(
    reserveOrder(
      t.db,
      PAID_ENV,
      t.online({
        lines: [
          { ticketTypeId: t.seed.generalTypeId, quantity: 2 },
          { ticketTypeId: t.seed.vipTypeId, quantity: 2 },
        ],
      }),
    ),
    'limit_exceeded',
    'order',
  );
  // Repeated lines of one type are merged before the limit is checked.
  await rejects(
    reserveOrder(
      t.db,
      PAID_ENV,
      t.online({
        lines: [
          { ticketTypeId: t.seed.vipTypeId, quantity: 2 },
          { ticketTypeId: t.seed.vipTypeId, quantity: 3 },
        ],
      }),
    ),
    'limit_exceeded',
  );
});

test('door sales need the event setting and the platform switch', async () => {
  const off = await setup({ flow: 'organizer_account', doorSalesEnabled: false });
  await rejects(
    reserveOrder(off.db, PAID_ENV, off.online({ channel: 'door', paymentMethod: 'cash' })),
    'not_on_sale',
    'door_sales_off',
  );
  const platform = await setup();
  platform.exec('UPDATE payment_settings SET door_sales_enabled = 0 WHERE id = 1');
  await rejects(
    reserveOrder(platform.db, PAID_ENV, platform.online({ channel: 'door', paymentMethod: 'cash' })),
    'not_on_sale',
    'door_sales_off',
  );
  await rejects(
    reserveOrder(platform.db, PAID_ENV, platform.online({ channel: 'door', paymentMethod: 'card_online' })),
    'invalid',
    'payment_method',
  );
});

test('a promo code is used once per order, refused when used up, and given back when the hold expires', async () => {
  const t = await setup();
  await createEventCode(t.db, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    form: { code: 'GRACE10', kind: 'promo', discountKind: 'percent', percentOff: '10', maxUses: '1' },
    now: PAID_NOW,
  });
  const first = await reserveOrder(t.db, PAID_ENV, t.online({ code: 'grace10' }));
  assert.equal(first.priced.discountCents, 400);
  assert.equal(first.priced.totalCents, 3600);
  await rejects(reserveOrder(t.db, PAID_ENV, t.online({ code: 'GRACE10' })), 'code_used_up');
  await rejects(reserveOrder(t.db, PAID_ENV, t.online({ code: 'NOPE' })), 'code_invalid');
  // After the first hold expires its use comes back, and the next order can use the code.
  const later = PAID_NOW + ORDER_HOLD_SECONDS + 1;
  const second = await reserveOrder(t.db, PAID_ENV, t.online({ code: 'GRACE10', now: later }));
  assert.equal(second.priced.discountCents, 400);
  const first2 = await t.one<{ status: string }>('SELECT status FROM orders WHERE id = ?1', first.orderId);
  assert.equal(first2!.status, 'expired');
  assert.equal(
    (await t.one<{ uses: number }>("SELECT uses FROM event_codes WHERE code = 'GRACE10'"))!.uses,
    1,
  );
});

test('two buyers racing for the last seat: exactly one wins, the other is sold out and holds nothing', async () => {
  const t = await setup();
  t.exec(`UPDATE ticket_types SET capacity = 1 WHERE id = '${t.seed.generalTypeId}'`);
  t.exec(`UPDATE ticket_inventory SET capacity = 1 WHERE ticket_type_id = '${t.seed.generalTypeId}'`);
  const one = { lines: [{ ticketTypeId: t.seed.generalTypeId, quantity: 1 }] };
  const results = await Promise.allSettled([
    reserveOrder(t.db, PAID_ENV, t.online({ ...one, buyerEmail: 'a@example.org' })),
    reserveOrder(t.db, PAID_ENV, t.online({ ...one, buyerEmail: 'b@example.org' })),
  ]);
  const won = results.filter((r) => r.status === 'fulfilled');
  const lost = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  assert.equal(won.length, 1);
  assert.equal(lost.length, 1);
  assert.equal((lost[0].reason as PaidError).code, 'sold_out');
  assert.equal((await t.inv(t.seed.generalTypeId))!.online_taken, 1);
  assert.equal(await t.people(), 1);
  assert.equal((await t.all('SELECT id FROM orders')).length, 1);
});

test('a multi-line order that fails on one line reserves nothing', async () => {
  const t = await setup();
  // VIP: 10 per date, 2 held for the door → 8 online. Take 7.
  t.exec(`UPDATE ticket_inventory SET online_taken = 7 WHERE ticket_type_id = '${t.seed.vipTypeId}'`);
  await rejects(
    reserveOrder(
      t.db,
      PAID_ENV,
      t.online({
        lines: [
          { ticketTypeId: t.seed.generalTypeId, quantity: 2 },
          { ticketTypeId: t.seed.vipTypeId, quantity: 2 },
        ],
      }),
    ),
    'sold_out',
  );
  assert.equal((await t.inv(t.seed.generalTypeId))!.online_taken, 0);
  assert.equal((await t.inv(t.seed.vipTypeId))!.online_taken, 7);
  assert.equal(await t.people(), 0);
  assert.equal((await t.all('SELECT id FROM orders')).length, 0);
  assert.equal((await t.all('SELECT id FROM order_items')).length, 0);
});

test('the event capacity in people caps every type per date (group packs count each person)', async () => {
  const t = await setup({ flow: 'organizer_account', eventCapacity: 5 });
  t.exec(`UPDATE ticket_types SET people_per_ticket = 4 WHERE id = '${t.seed.vipTypeId}'`);
  await reserveOrder(t.db, PAID_ENV, t.online({ lines: [{ ticketTypeId: t.seed.vipTypeId, quantity: 1 }] }));
  assert.equal(await t.people(), 4);
  await rejects(reserveOrder(t.db, PAID_ENV, t.online()), 'sold_out');
  await reserveOrder(
    t.db,
    PAID_ENV,
    t.online({ lines: [{ ticketTypeId: t.seed.generalTypeId, quantity: 1 }] }),
  );
  assert.equal(await t.people(), 5);
});

test('expired holds are released (on the next reservation and by releaseExpiredOrders), payments marked expired', async () => {
  const t = await setup();
  const a = await reserveOrder(t.db, PAID_ENV, t.online());
  await t.exec(
    `INSERT INTO payments (id, order_id, kind, provider_ref, amount_cents, status) VALUES ('pay_a', '${a.orderId}', 'checkout_session', 'cs_a', 4000, 'pending')`,
  );
  assert.equal((await releaseExpiredOrders(t.db, PAID_NOW + ORDER_HOLD_SECONDS - 1)).released, 0);
  assert.equal((await releaseExpiredOrders(t.db, PAID_NOW + ORDER_HOLD_SECONDS)).released, 1);
  assert.equal((await t.inv(t.seed.generalTypeId))!.online_taken, 0);
  assert.equal(await t.people(), 0);
  assert.equal(
    (await t.one<{ status: string }>("SELECT status FROM payments WHERE id = 'pay_a'"))!.status,
    'expired',
  );
  assert.equal((await releaseExpiredOrders(t.db, PAID_NOW + 2 * ORDER_HOLD_SECONDS)).released, 0);
});

test('releaseOrder: failed cancels a pending order and frees the seats; a paid order is not released', async () => {
  const t = await setup();
  const a = await reserveOrder(t.db, PAID_ENV, t.online());
  assert.deepEqual(await releaseOrder(t.db, { orderId: a.orderId, reason: 'failed', now: PAID_NOW + 1 }), {
    released: true,
  });
  assert.equal(
    (await t.one<{ status: string }>('SELECT status FROM orders WHERE id = ?1', a.orderId))!.status,
    'canceled',
  );
  assert.equal((await t.inv(t.seed.generalTypeId))!.online_taken, 0);
  assert.deepEqual(await releaseOrder(t.db, { orderId: a.orderId, reason: 'canceled', now: PAID_NOW + 2 }), {
    released: false,
  });
  const b = await reserveOrder(t.db, PAID_ENV, t.online());
  const session = await sessionFor(t, b.orderId);
  await markOrderPaid(t.db, PAID_ENV, {
    orderId: b.orderId,
    amountCents: 4000,
    currency: 'usd',
    providerRef: session,
    stripeAccountId: 'acct_test_1',
    now: PAID_NOW + 3,
  });
  assert.deepEqual(await releaseOrder(t.db, { orderId: b.orderId, reason: 'expired', now: PAID_NOW + 4 }), {
    released: false,
  });
  assert.deepEqual(await releaseOrder(t.db, { orderId: b.orderId, reason: 'voided', now: PAID_NOW + 4 }), {
    released: false,
  });
  assert.equal((await t.inv(t.seed.generalTypeId))!.online_taken, 2);
});

test('markOrderPaid issues one ticket per seat once; the second call is already_paid', async () => {
  const t = await setup();
  const r = await reserveOrder(t.db, PAID_ENV, t.online());
  const session = await sessionFor(t, r.orderId);
  const input = {
    orderId: r.orderId,
    amountCents: 4000,
    currency: 'USD',
    providerRef: session,
    stripeAccountId: 'acct_test_1',
    paymentIntentId: 'pi_1',
    now: PAID_NOW + 60,
  };
  const first = await markOrderPaid(t.db, PAID_ENV, input);
  assert.equal(first.outcome, 'paid');
  assert.equal(first.outcome === 'paid' && first.ticketIds.length, 2);
  const again = await markOrderPaid(t.db, PAID_ENV, input);
  assert.deepEqual(again, { outcome: 'already_paid', orderId: r.orderId });
  const tickets = await t.all<{
    seq: number;
    credential_salt: string;
    credential_version: number;
    holder_name: string;
  }>(
    'SELECT seq, credential_salt, credential_version, holder_name FROM tickets WHERE order_id = ?1 ORDER BY seq',
    r.orderId,
  );
  assert.deepEqual(
    tickets.map((x) => x.seq),
    [1, 2],
  );
  assert.ok(tickets.every((x) => /^[0-9A-Z]{26}$/.test(x.credential_salt) && x.credential_version === 1));
  assert.equal(tickets[0].holder_name, 'Ruth Bekele');
  const o = await t.one<Record<string, unknown>>(
    'SELECT status, paid_at, hold_expires_at, payment_intent_id FROM orders WHERE id = ?1',
    r.orderId,
  );
  assert.deepEqual(
    { ...o },
    { status: 'paid', paid_at: PAID_NOW + 60, hold_expires_at: null, payment_intent_id: 'pi_1' },
  );
  assert.equal((await t.all('SELECT id FROM ledger_entries WHERE order_id = ?1', r.orderId)).length, 1);
  // Paid seats stay counted.
  assert.equal((await t.inv(t.seed.generalTypeId))!.online_taken, 2);
  assert.equal(
    (await markOrderPaid(t.db, PAID_ENV, { ...input, orderId: 'ord_missing' })).outcome,
    'not_found',
  );
});

test('amount, currency, account or reference mismatches never issue tickets', async () => {
  const t = await setup();
  const r = await reserveOrder(t.db, PAID_ENV, t.online());
  const session = await sessionFor(t, r.orderId);
  const base = {
    orderId: r.orderId,
    amountCents: 4000,
    currency: 'usd',
    providerRef: session,
    stripeAccountId: 'acct_test_1',
    now: PAID_NOW + 1,
  };
  assert.deepEqual(await markOrderPaid(t.db, PAID_ENV, { ...base, amountCents: 3999 }), {
    outcome: 'mismatch',
    orderId: r.orderId,
    reason: 'amount',
  });
  assert.deepEqual(await markOrderPaid(t.db, PAID_ENV, { ...base, currency: 'eur' }), {
    outcome: 'mismatch',
    orderId: r.orderId,
    reason: 'currency',
  });
  assert.deepEqual(await markOrderPaid(t.db, PAID_ENV, { ...base, stripeAccountId: null }), {
    outcome: 'mismatch',
    orderId: r.orderId,
    reason: 'account',
  });
  assert.deepEqual(await markOrderPaid(t.db, PAID_ENV, { ...base, stripeAccountId: 'acct_other' }), {
    outcome: 'mismatch',
    orderId: r.orderId,
    reason: 'account',
  });
  assert.deepEqual(await markOrderPaid(t.db, PAID_ENV, { ...base, providerRef: 'cs_other' }), {
    outcome: 'mismatch',
    orderId: r.orderId,
    reason: 'reference',
  });
  assert.deepEqual(await markOrderPaid(t.db, PAID_ENV, { ...base, providerRef: null }), {
    outcome: 'mismatch',
    orderId: r.orderId,
    reason: 'reference',
  });
  assert.equal((await t.all('SELECT id FROM tickets')).length, 0);
  assert.equal(
    (await t.one<{ status: string }>('SELECT status FROM orders WHERE id = ?1', r.orderId))!.status,
    'pending',
  );
});

test('paid after the hold expired: seats taken again when available, otherwise paid_unfulfilled with the money recorded', async () => {
  const t = await setup();
  const r = await reserveOrder(t.db, PAID_ENV, t.online());
  const session = await sessionFor(t, r.orderId);
  await releaseExpiredOrders(t.db, PAID_NOW + ORDER_HOLD_SECONDS);
  assert.equal((await t.inv(t.seed.generalTypeId))!.online_taken, 0);
  const paid = await markOrderPaid(t.db, PAID_ENV, {
    orderId: r.orderId,
    amountCents: 4000,
    currency: 'usd',
    providerRef: session,
    stripeAccountId: 'acct_test_1',
    now: PAID_NOW + ORDER_HOLD_SECONDS + 10,
  });
  assert.equal(paid.outcome, 'paid');
  assert.equal((await t.inv(t.seed.generalTypeId))!.online_taken, 2);
  assert.equal(await t.people(), 2);
  assert.equal((await t.all('SELECT id FROM tickets WHERE order_id = ?1', r.orderId)).length, 2);

  const u = await setup();
  u.exec(`UPDATE ticket_types SET capacity = 2 WHERE id = '${u.seed.generalTypeId}'`);
  u.exec(`UPDATE ticket_inventory SET capacity = 2 WHERE ticket_type_id = '${u.seed.generalTypeId}'`);
  const lost = await reserveOrder(u.db, PAID_ENV, u.online());
  const s2 = await sessionFor(u, lost.orderId);
  // The hold expires and someone else buys both seats.
  await reserveOrder(
    u.db,
    PAID_ENV,
    u.online({ buyerEmail: 'other@example.org', now: PAID_NOW + ORDER_HOLD_SECONDS + 1 }),
  );
  const late = await markOrderPaid(u.db, PAID_ENV, {
    orderId: lost.orderId,
    amountCents: 4000,
    currency: 'usd',
    providerRef: s2,
    stripeAccountId: 'acct_test_1',
    now: PAID_NOW + ORDER_HOLD_SECONDS + 20,
  });
  assert.deepEqual(late, { outcome: 'unfulfilled', orderId: lost.orderId });
  assert.equal(
    (await u.one<{ status: string }>('SELECT status FROM orders WHERE id = ?1', lost.orderId))!.status,
    'paid_unfulfilled',
  );
  assert.equal((await u.all('SELECT id FROM tickets WHERE order_id = ?1', lost.orderId)).length, 0);
  assert.equal((await u.inv(u.seed.generalTypeId))!.online_taken, 2);
  const ledger = await u.all<{ entry_type: string; amount_cents: number }>(
    'SELECT entry_type, amount_cents FROM ledger_entries WHERE order_id = ?1',
    lost.orderId,
  );
  assert.deepEqual(
    ledger.map((l) => [l.entry_type, l.amount_cents]),
    [['ticket_sale', 4000]],
  );
  assert.deepEqual(
    await markOrderPaid(u.db, PAID_ENV, {
      orderId: lost.orderId,
      amountCents: 4000,
      currency: 'usd',
      providerRef: s2,
      stripeAccountId: 'acct_test_1',
      now: PAID_NOW + ORDER_HOLD_SECONDS + 30,
    }),
    { outcome: 'already_paid', orderId: lost.orderId },
  );
});

test('paid while the event was canceled: unfulfilled, the seats freed', async () => {
  const t = await setup();
  const r = await reserveOrder(t.db, PAID_ENV, t.online());
  const session = await sessionFor(t, r.orderId);
  t.exec("UPDATE events SET status = 'canceled' WHERE id = 'evt_1'");
  const res = await markOrderPaid(t.db, PAID_ENV, {
    orderId: r.orderId,
    amountCents: 4000,
    currency: 'usd',
    providerRef: session,
    stripeAccountId: 'acct_test_1',
    now: PAID_NOW + 1,
  });
  assert.equal(res.outcome, 'unfulfilled');
  assert.equal((await t.inv(t.seed.generalTypeId))!.online_taken, 0);
  assert.equal(
    (await t.one<{ status: string }>('SELECT status FROM orders WHERE id = ?1', r.orderId))!.status,
    'paid_unfulfilled',
  );
});

test('fees passed on and absorbed, with a gift: totals and ledger rows', async () => {
  for (const feePayer of ['buyer', 'organizer'] as const) {
    const t = await setup({ flow: 'gamo_collects', feePayer, giftsEnabled: true });
    t.exec(
      `INSERT INTO fee_settings (id, fixed_cents, percent_bps, reason, effective_at) VALUES ('fee_test', 50, 300, 'test', ${PAID_NOW - 10})`,
    );
    const r = await reserveOrder(t.db, PAID_ENV, t.online({ giftCents: 1000 }));
    // 2 × 50 + 3 % of 4000 = 220.
    assert.equal(r.priced.feeCents, 220);
    assert.equal(r.priced.totalCents, feePayer === 'buyer' ? 4000 + 220 + 1000 : 4000 + 1000);
    const session = await sessionFor(t, r.orderId);
    await markOrderPaid(t.db, PAID_ENV, {
      orderId: r.orderId,
      amountCents: r.priced.totalCents,
      currency: 'usd',
      providerRef: session,
      stripeAccountId: null,
      now: PAID_NOW + 1,
    });
    const ledger = await t.all<{
      entry_type: string;
      amount_cents: number;
      held_by: string;
      category: string;
    }>(
      'SELECT entry_type, amount_cents, held_by, category FROM ledger_entries WHERE order_id = ?1 ORDER BY source_key',
      r.orderId,
    );
    const rows = ledger.map((l) => `${l.entry_type}:${l.amount_cents}:${l.held_by}`).sort();
    const expected = ['gamo_fee:220:gamo', 'gift:1000:gamo', 'ticket_sale:4000:gamo'];
    if (feePayer === 'organizer') expected.push('ticket_sale:-220:gamo');
    assert.deepEqual(rows, expected.sort());
    const fee = JSON.parse(
      String((await t.one('SELECT fee_snapshot FROM orders WHERE id = ?1', r.orderId))!.fee_snapshot),
    );
    assert.deepEqual(fee, {
      v: 1,
      feeSettingId: 'fee_test',
      fixedCents: 50,
      percentBps: 300,
      payer: feePayer,
    });
  }
});

test('a gift needs gifts on for the event and a valid amount', async () => {
  const t = await setup();
  await rejects(reserveOrder(t.db, PAID_ENV, t.online({ giftCents: 1000 })), 'invalid', 'gift');
  const on = await setup({ flow: 'organizer_account', giftsEnabled: true });
  await rejects(reserveOrder(on.db, PAID_ENV, on.online({ giftCents: 50 })), 'invalid', 'gift');
});

test('names: buyer name and email are required online; attendee names when the event asks', async () => {
  const t = await setup({ flow: 'organizer_account', namesRequired: true });
  await rejects(reserveOrder(t.db, PAID_ENV, t.online({ buyerEmail: null })), 'invalid', 'email');
  await rejects(reserveOrder(t.db, PAID_ENV, t.online({ buyerName: ' ' })), 'invalid', 'name');
  await rejects(
    reserveOrder(t.db, PAID_ENV, t.online({ attendeeNames: ['A'] })),
    'invalid',
    'attendee_names',
  );
  const r = await reserveOrder(t.db, PAID_ENV, t.online({ attendeeNames: ['Ada Byron', 'Ben Cole'] }));
  assert.equal(r.status, 'pending');
  // The names wait on the order and go to the tickets, in order, when it is paid.
  t.exec(`UPDATE orders SET checkout_session_id = 'cs_names' WHERE id = '${r.orderId}'`);
  const paid = await markOrderPaid(t.db, PAID_ENV, {
    orderId: r.orderId,
    amountCents: r.priced.totalCents,
    currency: 'usd',
    providerRef: 'cs_names',
    stripeAccountId: r.stripeAccountId,
    now: PAID_NOW + 5,
  });
  assert.equal(paid.outcome, 'paid');
  const holders = await t.all<{ holder_name: string }>(
    'SELECT holder_name FROM tickets WHERE order_id = ?1 ORDER BY seq',
    r.orderId,
  );
  assert.deepEqual(
    holders.map((h) => h.holder_name),
    ['Ada Byron', 'Ben Cole'],
  );
});

test('comp tickets need a reason, cost nothing, carry no fee and are paid at once', async () => {
  const t = await setup({});
  t.exec(
    `INSERT INTO fee_settings (id, fixed_cents, percent_bps, reason, effective_at) VALUES ('fee_test', 50, 300, 'test', ${PAID_NOW - 10})`,
  );
  const lines = [{ ticketTypeId: t.seed.vipTypeId, quantity: 2 }];
  const comp = (compReason: string) =>
    issueCompOrder(t.db, PAID_ENV, {
      organizationId: 'org_1',
      eventId: 'evt_1',
      occurrenceId: 'occ_1',
      lines,
      compReason,
      now: PAID_NOW,
    });
  await rejects(comp('  '), 'invalid', 'comp_reason');
  await rejects(comp('x'.repeat(201)), 'invalid', 'comp_reason');
  await rejects(
    issueCompOrder(t.db, PAID_ENV, {
      organizationId: 'org_2',
      eventId: 'evt_1',
      occurrenceId: 'occ_1',
      lines,
      compReason: 'Band',
      now: PAID_NOW,
    }),
    'not_found',
  );
  const done = await comp('Worship band');
  assert.equal(done.ticketIds.length, 2);
  const o = await t.one<Record<string, unknown>>(
    'SELECT status, total_cents, fee_cents, comp_reason, payment_method, funds_flow FROM orders WHERE id = ?1',
    done.orderId,
  );
  assert.deepEqual(
    { ...o },
    {
      status: 'paid',
      total_cents: 0,
      fee_cents: 0,
      comp_reason: 'Worship band',
      payment_method: 'comp',
      funds_flow: null,
    },
  );
  assert.equal((await t.all('SELECT id FROM ledger_entries')).length, 0);
  assert.deepEqual(
    (await t.all('SELECT kind, status FROM payments WHERE order_id = ?1', done.orderId)).map((p) => ({
      ...p,
    })),
    [{ kind: 'comp', status: 'succeeded' }],
  );
});

test('preview orders: allowed on a draft by its organization, never counted, voidable', async () => {
  const t = await setup();
  t.exec("UPDATE events SET status = 'draft' WHERE id = 'evt_1'");
  await rejects(reserveOrder(t.db, PAID_ENV, t.online()), 'not_found');
  const p = await reserveOrder(t.db, PAID_ENV, t.online({ isPreview: true }));
  const session = await sessionFor(t, p.orderId);
  await markOrderPaid(t.db, PAID_ENV, {
    orderId: p.orderId,
    amountCents: 4000,
    currency: 'usd',
    providerRef: session,
    stripeAccountId: 'acct_test_1',
    now: PAID_NOW + 1,
  });
  assert.equal((await t.all('SELECT id FROM ledger_entries')).length, 0);
  assert.deepEqual(await listEventOrders(t.db, 'org_1', 'evt_1'), []);
  assert.equal((await orderCounts(t.db, 'org_1', 'evt_1')).all, 0);
  assert.equal((await listEventOrders(t.db, 'org_1', 'evt_1', { includePreview: true })).length, 1);
  await rejects(
    voidPreviewOrder(t.db, { organizationId: 'org_2', orderId: p.orderId, now: PAID_NOW + 2 }),
    'not_found',
  );
  await voidPreviewOrder(t.db, { organizationId: 'org_1', orderId: p.orderId, now: PAID_NOW + 2 });
  // A voided preview is removed with its tickets, so it never pins the draft's dates.
  assert.equal(await t.one('SELECT id FROM orders WHERE id = ?1', p.orderId), undefined);
  assert.deepEqual(await t.all('SELECT id FROM tickets WHERE order_id = ?1', p.orderId), []);
  assert.equal((await t.inv(t.seed.generalTypeId))!.online_taken, 0);
  await rejects(
    voidPreviewOrder(t.db, { organizationId: 'org_1', orderId: p.orderId, now: PAID_NOW + 3 }),
    'not_found',
  );
  t.exec("UPDATE events SET status = 'published' WHERE id = 'evt_1'");
  const real = await reserveOrder(t.db, PAID_ENV, t.online());
  await rejects(
    voidPreviewOrder(t.db, { organizationId: 'org_1', orderId: real.orderId, now: PAID_NOW + 3 }),
    'forbidden',
  );
});

test('order lists: search, filters, counts equal list lengths, detail, CSV escapes formulas', async () => {
  const t = await setup();
  const a = await reserveOrder(
    t.db,
    PAID_ENV,
    t.online({ buyerName: '=HYPERLINK("x")', buyerEmail: 'abebe@example.org' }),
  );
  const b = await reserveOrder(
    t.db,
    PAID_ENV,
    t.online({
      lines: [{ ticketTypeId: t.seed.vipTypeId, quantity: 1 }],
      buyerName: 'Sara',
      buyerEmail: 'sara@example.org',
    }),
  );
  await reserveOrder(
    t.db,
    PAID_ENV,
    t.online({ channel: 'door', paymentMethod: 'cash', buyerName: null, buyerEmail: null }),
  );
  const s = await sessionFor(t, b.orderId);
  await markOrderPaid(t.db, PAID_ENV, {
    orderId: b.orderId,
    amountCents: 5000,
    currency: 'usd',
    providerRef: s,
    stripeAccountId: 'acct_test_1',
    now: PAID_NOW + 1,
  });

  assert.equal((await listEventOrders(t.db, 'org_1', 'evt_1')).length, 3);
  assert.deepEqual(
    (await listEventOrders(t.db, 'org_1', 'evt_1', { q: 'SARA' })).map((o) => o.id),
    [b.orderId],
  );
  assert.deepEqual(
    (await listEventOrders(t.db, 'org_1', 'evt_1', { q: 'abebe@' })).map((o) => o.id),
    [a.orderId],
  );
  assert.deepEqual(
    (await listEventOrders(t.db, 'org_1', 'evt_1', { q: a.reference.toLowerCase().replace(/-/g, ' ') })).map(
      (o) => o.id,
    ),
    [a.orderId],
  );
  assert.deepEqual(
    (await listEventOrders(t.db, 'org_1', 'evt_1', { q: a.reference.replace(/-/g, '').toLowerCase() })).map(
      (o) => o.id,
    ),
    [a.orderId],
  );
  assert.deepEqual((await listEventOrders(t.db, 'org_1', 'evt_1', { q: '100%' })).length, 0);
  assert.equal((await listEventOrders(t.db, 'org_2', 'evt_1')).length, 0);

  const counts = await orderCounts(t.db, 'org_1', 'evt_1');
  assert.equal(counts.all, 3);
  for (const [status, n] of Object.entries(counts.byStatus))
    assert.equal((await listEventOrders(t.db, 'org_1', 'evt_1', { status: status as 'paid' })).length, n);
  for (const [channel, n] of Object.entries(counts.byChannel))
    assert.equal((await listEventOrders(t.db, 'org_1', 'evt_1', { channel: channel as 'door' })).length, n);
  for (const [method, n] of Object.entries(counts.byMethod))
    assert.equal((await listEventOrders(t.db, 'org_1', 'evt_1', { method: method as 'cash' })).length, n);
  for (const [ticketTypeId, n] of Object.entries(counts.byTicketType))
    assert.equal((await listEventOrders(t.db, 'org_1', 'evt_1', { ticketTypeId })).length, n);
  assert.deepEqual(counts.byStatus, { paid: 1, pending: 2 });
  assert.deepEqual(counts.byTicketType, { [t.seed.generalTypeId]: 2, [t.seed.vipTypeId]: 1 });
  const paidOnly = await orderCounts(t.db, 'org_1', 'evt_1', { status: 'paid' });
  assert.equal(paidOnly.all, 1);
  await rejects(listEventOrders(t.db, 'org_1', 'evt_1', { status: 'bogus' as 'paid' }), 'invalid');

  const detail = await getOrderDetail(t.db, 'org_1', b.orderId);
  assert.equal(detail!.order.reference, b.reference);
  assert.equal(detail!.items.length, 1);
  assert.equal(detail!.tickets.length, 1);
  assert.equal(detail!.payments.length, 0);
  assert.equal(await getOrderDetail(t.db, 'org_2', b.orderId), null);

  const csv = ordersCsv(await listEventOrders(t.db, 'org_1', 'evt_1', { q: 'abebe' }), 'America/Phoenix');
  const [header, row] = csv.trim().split('\r\n');
  assert.ok(header.startsWith('Reference,Date,Status'));
  assert.ok(row.includes(`"'=HYPERLINK(""x"")"`), row);
  assert.ok(row.includes(',40.00,'), row);
});
