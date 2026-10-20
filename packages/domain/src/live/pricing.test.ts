import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAID_NOW, paidTestDatabase, seedPaidEvent } from './paid-testing.ts';
import { nextPriceChangeAt, unitPriceAt, unitPricesForEvent } from './pricing.ts';

const DEADLINES = [
  { priceCents: 1800, endsAt: 200 },
  { priceCents: 1500, endsAt: 100 },
];

test('the first deadline still ahead applies, then the type price', () => {
  assert.equal(unitPriceAt(2000, DEADLINES, 50), 1500);
  assert.equal(unitPriceAt(2000, DEADLINES, 100), 1800);
  assert.equal(unitPriceAt(2000, DEADLINES, 199), 1800);
  assert.equal(unitPriceAt(2000, DEADLINES, 200), 2000);
  assert.equal(unitPriceAt(2000, [], 0), 2000);
  assert.equal(nextPriceChangeAt(DEADLINES, 50), 100);
  assert.equal(nextPriceChangeAt(DEADLINES, 250), null);
});

test('unitPricesForEvent reads every type with its deadlines', async () => {
  const { d1, db } = await paidTestDatabase();
  seedPaidEvent(d1);
  d1.sqlite.exec(
    `INSERT INTO price_deadlines (id, ticket_type_id, price_cents, ends_at) VALUES
       ('tpd_a', 'tty_general_1', 1500, ${PAID_NOW + 10}), ('tpd_b', 'tty_general_1', 1700, ${PAID_NOW + 20})`,
  );
  const now = await unitPricesForEvent(db, 'evt_1', PAID_NOW);
  assert.deepEqual([now.get('tty_general_1'), now.get('tty_vip_1')], [1500, 5000]);
  const later = await unitPricesForEvent(db, 'evt_1', PAID_NOW + 15);
  assert.equal(later.get('tty_general_1'), 1700);
  assert.equal((await unitPricesForEvent(db, 'evt_1', PAID_NOW + 20)).get('tty_general_1'), 2000);
});
