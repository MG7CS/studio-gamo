import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createSqliteD1 } from '@gamo/db/testing';
import { REGISTRANT_RETENTION_SECONDS, runLiveCleanup } from './cleanup.ts';

const MIGRATIONS = new URL('../../../db/live/migrations/', import.meta.url);
const NOW = 1_900_000_000;
const DAY = 86400;

async function database() {
  const d1 = createSqliteD1();
  for (const name of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await d1.exec(readFileSync(new URL(name, MIGRATIONS), 'utf8'));
  d1.sqlite.exec(`
    INSERT INTO organizations (id, name, slug, kind) VALUES ('org_1', 'Grace', 'grace', 'church');
    INSERT INTO venues (id, name, city, state, timezone) VALUES ('ven_1', 'Hall', 'Phoenix', 'AZ', 'America/Phoenix');
    INSERT INTO events (id, organization_id, origin, slug, title, category, venue_id, timezone, admission, status)
      VALUES ('evt_old', 'org_1', 'organizer', 'old', 'Old night', 'worship', 'ven_1', 'America/Phoenix', 'free_registration', 'published'),
             ('evt_new', 'org_1', 'organizer', 'new', 'New night', 'worship', 'ven_1', 'America/Phoenix', 'free_registration', 'published'),
             ('evt_series', 'org_1', 'organizer', 'series', 'Series', 'worship', 'ven_1', 'America/Phoenix', 'free_registration', 'published');
    INSERT INTO event_occurrences (id, event_id, starts_at) VALUES
      ('occ_old', 'evt_old', ${NOW - (REGISTRANT_RETENTION_SECONDS + 5 * DAY)}),
      ('occ_new', 'evt_new', ${NOW - 10 * DAY}),
      ('occ_s1', 'evt_series', ${NOW - (REGISTRANT_RETENTION_SECONDS + 20 * DAY)}),
      ('occ_s2', 'evt_series', ${NOW + 3 * DAY});
    INSERT INTO registrations (id, occurrence_id, name, email, email_hash, party_size, status, terms_version, checked_in_at) VALUES
      ('reg_a', 'occ_old', 'Sam', 'sam@example.org', 'h1', 3, 'confirmed', 'v1', ${NOW - 100 * DAY}),
      ('reg_b', 'occ_old', 'Kim', 'kim@example.org', 'h2', 2, 'confirmed', 'v1', NULL),
      ('reg_c', 'occ_old', 'Lee', 'lee@example.org', 'h3', 1, 'canceled', 'v1', NULL),
      ('reg_d', 'occ_new', 'Ann', 'ann@example.org', 'h4', 1, 'confirmed', 'v1', NULL),
      ('reg_e', 'occ_s1', 'Bo', 'bo@example.org', 'h5', 1, 'confirmed', 'v1', NULL);
  `);
  return d1;
}

const count = (d1: Awaited<ReturnType<typeof database>>, table: string) =>
  (d1.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

test('cleanup deletes registrants 90 days after the last date, keeps totals, and leaves recent and running series alone', async () => {
  const d1 = await database();
  const report = await runLiveCleanup(d1 as never, NOW);
  assert.equal(report.registrationsRemoved, 3, 'only the finished old event');
  assert.equal(report.occurrencesSummarized, 1);
  const old = d1.sqlite
    .prepare(
      "SELECT registered_total AS r, checked_in_total AS c FROM event_occurrences WHERE id = 'occ_old'",
    )
    .get() as { r: number; c: number };
  assert.deepEqual({ ...old }, { r: 5, c: 3 }, 'confirmed people and those checked in are kept as numbers');
  const left = d1.sqlite.prepare('SELECT id FROM registrations ORDER BY id').all() as Array<{ id: string }>;
  assert.deepEqual(
    left.map((r) => r.id),
    ['reg_d', 'reg_e'],
    'a recent event and a series that is still running keep their registrants',
  );
  assert.equal(count(d1, 'event_occurrences'), 4, 'the dates themselves stay');
});

test('cleanup releases abandoned holds, drops expired codes, old sessions and invitations, and reports each count', async () => {
  const d1 = await database();
  d1.sqlite.exec(`
    INSERT INTO organizers (id, clerk_user_id, email, display_name) VALUES ('org_u', 'user_1', 'a@example.org', 'A');
    INSERT INTO organizer_sessions (id, organizer_id, expires_at) VALUES ('s_old', 'org_u', ${NOW - 40 * DAY}), ('s_ok', 'org_u', ${NOW + DAY});
    INSERT INTO invitations (id, organization_id, email_hash, token_hash, expires_at) VALUES
      ('i_old', 'org_1', 'h', 't1', ${NOW - 40 * DAY}), ('i_ok', 'org_1', 'h', 't2', ${NOW + DAY});
    INSERT INTO registrations (id, occurrence_id, name, email, email_hash, party_size, status, terms_version, expires_at)
      VALUES ('reg_p', 'occ_s2', 'Pat', 'pat@example.org', 'h9', 2, 'pending', 'v1', ${NOW - 60});
    UPDATE event_occurrences SET seats_taken = 2 WHERE id = 'occ_s2';
    INSERT INTO email_codes (id, registration_id, code_hash, expires_at) VALUES ('c1', 'reg_p', 'x', ${NOW - 30});
    INSERT INTO rate_limit_counters (bucket, window_start, count, expires_at) VALUES ('b', 1, 1, ${NOW - 1});
  `);
  const report = await runLiveCleanup(d1 as never, NOW);
  assert.equal(report.sessionsRemoved, 1);
  assert.equal(report.invitationsRemoved, 1);
  assert.equal(report.emailCodesRemoved, 1);
  assert.equal(report.rateLimitCountersRemoved, 1);
  const seats = d1.sqlite
    .prepare("SELECT seats_taken AS n FROM event_occurrences WHERE id = 'occ_s2'")
    .get() as {
    n: number;
  };
  assert.equal(seats.n, 0, 'the abandoned hold gave its seats back');
  assert.equal(count(d1, 'organizer_sessions'), 1);
  assert.equal(count(d1, 'invitations'), 1);
});

test('paid orders keep their amounts and references but lose names and emails 90 days after the event', async () => {
  const { paidTestDatabase, seedPaidEvent, PAID_NOW } = await import('./paid-testing.ts');
  const { d1, db } = await paidTestDatabase();
  const seed = seedPaidEvent(d1, { flow: 'gamo_collects' });
  d1.sqlite
    .exec(`INSERT INTO orders (id, reference, event_id, occurrence_id, organization_id, channel, payment_method,
      status, funds_flow, seller, buyer_name, buyer_email, email_hash, attendee_names, subtotal_cents, total_cents,
      policy_snapshot, fee_snapshot)
    VALUES ('ord_old', 'GL-2222-4444', '${seed.eventId}', '${seed.occurrenceId}', '${seed.organizationId}', 'online',
      'card_online', 'paid', 'gamo_collects', 'gamo', 'Ada', 'ada@example.org', 'h', '["Ada"]', 2000, 2000, '{}', '{}');
    INSERT INTO order_items (id, order_id, ticket_type_id, name, unit_price_cents, quantity, line_total_cents)
      VALUES ('oit_old', 'ord_old', '${seed.generalTypeId}', 'General', 2000, 1, 2000);
    INSERT INTO tickets (id, order_id, order_item_id, seq, event_id, occurrence_id, ticket_type_id, holder_name,
      holder_email, email_hash, credential_salt)
      VALUES ('tkt_old', 'ord_old', 'oit_old', 1, '${seed.eventId}', '${seed.occurrenceId}', '${seed.generalTypeId}',
      'Ada', 'ada@example.org', 'h', 'salt');
    INSERT INTO refunds (id, order_id, amount_cents, method, requested_by, reason, decided_note, status)
      VALUES ('rfd_old', 'ord_old', 500, 'stripe', 'buyer', 'Sample: my mother is ill', 'Sample note', 'declined');`);
  const lastDateEnds = PAID_NOW + 30 * 86_400 + 3 * 3600;
  // Before the 90 days have passed nothing personal is removed.
  let report = await runLiveCleanup(db, lastDateEnds + REGISTRANT_RETENTION_SECONDS - 10);
  assert.equal(report.ordersAnonymized, 0);
  report = await runLiveCleanup(db, lastDateEnds + REGISTRANT_RETENTION_SECONDS + 10);
  assert.equal(report.ordersAnonymized, 1);
  const order = {
    ...d1.sqlite
      .prepare(
        "SELECT buyer_name, buyer_email, email_hash, attendee_names, reference, total_cents FROM orders WHERE id = 'ord_old'",
      )
      .get(),
  };
  assert.deepEqual(order, {
    buyer_name: null,
    buyer_email: null,
    email_hash: null,
    attendee_names: null,
    reference: 'GL-2222-4444',
    total_cents: 2000,
  });
  const ticket = {
    ...d1.sqlite
      .prepare("SELECT holder_name, holder_email, email_hash, status FROM tickets WHERE id = 'tkt_old'")
      .get(),
  };
  assert.deepEqual(ticket, { holder_name: null, holder_email: null, email_hash: null, status: 'valid' });
  // Free text people typed goes too; the amount stays.
  const refund = {
    ...d1.sqlite.prepare("SELECT reason, decided_note, amount_cents FROM refunds WHERE id = 'rfd_old'").get(),
  };
  assert.deepEqual(refund, { reason: 'Removed after 90 days', decided_note: null, amount_cents: 500 });
});
