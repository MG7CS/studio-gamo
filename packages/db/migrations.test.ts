/**
 * Migrations 0012/0013 (identity and ticketing): applied from scratch and on top of a database that
 * already holds pre-0012 rows. Inventory/scanning atomicity is tested with the statement builders
 * in packages/domain/src/ticketing/sql.test.ts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMigrations,
  createInMemoryD1,
  createMigratedD1,
  migrationFileNames,
  readMigrations,
} from './testing.ts';

const FUTURE = Math.floor(Date.now() / 1000) + 30 * 86400; // 0003's trigger compares with the real clock
const T = 1_900_000_000;

const NEW_TABLES = [
  'persons',
  'customer_profiles',
  'customer_access_tokens',
  'customer_sessions',
  'provider_profiles',
  'verification_records',
  'terms_documents',
  'terms_acceptances',
  'marketing_consents',
  'rate_limit_counters',
  'email_log',
  'email_suppressions',
  'ticket_access_log',
  'academy_registrations',
  'venues',
  'venue_maps',
  'venue_sections',
  'venue_seats',
  'order_items',
  'event_policies',
  'event_changes',
  'waitlist_entries',
  'scanner_sessions',
  'scanner_devices',
  'ticket_scan_events',
  'ticket_presence',
];

const NEW_COLUMNS: Record<string, string[]> = {
  users: ['person_id'],
  sessions: ['clerk_session_id'],
  organizer_profiles: ['first_event_approved_at', 'always_review'],
  events: [
    'venue_id',
    'venue_map_id',
    'first_event_review',
    'cancelled_at',
    'rescheduled_from_starts_at',
    'door_sales_cash_enabled',
  ],
  ticket_tiers: [
    'kind',
    'description',
    'sold_count',
    'per_order_limit',
    'min_age',
    'max_age',
    'seats_per_ticket',
    'zone_codes_json',
    'valid_days_json',
    'sales_start_at',
    'sales_end_at',
    'requires_companion_of',
    'currency',
    'sort_order',
    'status',
  ],
  ticket_holds: [
    'order_id',
    'order_item_id',
    'section_id',
    'seat_id',
    'customer_profile_id',
    'stripe_checkout_session_id',
    'released_at',
  ],
  ticket_orders: [
    'customer_profile_id',
    'order_reference',
    'hold_expires_at',
    'stripe_checkout_expires_at',
    'amount_refunded_cents',
    'payment_status',
    'payment_method',
    'disputed_at',
    'cancelled_at',
    'policy_snapshot_json',
    'source',
    'verification_required',
    'email_verified_at',
    'updated_at',
  ],
  tickets: [
    'order_item_id',
    'section_id',
    'seat_id',
    'customer_profile_id',
    'version',
    'qr_salt',
    'qr_key_id',
    'seq',
    'zone_code',
    'gate_label',
    'transferred_from_ticket_email',
    'transfer_count',
    'voided_at',
    'void_reason',
    'refunded_at',
    'issued_at',
    'updated_at',
    'released_on_void',
  ],
};

const NEW_INDEXES = [
  'users_person_idx',
  'sessions_clerk_session_idx',
  'customer_tokens_expires_idx',
  'provider_profiles_person_role_org_unique',
  'terms_documents_one_active_unique',
  'rate_limit_counters_expires_idx',
  'email_log_retry_idx',
  'ticket_holds_seat_unique',
  'ticket_holds_event_sweep_idx',
  'tickets_order_item_seq_unique',
  'tickets_seat_unique',
  'ticket_orders_reference_unique',
  'ticket_scan_events_client_unique',
  'waitlist_entries_unique',
  'venue_sections_event_code_unique',
];

const NEW_TRIGGERS = [
  'provider_publish_gate_insert',
  'provider_publish_gate_update',
  'verification_records_no_update',
  'verification_records_no_delete',
  'terms_acceptances_immutable',
  'tier_validate_category_insert',
  'tier_validate_category_update',
  'section_validate_insert',
  'section_validate_update',
  'external_event_block_sections',
  'external_event_block_order_items',
  'order_validate_insert',
  'order_validate_update',
  'order_refund_bounds',
  'order_item_validate_insert',
  'order_item_immutable',
  'hold_validate_managed_insert',
  'hold_transition_guard',
  'hold_reserve',
  'hold_release',
  'hold_convert',
  'ticket_issue_validate',
  'ticket_terminal_guard',
  'ticket_managed_immutable',
  'ticket_release',
];

type Db = Awaited<ReturnType<typeof createMigratedD1>>;
const names = (d1: Db, type: string) =>
  new Set(
    (
      d1.sqlite.prepare('SELECT name FROM sqlite_master WHERE type = ?').all(type) as Array<{ name: string }>
    ).map((r) => r.name),
  );
const columns = (d1: Db, table: string) =>
  new Set(
    (d1.sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((r) => r.name),
  );
const get = (d1: Db, sql: string, ...p: Array<string | number | null>) =>
  ({ ...(d1.sqlite.prepare(sql).get(...p) as object) }) as Record<string, unknown>;
const run = (d1: Db, sql: string, ...p: Array<string | number | null>) => d1.sqlite.prepare(sql).run(...p);

function seedOrganizer(d1: Db) {
  d1.sqlite.exec(`
    INSERT INTO organizations (id, name, slug, type, status, created_at) VALUES ('org_s', 'Sample Church', 'sample-church', 'church', 'active', ${T});
    INSERT INTO organizer_profiles (id, organization_id, created_at) VALUES ('op_s', 'org_s', ${T});
  `);
}

function seedFreeEvent(d1: Db, id = 'evt_free', capacity = 2) {
  run(
    d1,
    "INSERT INTO events (id, organizer_id, title, slug, category, description, venue_name, city, state, starts_at, admission_type, status, created_at) VALUES (?, 'op_s', 'Sample Free Night', ?, 'worship', 'Sample', 'Sample Hall', 'Phoenix', 'AZ', ?, 'free', 'approved', ?)",
    id,
    id,
    FUTURE,
    T,
  );
  run(
    d1,
    "INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity) VALUES (?, ?, 'General', 0, ?)",
    `tier_${id}`,
    id,
    capacity,
  );
}

function seedExternalEvent(d1: Db) {
  run(
    d1,
    "INSERT INTO events (id, organizer_id, title, slug, category, description, venue_name, city, state, starts_at, admission_type, status, listing_type, editorial_status, external_url, created_at) VALUES ('evt_ext', 'op_s', 'Sample External', 'evt-ext', 'concert', 'Sample', 'Arena', 'Phoenix', 'AZ', ?, 'external', 'approved', 'external_discovery', 'published', 'https://tickets.example.org/e', ?)",
    FUTURE,
    T,
  );
}

describe('from scratch', () => {
  test('migration files are numbered and every new table, column, index and trigger exists', async () => {
    const files = migrationFileNames();
    assert.ok(
      files.includes('0012_identity_terms_customers.sql') && files.includes('0013_live_ticketing.sql'),
    );
    assert.deepEqual([...files].sort(), files);
    const d1 = await createMigratedD1();
    const tables = names(d1, 'table');
    for (const t of NEW_TABLES) assert.ok(tables.has(t), `table ${t}`);
    for (const [table, cols] of Object.entries(NEW_COLUMNS)) {
      const have = columns(d1, table);
      for (const c of cols) assert.ok(have.has(c), `${table}.${c}`);
    }
    const indexes = names(d1, 'index');
    for (const i of NEW_INDEXES) assert.ok(indexes.has(i), `index ${i}`);
    const triggers = names(d1, 'trigger');
    for (const t of NEW_TRIGGERS) assert.ok(triggers.has(t), `trigger ${t}`);
    for (const t of [
      'registration_validate',
      'registration_reserve',
      'tier_validate_update',
      'external_event_block_tickets',
    ])
      assert.ok(triggers.has(t), `existing trigger ${t} kept`);
    assert.deepEqual(d1.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  });

  test('every trigger is written on one line (Wrangler remote splitter rule)', () => {
    for (const sql of readMigrations().slice(-2))
      for (const stmt of sql.split('--> statement-breakpoint'))
        if (/CREATE TRIGGER/i.test(stmt)) {
          const body = stmt.split('\n').filter((l) => l.trim() && !l.trim().startsWith('--'));
          assert.equal(body.length, 1, body[0]?.slice(0, 80));
        }
  });

  test('applying twice is harmless for IF NOT EXISTS objects but ALTERs are not re-runnable (Wrangler tracks them)', async () => {
    const d1 = await createMigratedD1();
    await assert.rejects(() => applyMigrations(d1, readMigrations().slice(-1)), /duplicate column/);
  });
});

describe('identity and consent constraints', () => {
  test('persons and customers: normalised emails; a customer links to a person only once the email is verified', async () => {
    const d1 = await createMigratedD1();
    assert.throws(
      () =>
        run(
          d1,
          "INSERT INTO persons (id, email_normalized, email_verified_at, created_at, updated_at) VALUES ('p', 'Sample@Example.org', 1, 1, 1)",
        ),
      /CHECK/,
    );
    run(
      d1,
      "INSERT INTO persons (id, email_normalized, email_verified_at, created_at, updated_at) VALUES ('per_1', 'sample@example.org', 1, 1, 1)",
    );
    assert.throws(
      () =>
        run(
          d1,
          "INSERT INTO persons (id, email_normalized, email_verified_at, created_at, updated_at) VALUES ('per_2', 'sample@example.org', 1, 1, 1)",
        ),
      /UNIQUE/,
    );
    assert.throws(
      () =>
        run(
          d1,
          "INSERT INTO customer_profiles (id, email_normalized, person_id, created_at, updated_at) VALUES ('c1', 'sample@example.org', 'per_1', 1, 1)",
        ),
      /CHECK/,
    );
    run(
      d1,
      "INSERT INTO customer_profiles (id, email_normalized, person_id, email_verified_at, created_at, updated_at) VALUES ('c1', 'sample@example.org', 'per_1', 2, 1, 1)",
    );
    run(
      d1,
      "INSERT INTO users (id, email, created_at, person_id) VALUES ('usr_1', 'sample@example.org', 1, 'per_1')",
    );
    assert.throws(
      () => run(d1, "UPDATE users SET person_id = 'per_missing' WHERE id = 'usr_1'"),
      /FOREIGN KEY/,
    );
  });

  test('provider profiles: church/musician/technician always need review; publishing requires verified', async () => {
    const d1 = await createMigratedD1();
    run(
      d1,
      "INSERT INTO persons (id, email_normalized, email_verified_at, created_at, updated_at) VALUES ('per_1', 'church@example.org', 1, 1, 1)",
    );
    const insert = (id: string, role: string, review: number, status: string, published: number | null) =>
      run(
        d1,
        "INSERT INTO provider_profiles (id, person_id, role, product_origin, display_name, status, published_at, requires_staff_review, created_at, updated_at) VALUES (?, 'per_1', ?, 'worship', 'Sample', ?, ?, ?, 1, 1)",
        id,
        role,
        status,
        published,
        review,
      );
    assert.throws(() => insert('pp_a', 'church', 0, 'draft', null), /CHECK/);
    assert.throws(() => insert('pp_b', 'church', 1, 'submitted', 5), /PROVIDER_NOT_VERIFIED/);
    insert('pp_c', 'church', 1, 'draft', null);
    assert.throws(
      () => run(d1, "UPDATE provider_profiles SET published_at = 5 WHERE id = 'pp_c'"),
      /PROVIDER_NOT_VERIFIED/,
    );
    run(d1, "UPDATE provider_profiles SET status = 'verified', published_at = 5 WHERE id = 'pp_c'");
    assert.throws(
      () => run(d1, "UPDATE provider_profiles SET status = 'suspended' WHERE id = 'pp_c'"),
      /PROVIDER_NOT_VERIFIED/,
      'suspending must unpublish',
    );
    run(d1, "UPDATE provider_profiles SET status = 'suspended', published_at = NULL WHERE id = 'pp_c'");
    assert.throws(
      () => insert('pp_d', 'church', 1, 'draft', null),
      /UNIQUE/,
      'one church role per person without an organization',
    );
    insert('pp_e', 'organizer', 0, 'draft', 5);
    assert.throws(
      () => run(d1, "UPDATE provider_profiles SET role = 'agent' WHERE id = 'pp_e'"),
      /PROVIDER_IMMUTABLE/,
    );
  });

  test('verification records are append-only and need staff identity for decisions', async () => {
    const d1 = await createMigratedD1();
    const add = (
      id: string,
      action: string,
      staff: string | null,
      notes: string | null,
      meeting: number | null = null,
    ) =>
      run(
        d1,
        "INSERT INTO verification_records (id, subject_type, subject_id, action, staff_user_id, staff_name, notes, meeting_at, created_at) VALUES (?, 'provider_profile', 'pp_1', ?, ?, ?, ?, ?, 1)",
        id,
        action,
        staff,
        staff ? 'Sample Staff' : null,
        notes,
        meeting,
      );
    assert.throws(() => add('v1', 'verify', null, 'Met in person'), /CHECK/);
    assert.throws(() => add('v2', 'verify', 'usr_staff', '  '), /CHECK/);
    assert.throws(() => add('v3', 'schedule_meeting', 'usr_staff', null), /CHECK/);
    add('v4', 'schedule_meeting', 'usr_staff', null, T);
    add('v5', 'verify', 'usr_staff', 'Met the pastor on site');
    add('v6', 'submit', null, null);
    assert.throws(
      () => run(d1, "UPDATE verification_records SET notes = 'x' WHERE id = 'v5'"),
      /VERIFICATION_RECORD_IMMUTABLE/,
    );
    assert.throws(
      () => run(d1, "DELETE FROM verification_records WHERE id = 'v5'"),
      /VERIFICATION_RECORD_IMMUTABLE/,
    );
  });

  test('terms: one active version per slug, acceptances reference a real document and a subject, and are immutable', async () => {
    const d1 = await createMigratedD1();
    const doc = (id: string, version: string, status: string) =>
      run(
        d1,
        "INSERT INTO terms_documents (id, slug, version, title, status, content_hash, created_at) VALUES (?, 'ticket-terms', ?, 'Ticket Terms (DRAFT)', ?, ?, 1)",
        id,
        version,
        status,
        'a'.repeat(64),
      );
    doc('td_1', '2026-10-18', 'active');
    assert.throws(() => doc('td_2', '2026-11-01', 'active'), /UNIQUE/);
    doc('td_2', '2026-11-01', 'draft');
    assert.equal(
      get(d1, "SELECT legal_review_status AS s FROM terms_documents WHERE id = 'td_1'").s,
      'draft_requires_review',
    );
    assert.throws(
      () => run(d1, "UPDATE terms_documents SET content_hash = ? WHERE id = 'td_1'", 'b'.repeat(64)),
      /TERMS_DOCUMENT_IMMUTABLE/,
    );
    const accept = (id: string, version: string, email: string | null) =>
      run(
        d1,
        "INSERT INTO terms_acceptances (id, document_slug, document_version, email_normalized, context, accepted_at) VALUES (?, 'ticket-terms', ?, ?, 'order:ord_1', 1)",
        id,
        version,
        email,
      );
    assert.throws(() => accept('ta_1', '1999-01-01', 'sample@example.org'), /FOREIGN KEY/);
    assert.throws(() => accept('ta_2', '2026-10-18', null), /CHECK/);
    accept('ta_3', '2026-10-18', 'sample@example.org');
    assert.throws(
      () => run(d1, "UPDATE terms_acceptances SET context = 'order:ord_2' WHERE id = 'ta_3'"),
      /TERMS_ACCEPTANCE_IMMUTABLE/,
    );
    run(d1, "UPDATE terms_acceptances SET email_normalized = 'erased:abc', ip_hash = NULL WHERE id = 'ta_3'");
  });

  test('academy registrations: under-18 needs a guardian and both consents; no birth date column exists', async () => {
    const d1 = await createMigratedD1();
    assert.ok(![...columns(d1, 'academy_registrations')].some((c) => /birth|dob/.test(c)));
    d1.sqlite.exec(`
      INSERT INTO customer_profiles (id, email_normalized, created_at, updated_at) VALUES ('cus_1', 'parent@example.org', 1, 1);
      INSERT INTO terms_documents (id, slug, version, title, status, content_hash, created_at) VALUES ('td', 'academy-enrollment-terms', '1', 'DRAFT', 'active', '${'a'.repeat(64)}', 1);
      INSERT INTO terms_acceptances (id, document_slug, document_version, customer_profile_id, context, accepted_at) VALUES ('ta', 'academy-enrollment-terms', '1', 'cus_1', 'registration:reg_1', 1);
    `);
    const reg = (
      id: string,
      band: string,
      guardian: boolean,
      status = 'reserved',
      paidAt: number | null = null,
    ) =>
      run(
        d1,
        "INSERT INTO academy_registrations (id, program_slug, location, student_first_name, student_age_band, guardian_name, guardian_email, guardian_phone, customer_profile_id, status, terms_acceptance_id, guardian_consent_acceptance_id, child_safety_acceptance_id, idempotency_key, paid_at, created_at, updated_at) VALUES (?, 'sample-piano', 'Sample Studio', 'Sam', ?, ?, ?, ?, 'cus_1', ?, 'ta', ?, ?, ?, ?, 1, 1)",
        id,
        band,
        guardian ? 'Sample Parent' : null,
        guardian ? 'parent@example.org' : null,
        guardian ? '+1 555 0100' : null,
        status,
        guardian ? 'ta' : null,
        guardian ? 'ta' : null,
        `idem_${id}`,
        paidAt,
      );
    assert.throws(() => reg('r1', '10_12', false), /CHECK/);
    reg('r2', '10_12', true);
    reg('r3', '18_plus', false);
    assert.throws(() => reg('r4', '18_plus', false, 'paid'), /CHECK/);
    reg('r5', '18_plus', false, 'paid', 5);
    assert.throws(() => reg('r6', 'age_9', true), /CHECK/);
    assert.throws(
      () => run(d1, "UPDATE academy_registrations SET idempotency_key = 'idem_r2' WHERE id = 'r3'"),
      /UNIQUE/,
    );
  });

  test('email log, suppressions and rate-limit counters hold hashes, not addresses', async () => {
    const d1 = await createMigratedD1();
    assert.throws(
      () =>
        run(
          d1,
          "INSERT INTO email_suppressions (email_hash, reason, created_at) VALUES ('parent@example.org', 'hard_bounce', 1)",
        ),
      /CHECK/,
    );
    run(
      d1,
      "INSERT INTO email_suppressions (email_hash, reason, created_at) VALUES (?, 'complaint', 1)",
      'f'.repeat(64),
    );
    run(
      d1,
      "INSERT INTO email_log (id, kind, idempotency_key, recipient_hash, status, created_at, updated_at) VALUES ('em_1', 'ticket_confirmation', 'ticket_email_ord_1', ?, 'queued', 1, 1)",
      'f'.repeat(64),
    );
    assert.throws(
      () =>
        run(
          d1,
          "INSERT INTO email_log (id, kind, idempotency_key, recipient_hash, created_at, updated_at) VALUES ('em_2', 'ticket_confirmation', 'ticket_email_ord_1', ?, 1, 1)",
          'f'.repeat(64),
        ),
      /UNIQUE/,
    );
    assert.throws(() => run(d1, "UPDATE email_log SET status = 'opened'"), /CHECK/);
  });
});

describe('upgrade from 0011 with existing rows', () => {
  async function legacyDb() {
    const d1 = createInMemoryD1();
    await applyMigrations(d1, readMigrations('0012'));
    seedOrganizer(d1);
    seedFreeEvent(d1, 'evt_free', 5);
    // A legacy free RSVP: registration (0003 trigger reserves) → order → ticket, as live.ts writes them.
    d1.sqlite.exec(`
      INSERT INTO event_registrations (id, event_id, tier_id, attendee_name, attendee_email, quantity, qr_token, created_at)
        VALUES ('reg_1', 'evt_free', 'tier_evt_free', 'Sample Guest', 'guest@example.org', 2, 'gamt_evt_free_${'0'.repeat(32)}', ${T});
      INSERT INTO ticket_orders (id, order_number, event_id, tier_id, purchaser_name, purchaser_email, quantity, order_kind, idempotency_key, status, created_at)
        VALUES ('ord_legacy', 'GL-LEGACY-1', 'evt_free', 'tier_evt_free', 'Sample Guest', 'guest@example.org', 2, 'free', 'idem_legacy', 'confirmed', ${T});
      INSERT INTO tickets (id, order_id, event_id, tier_id, registration_id, holder_name, holder_email, qr_token, qr_signature_hash, status, created_at)
        VALUES ('tkt_ord_legacy_0', 'ord_legacy', 'evt_free', 'tier_evt_free', 'reg_1', 'Sample Guest', 'guest@example.org', 'gamt_evt_free_${'0'.repeat(32)}', 'x', 'checked_in', ${T});
      INSERT INTO ticket_holds (id, event_id, tier_id, purchaser_email, quantity, idempotency_key, status, expires_at, created_at)
        VALUES ('hold_legacy', 'evt_free', 'tier_evt_free', 'guest@example.org', 1, 'idem_hold_legacy', 'held', ${T + 900}, ${T});
    `);
    assert.equal(get(d1, 'SELECT reserved_count AS r FROM ticket_tiers').r, 2);
    await applyMigrations(d1, readMigrations().slice(-2));
    return d1;
  }

  test('old rows stay valid and take the new defaults', async () => {
    const d1 = await legacyDb();
    assert.deepEqual(
      get(
        d1,
        'SELECT kind, sold_count, seats_per_ticket, currency, status, sort_order, reserved_count FROM ticket_tiers',
      ),
      {
        kind: 'general',
        sold_count: 0,
        seats_per_ticket: 1,
        currency: 'usd',
        status: 'active',
        sort_order: 0,
        reserved_count: 2,
      },
    );
    assert.deepEqual(
      get(
        d1,
        'SELECT source, amount_refunded_cents, verification_required, order_reference FROM ticket_orders',
      ),
      {
        source: 'online',
        amount_refunded_cents: 0,
        verification_required: 0,
        order_reference: null,
      },
    );
    assert.deepEqual(
      get(d1, 'SELECT version, transfer_count, released_on_void, order_item_id, status FROM tickets'),
      {
        version: 1,
        transfer_count: 0,
        released_on_void: 0,
        order_item_id: null,
        status: 'checked_in',
      },
    );
    assert.deepEqual(get(d1, 'SELECT always_review, first_event_approved_at FROM organizer_profiles'), {
      always_review: 0,
      first_event_approved_at: null,
    });
    assert.deepEqual(get(d1, 'SELECT first_event_review, door_sales_cash_enabled, venue_id FROM events'), {
      first_event_review: 0,
      door_sales_cash_enabled: 0,
      venue_id: null,
    });
    assert.deepEqual(d1.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  });

  test('legacy holds and tickets keep their own bookkeeping (no trigger double-counts them)', async () => {
    const d1 = await legacyDb();
    run(d1, "UPDATE ticket_holds SET status = 'expired' WHERE id = 'hold_legacy'");
    run(d1, "UPDATE ticket_holds SET status = 'held' WHERE id = 'hold_legacy'"); // legacy holds are not state-guarded
    run(d1, "UPDATE tickets SET status = 'refunded' WHERE id = 'tkt_ord_legacy_0'");
    assert.equal(
      get(d1, 'SELECT reserved_count AS r FROM ticket_tiers').r,
      2,
      'unchanged: legacy code adjusts counts itself',
    );
    assert.throws(
      () => run(d1, "UPDATE tickets SET status = 'valid' WHERE id = 'tkt_ord_legacy_0'"),
      /TICKET_TERMINAL/,
    );
    assert.throws(
      () => run(d1, "UPDATE ticket_holds SET order_item_id = 'oit_x' WHERE id = 'hold_legacy'"),
      /HOLD_TRANSITION_INVALID|FOREIGN KEY/,
    );
    assert.throws(
      () => run(d1, "UPDATE ticket_orders SET status = 'shipped' WHERE id = 'ord_legacy'"),
      /ORDER_INVALID/,
    );
    run(d1, "UPDATE ticket_orders SET status = 'canceled' WHERE id = 'ord_legacy'"); // legacy spelling still accepted
  });

  test('0003 free-registration triggers still enforce capacity and release on cancel', async () => {
    const d1 = await legacyDb();
    const register = (id: string, quantity: number) =>
      run(
        d1,
        "INSERT INTO event_registrations (id, event_id, tier_id, attendee_name, attendee_email, quantity, qr_token, created_at) VALUES (?, 'evt_free', 'tier_evt_free', 'Sample Guest', ?, ?, ?, ?)",
        id,
        `${id}@example.org`,
        quantity,
        `gamt_evt_free_${id.padEnd(32, '0')}`,
        T,
      );
    register('reg_2', 3);
    assert.equal(get(d1, 'SELECT reserved_count AS r FROM ticket_tiers').r, 5);
    assert.throws(() => register('reg_3', 1), /REGISTRATION_UNAVAILABLE/);
    run(d1, "UPDATE event_registrations SET status = 'canceled' WHERE id = 'reg_2'");
    assert.equal(get(d1, 'SELECT reserved_count AS r FROM ticket_tiers').r, 2);
    register('reg_4', 3);
    assert.throws(
      () => run(d1, 'UPDATE ticket_tiers SET capacity = 4'),
      /TIER_INVALID/,
      'capacity cannot drop below what is reserved',
    );
    assert.throws(
      () => run(d1, 'UPDATE ticket_tiers SET sold_count = 6'),
      /TIER_INVALID/,
      'sold never exceeds reserved',
    );
  });

  test('external listings still cannot get tiers, sections, orders, items, holds or tickets', async () => {
    const d1 = await legacyDb();
    seedExternalEvent(d1);
    assert.throws(
      () => run(d1, "INSERT INTO ticket_tiers (id, event_id, name) VALUES ('t_ext', 'evt_ext', 'GA')"),
      /EXTERNAL_EVENT_NO_TIERS/,
    );
    assert.throws(
      () =>
        run(
          d1,
          "INSERT INTO venue_sections (id, event_id, tier_id, code, name, capacity, created_at, updated_at) VALUES ('s_ext', 'evt_ext', 'tier_evt_free', 'A', 'A', 5, 1, 1)",
        ),
      /EXTERNAL_EVENT_NO_SECTIONS|SECTION_INVALID/, // an external event has no category to attach a section to
    );
    assert.throws(
      () =>
        run(
          d1,
          "INSERT INTO ticket_orders (id, order_number, event_id, purchaser_name, purchaser_email, idempotency_key, created_at) VALUES ('o_ext', 'n', 'evt_ext', 'a', 'a@example.org', 'k', 1)",
        ),
      /EXTERNAL_EVENT_NO_ORDERS/,
    );
    assert.throws(
      () =>
        run(
          d1,
          "INSERT INTO order_items (id, order_id, event_id, tier_id, quantity, unit_price_cents, subtotal_cents, created_at, updated_at) VALUES ('i_ext', 'ord_legacy', 'evt_ext', 'tier_evt_free', 1, 0, 0, 1, 1)",
        ),
      /EXTERNAL_EVENT_NO_ORDERS|ORDER_ITEM_INVALID/,
    );
    assert.throws(
      () =>
        run(
          d1,
          "INSERT INTO ticket_holds (id, event_id, tier_id, purchaser_email, quantity, idempotency_key, expires_at, created_at) VALUES ('h_ext', 'evt_ext', 'tier_evt_free', 'a@example.org', 1, 'k2', 1, 1)",
        ),
      /EXTERNAL_EVENT_NO_HOLDS/,
    );
    assert.throws(
      () =>
        run(
          d1,
          "INSERT INTO tickets (id, order_id, event_id, holder_name, holder_email, qr_token, qr_signature_hash, created_at) VALUES ('t_ext', 'ord_legacy', 'evt_ext', 'a', 'a@example.org', 'q', 'x', 1)",
        ),
      /EXTERNAL_EVENT_NO_TICKETS/,
    );
  });

  test('section and category CHECKs: capacity bounds, companion category on the same event, json columns', async () => {
    const d1 = await legacyDb();
    const section = (id: string, capacity: number, reserved = 0) =>
      run(
        d1,
        "INSERT INTO venue_sections (id, event_id, tier_id, code, name, capacity, reserved_count, created_at, updated_at) VALUES (?, 'evt_free', 'tier_evt_free', ?, 'Sample', ?, ?, 1, 1)",
        id,
        id.toUpperCase(),
        capacity,
        reserved,
      );
    assert.throws(() => section('sa', 0), /CHECK|SECTION_INVALID/);
    assert.throws(() => section('sb', 2, 3), /SECTION_INVALID/);
    section('sc', 5);
    section('sd', 5);
    assert.throws(
      () => run(d1, "UPDATE venue_sections SET code = 'SC' WHERE id = 'sd'"),
      /UNIQUE/,
      'codes are unique per event',
    );
    assert.throws(
      () => run(d1, "UPDATE venue_sections SET reserved_count = 6 WHERE id = 'sc'"),
      /SECTION_INVALID/,
    );
    assert.throws(() => run(d1, 'UPDATE ticket_tiers SET requires_companion_of = id'), /TIER_INVALID/);
    assert.throws(() => run(d1, "UPDATE ticket_tiers SET zone_codes_json = 'not json'"), /CHECK/);
    assert.throws(() => run(d1, "UPDATE ticket_tiers SET kind = 'balcony'"), /CHECK/);
    assert.throws(() => run(d1, 'UPDATE ticket_tiers SET min_age = 18, max_age = 12'), /TIER_INVALID/);
  });
});
