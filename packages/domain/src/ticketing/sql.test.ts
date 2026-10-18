/**
 * Inventory and admission atomicity on a migrated database (design T-01, §5.2, §5.3).
 * Single-connection tests use the D1-like test adapter (each batch is one serialized transaction);
 * the cross-connection tests run batches from several worker threads against one file database.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createDb } from '@gamo/db';
import { asD1, createMigratedD1, type SqliteD1 } from '@gamo/db/testing';
import { LiveService } from '../services/live.ts';
import { newOrderReference, newPrefixedId, newTicketId } from '../security/ids.ts';
import { macDigest, newQrSalt, signTicketQr } from '../security/ticket-qr.ts';
import { allRows, runBatch, type SqlDatabase, type SqlStatementSpec } from '../security/sql-database.ts';
import { HOLD_DURATION_SECONDS, EVENT_POLICY_DEFAULTS, policySnapshotJson } from '../types/policy.ts';
import {
  addItemRefundedQuantityStatement,
  addOrderRefundStatement,
  bumpTicketVersionStatement,
  buildHoldBatch,
  buildScanInBatch,
  buildScanOutBatch,
  convertOrderHoldsStatement,
  expireStaleOrdersStatement,
  insertRejectedScanStatement,
  insertTicketStatement,
  reconcileOrderRefundStatement,
  refundTicketStatement,
  releaseExpiredHoldsStatement,
  releaseOrderHoldsStatement,
  ticketingErrorCode,
  transitionOrderStatement,
  voidEventTicketsStatement,
  voidOrderTicketsStatement,
  voidTicketStatement,
  type HoldBatchItem,
  type NewOrderInput,
  type ScanContext,
} from './sql.ts';

const NOW = 1_900_000_000;
const QR_KEYS = { GL1: 'ticket-qr-secret-for-tests-only-00000001' };

interface Fixture {
  d1: SqliteD1;
  db: SqlDatabase;
  q: (sql: string, ...params: Array<string | number | null>) => Record<string, unknown>;
  all: (sql: string, ...params: Array<string | number | null>) => Record<string, unknown>[];
}

function wrap(d1: SqliteD1): Fixture {
  return {
    d1,
    db: d1,
    q: (sql, ...p) => ({ ...(d1.sqlite.prepare(sql).get(...p) as Record<string, unknown>) }),
    all: (sql, ...p) =>
      (d1.sqlite.prepare(sql).all(...p) as Record<string, unknown>[]).map((r) => ({ ...r })),
  };
}

/** One approved paid event with categories and sections (fictional sample data). */
function seed(
  d1: SqliteD1,
  opts: {
    eventId?: string;
    admission?: 'free' | 'paid';
    status?: string;
    tiers?: Array<{ id: string; capacity: number; price?: number; seats?: number; status?: string }>;
    sections?: Array<{ id: string; tierId: string; capacity: number; price?: number | null }>;
    seats?: Array<{ id: string; sectionId: string }>;
  } = {},
) {
  const eventId = opts.eventId ?? 'evt_sample';
  const s = d1.sqlite;
  s.exec(
    `INSERT OR IGNORE INTO organizations (id, name, slug, type, status, created_at) VALUES ('org_sample', 'Sample Church', 'sample-church', 'church', 'active', ${NOW});
     INSERT OR IGNORE INTO organizer_profiles (id, organization_id, created_at) VALUES ('op_sample', 'org_sample', ${NOW});`,
  );
  s.prepare(
    "INSERT INTO events (id, organizer_id, title, slug, category, description, venue_name, city, state, starts_at, ends_at, admission_type, status, created_at) VALUES (?, 'op_sample', 'Sample Night of Worship', ?, 'concert', 'Sample event', 'Sample Hall', 'Phoenix', 'AZ', ?, ?, ?, ?, ?)",
  ).run(eventId, eventId, NOW + 86400, NOW + 90000, opts.admission ?? 'paid', opts.status ?? 'approved', NOW);
  for (const t of opts.tiers ?? [{ id: 'tier_ga', capacity: 10, price: 2500 }])
    s.prepare(
      'INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, reserved_count, seats_per_ticket, status) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
    ).run(t.id, eventId, `Sample ${t.id}`, t.price ?? 2500, t.capacity, t.seats ?? 1, t.status ?? 'active');
  for (const sec of opts.sections ?? [])
    s.prepare(
      'INSERT INTO venue_sections (id, event_id, tier_id, code, name, price_cents, capacity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      sec.id,
      eventId,
      sec.tierId,
      sec.id.toUpperCase(),
      `Section ${sec.id}`,
      sec.price ?? null,
      sec.capacity,
      NOW,
      NOW,
    );
  for (const seat of opts.seats ?? [])
    s.prepare(
      "INSERT INTO venue_seats (id, section_id, row_label, seat_label, created_at) VALUES (?, ?, 'A', ?, ?)",
    ).run(seat.id, seat.sectionId, seat.id, NOW);
  return eventId;
}

function order(over: Partial<NewOrderInput> = {}): NewOrderInput {
  return {
    id: newPrefixedId('ord'),
    reference: newOrderReference(),
    eventId: 'evt_sample',
    customerProfileId: null,
    purchaserName: 'Sample Buyer',
    purchaserEmail: 'sample.buyer@example.org',
    kind: 'paid',
    status: 'pending_payment',
    idempotencyKey: newPrefixedId('idem'),
    holdExpiresAt: NOW + HOLD_DURATION_SECONDS,
    policySnapshotJson: policySnapshotJson(EVENT_POLICY_DEFAULTS),
    now: NOW,
    ...over,
  };
}

function item(
  categoryId: string,
  quantity: number,
  over: Partial<HoldBatchItem['item']> = {},
): HoldBatchItem {
  return { item: { id: newPrefixedId('oit'), categoryId, quantity, ...over }, holdId: newPrefixedId('hold') };
}

const counts = (f: Fixture, tierId = 'tier_ga') =>
  f.q('SELECT reserved_count AS reserved, sold_count AS sold FROM ticket_tiers WHERE id = ?', tierId);
const sectionCounts = (f: Fixture, id: string) =>
  f.q('SELECT reserved_count AS reserved, sold_count AS sold FROM venue_sections WHERE id = ?', id);
const rowCount = (f: Fixture, table: string) => Number(f.q(`SELECT count(*) AS n FROM ${table}`).n);

async function failsWith(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (e: unknown) => {
    assert.equal(ticketingErrorCode(e), code, String((e as Error).message));
    return true;
  });
}

/** Holds → converted → tickets for one order; returns ticket ids. */
async function sellAndIssue(f: Fixture, o: NewOrderInput, items: HoldBatchItem[]) {
  await runBatch(f.db, buildHoldBatch({ order: o, items }));
  const issue: SqlStatementSpec[] = [
    transitionOrderStatement({
      orderId: o.id,
      from: ['pending_payment', 'pending_verification'],
      to: 'paid',
      now: NOW + 10,
    }),
    convertOrderHoldsStatement({ orderId: o.id, now: NOW + 10 }),
  ];
  const ids: string[] = [];
  for (const { item: it } of items) {
    const row = f.q('SELECT section_id, seat_id FROM order_items WHERE id = ?', it.id);
    for (let seq = 1; seq <= it.quantity; seq++) {
      const id = newTicketId();
      const salt = newQrSalt();
      const sig = await signTicketQr({ ticketId: id, version: 1, eventId: o.eventId, salt }, QR_KEYS);
      assert.ok(sig.ok);
      issue.push(
        insertTicketStatement({
          id,
          orderId: o.id,
          orderItemId: it.id,
          eventId: o.eventId,
          categoryId: it.categoryId,
          sectionId: (row.section_id as string | null) ?? null,
          seatId: (row.seat_id as string | null) ?? null,
          holderName: 'Sample Holder',
          holderEmail: o.purchaserEmail,
          seq,
          qrKeyId: sig.keyId,
          qrSalt: salt,
          qrSignatureHash: sig.macDigest,
          now: NOW + 10,
        }),
      );
      ids.push(id);
    }
  }
  await runBatch(f.db, issue);
  return ids;
}

describe('holds and orders', () => {
  test('a batch that oversells a category or a section rolls back entirely', async () => {
    const f = wrap(await createMigratedD1());
    seed(f.d1, {
      tiers: [
        { id: 'tier_ga', capacity: 5 },
        { id: 'tier_vip', capacity: 10, price: 9000 },
      ],
      sections: [{ id: 'sec_b', tierId: 'tier_vip', capacity: 3 }],
    });
    await failsWith(
      runBatch(f.db, buildHoldBatch({ order: order(), items: [item('tier_ga', 6)] })),
      'SOLD_OUT',
    );
    await failsWith(
      runBatch(
        f.db,
        buildHoldBatch({ order: order(), items: [item('tier_vip', 4, { sectionId: 'sec_b' })] }),
      ),
      'SECTION_SOLD_OUT',
    );
    // The second item fails: the first item's reservation is rolled back with it.
    await failsWith(
      runBatch(
        f.db,
        buildHoldBatch({
          order: order(),
          items: [item('tier_ga', 2), item('tier_vip', 4, { sectionId: 'sec_b' })],
        }),
      ),
      'SECTION_SOLD_OUT',
    );
    assert.deepEqual(counts(f), { reserved: 0, sold: 0 });
    assert.deepEqual(counts(f, 'tier_vip'), { reserved: 0, sold: 0 });
    assert.deepEqual(sectionCounts(f, 'sec_b'), { reserved: 0, sold: 0 });
    for (const table of ['ticket_orders', 'order_items', 'ticket_holds'])
      assert.equal(rowCount(f, table), 0, table);

    // Exactly at capacity is fine; totals come from database prices.
    const o = order();
    const [, , , , , totals] = await runBatch(
      f.db,
      buildHoldBatch({ order: o, items: [item('tier_ga', 5), item('tier_vip', 3, { sectionId: 'sec_b' })] }),
    );
    assert.deepEqual(
      { ...(totals[0] as object) },
      { quantity: 8, subtotal_cents: 5 * 2500 + 3 * 9000, total_cents: 39500, currency: 'usd' },
    );
    assert.deepEqual(counts(f), { reserved: 5, sold: 0 });
    assert.deepEqual(sectionCounts(f, 'sec_b'), { reserved: 3, sold: 0 });
  });

  test('a reused idempotency key returns DUPLICATE_ORDER and reserves nothing more', async () => {
    const f = wrap(await createMigratedD1());
    seed(f.d1);
    const o = order();
    await runBatch(f.db, buildHoldBatch({ order: o, items: [item('tier_ga', 2)] }));
    await failsWith(
      runBatch(
        f.db,
        buildHoldBatch({
          order: { ...o, id: newPrefixedId('ord'), reference: newOrderReference() },
          items: [item('tier_ga', 2)],
        }),
      ),
      'DUPLICATE_ORDER',
    );
    assert.deepEqual(counts(f), { reserved: 2, sold: 0 });
    assert.equal(rowCount(f, 'ticket_holds'), 1);
  });

  test('50 concurrent hold batches for capacity 10 reserve exactly 10 (one connection)', async () => {
    const f = wrap(await createMigratedD1());
    seed(f.d1, { tiers: [{ id: 'tier_ga', capacity: 10 }] });
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () =>
        runBatch(f.db, buildHoldBatch({ order: order(), items: [item('tier_ga', 1)] })),
      ),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 10);
    for (const r of results)
      if (r.status === 'rejected') assert.equal(ticketingErrorCode(r.reason), 'SOLD_OUT');
    assert.deepEqual(counts(f), { reserved: 10, sold: 0 });
    assert.equal(rowCount(f, 'ticket_holds'), 10);
    assert.equal(rowCount(f, 'ticket_orders'), 10);
    assert.equal(rowCount(f, 'order_items'), 10);
  });

  test('group tickets consume seats_per_ticket units; categories that are not on sale refuse holds', async () => {
    const f = wrap(await createMigratedD1());
    seed(f.d1, {
      tiers: [
        { id: 'tier_table', capacity: 16, price: 40000, seats: 8 },
        { id: 'tier_hidden', capacity: 10, status: 'hidden' },
      ],
    });
    await runBatch(f.db, buildHoldBatch({ order: order(), items: [item('tier_table', 2)] }));
    assert.deepEqual(counts(f, 'tier_table'), { reserved: 16, sold: 0 });
    assert.equal(f.q('SELECT seats_per_ticket AS s FROM order_items').s, 8);
    await failsWith(
      runBatch(f.db, buildHoldBatch({ order: order(), items: [item('tier_table', 1)] })),
      'SOLD_OUT',
    );
    await failsWith(
      runBatch(f.db, buildHoldBatch({ order: order(), items: [item('tier_hidden', 1)] })),
      'CATEGORY_NOT_ON_SALE',
    );
    f.d1.sqlite.exec("UPDATE events SET status = 'pending_review' WHERE id = 'evt_sample'");
    f.d1.sqlite.exec("UPDATE ticket_tiers SET status = 'active' WHERE id = 'tier_hidden'");
    await failsWith(
      runBatch(f.db, buildHoldBatch({ order: order(), items: [item('tier_hidden', 1)] })),
      'EVENT_NOT_ON_SALE',
    );
  });

  test('held → expired releases exactly once even when the sweep runs twice concurrently', async () => {
    const f = wrap(await createMigratedD1());
    seed(f.d1, {
      tiers: [{ id: 'tier_ga', capacity: 20, seats: 2 }],
      sections: [{ id: 'sec_a', tierId: 'tier_ga', capacity: 10 }],
    });
    const o = order({ holdExpiresAt: NOW + 60 });
    await runBatch(f.db, buildHoldBatch({ order: o, items: [item('tier_ga', 3, { sectionId: 'sec_a' })] }));
    assert.deepEqual(counts(f), { reserved: 6, sold: 0 });
    assert.deepEqual(sectionCounts(f, 'sec_a'), { reserved: 6, sold: 0 });

    assert.deepEqual(
      await allRows(f.db, releaseExpiredHoldsStatement({ now: NOW + 59 })),
      [],
      'not expired yet',
    );
    const sweeps = await Promise.all([
      allRows(f.db, releaseExpiredHoldsStatement({ now: NOW + 60, eventId: 'evt_sample' })),
      allRows(f.db, releaseExpiredHoldsStatement({ now: NOW + 60 })),
      runBatch(f.db, [releaseOrderHoldsStatement({ orderId: o.id, now: NOW + 60, status: 'expired' })]),
    ]);
    assert.equal(
      sweeps[0].length + sweeps[1].length + sweeps[2][0].length,
      1,
      'one statement expired the hold',
    );
    assert.deepEqual(counts(f), { reserved: 0, sold: 0 });
    assert.deepEqual(sectionCounts(f, 'sec_a'), { reserved: 0, sold: 0 });
    assert.equal(f.q('SELECT released_at FROM ticket_holds').released_at, NOW + 60);
    assert.deepEqual(
      (await allRows(f.db, expireStaleOrdersStatement({ now: NOW + 60 }))).map((r) => r.id),
      [o.id],
    );
    // An expired hold can never be converted (no resurrecting released inventory).
    await failsWith(
      runBatch(f.db, [{ sql: "UPDATE ticket_holds SET status = 'converted'", params: [] }]),
      'HOLD_TRANSITION_INVALID',
    );
  });

  test('an open Stripe session keeps its hold until session expiry + grace', async () => {
    const f = wrap(await createMigratedD1());
    seed(f.d1);
    const o = order({ holdExpiresAt: NOW + 60 });
    await runBatch(f.db, [
      ...buildHoldBatch({ order: o, items: [item('tier_ga', 1)] }),
      transitionOrderStatement({
        orderId: o.id,
        from: ['pending_payment'],
        to: 'pending_payment',
        now: NOW,
        set: { stripeCheckoutSessionId: 'cs_test_sample', stripeCheckoutExpiresAt: NOW + 1800 },
      }),
    ]);
    assert.equal((await allRows(f.db, releaseExpiredHoldsStatement({ now: NOW + 1800 }))).length, 0);
    assert.equal((await allRows(f.db, releaseExpiredHoldsStatement({ now: NOW + 1800 + 300 }))).length, 1);
    assert.deepEqual(counts(f), { reserved: 0, sold: 0 });
  });

  test('held → converted moves units to sold; tickets issue once per (item, seq), only after conversion', async () => {
    const f = wrap(await createMigratedD1());
    seed(f.d1, {
      tiers: [{ id: 'tier_ga', capacity: 10 }],
      sections: [{ id: 'sec_a', tierId: 'tier_ga', capacity: 4 }],
    });
    const o = order();
    const it = item('tier_ga', 2, { sectionId: 'sec_a' });
    await runBatch(f.db, buildHoldBatch({ order: o, items: [it] }));

    const ticket = (seq: number) => ({
      id: newTicketId(),
      orderId: o.id,
      orderItemId: it.item.id,
      eventId: o.eventId,
      categoryId: 'tier_ga',
      sectionId: 'sec_a',
      holderName: 'Sample Holder',
      holderEmail: o.purchaserEmail,
      seq,
      qrKeyId: 'GL1',
      qrSalt: newQrSalt(),
      qrSignatureHash: 'a'.repeat(64),
      now: NOW,
    });
    await failsWith(runBatch(f.db, [insertTicketStatement(ticket(1))]), 'TICKET_NOT_SOLD');

    const converted = await allRows(f.db, convertOrderHoldsStatement({ orderId: o.id, now: NOW }));
    assert.equal(converted.length, 1);
    assert.deepEqual(counts(f), { reserved: 2, sold: 2 });
    assert.deepEqual(sectionCounts(f, 'sec_a'), { reserved: 2, sold: 2 });
    assert.equal(
      (await allRows(f.db, convertOrderHoldsStatement({ orderId: o.id, now: NOW }))).length,
      0,
      'idempotent',
    );
    assert.deepEqual(counts(f), { reserved: 2, sold: 2 });

    const [first] = await runBatch(f.db, [insertTicketStatement(ticket(1))]);
    assert.equal(first.length, 1);
    const [replay] = await runBatch(f.db, [insertTicketStatement(ticket(1))]);
    assert.equal(replay.length, 0, 'a replayed webhook does not issue a second ticket for seq 1');
    await failsWith(runBatch(f.db, [insertTicketStatement(ticket(3))]), 'TICKET_ORDER_ITEM_MISMATCH');
    await failsWith(
      runBatch(f.db, [insertTicketStatement({ ...ticket(2), sectionId: null })]),
      'TICKET_ORDER_ITEM_MISMATCH',
    );
    assert.equal(rowCount(f, 'tickets'), 1);
    const row = f.q(
      "SELECT qr_token = id AS same_as_id, qr_token LIKE 'tkm_%' AS handle, length(qr_token) AS len, version, status, released_on_void FROM tickets",
    );
    assert.deepEqual(
      row,
      { same_as_id: 0, handle: 1, len: 36, version: 1, status: 'valid', released_on_void: 0 },
      'the legacy token handle is random and never the id shown in the QR',
    );
    await failsWith(
      Promise.resolve().then(() =>
        f.d1.sqlite
          .prepare(
            "INSERT INTO tickets (id, order_id, event_id, tier_id, holder_name, holder_email, qr_token, qr_signature_hash, status, created_at, order_item_id, version, qr_salt, qr_key_id, seq, released_on_void) SELECT 'tkt_forged', order_id, event_id, tier_id, holder_name, holder_email, 'tkt_forged', 'x', 'valid', 0, order_item_id, 1, 's', 'GL1', 2, 0 FROM tickets LIMIT 1",
          )
          .run(),
      ),
      'TICKET_ISSUE_INVALID',
    );
    // The legacy plaintext-token scanner never admits a managed ticket, by its id or by its handle.
    const managed = f.q('SELECT id, event_id, qr_token FROM tickets') as {
      id: string;
      event_id: string;
      qr_token: string;
    };
    const legacy = new LiveService(createDb(asD1(f.d1)));
    for (const qrToken of [managed.id, managed.qr_token])
      await assert.rejects(
        legacy.scanTicketPass('usr_door', { eventId: managed.event_id, qrToken }),
        /^Error: NOT_FOUND/,
      );
    assert.equal(f.q('SELECT status FROM tickets').status, 'valid');
  });

  test('voiding releases once; refunding a voided ticket does not release again; terminal states stay terminal', async () => {
    const f = wrap(await createMigratedD1());
    seed(f.d1, {
      tiers: [{ id: 'tier_ga', capacity: 10, seats: 2 }],
      sections: [{ id: 'sec_a', tierId: 'tier_ga', capacity: 10 }],
    });
    const o = order();
    const [t1, t2, t3] = await sellAndIssue(f, o, [item('tier_ga', 3, { sectionId: 'sec_a' })]);
    assert.deepEqual(counts(f), { reserved: 6, sold: 6 });

    const voids = await Promise.all([
      allRows(f.db, voidTicketStatement({ ticketId: t1, reason: 'organizer', now: NOW + 20 })),
      allRows(f.db, voidTicketStatement({ ticketId: t1, reason: 'staff', now: NOW + 20 })),
    ]);
    assert.equal(voids[0].length + voids[1].length, 1);
    assert.deepEqual(counts(f), { reserved: 4, sold: 4 });
    assert.deepEqual(sectionCounts(f, 'sec_a'), { reserved: 4, sold: 4 });
    assert.deepEqual(f.q('SELECT status, released_on_void, void_reason FROM tickets WHERE id = ?', t1), {
      status: 'voided',
      released_on_void: 1,
      void_reason: 'organizer',
    });

    assert.equal((await allRows(f.db, refundTicketStatement({ ticketId: t1, now: NOW + 30 }))).length, 1);
    assert.deepEqual(counts(f), { reserved: 4, sold: 4 }, 'refund after void releases nothing more');
    assert.equal((await allRows(f.db, refundTicketStatement({ ticketId: t2, now: NOW + 30 }))).length, 1);
    assert.deepEqual(counts(f), { reserved: 2, sold: 2 });
    assert.equal((await allRows(f.db, refundTicketStatement({ ticketId: t2, now: NOW + 31 }))).length, 0);

    await failsWith(
      runBatch(f.db, [{ sql: "UPDATE tickets SET status = 'valid' WHERE id = ?1", params: [t1] }]),
      'TICKET_TERMINAL',
    );
    await failsWith(
      runBatch(f.db, [{ sql: 'UPDATE tickets SET seq = 9 WHERE id = ?1', params: [t3] }]),
      'TICKET_IMMUTABLE',
    );
    await failsWith(
      runBatch(f.db, [{ sql: 'UPDATE tickets SET version = 0 WHERE id = ?1', params: [t3] }]),
      'TICKET_IMMUTABLE',
    );

    assert.deepEqual(
      (
        await allRows(f.db, voidOrderTicketsStatement({ orderId: o.id, reason: 'dispute', now: NOW + 40 }))
      ).map((r) => r.id),
      [t3],
    );
    assert.deepEqual(counts(f), { reserved: 0, sold: 0 });
    assert.deepEqual(
      await allRows(f.db, voidEventTicketsStatement({ eventId: 'evt_sample', now: NOW + 50 })),
      [],
    );
  });

  test('refund totals accumulate and can never exceed the order total', async () => {
    const f = wrap(await createMigratedD1());
    seed(f.d1);
    const o = order();
    const [it] = [item('tier_ga', 2)];
    await sellAndIssue(f, o, [it]);
    assert.equal(f.q('SELECT total_cents FROM ticket_orders').total_cents, 5000);
    const [partial] = await allRows(
      f.db,
      addOrderRefundStatement({ orderId: o.id, amountCents: 2500, now: NOW }),
    );
    assert.deepEqual(
      { ...partial },
      { amount_refunded_cents: 2500, total_cents: 5000, status: 'partially_refunded' },
    );
    await failsWith(
      runBatch(f.db, [addOrderRefundStatement({ orderId: o.id, amountCents: 2501, now: NOW })]),
      'REFUND_EXCEEDS_TOTAL',
    );
    const [full] = await allRows(
      f.db,
      addOrderRefundStatement({ orderId: o.id, amountCents: 2500, now: NOW }),
    );
    assert.equal(full.status, 'refunded');
    assert.equal(
      (
        await allRows(
          f.db,
          reconcileOrderRefundStatement({ orderId: o.id, amountRefundedCents: 4000, now: NOW }),
        )
      ).length,
      0,
      'never decreases',
    );
    await failsWith(
      runBatch(f.db, [{ sql: 'UPDATE ticket_orders SET amount_refunded_cents = 1', params: [] }]),
      'REFUND_EXCEEDS_TOTAL',
    );
    assert.throws(() => addOrderRefundStatement({ orderId: o.id, amountCents: 0, now: NOW }), RangeError);
    await allRows(f.db, addItemRefundedQuantityStatement({ orderItemId: it.item.id, quantity: 2, now: NOW }));
    await assert.rejects(
      runBatch(f.db, [addItemRefundedQuantityStatement({ orderItemId: it.item.id, quantity: 1, now: NOW })]),
      /CHECK constraint failed/,
    );
  });

  test('order transitions are conditional; transfers bump the version once', async () => {
    const f = wrap(await createMigratedD1());
    seed(f.d1);
    const o = order();
    const [t] = await sellAndIssue(f, o, [item('tier_ga', 1)]);
    assert.equal(
      (
        await allRows(
          f.db,
          transitionOrderStatement({ orderId: o.id, from: ['pending_payment'], to: 'paid', now: NOW }),
        )
      ).length,
      0,
    );
    const done = await allRows(
      f.db,
      transitionOrderStatement({
        orderId: o.id,
        from: ['paid'],
        to: 'confirmed',
        now: NOW,
        set: { confirmedAt: NOW, paymentStatus: 'paid' },
      }),
    );
    assert.deepEqual(
      done.map((r) => ({ ...r })),
      [{ id: o.id, status: 'confirmed' }],
    );
    assert.deepEqual(f.q('SELECT payment_status, confirmed_at FROM ticket_orders'), {
      payment_status: 'paid',
      confirmed_at: NOW,
    });
    assert.throws(
      () => transitionOrderStatement({ orderId: o.id, from: [], to: 'paid', now: NOW }),
      RangeError,
    );

    const bump = (expectedVersion: number) =>
      bumpTicketVersionStatement({
        ticketId: t,
        expectedVersion,
        qrSalt: newQrSalt(),
        qrKeyId: 'GL1',
        qrSignatureHash: 'b'.repeat(64),
        now: NOW + 1,
        transfer: {
          holderName: 'Sample Friend',
          holderEmail: 'friend@example.org',
          customerProfileId: null,
          previousEmail: o.purchaserEmail,
        },
      });
    const both = await Promise.all([allRows(f.db, bump(1)), allRows(f.db, bump(1))]);
    assert.equal(both[0].length + both[1].length, 1, 'two concurrent transfers of version 1: one wins');
    assert.deepEqual(
      f.q('SELECT version, transfer_count, holder_email, transferred_from_ticket_email FROM tickets'),
      {
        version: 2,
        transfer_count: 1,
        holder_email: 'friend@example.org',
        transferred_from_ticket_email: 'sample.buyer@example.org',
      },
    );
    assert.deepEqual(counts(f), { reserved: 1, sold: 1 }, 'a transfer is not a release');
  });
});

describe('seats (Phase 2 schema)', () => {
  test('one active hold or ticket per seat; the seat frees again after release or void', async () => {
    const f = wrap(await createMigratedD1());
    seed(f.d1, {
      tiers: [{ id: 'tier_ga', capacity: 10 }],
      sections: [{ id: 'sec_a', tierId: 'tier_ga', capacity: 10 }],
      seats: [{ id: 'seat_1', sectionId: 'sec_a' }],
    });
    const seatItem = () => item('tier_ga', 1, { sectionId: 'sec_a', seatId: 'seat_1' });
    const a = order();
    await runBatch(f.db, buildHoldBatch({ order: a, items: [seatItem()] }));
    await failsWith(
      runBatch(f.db, buildHoldBatch({ order: order(), items: [seatItem()] })),
      'SEAT_ALREADY_HELD',
    );
    await allRows(f.db, releaseOrderHoldsStatement({ orderId: a.id, now: NOW }));

    const b = order();
    const [ticketId] = await sellAndIssue(f, b, [seatItem()]);
    await failsWith(runBatch(f.db, buildHoldBatch({ order: order(), items: [seatItem()] })), 'SEAT_TAKEN');
    await allRows(f.db, voidTicketStatement({ ticketId, reason: 'organizer', now: NOW }));
    const c = order();
    await sellAndIssue(f, c, [seatItem()]);
    assert.equal(
      Number(f.q("SELECT count(*) AS n FROM tickets WHERE seat_id = 'seat_1' AND status = 'valid'").n),
      1,
    );
    await assert.rejects(
      runBatch(
        f.db,
        buildHoldBatch({
          order: order(),
          items: [item('tier_ga', 2, { sectionId: 'sec_a', seatId: 'seat_1' })],
        }),
      ),
      /CHECK constraint failed/,
      'a seat item is exactly one ticket',
    );
  });
});

describe('scanning', () => {
  async function scanFixture() {
    const f = wrap(await createMigratedD1());
    seed(f.d1, { tiers: [{ id: 'tier_ga', capacity: 10 }] });
    seed(f.d1, { eventId: 'evt_other', tiers: [{ id: 'tier_other', capacity: 5 }] });
    const [t1, t2] = await sellAndIssue(f, order(), [item('tier_ga', 2)]);
    const [other] = await sellAndIssue(f, order({ eventId: 'evt_other' }), [item('tier_other', 1)]);
    return { f, t1, t2, other };
  }
  const ctx = (ticketId: string, over: Partial<ScanContext> = {}): ScanContext => ({
    scanEventId: newPrefixedId('scan'),
    eventId: 'evt_sample',
    ticketId,
    ticketVersion: 1,
    dayKey: '2030-03-17',
    gate: 'Gate A',
    now: NOW + 100,
    ...over,
  });
  const result = async (f: Fixture, specs: SqlStatementSpec[]) => {
    const rows = await runBatch(f.db, specs);
    const last = rows[rows.length - 1][0] as { result: string; conflict?: string } | undefined;
    return last;
  };

  test('two concurrent scan-ins of one ticket produce exactly one admission', async () => {
    const { f, t1 } = await scanFixture();
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, (_, i) => result(f, buildScanInBatch(ctx(t1, { gate: `Gate ${i}` }), null))),
    );
    assert.deepEqual(
      outcomes.map((o) => o!.result).sort(),
      ['admitted', ...Array(5).fill('already_inside')].sort(),
    );
    assert.deepEqual(f.q('SELECT state, entry_count, exit_count FROM ticket_presence'), {
      state: 'inside',
      entry_count: 1,
      exit_count: 0,
    });
    assert.equal(rowCount(f, 'ticket_scan_events'), 6);
  });

  test('exit and re-entry follow the policy limit; duplicates by client scan id are recorded once', async () => {
    const { f, t1, t2 } = await scanFixture();
    assert.equal((await result(f, buildScanInBatch(ctx(t1), 1)))!.result, 'admitted');
    assert.equal((await result(f, buildScanOutBatch(ctx(t1))))!.result, 'exited');
    assert.equal((await result(f, buildScanOutBatch(ctx(t1))))!.result, 'not_inside');
    assert.equal((await result(f, buildScanInBatch(ctx(t1), 1)))!.result, 'already_used', 're-entry off');
    assert.equal((await result(f, buildScanInBatch(ctx(t1), 2)))!.result, 'admitted', 'one re-entry allowed');
    await result(f, buildScanOutBatch(ctx(t1)));
    assert.equal((await result(f, buildScanInBatch(ctx(t1), 2)))!.result, 'reentry_denied');
    assert.equal(
      (await result(f, buildScanInBatch(ctx(t1), 2, { reason: 'Supervisor: re-entry for medication' })))!
        .result,
      'override_admitted',
    );
    assert.deepEqual(
      f.q('SELECT entry_count, exit_count, state FROM ticket_presence WHERE ticket_id = ?', t1),
      {
        entry_count: 3,
        exit_count: 2,
        state: 'inside',
      },
    );
    assert.equal(
      (await result(f, buildScanInBatch(ctx(t1, { dayKey: '2030-03-18' }), 1)))!.result,
      'admitted',
      'a new day',
    );
    assert.throws(() => buildScanInBatch(ctx(t1), 1, { reason: '  ' }), RangeError);

    f.d1.sqlite.exec(
      "INSERT INTO scanner_sessions (id, event_id, label, link_token_hash, pin_hash, pin_salt, expires_at, created_at) VALUES ('ss_1', 'evt_sample', 'Gate A', '" +
        'c'.repeat(64) +
        `', 'pbkdf2_sha256$100000$x', 'aa', ${NOW + 86400}, ${NOW})`,
    );
    const dup = { scannerSessionId: 'ss_1', clientScanId: 'device-1-0001' };
    const first = await result(f, buildScanInBatch(ctx(t2, dup), null));
    const again = await result(f, buildScanInBatch(ctx(t2, { ...dup, now: NOW + 101 }), null));
    assert.equal(first!.result, 'admitted');
    assert.equal(again, undefined, 'the repeat inserts nothing');
    assert.equal(
      Number(f.q("SELECT count(*) AS n FROM ticket_scan_events WHERE client_scan_id = 'device-1-0001'").n),
      1,
    );
  });

  test('scan outcomes for unknown, wrong-event, stale, voided and refunded tickets; offline duplicates flagged', async () => {
    const { f, t1, t2, other } = await scanFixture();
    const unknown = newTicketId();
    assert.equal((await result(f, buildScanInBatch(ctx(unknown), null)))!.result, 'not_found');
    assert.equal(
      f.q('SELECT ticket_id FROM ticket_scan_events ORDER BY received_at LIMIT 1').ticket_id,
      null,
    );
    assert.equal((await result(f, buildScanInBatch(ctx(other), null)))!.result, 'wrong_event');
    assert.equal(
      (await result(f, buildScanInBatch(ctx(t1, { ticketVersion: 2 }), null)))!.result,
      'stale_version',
    );
    await allRows(f.db, voidTicketStatement({ ticketId: t1, reason: 'organizer', now: NOW }));
    assert.equal((await result(f, buildScanInBatch(ctx(t1), null)))!.result, 'voided');
    await allRows(f.db, refundTicketStatement({ ticketId: t2, now: NOW }));
    assert.equal((await result(f, buildScanInBatch(ctx(t2), null)))!.result, 'refunded');
    assert.equal(rowCount(f, 'ticket_presence'), 0, 'nothing was admitted');

    const [fresh] = await sellAndIssue(f, order(), [item('tier_ga', 1)]);
    const online = await result(f, buildScanInBatch(ctx(fresh), null));
    const offline = await result(
      f,
      buildScanInBatch(ctx(fresh, { offline: true, deviceScannedAt: NOW + 50 }), null),
    );
    assert.equal(online!.result, 'admitted');
    assert.deepEqual(
      { result: offline!.result, conflict: offline!.conflict },
      { result: 'already_inside', conflict: 'duplicate_offline' },
    );

    const [rejected] = await allRows(
      f.db,
      insertRejectedScanStatement(
        {
          scanEventId: newPrefixedId('scan'),
          eventId: 'evt_sample',
          ticketId: unknown,
          dayKey: '2030-03-17',
          now: NOW,
        },
        'in',
        'invalid',
      ),
    );
    assert.equal(rejected.result, 'invalid');
  });
});

/** Runs SQL batches from several worker threads against one file database (real concurrent connections). */
async function runInWorkers(path: string, batchesPerWorker: SqlStatementSpec[][][]) {
  const code = `
    const { workerData, parentPort } = require('node:worker_threads');
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(workerData.path);
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=20000;');
    const out = [];
    for (const batch of workerData.batches) {
      try {
        db.exec('BEGIN IMMEDIATE');
        const rows = [];
        for (const s of batch) rows.push(db.prepare(s.sql).all(...s.params));
        db.exec('COMMIT');
        out.push({ ok: true, rows });
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch {}
        out.push({ ok: false, message: String(e && e.message) });
      }
    }
    db.close();
    parentPort.postMessage(out);
  `;
  const runs = batchesPerWorker.map(
    (batches) =>
      new Promise<Array<{ ok: boolean; rows?: unknown[][]; message?: string }>>((resolve, reject) => {
        const w = new Worker(code, { eval: true, workerData: { path, batches } });
        w.once('message', resolve);
        w.once('error', reject);
      }),
  );
  return (await Promise.all(runs)).flat();
}

describe('across connections (worker threads, one file database)', () => {
  test('hold batches from 8 connections never oversell; concurrent scan-ins admit once', async () => {
    // GAMO_TEST_TMPDIR lets a sandboxed run keep temp files in its own scratch directory.
    const dir = mkdtempSync(join(process.env.GAMO_TEST_TMPDIR ?? tmpdir(), 'gamo-ticketing-'));
    const path = join(dir, 'db.sqlite');
    try {
      const d1 = await createMigratedD1(path);
      d1.sqlite.exec('PRAGMA journal_mode=WAL');
      const f = wrap(d1);
      seed(d1, { tiers: [{ id: 'tier_ga', capacity: 10 }] });

      const workers = Array.from({ length: 8 }, () =>
        Array.from({ length: 8 }, () => buildHoldBatch({ order: order(), items: [item('tier_ga', 1)] })),
      );
      const outcomes = await runInWorkers(path, workers);
      assert.equal(outcomes.length, 64);
      assert.equal(outcomes.filter((o) => o.ok).length, 10);
      for (const o of outcomes.filter((x) => !x.ok))
        assert.equal(ticketingErrorCode({ message: o.message }), 'SOLD_OUT', String(o.message));
      assert.deepEqual(counts(f), { reserved: 10, sold: 0 });
      assert.equal(rowCount(f, 'ticket_holds'), 10);

      // Issue one ticket, then race 8 connections × 4 scan-ins on it.
      f.d1.sqlite.exec(
        "UPDATE ticket_holds SET status = 'released' WHERE rowid IN (SELECT rowid FROM ticket_holds LIMIT 9)",
      );
      const sold = f.q("SELECT order_id FROM ticket_holds WHERE status = 'held'").order_id as string;
      const itemRow = f.q('SELECT id FROM order_items WHERE order_id = ?', sold);
      await runBatch(f.db, [convertOrderHoldsStatement({ orderId: sold, now: NOW })]);
      const ticketId = newTicketId();
      await runBatch(f.db, [
        insertTicketStatement({
          id: ticketId,
          orderId: sold,
          orderItemId: itemRow.id as string,
          eventId: 'evt_sample',
          categoryId: 'tier_ga',
          holderName: 'Sample Holder',
          holderEmail: 'sample.buyer@example.org',
          seq: 1,
          qrKeyId: 'GL1',
          qrSalt: newQrSalt(),
          qrSignatureHash: await macDigest('X'),
          now: NOW,
        }),
      ]);
      const scans = Array.from({ length: 8 }, (_, w) =>
        Array.from({ length: 4 }, (_, i) =>
          buildScanInBatch(
            {
              scanEventId: `scan_w${w}_${i}`,
              eventId: 'evt_sample',
              ticketId,
              ticketVersion: 1,
              dayKey: '2030-03-17',
              now: NOW + i,
            },
            1,
          ),
        ),
      );
      const scanOutcomes = await runInWorkers(path, scans);
      assert.ok(
        scanOutcomes.every((o) => o.ok),
        JSON.stringify(scanOutcomes.find((o) => !o.ok)),
      );
      const results = scanOutcomes.map((o) => (o.rows![1][0] as { result: string }).result);
      assert.equal(results.filter((r) => r === 'admitted').length, 1);
      assert.equal(results.filter((r) => r === 'already_inside').length, 31);
      assert.deepEqual(f.q('SELECT entry_count FROM ticket_presence'), { entry_count: 1 });
      d1.sqlite.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
