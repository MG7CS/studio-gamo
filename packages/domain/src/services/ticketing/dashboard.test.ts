import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  attendanceCsv,
  attendanceSummary,
  listOrders,
  markConflictReviewed,
  salesSummary,
  scanLog,
  scanLogCsv,
  toCsv,
} from './dashboard.ts';
import { syncOfflineScans } from './manifest.ts';
import { scanTicket } from './scanning.ts';
import { DoorSaleError, sellAtDoor } from './scanning-door-sales.ts';
import {
  createFixture,
  issueTickets,
  QR_KEYS,
  scannerDevice,
  seedEvent,
  TEST_ENV,
} from './scanning-test-fixtures.ts';

const NOW = 1_900_000_000;
const HOUR = 3600;

describe('organizer dashboard', () => {
  test('sales, masked orders, attendance, scan log filters, conflict review and CSV', async () => {
    const f = await createFixture();
    const eventId = seedEvent(f, {
      startsAt: NOW + HOUR,
      tiers: [
        { id: 'tier_ga', capacity: 30, price: 2000, name: 'General' },
        { id: 'tier_vip', capacity: 5, price: 5000, name: 'VIP' },
      ],
    });
    const ga = await issueTickets(f, {
      eventId,
      categoryId: 'tier_ga',
      quantity: 2,
      holderName: 'Ruth Sample',
      email: 'ruth@example.org',
      now: NOW,
    });
    await issueTickets(f, {
      eventId,
      categoryId: 'tier_vip',
      quantity: 1,
      holderName: 'Boaz Sample',
      email: 'boaz@example.org',
      now: NOW,
    });

    const sales = await salesSummary(f.db, eventId);
    assert.deepEqual(
      sales.categories.map((c) => [c.name, c.sold, c.remaining, c.grossCents]),
      [
        ['General', 2, 28, 4000],
        ['VIP', 1, 4, 5000],
      ],
    );
    assert.equal(sales.totals.grossCents, 9000);
    assert.equal(sales.totals.tickets, 3);

    const masked = await listOrders(f.db, eventId, { unmask: false });
    assert.equal(masked.total, 2);
    assert.ok(
      masked.orders.every((o) => o.purchaserEmail.includes('•••') && !o.purchaserEmail.startsWith('ruth@')),
    );
    assert.ok(masked.orders.some((o) => o.purchaserName === 'Ruth S.'));
    const full = await listOrders(f.db, eventId, { unmask: true });
    assert.ok(full.orders.some((o) => o.purchaserEmail === 'ruth@example.org'));

    const a = await scannerDevice(f, { eventId, now: NOW, label: 'North door' });
    const b = await scannerDevice(f, { eventId, now: NOW, label: 'South door' });
    await scanTicket(f.db, {
      eventId,
      code: ga[0].payload,
      direction: 'in',
      actor: { kind: 'scanner', device: a.device },
      keyring: QR_KEYS,
      now: NOW,
    });
    await scanTicket(f.db, {
      eventId,
      code: 'junk',
      direction: 'in',
      actor: { kind: 'scanner', device: a.device },
      keyring: QR_KEYS,
      now: NOW + 1,
    });
    await syncOfflineScans(f.db, {
      eventId,
      device: b.device,
      keyring: QR_KEYS,
      now: NOW + 100,
      scans: [
        {
          clientScanId: 'b-1',
          code: ga[0].payload,
          direction: 'in',
          deviceScannedAt: NOW + 50,
          localResult: 'admitted',
        },
      ],
    });

    const attendance = await attendanceSummary(f.db, eventId, NOW + 200);
    assert.equal(attendance.headcount.insideNow, 1);
    assert.equal(attendance.days[0].admitted, 1);
    assert.equal(
      attendance.hours.reduce((n, h) => n + h.entries, 0),
      1,
    );

    const all = await scanLog(f.db, eventId);
    assert.equal(all.total, 3);
    assert.deepEqual(all.gates, ['North door', 'South door']);
    assert.equal((await scanLog(f.db, eventId, { result: 'invalid' })).total, 1);
    assert.equal((await scanLog(f.db, eventId, { gate: 'South door' })).total, 1);
    assert.equal((await scanLog(f.db, eventId, { deviceId: a.device.deviceId })).total, 2);
    const conflicts = await scanLog(f.db, eventId, { conflictsOnly: true });
    assert.equal(conflicts.total, 1);
    assert.equal(conflicts.rows[0].holder, 'Ruth S.');
    assert.equal(conflicts.rows[0].reviewed, false);
    assert.equal(
      await markConflictReviewed(f.db, {
        eventId,
        scanEventId: conflicts.rows[0].id,
        userId: 'usr_owner',
        now: NOW,
      }),
      true,
    );
    assert.equal(
      await markConflictReviewed(f.db, {
        eventId,
        scanEventId: conflicts.rows[0].id,
        userId: 'usr_owner',
        now: NOW,
      }),
      false,
    );
    assert.equal((await scanLog(f.db, eventId, { conflictsOnly: true })).rows[0].reviewed, true);
    assert.equal(
      await markConflictReviewed(f.db, {
        eventId,
        scanEventId: all.rows.find((r) => r.result === 'invalid')!.id,
        userId: 'usr_owner',
        now: NOW,
      }),
      false,
    );

    const csvMasked = await attendanceCsv(f.db, eventId, false);
    assert.ok(!csvMasked.includes('@'), 'no emails for non-owners');
    assert.ok(csvMasked.includes('Ruth S.'));
    assert.ok((await attendanceCsv(f.db, eventId, true)).includes('ruth@example.org'));
    const log = await scanLogCsv(f.db, eventId);
    assert.equal(log.trim().split('\r\n').length, 4);
    assert.equal(toCsv(['a'], [['=SUM(1)'], ['x,"y"']]), 'a\r\n\'=SUM(1)\r\n"x,""y"""\r\n');
  });
});

describe('door sales', () => {
  test('free issue and recorded cash sales issue tickets that admit in the same step; policy and roles are enforced', async () => {
    const f = await createFixture();
    const eventId = seedEvent(f, {
      startsAt: NOW + HOUR,
      tiers: [{ id: 'tier_ga', capacity: 3, price: 1500, name: 'General' }],
      policy: { door_sales_enabled: 1, door_sales_methods_json: '["free_issue","cash_recorded"]' },
    });
    const sup = await scannerDevice(f, { eventId, now: NOW, canOverride: true });
    const plain = await scannerDevice(f, { eventId, now: NOW });
    const base = {
      eventId,
      categoryId: 'tier_ga',
      keyring: QR_KEYS,
      now: NOW,
    };
    await assert.rejects(
      sellAtDoor(f.db, TEST_ENV, {
        ...base,
        actor: { kind: 'scanner', device: plain.device },
        quantity: 1,
        method: 'free_issue',
        admitNow: false,
        idempotencyKey: 'door-key-0001',
      }),
      (e: unknown) => e instanceof DoorSaleError && e.code === 'NOT_ALLOWED',
    );
    const sale = await sellAtDoor(f.db, TEST_ENV, {
      ...base,
      actor: { kind: 'scanner', device: sup.device },
      quantity: 2,
      method: 'cash_recorded',
      unitPriceCents: 2000,
      holderName: 'Sample Walk-in',
      admitNow: true,
      idempotencyKey: 'door-key-0002',
    });
    assert.equal(sale.tickets.length, 2);
    assert.deepEqual(
      sale.admissions.map((a) => a.result),
      ['admitted', 'admitted'],
    );
    assert.match(sale.qrSvgs[0], /^<svg/);
    const order = f.q(
      'SELECT source, status, payment_method, total_cents FROM ticket_orders WHERE id = ?',
      sale.orderId,
    );
    assert.deepEqual(order, {
      source: 'door',
      status: 'paid',
      payment_method: 'cash_recorded',
      total_cents: 4000,
    });
    await assert.rejects(
      sellAtDoor(f.db, TEST_ENV, {
        ...base,
        actor: { kind: 'organizer', userId: 'usr_owner' },
        quantity: 1,
        method: 'cash_recorded',
        unitPriceCents: 2000,
        admitNow: false,
        idempotencyKey: 'door-key-0002',
      }),
      (e: unknown) => e instanceof DoorSaleError && e.code === 'INVALID_INPUT',
      'a double submit records nothing new',
    );
    const free = await sellAtDoor(f.db, TEST_ENV, {
      ...base,
      actor: { kind: 'organizer', userId: 'usr_owner' },
      quantity: 1,
      method: 'free_issue',
      admitNow: false,
      idempotencyKey: 'door-key-0003',
    });
    assert.equal(f.q('SELECT status, total_cents AS t FROM ticket_orders WHERE id = ?', free.orderId).t, 0);
    await assert.rejects(
      sellAtDoor(f.db, TEST_ENV, {
        ...base,
        actor: { kind: 'organizer', userId: 'usr_owner' },
        quantity: 1,
        method: 'free_issue',
        admitNow: false,
        idempotencyKey: 'door-key-0004',
      }),
      (e: unknown) => e instanceof DoorSaleError && e.code === 'SOLD_OUT',
    );
    assert.equal(
      f.q('SELECT reserved_count AS r, sold_count AS s FROM ticket_tiers WHERE id = ?', 'tier_ga').s,
      3,
    );

    const off = await createFixture();
    const offId = seedEvent(off, { startsAt: NOW + HOUR });
    await assert.rejects(
      sellAtDoor(off.db, TEST_ENV, {
        eventId: offId,
        categoryId: `${offId}_ga`,
        keyring: QR_KEYS,
        now: NOW,
        actor: { kind: 'organizer', userId: 'usr_owner' },
        quantity: 1,
        method: 'free_issue',
        admitNow: false,
        idempotencyKey: 'door-key-0005',
      }),
      (e: unknown) => e instanceof DoorSaleError && e.code === 'DOOR_SALES_OFF',
    );
  });
});
