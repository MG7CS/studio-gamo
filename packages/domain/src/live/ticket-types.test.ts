import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allRows } from '../security/sql-database.ts';
import { reserveOrder } from './orders.ts';
import { PAID_ENV, PAID_NOW, paidTestDatabase, seedPaidEvent } from './paid-testing.ts';
import { ORDER_HOLD_SECONDS, PaidError } from './paid-types.ts';
import {
  addPriceDeadline,
  applyInventorySync,
  availabilityFor,
  deleteTicketType,
  listEventTicketTypes,
  listTicketTypes,
  priceNow,
  removePriceDeadline,
  saveTicketType,
  setTicketTypeStatus,
  syncTicketInventory,
  validateTicketTypeForm,
} from './ticket-types.ts';

async function setup() {
  const { d1, db } = await paidTestDatabase();
  const seed = seedPaidEvent(d1, { flow: 'organizer_account' });
  return { d1, db, seed, exec: (sql: string) => d1.sqlite.exec(sql) };
}

const detailOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof PaidError);
    return e.detail;
  }
  return null;
};

test('validateTicketTypeForm: prices in dollars, limits and door allocation', () => {
  const v = validateTicketTypeForm({
    name: ' Family pack ',
    price: '$45.50',
    kind: 'group',
    peoplePerTicket: '4',
    capacity: '20',
    doorAllocation: '5',
  });
  assert.equal(v.name, 'Family pack');
  assert.equal(v.priceCents, 4550);
  assert.equal(v.peoplePerTicket, 4);
  assert.equal(v.capacity, 20);
  assert.equal(v.doorAllocation, 5);
  assert.equal(v.doorUsesOnline, true);
  assert.equal(v.perOrderLimit, 10);
  assert.equal(v.status, 'on_sale');
  assert.equal(validateTicketTypeForm({ name: 'Free', price: '0' }).priceCents, 0);
  assert.equal(
    validateTicketTypeForm({ name: 'A', price: '1', doorUsesOnline: undefined }).doorUsesOnline,
    true,
  );
  assert.equal(validateTicketTypeForm({ name: 'A', price: '1', doorUsesOnline: '' }).doorUsesOnline, false);
  assert.equal(
    detailOf(() => validateTicketTypeForm({ name: '', price: '1' })),
    'name',
  );
  assert.equal(
    detailOf(() => validateTicketTypeForm({ name: 'x'.repeat(61), price: '1' })),
    'name',
  );
  assert.equal(
    detailOf(() => validateTicketTypeForm({ name: 'A', price: '-1' })),
    'price',
  );
  assert.equal(
    detailOf(() => validateTicketTypeForm({ name: 'A', price: '10000.01' })),
    'price',
  );
  assert.equal(
    detailOf(() => validateTicketTypeForm({ name: 'A', price: '1', kind: 'adult' })),
    'kind',
  );
  assert.equal(
    detailOf(() => validateTicketTypeForm({ name: 'A', price: '1', peoplePerTicket: '21' })),
    'people_per_ticket',
  );
  assert.equal(
    detailOf(() => validateTicketTypeForm({ name: 'A', price: '1', capacity: '0' })),
    'capacity',
  );
  assert.equal(
    detailOf(() => validateTicketTypeForm({ name: 'A', price: '1', capacity: '2', doorAllocation: '3' })),
    'door_allocation',
  );
  assert.equal(
    detailOf(() => validateTicketTypeForm({ name: 'A', price: '1', perOrderLimit: '51' })),
    'per_order_limit',
  );
  assert.equal(
    detailOf(() => validateTicketTypeForm({ name: 'A', price: '1', salesStartAt: 10, salesEndAt: 10 })),
    'sales_end_at',
  );
  assert.equal(
    detailOf(() => validateTicketTypeForm({ name: 'A', price: '1', status: 'sold_out' })),
    'status',
  );
});

test('saveTicketType creates the type with inventory rows for every date, and updates them', async () => {
  const t = await setup();
  t.exec(
    "INSERT INTO event_occurrences (id, event_id, starts_at) VALUES ('occ_2', 'evt_1', " +
      (PAID_NOW + 40 * 86400) +
      ')',
  );
  const id = await saveTicketType(t.db, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    form: { name: 'Student', price: '10', capacity: '30', kind: 'student' },
    now: PAID_NOW,
  });
  const inv = await allRows<{ occurrence_id: string; capacity: number }>(t.db, {
    sql: 'SELECT occurrence_id, capacity FROM ticket_inventory WHERE ticket_type_id = ?1 ORDER BY occurrence_id',
    params: [id],
  });
  assert.deepEqual(
    inv.map((r) => [r.occurrence_id, r.capacity]),
    [
      ['occ_1', 30],
      ['occ_2', 30],
    ],
  );
  assert.equal(
    (
      await allRows(t.db, {
        sql: "SELECT 1 FROM occurrence_inventory WHERE occurrence_id = 'occ_2'",
        params: [],
      })
    ).length,
    1,
  );
  const types = await listTicketTypes(t.db, 'org_1', 'evt_1');
  assert.deepEqual(
    types.map((x) => [x.name, x.position]),
    [
      ['General', 0],
      ['VIP', 1],
      ['Student', 2],
    ],
  );
  await saveTicketType(t.db, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    ticketTypeId: id,
    form: { name: 'Student', price: '12', capacity: '40' },
    now: PAID_NOW,
  });
  const [row] = await allRows<{ capacity: number }>(t.db, {
    sql: "SELECT capacity FROM ticket_inventory WHERE ticket_type_id = ?1 AND occurrence_id = 'occ_1'",
    params: [id],
  });
  assert.equal(row.capacity, 40);
  await assert.rejects(
    saveTicketType(t.db, {
      organizationId: 'org_2',
      eventId: 'evt_1',
      form: { name: 'X', price: '1' },
      now: PAID_NOW,
    }),
    (e: PaidError) => e.code === 'not_found',
  );
  await assert.rejects(
    saveTicketType(t.db, {
      organizationId: 'org_1',
      eventId: 'evt_1',
      ticketTypeId: 'tty_nope',
      form: { name: 'X', price: '1' },
      now: PAID_NOW,
    }),
    (e: PaidError) => e.code === 'not_found',
  );
  assert.equal((await listEventTicketTypes(t.db, 'evt_1')).length, 3);
});

test('a capacity below what is sold or held is refused and changes nothing', async () => {
  const t = await setup();
  await reserveOrder(t.db, PAID_ENV, {
    eventId: 'evt_1',
    occurrenceId: 'occ_1',
    channel: 'online',
    paymentMethod: 'card_online',
    lines: [{ ticketTypeId: t.seed.generalTypeId, quantity: 5 }],
    buyerName: 'A',
    buyerEmail: 'a@example.org',
    now: PAID_NOW,
  });
  await assert.rejects(
    saveTicketType(t.db, {
      organizationId: 'org_1',
      eventId: 'evt_1',
      ticketTypeId: t.seed.generalTypeId,
      form: { name: 'General', price: '20', capacity: '4' },
      now: PAID_NOW,
    }),
    (e: PaidError) => e.code === 'invalid' && e.detail === 'capacity_below_sold',
  );
  const [type] = await allRows<{ capacity: number }>(t.db, {
    sql: 'SELECT capacity FROM ticket_types WHERE id = ?1',
    params: [t.seed.generalTypeId],
  });
  assert.equal(type.capacity, 100);
  // The event capacity in people works the same way.
  t.exec("UPDATE events SET capacity = 3 WHERE id = 'evt_1'");
  await assert.rejects(
    applyInventorySync(t.db, 'evt_1'),
    (e: PaidError) => e.detail === 'capacity_below_sold',
  );
  t.exec("UPDATE events SET capacity = 5 WHERE id = 'evt_1'");
  await applyInventorySync(t.db, 'evt_1');
  assert.equal(syncTicketInventory(t.db, 'evt_1').length, 2);
});

test('availability is computed from inventory, counts expired holds as free and caps by people', async () => {
  const t = await setup();
  const before = await availabilityFor(t.db, 'evt_1', 'occ_1', PAID_NOW);
  assert.deepEqual(before, [
    { ticketTypeId: t.seed.generalTypeId, online: 100, door: 100, soldOut: false },
    { ticketTypeId: t.seed.vipTypeId, online: 8, door: 2, soldOut: false },
  ]);
  t.exec(`UPDATE ticket_inventory SET online_taken = 8 WHERE ticket_type_id = '${t.seed.vipTypeId}'`);
  const vip = (await availabilityFor(t.db, 'evt_1', 'occ_1', PAID_NOW))[1];
  assert.deepEqual(vip, { ticketTypeId: t.seed.vipTypeId, online: 0, door: 2, soldOut: true });
  t.exec(`UPDATE ticket_inventory SET online_taken = 0 WHERE ticket_type_id = '${t.seed.vipTypeId}'`);

  await reserveOrder(t.db, PAID_ENV, {
    eventId: 'evt_1',
    occurrenceId: 'occ_1',
    channel: 'online',
    paymentMethod: 'card_online',
    lines: [{ ticketTypeId: t.seed.generalTypeId, quantity: 3 }],
    buyerName: 'A',
    buyerEmail: 'a@example.org',
    now: PAID_NOW,
  });
  assert.equal((await availabilityFor(t.db, 'evt_1', 'occ_1', PAID_NOW))[0].online, 97);
  assert.equal((await availabilityFor(t.db, 'evt_1', 'occ_1', PAID_NOW + ORDER_HOLD_SECONDS))[0].online, 100);

  t.exec("UPDATE events SET capacity = 10 WHERE id = 'evt_1'");
  t.exec("UPDATE occurrence_inventory SET capacity = 10 WHERE occurrence_id = 'occ_1'");
  t.exec(`UPDATE ticket_types SET people_per_ticket = 4 WHERE id = '${t.seed.vipTypeId}'`);
  const capped = await availabilityFor(t.db, 'evt_1', 'occ_1', PAID_NOW);
  assert.equal(capped[0].online, 7);
  assert.equal(capped[1].online, 1);
});

test('status, delete and price deadlines', async () => {
  const t = await setup();
  await setTicketTypeStatus(t.db, {
    organizationId: 'org_1',
    ticketTypeId: t.seed.vipTypeId,
    status: 'hidden',
    now: PAID_NOW,
  });
  assert.equal((await listTicketTypes(t.db, 'org_1', 'evt_1'))[1].status, 'hidden');
  await assert.rejects(
    setTicketTypeStatus(t.db, {
      organizationId: 'org_2',
      ticketTypeId: t.seed.vipTypeId,
      status: 'ended',
      now: PAID_NOW,
    }),
    (e: PaidError) => e.code === 'not_found',
  );

  const early = await addPriceDeadline(t.db, {
    organizationId: 'org_1',
    ticketTypeId: t.seed.generalTypeId,
    price: '15',
    endsAt: PAID_NOW + 86400,
    now: PAID_NOW,
  });
  await addPriceDeadline(t.db, {
    organizationId: 'org_1',
    ticketTypeId: t.seed.generalTypeId,
    price: '18',
    endsAt: PAID_NOW + 7 * 86400,
    now: PAID_NOW,
  });
  await assert.rejects(
    addPriceDeadline(t.db, {
      organizationId: 'org_1',
      ticketTypeId: t.seed.generalTypeId,
      price: '18',
      endsAt: PAID_NOW - 1,
      now: PAID_NOW,
    }),
    (e: PaidError) => e.detail === 'ends_at',
  );
  await assert.rejects(
    addPriceDeadline(t.db, {
      organizationId: 'org_1',
      ticketTypeId: t.seed.generalTypeId,
      price: '16',
      endsAt: PAID_NOW + 86400,
      now: PAID_NOW,
    }),
    (e: PaidError) => e.detail === 'ends_at',
  );
  const general = (await listTicketTypes(t.db, 'org_1', 'evt_1'))[0];
  assert.equal(priceNow(general, PAID_NOW), 1500);
  assert.equal(priceNow(general, PAID_NOW + 86400), 1800);
  assert.equal(priceNow(general, PAID_NOW + 7 * 86400), 2000);
  const r = await reserveOrder(t.db, PAID_ENV, {
    eventId: 'evt_1',
    occurrenceId: 'occ_1',
    channel: 'online',
    paymentMethod: 'card_online',
    lines: [{ ticketTypeId: t.seed.generalTypeId, quantity: 1 }],
    buyerName: 'A',
    buyerEmail: 'a@example.org',
    now: PAID_NOW + 2 * 86400,
  });
  assert.equal(r.priced.subtotalCents, 1800);
  await removePriceDeadline(t.db, { organizationId: 'org_1', deadlineId: early });
  await assert.rejects(
    removePriceDeadline(t.db, { organizationId: 'org_1', deadlineId: early }),
    (e: PaidError) => e.code === 'not_found',
  );

  await assert.rejects(
    deleteTicketType(t.db, { organizationId: 'org_1', ticketTypeId: t.seed.generalTypeId }),
    (e: PaidError) => e.detail === 'has_orders',
  );
  await deleteTicketType(t.db, { organizationId: 'org_1', ticketTypeId: t.seed.vipTypeId });
  assert.equal((await listTicketTypes(t.db, 'org_1', 'evt_1')).length, 1);
});
