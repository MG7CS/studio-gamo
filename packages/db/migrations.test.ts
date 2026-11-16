/**
 * Migrations: 0012 (identity, terms, customers) constraints, 0018 (remove Gamo Live) and 0019 (remove
 * public accounts and legacy demo tables), each applied both from scratch and on top of a database that
 * still holds rows in the tables it drops.
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

/** Tables 0018 drops (Gamo Live, its production links, and the never-used payment tables). */
const LIVE_TABLES = [
  'events',
  'event_occurrences',
  'event_registrations',
  'event_organizations',
  'event_team_members',
  'event_performers',
  'event_policies',
  'event_changes',
  'ticket_tiers',
  'ticket_holds',
  'ticket_orders',
  'order_items',
  'tickets',
  'ticket_scans',
  'ticket_scan_events',
  'ticket_presence',
  'ticket_access_log',
  'refund_records',
  'settlement_records',
  'waitlist_entries',
  'scanner_sessions',
  'scanner_devices',
  'venues',
  'venue_maps',
  'venue_sections',
  'venue_seats',
  'artist_profiles',
  'artist_representatives',
  'representation_authorizations',
  'booking_inquiries',
  'booking_offers',
  'performance_engagements',
  'organizer_profiles',
  'production_requests',
  'production_projects',
  'external_listing_revisions',
  'external_outbound_clicks',
  'notification_jobs',
  'payment_records',
  'ledger_entries',
  'stripe_webhook_events',
];

/** Tables 0018 left in place (some of them 0019 drops later). */
const KEPT_AFTER_0018 = [
  'users',
  'sessions',
  'organizations',
  'organization_members',
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
  'academy_registrations',
  'participation_inquiries',
  'media_files',
  'moderation_reviews',
  'audit_logs',
];

/** Tables 0019 drops: public sign-in, product accounts, organizations, provider review and old demo tables. */
const ACCOUNT_TABLES = [
  'product_accounts',
  'clerk_identity_links',
  'auth_challenges',
  'provider_profiles',
  'verification_records',
  'participation_inquiries',
  'organizations',
  'organization_members',
  'church_partnerships',
  'sponsorships',
  'churches',
  'musician_profiles',
  'musician_skills',
  'applications',
  'gigs',
  'gig_positions',
  'gig_assignments',
  'checkins',
  'standby_dispatches',
  'instructor_profiles',
  'classes',
  'enrollments',
];

/**
 * Exactly the tables left after 0019. persons stays because users, customer_profiles and
 * terms_acceptances hold person_id foreign keys; external_identities binds the Cloudflare Access subject
 * of staff; customer_sessions, marketing_consents and moderation_reviews are read by kept code or kept
 * staff tooling.
 */
const KEPT_AFTER_0019 = [
  'users',
  'sessions',
  'roles',
  'user_roles',
  'admin_credentials',
  'external_identities',
  'persons',
  'customer_profiles',
  'customer_access_tokens',
  'customer_sessions',
  'academy_registrations',
  'terms_documents',
  'terms_acceptances',
  'marketing_consents',
  'email_log',
  'email_suppressions',
  'rate_limit_counters',
  'audit_logs',
  'media_files',
  'moderation_reviews',
];

const NEW_COLUMNS: Record<string, string[]> = {
  users: ['person_id'],
  sessions: ['clerk_session_id'],
  customer_access_tokens: ['product'],
  customer_sessions: ['product'],
};

const NEW_INDEXES = [
  'users_person_idx',
  'sessions_clerk_session_idx',
  'customer_tokens_expires_idx',
  'terms_documents_one_active_unique',
  'rate_limit_counters_expires_idx',
  'email_log_retry_idx',
];

const NEW_TRIGGERS = ['terms_acceptances_immutable'];

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
const userTables = (d1: Db) => [...names(d1, 'table')].filter((t) => !t.startsWith('sqlite_')).sort();
const DROPPED_BY_0019 = [...LIVE_TABLES, ...ACCOUNT_TABLES];

/** The database exactly as it was after 0018 (before 0019). */
async function migratedThrough0018() {
  const d1 = createInMemoryD1();
  await applyMigrations(d1, readMigrations('0019'));
  return d1;
}

/** Nothing left in the schema may name a dropped table (a trigger or view would fail at run time). */
function assertNoReferencesToDroppedTables(d1: Db, dropped: string[], kept: string[]) {
  const tables = names(d1, 'table');
  for (const t of dropped) assert.ok(!tables.has(t), `table ${t} dropped`);
  for (const t of kept) assert.ok(tables.has(t), `table ${t} kept`);
  const objects = d1.sqlite
    .prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('trigger', 'view')",
    )
    .all() as Array<{ type: string; name: string; sql: string }>;
  for (const o of objects)
    for (const t of dropped)
      assert.ok(!new RegExp(`\\b${t}\\b`).test(o.sql), `${o.type} ${o.name} still reads ${t}`);
  for (const t of tables) {
    if (t.startsWith('sqlite_')) continue;
    const fks = d1.sqlite.prepare(`PRAGMA foreign_key_list(${t})`).all() as Array<{ table: string }>;
    for (const fk of fks) assert.ok(!dropped.includes(fk.table), `${t} references dropped ${fk.table}`);
  }
  assert.deepEqual(d1.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
}

describe('from scratch', () => {
  test('migration files are numbered and every kept table, column, index and trigger exists', async () => {
    const files = migrationFileNames();
    assert.ok(
      files.includes('0012_identity_terms_customers.sql') &&
        files.includes('0018_remove_gamo_live.sql') &&
        files.includes('0019_remove_public_accounts.sql'),
    );
    assert.deepEqual([...files].sort(), files);
    const d1 = await createMigratedD1();
    for (const [table, cols] of Object.entries(NEW_COLUMNS)) {
      const have = columns(d1, table);
      for (const c of cols) assert.ok(have.has(c), `${table}.${c}`);
    }
    const indexes = names(d1, 'index');
    for (const i of NEW_INDEXES) assert.ok(indexes.has(i), `index ${i}`);
    const triggers = names(d1, 'trigger');
    for (const t of NEW_TRIGGERS) assert.ok(triggers.has(t), `trigger ${t}`);
    assert.ok(!triggers.has('moderation_pending'), 'the event-moderation trigger is gone');
  });

  test('0018 leaves no Live table, and nothing kept references one', async () => {
    assertNoReferencesToDroppedTables(await migratedThrough0018(), LIVE_TABLES, KEPT_AFTER_0018);
  });

  test('0019 leaves exactly the kept tables, and nothing kept references a dropped one', async () => {
    const d1 = createInMemoryD1(); // as 0019 left it; 0020+ add forms/roster tables (migrations-forms.test.ts)
    await applyMigrations(d1, readMigrations('0020'));
    assertNoReferencesToDroppedTables(d1, DROPPED_BY_0019, KEPT_AFTER_0019);
    assert.deepEqual(userTables(d1), [...KEPT_AFTER_0019].sort());
    const triggers = names(d1, 'trigger');
    for (const t of [
      'provider_publish_gate_insert',
      'provider_identity_immutable',
      'verification_records_no_delete',
    ])
      assert.ok(!triggers.has(t), `trigger ${t} dropped`);
  });

  test('every trigger is written on one line (Wrangler remote splitter rule)', () => {
    for (const sql of readMigrations().slice(readMigrations('0012').length))
      for (const stmt of sql.split('--> statement-breakpoint'))
        if (/CREATE TRIGGER/i.test(stmt)) {
          const body = stmt.split('\n').filter((l) => l.trim() && !l.trim().startsWith('--'));
          assert.equal(body.length, 1, body[0]?.slice(0, 80));
        }
  });

  test('applying twice is harmless for IF NOT EXISTS / IF EXISTS objects but ALTERs are not re-runnable (Wrangler tracks them)', async () => {
    const d1 = await createMigratedD1();
    const only0018And0019 = readMigrations('0020').slice(readMigrations('0018').length);
    assert.equal(only0018And0019.length, 2);
    await applyMigrations(d1, only0018And0019);
    const only0017 = readMigrations('0018').slice(readMigrations('0017').length);
    await assert.rejects(() => applyMigrations(d1, only0017), /duplicate column/);
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

describe('0018 on a database that still holds Live rows', () => {
  async function liveDb() {
    const d1 = createInMemoryD1();
    await applyMigrations(d1, readMigrations('0012'));
    d1.sqlite.exec(`
      INSERT INTO users (id, email, created_at) VALUES ('usr_staff', 'staff@example.org', ${T});
      INSERT INTO organizations (id, name, slug, type, status, created_at) VALUES ('org_s', 'Sample Church', 'sample-church', 'church', 'active', ${T});
      INSERT INTO organizer_profiles (id, organization_id, created_at) VALUES ('op_s', 'org_s', ${T});
    `);
    run(
      d1,
      "INSERT INTO events (id, organizer_id, title, slug, category, description, venue_name, city, state, starts_at, admission_type, status, created_at) VALUES ('evt_free', 'op_s', 'Sample Free Night', 'evt-free', 'worship', 'Sample', 'Sample Hall', 'Phoenix', 'AZ', ?, 'free', 'approved', ?)",
      FUTURE,
      T,
    );
    // A free RSVP (0003 trigger reserves and queues a notification job) → order → ticket, plus a hold.
    d1.sqlite.exec(`
      INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity) VALUES ('tier_free', 'evt_free', 'General', 0, 5);
      INSERT INTO event_registrations (id, event_id, tier_id, attendee_name, attendee_email, quantity, qr_token, created_at)
        VALUES ('reg_1', 'evt_free', 'tier_free', 'Sample Guest', 'guest@example.org', 2, 'gamt_evt_free_${'0'.repeat(32)}', ${T});
      INSERT INTO ticket_orders (id, order_number, event_id, tier_id, purchaser_name, purchaser_email, quantity, order_kind, idempotency_key, status, created_at)
        VALUES ('ord_1', 'GL-SAMPLE-1', 'evt_free', 'tier_free', 'Sample Guest', 'guest@example.org', 2, 'free', 'idem_1', 'confirmed', ${T});
      INSERT INTO tickets (id, order_id, event_id, tier_id, registration_id, holder_name, holder_email, qr_token, qr_signature_hash, status, created_at)
        VALUES ('tkt_1', 'ord_1', 'evt_free', 'tier_free', 'reg_1', 'Sample Guest', 'guest@example.org', 'gamt_evt_free_${'0'.repeat(32)}', 'x', 'checked_in', ${T});
      INSERT INTO ticket_holds (id, event_id, tier_id, purchaser_email, quantity, idempotency_key, status, expires_at, created_at)
        VALUES ('hold_1', 'evt_free', 'tier_free', 'guest@example.org', 1, 'idem_hold_1', 'held', ${T + 900}, ${T});
    `);
    await applyMigrations(d1, readMigrations('0018').slice(readMigrations('0012').length));
    d1.sqlite.exec(`
      INSERT INTO persons (id, email_normalized, email_verified_at, created_at, updated_at) VALUES ('per_1', 'guest@example.org', 1, 1, 1);
      INSERT INTO customer_profiles (id, email_normalized, person_id, email_verified_at, created_at, updated_at) VALUES ('cus_1', 'guest@example.org', 'per_1', 2, 1, 1);
      INSERT INTO venues (id, organization_id, name, timezone, created_at, updated_at) VALUES ('ven_1', 'org_s', 'Sample Hall', 'America/Phoenix', 1, 1);
      INSERT INTO venue_sections (id, event_id, tier_id, code, name, capacity, created_at, updated_at) VALUES ('sec_1', 'evt_free', 'tier_free', 'A', 'Sample', 5, 1, 1);
      INSERT INTO venue_seats (id, section_id, row_label, seat_label, created_at) VALUES ('seat_1', 'sec_1', 'A', '1', 1);
      INSERT INTO order_items (id, order_id, event_id, tier_id, section_id, quantity, unit_price_cents, subtotal_cents, created_at, updated_at) VALUES ('oit_1', 'ord_1', 'evt_free', 'tier_free', 'sec_1', 1, 0, 0, 1, 1);
      INSERT INTO moderation_reviews (id, reviewer_user_id, target_type, target_id, decision, reviewed_at) VALUES ('mod_1', 'usr_staff', 'provider_profile', 'pp_1', 'approved', ${T});
    `);
    assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM notification_jobs').n, 1);
    await applyMigrations(d1, readMigrations('0019').slice(readMigrations('0018').length));
    return d1;
  }

  test('drops every Live table with rows present and keeps people, customers and reviews', async () => {
    const d1 = await liveDb();
    assertNoReferencesToDroppedTables(d1, LIVE_TABLES, KEPT_AFTER_0018);
    assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM users').n, 1);
    assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM organizations').n, 1);
    assert.equal(get(d1, "SELECT person_id AS p FROM customer_profiles WHERE id = 'cus_1'").p, 'per_1');
    assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM moderation_reviews').n, 1);
  });

  test('moderation reviews of any target insert again (no trigger reads the dropped events table)', async () => {
    const d1 = await liveDb();
    run(
      d1,
      "INSERT INTO moderation_reviews (id, reviewer_user_id, target_type, target_id, decision, reviewed_at) VALUES ('mod_2', 'usr_staff', 'event', 'evt_free', 'approved', ?)",
      T,
    );
    assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM moderation_reviews').n, 2);
  });
});

describe('0019 on a database that still holds account, provider and demo rows', () => {
  async function accountsDb() {
    const d1 = await migratedThrough0018();
    d1.sqlite.exec(`
      INSERT INTO persons (id, email_normalized, email_verified_at, created_at, updated_at) VALUES ('per_1', 'sample@example.org', 1, 1, 1);
      INSERT INTO users (id, email, created_at, person_id) VALUES ('usr_staff', 'staff@example.org', ${T}, NULL);
      INSERT INTO users (id, email, created_at, person_id) VALUES ('usr_1', 'sample@example.org', ${T}, 'per_1');
      INSERT INTO roles (id, code) VALUES ('role_admin', 'admin');
      INSERT INTO user_roles (id, user_id, role_id, created_at) VALUES ('ur_1', 'usr_staff', 'role_admin', ${T});
      INSERT INTO admin_credentials (user_id, password_hash, updated_at, created_at) VALUES ('usr_staff', 'pbkdf2$sample', ${T}, ${T});
      INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('ses_staff', 'usr_staff', ${T + 3600}, ${T});
      INSERT INTO sessions (id, user_id, expires_at, created_at, product) VALUES ('ses_1', 'usr_1', ${T + 3600}, ${T}, 'worship');
      INSERT INTO external_identities (id, user_id, provider, provider_subject, provider_email, verified_at, created_at) VALUES ('ext_1', 'usr_staff', 'cloudflare_access', 'sub_1', 'staff@example.org', ${T}, ${T});
      INSERT INTO customer_profiles (id, email_normalized, person_id, email_verified_at, created_at, updated_at) VALUES ('cus_1', 'sample@example.org', 'per_1', 2, 1, 1);
      INSERT INTO terms_documents (id, slug, version, title, status, content_hash, created_at) VALUES ('td', 'provider-terms', '1', 'DRAFT', 'active', '${'a'.repeat(64)}', 1);
      INSERT INTO terms_acceptances (id, document_slug, document_version, user_id, person_id, context, accepted_at) VALUES ('ta', 'provider-terms', '1', 'usr_1', 'per_1', 'provider:pp_1', 1);
      INSERT INTO organizations (id, name, slug, type, status, created_at) VALUES ('org_s', 'Sample Church', 'sample-church', 'church', 'active', ${T});
      INSERT INTO organization_members (id, organization_id, user_id, role, created_at) VALUES ('om_1', 'org_s', 'usr_1', 'owner', ${T});
      INSERT INTO church_partnerships (id, organization_id, program, participation_kind, started_at) VALUES ('cp_1', 'org_s', 'worship', 'host', ${T});
      INSERT INTO sponsorships (id, sponsor_org_id, program, created_at) VALUES ('sp_1', 'org_s', 'academy', ${T});
      INSERT INTO product_accounts (id, user_id, product, created_at, updated_at) VALUES ('pa_1', 'usr_1', 'worship', ${T}, ${T});
      INSERT INTO clerk_identity_links (id, product, clerk_app_id, clerk_issuer, clerk_user_id, clerk_email, user_id, product_account_id, linked_at, updated_at) VALUES ('cil_1', 'worship', 'app_1', 'https://sample.clerk', 'cu_1', 'sample@example.org', 'usr_1', 'pa_1', ${T}, ${T});
      INSERT INTO auth_challenges (id, email, code_hash, expires_at, created_at) VALUES ('ac_1', 'sample@example.org', 'hash', ${T + 600}, ${T});
      INSERT INTO provider_profiles (id, person_id, role, product_origin, organization_id, display_name, status, published_at, requires_staff_review, created_at, updated_at) VALUES ('pp_1', 'per_1', 'church', 'worship', 'org_s', 'Sample Church', 'verified', 5, 1, 1, 1);
      INSERT INTO verification_records (id, subject_type, subject_id, action, staff_user_id, staff_name, notes, created_at) VALUES ('vr_1', 'provider_profile', 'pp_1', 'verify', 'usr_staff', 'Sample Staff', 'Met the pastor on site', 1);
      INSERT INTO participation_inquiries (id, user_id, kind, interest, name, message, created_at) VALUES ('pi_1', 'usr_1', 'general', 'worship', 'Sample Person', 'Sample message', ${T});
      INSERT INTO churches (id, name, contact_user_id, organization_id) VALUES ('ch_1', 'Sample Church', 'usr_1', 'org_s');
      INSERT INTO musician_profiles (id, user_id) VALUES ('mp_1', 'usr_1');
      INSERT INTO musician_skills (id, musician_id, instrument) VALUES ('ms_1', 'mp_1', 'keys');
      INSERT INTO applications (id, musician_id) VALUES ('app_1', 'mp_1');
      INSERT INTO gigs (id, church_id, plan, starts_at, ends_at) VALUES ('gig_1', 'ch_1', 'sunday', ${T}, ${T + 7200});
      INSERT INTO gig_positions (id, gig_id, instrument) VALUES ('gp_1', 'gig_1', 'keys');
      INSERT INTO gig_assignments (id, position_id, musician_id, kind) VALUES ('ga_1', 'gp_1', 'mp_1', 'primary');
      INSERT INTO gig_assignments (id, position_id, musician_id, kind) VALUES ('ga_2', 'gp_1', 'mp_1', 'standby');
      INSERT INTO checkins (id, assignment_id, status, recorded_at) VALUES ('ci_1', 'ga_1', 'arrived', ${T});
      INSERT INTO standby_dispatches (id, gig_id, failed_assignment_id, standby_assignment_id, created_at) VALUES ('sd_1', 'gig_1', 'ga_1', 'ga_2', ${T});
      INSERT INTO instructor_profiles (id, user_id) VALUES ('ip_1', 'usr_1');
      INSERT INTO classes (id, instructor_id, host_org_id, title, instrument, created_at) VALUES ('cl_1', 'ip_1', 'org_s', 'Sample Piano', 'piano', ${T});
      INSERT INTO enrollments (id, class_id, student_user_id, enrolled_at) VALUES ('en_1', 'cl_1', 'usr_1', ${T});
    `);
    for (const t of ACCOUNT_TABLES)
      assert.ok(Number(get(d1, `SELECT COUNT(*) AS n FROM ${t}`).n) > 0, `${t} seeded`);
    await applyMigrations(d1, readMigrations('0020').slice(readMigrations('0019').length));
    return d1;
  }

  test('drops every account and demo table with rows present and keeps staff, customers and terms', async () => {
    const d1 = await accountsDb();
    assertNoReferencesToDroppedTables(d1, DROPPED_BY_0019, KEPT_AFTER_0019);
    assert.deepEqual(userTables(d1), [...KEPT_AFTER_0019].sort());
    assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM users').n, 2);
    assert.equal(get(d1, 'SELECT user_id AS u FROM admin_credentials').u, 'usr_staff');
    assert.equal(get(d1, "SELECT COUNT(*) AS n FROM user_roles WHERE user_id = 'usr_staff'").n, 1);
    assert.equal(get(d1, "SELECT COUNT(*) AS n FROM sessions WHERE id = 'ses_staff'").n, 1);
    assert.equal(get(d1, 'SELECT provider_subject AS s FROM external_identities').s, 'sub_1');
    assert.equal(get(d1, "SELECT person_id AS p FROM customer_profiles WHERE id = 'cus_1'").p, 'per_1');
    assert.equal(get(d1, "SELECT person_id AS p FROM users WHERE id = 'usr_1'").p, 'per_1');
    assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM terms_acceptances').n, 1);
  });

  test('kept tables still accept writes after 0019 (staff credentials, persons, terms)', async () => {
    const d1 = await accountsDb();
    run(d1, "INSERT INTO users (id, email, created_at) VALUES ('usr_new', 'new-staff@example.org', ?)", T);
    run(
      d1,
      "INSERT INTO admin_credentials (user_id, password_hash, updated_at, created_at) VALUES ('usr_new', 'pbkdf2$sample', ?, ?)",
      T,
      T,
    );
    run(d1, "DELETE FROM users WHERE id = 'usr_new'");
    assert.equal(get(d1, "SELECT COUNT(*) AS n FROM admin_credentials WHERE user_id = 'usr_new'").n, 0);
    run(d1, "DELETE FROM persons WHERE id = 'per_1'");
    assert.equal(get(d1, "SELECT person_id AS p FROM users WHERE id = 'usr_1'").p, null);
    assert.equal(get(d1, "SELECT person_id AS p FROM customer_profiles WHERE id = 'cus_1'").p, null);
  });
});
