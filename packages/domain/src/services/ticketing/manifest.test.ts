import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { macMatchesDigest, parseTicketQr } from '../../security/ticket-qr.ts';
import { ticketIdToQrPart } from '../../security/ids.ts';
import { buildScannerManifest, syncOfflineScans } from './manifest.ts';
import { scanTicket } from './scanning.ts';
import { createFixture, issueTickets, QR_KEYS, scannerDevice, seedEvent } from './scanning-test-fixtures.ts';

const NOW = 1_900_000_000;
const HOUR = 3600;

async function setup() {
  const f = await createFixture();
  const eventId = seedEvent(f, {
    startsAt: NOW + HOUR,
    tiers: [{ id: 'tier_ga', capacity: 40, name: 'General' }],
  });
  const tickets = await issueTickets(f, {
    eventId,
    categoryId: 'tier_ga',
    quantity: 3,
    holderName: 'Samantha Example-Holder',
    email: 'private.person@example.org',
    now: NOW,
  });
  return { f, eventId, tickets };
}

describe('scanner manifest (T-10)', () => {
  test('carries what offline verification needs and no emails or full names', async () => {
    const { f, eventId, tickets } = await setup();
    const { manifest, etag } = await buildScannerManifest(f.db, eventId, NOW);
    const text = JSON.stringify(manifest);
    assert.ok(!/@/.test(text), 'no email addresses');
    assert.ok(!text.includes('Example-Holder'), 'no surnames');
    assert.ok(!text.includes('private.person'));
    assert.equal(manifest.tickets.length, 3);
    const entry = manifest.tickets.find((t) => t.i === ticketIdToQrPart(tickets[0].id))!;
    assert.equal(entry.n, 'Samantha E.');
    assert.equal(entry.v, 1);
    // A device can verify a scanned code against the digest without the signing key.
    const parsed = parseTicketQr(tickets[0].payload);
    assert.ok(parsed.ok);
    assert.equal(await macMatchesDigest(parsed.mac, entry.d), true);
    assert.equal(await macMatchesDigest(parsed.mac, manifest.tickets.find((t) => t.i !== entry.i)!.d), false);
    assert.equal(manifest.maxEntriesPerDay, null);
    // The ETag ignores the generation time and changes with presence.
    assert.equal((await buildScannerManifest(f.db, eventId, NOW + 99)).etag, etag);
    await scanTicket(f.db, {
      eventId,
      code: tickets[0].payload,
      direction: 'in',
      actor: { kind: 'organizer', userId: 'usr_owner' },
      keyring: QR_KEYS,
      now: NOW,
    });
    const after = await buildScannerManifest(f.db, eventId, NOW);
    assert.notEqual(after.etag, etag);
    const day = Object.keys(after.manifest.tickets.find((t) => t.i === entry.i)!.p)[0];
    assert.deepEqual(after.manifest.tickets.find((t) => t.i === entry.i)!.p[day], { s: 'inside', e: 1 });
  });

  test('two offline devices admit the same ticket: after sync one admitted, the other duplicate_offline', async () => {
    const { f, eventId, tickets } = await setup();
    const a = await scannerDevice(f, { eventId, now: NOW, label: 'Gate A' });
    const b = await scannerDevice(f, { eventId, now: NOW, label: 'Gate B' });
    const code = tickets[0].payload;
    const first = await syncOfflineScans(f.db, {
      eventId,
      device: a.device,
      keyring: QR_KEYS,
      now: NOW + 600,
      scans: [
        { clientScanId: 'a-1', code, direction: 'in', deviceScannedAt: NOW + 100, localResult: 'admitted' },
      ],
    });
    const second = await syncOfflineScans(f.db, {
      eventId,
      device: b.device,
      keyring: QR_KEYS,
      now: NOW + 700,
      scans: [
        { clientScanId: 'b-1', code, direction: 'in', deviceScannedAt: NOW + 120, localResult: 'admitted' },
      ],
    });
    assert.equal(first.results[0].result, 'admitted');
    assert.equal(first.needsReview, 0);
    assert.equal(second.results[0].result, 'already_inside');
    assert.equal(second.results[0].conflict, 'duplicate_offline');
    assert.equal(second.needsReview, 1);
    assert.equal(second.headcount.insideNow, 1);
    assert.equal(
      f.q("SELECT count(*) AS n FROM ticket_scan_events WHERE conflict = 'duplicate_offline'").n,
      1,
    );
    // A retried sync (the response was lost) records nothing new.
    const retry = await syncOfflineScans(f.db, {
      eventId,
      device: b.device,
      keyring: QR_KEYS,
      now: NOW + 800,
      scans: [
        { clientScanId: 'b-1', code, direction: 'in', deviceScannedAt: NOW + 120, localResult: 'admitted' },
      ],
    });
    assert.equal(retry.results[0].conflict, 'duplicate_offline');
    assert.equal(f.q('SELECT count(*) AS n FROM ticket_scan_events').n, 2);
    assert.ok(f.q('SELECT last_sync_at AS t FROM scanner_devices WHERE id = ?', b.device.deviceId).t);
  });

  test('one device’s queue is replayed in device-time order (entry, exit, re-entry)', async () => {
    const { f, eventId, tickets } = await setup();
    const { device } = await scannerDevice(f, { eventId, now: NOW });
    const code = tickets[1].payload;
    const synced = await syncOfflineScans(f.db, {
      eventId,
      device,
      keyring: QR_KEYS,
      now: NOW + 900,
      scans: [
        { clientScanId: 'q-3', code, direction: 'in', deviceScannedAt: NOW + 300, localResult: 'admitted' },
        { clientScanId: 'q-1', code, direction: 'in', deviceScannedAt: NOW + 100, localResult: 'admitted' },
        { clientScanId: 'q-2', code, direction: 'out', deviceScannedAt: NOW + 200, localResult: 'exited' },
        {
          clientScanId: 'q-4',
          code: 'garbage',
          direction: 'in',
          deviceScannedAt: NOW + 400,
          localResult: 'invalid',
        },
      ],
    });
    assert.deepEqual(
      synced.results.map((r) => [r.clientScanId, r.result]),
      [
        ['q-1', 'admitted'],
        ['q-2', 'exited'],
        ['q-3', 'admitted'],
        ['q-4', 'invalid'],
      ],
    );
    assert.equal(synced.needsReview, 0);
    assert.equal(f.q('SELECT entry_count AS n FROM ticket_presence').n, 2);
    assert.equal(f.q('SELECT count(*) AS n FROM ticket_scan_events WHERE offline = 1').n, 4);
  });
});
