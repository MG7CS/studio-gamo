/**
 * Concurrency-review findings S1–S4 and T2 (ported from the reviewer's reproducers): replayed scan
 * ids, midnight inside one event, closing time, offline entry older than an online exit, and
 * headcount after a void. Fictional sample data only.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runBatch } from '../../security/sql-database.ts';
import { voidTicketStatement } from '../../ticketing/sql.ts';
import { syncOfflineScans } from './manifest.ts';
import { eventHeadcount, scanTicket, ticketsInsideForOrder, type ScanActor } from './scanning.ts';
import { createFixture, issueTickets, QR_KEYS, scannerDevice, seedEvent } from './scanning-test-fixtures.ts';

const NOW = 1_900_000_000;
const HOUR = 3600;
const organizer: ScanActor = { kind: 'organizer', userId: 'usr_owner' };

async function basic(
  policy?: Parameters<typeof seedEvent>[1]['policy'],
  extra: Partial<Parameters<typeof seedEvent>[1]> = {},
) {
  const f = await createFixture();
  const eventId = seedEvent(f, {
    startsAt: NOW + HOUR,
    tiers: [{ id: 'tier_ga', capacity: 50, name: 'GA' }],
    policy,
    ...extra,
  });
  return { f, eventId };
}
const scan = (
  f: Awaited<ReturnType<typeof createFixture>>,
  eventId: string,
  actor: ScanActor,
  code: string,
  direction: 'in' | 'out' = 'in',
  extra: { clientScanId?: string; now?: number; offline?: boolean; deviceScannedAt?: number } = {},
) =>
  scanTicket(f.db, {
    eventId,
    code,
    direction,
    actor,
    keyring: QR_KEYS,
    clientScanId: extra.clientScanId,
    offline: extra.offline,
    deviceScannedAt: extra.deviceScannedAt,
    now: extra.now ?? NOW,
  });

describe('S1 a replayed client scan id never re-applies presence', () => {
  test('a retried IN after an OUT answers the stored result and leaves the guest outside', async () => {
    const { f, eventId } = await basic();
    const [t] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 1, now: NOW });
    const { device } = await scannerDevice(f, { eventId, now: NOW });
    const actor: ScanActor = { kind: 'scanner', device };
    assert.equal((await scan(f, eventId, actor, t.payload, 'in', { clientScanId: 'c1' })).result, 'admitted');
    assert.equal((await scan(f, eventId, actor, t.payload, 'out', { clientScanId: 'c2' })).result, 'exited');
    const replay = await scan(f, eventId, actor, t.payload, 'in', { clientScanId: 'c1', now: NOW + 60 });
    assert.equal(replay.result, 'admitted');
    assert.equal(replay.repeated, true);
    const p = f.q('SELECT state, entry_count, exit_count FROM ticket_presence WHERE ticket_id = ?', t.id);
    assert.deepEqual(p, { state: 'outside', entry_count: 1, exit_count: 1 });
    assert.equal(f.q('SELECT count(*) AS n FROM ticket_scan_events').n, 2);
    assert.equal((await eventHeadcount(f.db, eventId, NOW)).insideNow, 0);
  });

  test('the statements themselves refuse a recorded client scan id (guard against a race past the pre-check)', async () => {
    const { f, eventId } = await basic();
    const [t] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 1, now: NOW });
    const { device } = await scannerDevice(f, { eventId, now: NOW });
    const actor: ScanActor = { kind: 'scanner', device };
    await scan(f, eventId, actor, t.payload, 'in', { clientScanId: 'r1' });
    await scan(f, eventId, actor, t.payload, 'out', { clientScanId: 'r2' });
    const { buildScanInBatch } = await import('../../ticketing/sql.ts');
    const day = String(f.q('SELECT day_key FROM ticket_presence').day_key);
    const [admit] = await runBatch(
      f.db,
      buildScanInBatch(
        {
          scanEventId: 'scan_race',
          eventId,
          ticketId: t.id,
          ticketVersion: 1,
          dayKey: day,
          scannerSessionId: device.sessionId,
          clientScanId: 'r1',
          now: NOW + 5,
        },
        null,
      ),
    );
    assert.equal(admit.length, 0, 'no admission for an already recorded client scan id');
    assert.equal(f.q('SELECT state FROM ticket_presence WHERE ticket_id = ?', t.id).state, 'outside');
  });

  test('a retried offline sync batch [in, out] is idempotent and keeps the re-entry allowance', async () => {
    const { f, eventId } = await basic({ reentry_allowed: 1, reentry_limit: 1 });
    const [t] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 1, now: NOW });
    const { device } = await scannerDevice(f, { eventId, now: NOW });
    const scans = [
      {
        clientScanId: 'o1',
        code: t.payload,
        direction: 'in' as const,
        deviceScannedAt: NOW + 10,
        localResult: 'admitted' as const,
      },
      {
        clientScanId: 'o2',
        code: t.payload,
        direction: 'out' as const,
        deviceScannedAt: NOW + 20,
        localResult: 'exited' as const,
      },
    ];
    const run = (now: number) => syncOfflineScans(f.db, { eventId, device, keyring: QR_KEYS, scans, now });
    await run(NOW + 100);
    const second = await run(NOW + 200);
    assert.ok(second.results.every((r) => !r.needsReview));
    const p = f.q('SELECT state, entry_count, exit_count FROM ticket_presence WHERE ticket_id = ?', t.id);
    assert.deepEqual(p, { state: 'outside', entry_count: 1, exit_count: 1 });
    assert.equal((await scan(f, eventId, organizer, t.payload, 'in', { now: NOW + 300 })).result, 'admitted');
  });
});

describe('S2 one operating day per event: midnight does not reset presence', () => {
  test('a 9 p.m.–2 a.m. event: an entry at 23:50 and another at 00:10 is "already inside"; headcount stays right', async () => {
    const start = Date.UTC(2030, 5, 11, 4, 0, 0) / 1000; // 21:00 America/Phoenix on 10 June
    const f = await createFixture();
    const eventId = seedEvent(f, {
      startsAt: start,
      endsAt: start + 5 * HOUR,
      tiers: [{ id: 'tier_ga', capacity: 50, name: 'GA' }],
    });
    const at2350 = Date.UTC(2030, 5, 11, 6, 50, 0) / 1000;
    const at0010 = at2350 + 20 * 60;
    const [t] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 1, now: start - 100 });
    assert.equal((await scan(f, eventId, organizer, t.payload, 'in', { now: at2350 })).result, 'admitted');
    assert.equal(
      (await scan(f, eventId, organizer, t.payload, 'in', { now: at0010 })).result,
      'already_inside',
    );
    assert.equal(
      (await eventHeadcount(f.db, eventId, at0010 + 120)).insideNow,
      1,
      'still inside after midnight',
    );
    assert.equal(
      (await scan(f, eventId, organizer, t.payload, 'out', { now: at0010 + 60 })).result,
      'exited',
    );
    assert.equal((await eventHeadcount(f.db, eventId, at0010 + 120)).insideNow, 0);
    assert.deepEqual(
      f.all('SELECT day_key FROM ticket_presence').map((r) => r.day_key),
      ['2030-06-10'],
    );
  });
});

describe('S3 scanning closes after the event', () => {
  test('a ticket is not admitted 10 days after the event; 5 hours after the end still works', async () => {
    const { f, eventId } = await basic();
    const [t] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 1, now: NOW });
    const end = NOW + HOUR + 3 * HOUR; // seedEvent: ends 3 h after the start
    const late = await scan(f, eventId, organizer, t.payload, 'in', { now: end + 10 * 86400 });
    assert.equal(late.result, 'event_ended');
    assert.equal(late.admitted, false);
    assert.match(late.message, /closed after the event ended/);
    assert.equal(f.q('SELECT count(*) AS n FROM ticket_presence').n, 0);
    assert.equal(
      (await scan(f, eventId, organizer, t.payload, 'in', { now: end + 5 * HOUR })).result,
      'admitted',
    );
  });
});

describe('S4 an offline entry older than an online exit does not put the guest back inside', () => {
  test('sync flags it superseded, keeps presence outside, counts the entry, and is idempotent', async () => {
    const { f, eventId } = await basic();
    const [t] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 1, now: NOW });
    const gateA = await scannerDevice(f, { eventId, now: NOW, label: 'A (offline)' });
    const gateB = await scannerDevice(f, { eventId, now: NOW, label: 'B (online)' });
    const tIn = NOW + HOUR + 600;
    const tOut = NOW + HOUR + HOUR;
    const out = await scan(f, eventId, { kind: 'scanner', device: gateB.device }, t.payload, 'out', {
      clientScanId: 'b-out',
      now: tOut,
    });
    assert.equal(out.result, 'not_inside');
    const scans = [
      {
        clientScanId: 'a-in',
        code: t.payload,
        direction: 'in' as const,
        deviceScannedAt: tIn,
        localResult: 'admitted' as const,
      },
    ];
    const run = (now: number) =>
      syncOfflineScans(f.db, { eventId, device: gateA.device, keyring: QR_KEYS, scans, now });
    const sync = await run(tOut + 600);
    assert.equal(sync.results[0].conflict, 'superseded');
    assert.equal(sync.results[0].needsReview, true);
    assert.equal(sync.headcount.insideNow, 0);
    const p = f.q('SELECT state, entry_count, exit_count FROM ticket_presence WHERE ticket_id = ?', t.id);
    assert.deepEqual(p, { state: 'outside', entry_count: 1, exit_count: 1 });
    const retry = await run(tOut + 900);
    assert.equal(retry.results[0].conflict, 'superseded');
    assert.deepEqual(f.q('SELECT entry_count, exit_count FROM ticket_presence WHERE ticket_id = ?', t.id), {
      entry_count: 1,
      exit_count: 1,
    });
    assert.equal(f.q('SELECT count(*) AS n FROM ticket_scan_events').n, 2);
  });
});

describe('T2 headcount after a void or refund of an admitted ticket', () => {
  test('a voided ticket inside is no longer counted, and its exit scan still clears presence', async () => {
    const { f, eventId } = await basic();
    const [t] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 2, now: NOW });
    await scan(f, eventId, organizer, t.payload, 'in');
    assert.equal(await ticketsInsideForOrder(f.db, t.orderId), 1);
    assert.equal((await eventHeadcount(f.db, eventId, NOW)).insideNow, 1);
    await runBatch(f.db, [voidTicketStatement({ ticketId: t.id, reason: 'organizer', now: NOW + 5 })]);
    assert.equal((await eventHeadcount(f.db, eventId, NOW)).insideNow, 0, 'void removes them from the count');
    const exit = await scan(f, eventId, organizer, t.payload, 'out', { now: NOW + 600 });
    assert.equal(exit.result, 'exited');
    assert.equal(f.q('SELECT state FROM ticket_presence WHERE ticket_id = ?', t.id).state, 'outside');
    assert.equal(await ticketsInsideForOrder(f.db, t.orderId), 0);
  });
});
