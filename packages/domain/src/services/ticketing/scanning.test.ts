/**
 * Door scanning on a migrated database: the database decides admission (design §5.3).
 * Fictional sample data only.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { newPrefixedId, newTicketId } from '../../security/ids.ts';
import { newQrSalt, signTicketQr } from '../../security/ticket-qr.ts';
import { runBatch } from '../../security/sql-database.ts';
import { SecretNotConfiguredError } from '../../security/crypto.ts';
import { bumpTicketVersionStatement, voidTicketStatement } from '../../ticketing/sql.ts';
import {
  eventHeadcount,
  lookupTickets,
  overrideAdmit,
  scanTicket,
  ScanRequestError,
  zoneAllowed,
  type ScanActor,
} from './scanning.ts';
import { holderInitials, venueDayKey } from './scanning-context.ts';
import { syncOfflineScans } from './manifest.ts';
import { DoorSaleError, sellAtDoor } from './scanning-door-sales.ts';
import { revokeScannerSession } from './scanner-sessions.ts';
import {
  createFixture,
  issueTickets,
  QR_KEYS,
  scannerDevice,
  seedEvent,
  TEST_ENV,
  type Fixture,
} from './scanning-test-fixtures.ts';

const NOW = 1_900_000_000;
const HOUR = 3600;

async function basic(policy?: Parameters<typeof seedEvent>[1]['policy']) {
  const f = await createFixture();
  const eventId = seedEvent(f, {
    startsAt: NOW + HOUR,
    tiers: [
      { id: 'tier_ga', capacity: 50, name: 'General admission' },
      { id: 'tier_vip', capacity: 10, zones: ['VIP'], name: 'VIP' },
    ],
    policy,
  });
  return { f, eventId };
}

const scan = (
  f: Fixture,
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

const organizer: ScanActor = { kind: 'organizer', userId: 'usr_owner' };

describe('online scanning', () => {
  test('two scanners racing on one ticket: exactly one admitted, the other already inside', async () => {
    const { f, eventId } = await basic();
    const [t] = await issueTickets(f, {
      eventId,
      categoryId: 'tier_ga',
      quantity: 1,
      holderName: 'Grace Hopper',
      now: NOW,
    });
    const a = await scannerDevice(f, { eventId, now: NOW, label: 'Gate A' });
    const b = await scannerDevice(f, { eventId, now: NOW, label: 'Gate B' });
    const results = await Promise.all([
      scan(f, eventId, { kind: 'scanner', device: a.device }, t.payload, 'in', { clientScanId: 'a-1' }),
      scan(f, eventId, { kind: 'scanner', device: b.device }, t.payload, 'in', { clientScanId: 'b-1' }),
    ]);
    assert.deepEqual(results.map((r) => r.result).sort(), ['admitted', 'already_inside']);
    const second = results.find((r) => r.result === 'already_inside')!;
    assert.ok(second.detail.gate, 'already inside says where');
    assert.ok(second.detail.atText, 'already inside says when');
    assert.equal(f.q("SELECT count(*) AS n FROM ticket_scan_events WHERE result = 'admitted'").n, 1);
    assert.equal(f.q('SELECT entry_count AS n FROM ticket_presence WHERE ticket_id = ?', t.id).n, 1);
    // Only first name + last initial ever leave the server.
    assert.equal(results[0].ticket?.holder, 'Grace H.');
    assert.ok(!JSON.stringify(results).includes('sample.buyer@example.org'));
    assert.ok(!JSON.stringify(results).includes('Hopper'));
  });

  test('the same client scan id twice is recorded once and answers the stored result', async () => {
    const { f, eventId } = await basic();
    const [t] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 1, now: NOW });
    const { device } = await scannerDevice(f, { eventId, now: NOW });
    const actor: ScanActor = { kind: 'scanner', device };
    const first = await scan(f, eventId, actor, t.payload, 'in', { clientScanId: 'dup-1' });
    const again = await scan(f, eventId, actor, t.payload, 'in', { clientScanId: 'dup-1', now: NOW + 2 });
    assert.equal(first.result, 'admitted');
    assert.equal(again.result, 'admitted');
    assert.equal(again.repeated, true);
    assert.equal(again.scanId, first.scanId);
    assert.equal(f.q('SELECT count(*) AS n FROM ticket_scan_events').n, 1);
    // A rejected scan is deduplicated the same way.
    const bad1 = await scan(f, eventId, actor, 'GL1.NOPE', 'in', { clientScanId: 'dup-2' });
    const bad2 = await scan(f, eventId, actor, 'GL1.NOPE', 'in', { clientScanId: 'dup-2' });
    assert.equal(bad1.result, 'invalid');
    assert.equal(bad2.repeated, true);
    assert.equal(f.q('SELECT count(*) AS n FROM ticket_scan_events').n, 2);
  });

  test('entry → exit → re-entry with unlimited re-entry', async () => {
    const { f, eventId } = await basic();
    const [t] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 1, now: NOW });
    const steps = [
      await scan(f, eventId, organizer, t.payload, 'in'),
      await scan(f, eventId, organizer, t.payload, 'in'),
      await scan(f, eventId, organizer, t.payload, 'out'),
      await scan(f, eventId, organizer, t.payload, 'out'),
      await scan(f, eventId, organizer, t.payload, 'in'),
    ].map((r) => r.result);
    assert.deepEqual(steps, ['admitted', 'already_inside', 'exited', 'not_inside', 'admitted']);
    assert.deepEqual((await eventHeadcount(f.db, eventId, NOW)).insideNow, 1);
  });

  test('re-entry not allowed → already used; re-entry limit 1 → limit reached on the third entry', async () => {
    const off = await basic({ reentry_allowed: 0 });
    const [t] = await issueTickets(off.f, {
      eventId: off.eventId,
      categoryId: 'tier_ga',
      quantity: 1,
      now: NOW,
    });
    const r1 = [
      await scan(off.f, off.eventId, organizer, t.payload, 'in'),
      await scan(off.f, off.eventId, organizer, t.payload, 'out'),
      await scan(off.f, off.eventId, organizer, t.payload, 'in'),
    ];
    assert.deepEqual(
      r1.map((r) => r.result),
      ['admitted', 'exited', 'already_used'],
    );
    assert.ok(r1[2].message.includes('Re-entry is not allowed'));

    const lim = await basic({ reentry_allowed: 1, reentry_limit: 1 });
    const [u] = await issueTickets(lim.f, {
      eventId: lim.eventId,
      categoryId: 'tier_ga',
      quantity: 1,
      now: NOW,
    });
    const r2 = [];
    for (const dir of ['in', 'out', 'in', 'out', 'in'] as const)
      r2.push((await scan(lim.f, lim.eventId, organizer, u.payload, dir)).result);
    assert.deepEqual(r2, ['admitted', 'exited', 'admitted', 'exited', 'reentry_denied']);
  });

  test('wrong zone: a VIP-only gate refuses general tickets and a GA gate refuses VIP-only tickets', async () => {
    const { f, eventId } = await basic();
    const [ga] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 1, now: NOW });
    const [vip] = await issueTickets(f, { eventId, categoryId: 'tier_vip', quantity: 1, now: NOW });
    const vipGate = await scannerDevice(f, { eventId, now: NOW, allowedZones: ['VIP'] });
    const gaGate = await scannerDevice(f, { eventId, now: NOW, allowedZones: ['GA'] });
    const open = await scannerDevice(f, { eventId, now: NOW });
    const refused = await scan(f, eventId, { kind: 'scanner', device: vipGate.device }, ga.payload);
    assert.equal(refused.result, 'wrong_zone');
    assert.deepEqual(refused.detail.allowedZones, ['VIP']);
    assert.match(refused.message, /admits VIP only/);
    assert.equal(
      (await scan(f, eventId, { kind: 'scanner', device: gaGate.device }, vip.payload)).result,
      'wrong_zone',
    );
    assert.equal(
      (await scan(f, eventId, { kind: 'scanner', device: vipGate.device }, vip.payload)).result,
      'admitted',
    );
    assert.equal(
      (await scan(f, eventId, { kind: 'scanner', device: open.device }, ga.payload)).result,
      'admitted',
    );
    assert.equal(zoneAllowed(['vip'], ['VIP']), true);
    assert.equal(zoneAllowed([], null), true);
  });

  test('stale version after a transfer/reissue bump; the new code admits', async () => {
    const { f, eventId } = await basic();
    const [t] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 1, now: NOW });
    const salt = newQrSalt();
    const v2 = await signTicketQr({ ticketId: t.id, version: 2, eventId, salt }, QR_KEYS);
    assert.ok(v2.ok);
    const [bumped] = await runBatch(f.db, [
      bumpTicketVersionStatement({
        ticketId: t.id,
        expectedVersion: 1,
        qrSalt: salt,
        qrKeyId: 'GL1',
        qrSignatureHash: v2.macDigest,
        now: NOW,
      }),
    ]);
    assert.equal(bumped.length, 1);
    const old = await scan(f, eventId, organizer, t.payload);
    assert.equal(old.result, 'stale_version');
    assert.match(old.message, /transferred or reissued/);
    assert.equal((await scan(f, eventId, organizer, v2.payload)).result, 'admitted');
    // A reissue that keeps the salt: the old MAC still verifies for version 1, the version check refuses it.
    const [u] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 1, now: NOW });
    const same = await signTicketQr({ ticketId: u.id, version: 2, eventId, salt: u.salt }, QR_KEYS);
    assert.ok(same.ok);
    await runBatch(f.db, [
      bumpTicketVersionStatement({
        ticketId: u.id,
        expectedVersion: 1,
        qrSalt: u.salt,
        qrKeyId: 'GL1',
        qrSignatureHash: same.macDigest,
        now: NOW,
      }),
    ]);
    assert.equal((await scan(f, eventId, organizer, u.payload)).result, 'stale_version');
    assert.equal(f.q('SELECT count(*) AS n FROM ticket_presence WHERE ticket_id = ?', u.id).n, 0);
  });

  test('wrong event shows only that event title; tampered, unknown, voided, cancelled and early scans are refused and recorded', async () => {
    const { f, eventId } = await basic();
    const otherId = seedEvent(f, { eventId: 'evt_other', title: 'Sample Youth Night', startsAt: NOW + HOUR });
    const [mine] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 1, now: NOW });
    const [theirs] = await issueTickets(f, {
      eventId: otherId,
      categoryId: `${otherId}_ga`,
      quantity: 1,
      holderName: 'Sample Person',
      now: NOW,
    });

    const wrong = await scan(f, eventId, organizer, theirs.payload);
    assert.equal(wrong.result, 'wrong_event');
    assert.equal(wrong.detail.eventTitle, 'Sample Youth Night');
    assert.equal(wrong.ticket, null, 'nothing about another event’s ticket holder');

    const last = mine.payload.slice(-1);
    const tampered = mine.payload.slice(0, -1) + (last === 'A' ? 'B' : 'A');
    assert.equal((await scan(f, eventId, organizer, tampered)).result, 'invalid');
    const ghost = await signTicketQr(
      { ticketId: newTicketId(), version: 1, eventId, salt: newQrSalt() },
      QR_KEYS,
    );
    assert.ok(ghost.ok);
    assert.equal((await scan(f, eventId, organizer, ghost.payload)).result, 'not_found');
    assert.equal((await scan(f, eventId, organizer, 'hello world')).result, 'invalid');

    const early = await scan(f, eventId, organizer, mine.payload, 'in', { now: NOW - 2 * HOUR });
    assert.equal(early.result, 'not_open_yet');
    assert.match(early.message, /Scanning opens at/);

    await runBatch(f.db, [voidTicketStatement({ ticketId: mine.id, reason: 'organizer', now: NOW })]);
    assert.equal((await scan(f, eventId, organizer, mine.payload)).result, 'voided');

    const [another] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 1, now: NOW });
    f.d1.sqlite.prepare('UPDATE events SET cancelled_at = ? WHERE id = ?').run(NOW, eventId);
    assert.equal((await scan(f, eventId, organizer, another.payload)).result, 'event_cancelled');
    assert.equal(f.q('SELECT count(*) AS n FROM ticket_scan_events WHERE event_id = ?', eventId).n, 7);
    assert.equal(f.q('SELECT count(*) AS n FROM ticket_presence').n, 0, 'nothing was admitted');
  });

  test('without QR keys outside local the scan fails closed', async () => {
    const { f, eventId } = await basic();
    const [t] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 1, now: NOW });
    await assert.rejects(
      scanTicket(f.db, {
        eventId,
        code: t.payload,
        direction: 'in',
        actor: organizer,
        keyring: {},
        now: NOW,
      }),
      SecretNotConfiguredError,
    );
  });

  test('an entry-only scanner cannot record exits', async () => {
    const { f, eventId } = await basic();
    const [t] = await issueTickets(f, { eventId, categoryId: 'tier_ga', quantity: 1, now: NOW });
    const { device } = await scannerDevice(f, { eventId, now: NOW, allowedDirections: 'in' });
    await assert.rejects(
      scan(f, eventId, { kind: 'scanner', device }, t.payload, 'out'),
      (e: unknown) => e instanceof ScanRequestError && e.code === 'DIRECTION_NOT_ALLOWED',
    );
  });

  test('legacy gamt_ passes admit once, atomically', async () => {
    const { f, eventId } = await basic();
    const token = `gamt_evtsampl_${'ab'.repeat(16)}`;
    f.d1.sqlite.exec(
      `INSERT INTO ticket_orders (id, order_number, event_id, purchaser_name, purchaser_email, idempotency_key, status, created_at) VALUES ('ord_legacy', 'L-1', '${eventId}', 'Sample Guest', 'guest@example.org', 'legacy-1', 'confirmed', ${NOW});
       INSERT INTO tickets (id, order_id, event_id, tier_id, holder_name, holder_email, qr_token, qr_signature_hash, status, created_at) VALUES ('tkt_legacy_1', 'ord_legacy', '${eventId}', 'tier_ga', 'Sample Guest', 'guest@example.org', '${token}', 'x', 'valid', ${NOW});`,
    );
    const [a, b] = await Promise.all([
      scan(f, eventId, organizer, token),
      scan(f, eventId, organizer, token),
    ]);
    assert.deepEqual([a.result, b.result].sort(), ['admitted', 'already_used']);
    assert.equal(f.q("SELECT status FROM tickets WHERE id = 'tkt_legacy_1'").status, 'checked_in');
    assert.equal((await eventHeadcount(f.db, eventId, NOW)).insideNow, 1);
  });
});

describe('venue-local day keys and multi-day passes', () => {
  test('day keys follow the venue zone across DST and midnight', () => {
    const zone = 'America/New_York';
    // 2026-11-01 02:00 EDT → 01:00 EST (DST ends).
    assert.equal(venueDayKey(Date.UTC(2026, 9, 31, 3, 59) / 1000, zone), '2026-10-30'); // 23:59 EDT
    assert.equal(venueDayKey(Date.UTC(2026, 9, 31, 4, 0) / 1000, zone), '2026-10-31'); // 00:00 EDT
    assert.equal(venueDayKey(Date.UTC(2026, 10, 2, 4, 30) / 1000, zone), '2026-11-01'); // 23:30 EST (a fixed −4 h would say 11-02)
    assert.equal(venueDayKey(Date.UTC(2026, 10, 2, 5, 0) / 1000, zone), '2026-11-02'); // 00:00 EST
    assert.equal(venueDayKey(Date.UTC(2026, 2, 8, 6, 59) / 1000, zone), '2026-03-08'); // spring forward day
    assert.equal(venueDayKey(Date.UTC(2026, 10, 2, 6, 30) / 1000, 'America/Phoenix'), '2026-11-01'); // no DST
  });

  test('a two-day pass enters once per operating day (05:00 cutoff) across the DST change, and not on other days', async () => {
    const f = await createFixture();
    const zone = 'America/New_York';
    const startsAt = Date.UTC(2026, 9, 31, 22, 0) / 1000; // 18:00 EDT Sat 31 Oct
    const eventId = seedEvent(f, {
      startsAt,
      endsAt: Date.UTC(2026, 10, 2, 16, 0) / 1000, // Monday 11:00 EST
      timezone: zone,
      tiers: [
        { id: 'tier_pass', capacity: 20, validDays: ['2026-10-31', '2026-11-01'], name: 'Weekend pass' },
      ],
      policy: { reentry_allowed: 0 },
    });
    const [t] = await issueTickets(f, {
      eventId,
      categoryId: 'tier_pass',
      quantity: 1,
      now: startsAt - 86400,
    });
    const sat2359 = Date.UTC(2026, 10, 1, 3, 59) / 1000; // 23:59 EDT Saturday
    const sun0001 = Date.UTC(2026, 10, 1, 4, 1) / 1000; // 00:01 EDT Sunday: still Saturday's operating day
    const sun0600 = Date.UTC(2026, 10, 1, 11, 0) / 1000; // 06:00 EST Sunday (after the change): Sunday begins
    const sun2330 = Date.UTC(2026, 10, 2, 4, 30) / 1000; // 23:30 EST Sunday
    const mon0600 = Date.UTC(2026, 10, 2, 11, 0) / 1000; // 06:00 EST Monday
    const at = (now: number, dir: 'in' | 'out' = 'in') =>
      scan(f, eventId, organizer, t.payload, dir, { now });
    assert.equal((await at(sat2359)).result, 'admitted');
    assert.equal((await at(sat2359 + 30, 'out')).result, 'exited');
    assert.equal(
      (await at(sun0001)).result,
      'already_used',
      'midnight does not start a new day: the 05:00 cutoff does',
    );
    assert.equal((await at(sun0600)).result, 'admitted', 'a new operating day after 05:00 local');
    assert.equal((await at(sun2330)).result, 'already_inside');
    assert.equal((await at(sun2330 + 60, 'out')).result, 'exited');
    assert.equal((await at(sun2330 + 120)).result, 'already_used', 'still Sunday in New York');
    const monday = await at(mon0600);
    assert.equal(monday.result, 'not_open_yet');
    assert.deepEqual(monday.detail.validDays, ['2026-10-31', '2026-11-01']);
    assert.deepEqual(
      f.all('SELECT day_key FROM ticket_presence ORDER BY day_key').map((r) => r.day_key),
      ['2026-10-31', '2026-11-01'],
    );
  });
});

describe('manual lookup and override', () => {
  test('lookup by name, email or reference is logged; override admits past the limit but never twice inside', async () => {
    const { f, eventId } = await basic({ reentry_allowed: 0 });
    const [t] = await issueTickets(f, {
      eventId,
      categoryId: 'tier_ga',
      quantity: 1,
      holderName: 'Sample Lookup Person',
      email: 'lookup.person@example.org',
      now: NOW,
    });
    const plain = await scannerDevice(f, { eventId, now: NOW });
    await assert.rejects(
      lookupTickets(f.db, {
        eventId,
        query: 'Lookup',
        actor: { kind: 'scanner', device: plain.device },
        ipHash: null,
        now: NOW,
      }),
      (e: unknown) => e instanceof ScanRequestError && e.status === 403,
    );
    const sup = await scannerDevice(f, { eventId, now: NOW, canOverride: true });
    const actor: ScanActor = { kind: 'scanner', device: sup.device };
    const byName = await lookupTickets(f.db, { eventId, query: 'lookup per', actor, ipHash: null, now: NOW });
    assert.equal(byName.results.length, 1);
    assert.equal(byName.results[0].emailMasked, 'l•••@example.org');
    const byEmail = await lookupTickets(f.db, {
      eventId,
      query: 'LOOKUP.person@example.org ',
      actor,
      ipHash: null,
      now: NOW,
    });
    assert.equal(byEmail.results[0].ticketId, t.id);
    const ref = String(f.q('SELECT order_reference AS r FROM ticket_orders WHERE id = ?', t.orderId).r);
    const byRef = await lookupTickets(f.db, {
      eventId,
      query: ref.toLowerCase().replace(/-/g, ' '),
      actor,
      ipHash: null,
      now: NOW,
    });
    assert.equal(byRef.results[0].ticketId, t.id);
    assert.equal(
      (await lookupTickets(f.db, { eventId, query: '%', actor, ipHash: null, now: NOW }).catch((e) => e))
        .status,
      400,
    );
    assert.equal(
      f.q("SELECT count(*) AS n FROM ticket_access_log WHERE action = 'lookup' AND actor_type = 'scanner'").n,
      3,
    );

    await scan(f, eventId, actor, t.payload, 'in');
    const inside = await overrideAdmit(f.db, {
      eventId,
      ticketId: t.id,
      reason: 'Phone died',
      actor,
      ipHash: null,
      now: NOW,
    });
    assert.equal(inside.result, 'already_inside');
    await scan(f, eventId, actor, t.payload, 'out');
    assert.equal((await scan(f, eventId, actor, t.payload, 'in')).result, 'already_used');
    const over = await overrideAdmit(f.db, {
      eventId,
      ticketId: t.id,
      reason: 'Stepped out to the car',
      actor,
      ipHash: null,
      now: NOW,
    });
    assert.equal(over.result, 'override_admitted');
    assert.equal(
      f.q("SELECT override_reason AS r FROM ticket_scan_events WHERE result = 'override_admitted'").r,
      'Stepped out to the car',
    );
    assert.equal(f.q("SELECT count(*) AS n FROM ticket_access_log WHERE action = 'override'").n, 2);
    await assert.rejects(
      overrideAdmit(f.db, { eventId, ticketId: t.id, reason: ' ', actor, ipHash: null, now: NOW }),
      (e: unknown) => e instanceof ScanRequestError && e.status === 400,
    );
  });

  test('holder initials', () => {
    assert.equal(holderInitials('grace brewster hopper'), 'grace H.');
    assert.equal(holderInitials('Ada'), 'Ada');
    assert.equal(holderInitials('  '), 'Guest');
  });

  test('a scan event id is unique per attempt', () => {
    assert.notEqual(newPrefixedId('scan'), newPrefixedId('scan'));
  });
});

describe('a scanner device is bound to its own event (review fix D-206)', () => {
  test('a device for event A is refused on event B for scan, lookup, override, sync and door sale', async () => {
    const f = await createFixture();
    const a = seedEvent(f, { eventId: 'evt_a', startsAt: NOW + HOUR });
    const b = seedEvent(f, {
      eventId: 'evt_b',
      startsAt: NOW + HOUR,
      policy: { door_sales_enabled: 1, door_sales_methods_json: '["free_issue"]' },
    });
    const [tb] = await issueTickets(f, {
      eventId: b,
      categoryId: `${b}_ga`,
      quantity: 1,
      holderName: 'Sample Other',
      now: NOW,
    });
    const { device } = await scannerDevice(f, { eventId: a, now: NOW, canOverride: true });
    const actor: ScanActor = { kind: 'scanner', device };
    const refused = (e: unknown) =>
      e instanceof ScanRequestError && e.status === 403 && e.code === 'NOT_ALLOWED';
    await assert.rejects(scan(f, b, actor, tb.payload), refused);
    await assert.rejects(
      lookupTickets(f.db, { eventId: b, query: 'Sample', actor, ipHash: null, now: NOW }),
      refused,
    );
    await assert.rejects(
      overrideAdmit(f.db, {
        eventId: b,
        ticketId: tb.id,
        reason: 'Phone died',
        actor,
        ipHash: null,
        now: NOW,
      }),
      refused,
    );
    await assert.rejects(
      syncOfflineScans(f.db, {
        eventId: b,
        device,
        keyring: QR_KEYS,
        now: NOW,
        scans: [{ clientScanId: 'x-1', code: tb.payload, direction: 'in', deviceScannedAt: NOW }],
      }),
      refused,
    );
    await assert.rejects(
      sellAtDoor(f.db, TEST_ENV, {
        eventId: b,
        categoryId: `${b}_ga`,
        actor,
        quantity: 1,
        method: 'free_issue',
        admitNow: true,
        idempotencyKey: 'door-cross-event-1',
        keyring: QR_KEYS,
        now: NOW,
      }),
      (e: unknown) => e instanceof DoorSaleError && e.code === 'NOT_ALLOWED',
    );
    assert.equal(f.q('SELECT count(*) AS n FROM ticket_scan_events').n, 0, 'nothing recorded');
    assert.equal(f.q('SELECT count(*) AS n FROM ticket_access_log').n, 0, 'no lookup logged');
    assert.equal(f.q("SELECT count(*) AS n FROM ticket_orders WHERE source = 'door'").n, 0, 'nothing sold');
    // The same device still works on its own event.
    const [ta] = await issueTickets(f, { eventId: a, categoryId: `${a}_ga`, quantity: 1, now: NOW });
    assert.equal((await scan(f, a, actor, ta.payload)).result, 'admitted');
  });

  test('revoking a session id under another event changes nothing', async () => {
    const f = await createFixture();
    const a = seedEvent(f, { eventId: 'evt_a', startsAt: NOW + HOUR });
    const b = seedEvent(f, { eventId: 'evt_b', startsAt: NOW + HOUR });
    const { created, device } = await scannerDevice(f, { eventId: a, now: NOW });
    assert.equal(
      await revokeScannerSession(f.db, { eventId: b, sessionId: created.id, now: NOW + 1 }),
      false,
    );
    assert.equal(f.q('SELECT revoked_at FROM scanner_sessions WHERE id = ?', created.id).revoked_at, null);
    assert.equal(
      f.q('SELECT revoked_at FROM scanner_devices WHERE id = ?', device.deviceId).revoked_at,
      null,
    );
    assert.equal(await revokeScannerSession(f.db, { eventId: a, sessionId: created.id, now: NOW + 2 }), true);
    assert.equal(
      f.q('SELECT revoked_at FROM scanner_devices WHERE id = ?', device.deviceId).revoked_at,
      NOW + 2,
    );
  });
});
