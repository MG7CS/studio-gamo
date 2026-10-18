import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMigratedD1, MIGRATIONS_DIR } from '@gamo/db/testing';
import * as E from './enums.ts';
import {
  EVENT_POLICY_DEFAULTS,
  eventPolicyFromRow,
  eventPolicyToRow,
  maxEntriesPerDay,
  normalizeEventPolicy,
  policySnapshotJson,
  REFUND_CUTOFF_HOURS,
} from './policy.ts';
import { toEpochSeconds } from './ticketing.ts';

const SQL = ['0012_identity_terms_customers.sql', '0013_live_ticketing.sql']
  .map((f) => readFileSync(`${MIGRATIONS_DIR}${f}`, 'utf8'))
  .join('\n');

test('every enum value backed by a CHECK or trigger appears in the migration SQL', () => {
  const checked: Record<string, readonly string[]> = {
    PROVIDER_ROLES: E.PROVIDER_ROLES,
    PROVIDER_STATUSES: E.PROVIDER_STATUSES,
    VERIFICATION_SUBJECT_TYPES: E.VERIFICATION_SUBJECT_TYPES,
    VERIFICATION_ACTIONS: E.VERIFICATION_ACTIONS,
    TERMS_STATUSES: E.TERMS_STATUSES,
    LEGAL_REVIEW_STATUSES: E.LEGAL_REVIEW_STATUSES,
    TOKEN_PURPOSES: E.TOKEN_PURPOSES,
    EMAIL_STATUSES: E.EMAIL_STATUSES,
    SUPPRESSION_REASONS: E.SUPPRESSION_REASONS,
    CATEGORY_KINDS: E.CATEGORY_KINDS,
    CATEGORY_STATUSES: E.CATEGORY_STATUSES,
    SECTION_STATUSES: E.SECTION_STATUSES,
    SEAT_STATUSES: E.SEAT_STATUSES,
    VENUE_MAP_MEDIA_TYPES: E.VENUE_MAP_MEDIA_TYPES,
    VENUE_MAP_STATUSES: E.VENUE_MAP_STATUSES,
    ORDER_STATUSES: E.ORDER_STATUSES,
    LEGACY_ORDER_STATUSES: E.LEGACY_ORDER_STATUSES,
    ORDER_SOURCES: E.ORDER_SOURCES,
    PAYMENT_STATUSES: E.PAYMENT_STATUSES,
    PAYMENT_METHODS: E.PAYMENT_METHODS,
    HOLD_STATUSES: E.HOLD_STATUSES,
    TICKET_STATUSES: E.TICKET_STATUSES,
    VOID_REASONS: E.VOID_REASONS,
    SCAN_DIRECTIONS: E.SCAN_DIRECTIONS,
    ALLOWED_DIRECTIONS: E.ALLOWED_DIRECTIONS,
    SCAN_RESULTS: E.SCAN_RESULTS,
    SCAN_CONFLICTS: E.SCAN_CONFLICTS,
    PRESENCE_STATES: E.PRESENCE_STATES,
    ACCESS_ACTOR_TYPES: E.ACCESS_ACTOR_TYPES,
    ACCESS_ACTIONS: E.ACCESS_ACTIONS,
    WAITLIST_STATUSES: E.WAITLIST_STATUSES,
    EVENT_CHANGE_KINDS: E.EVENT_CHANGE_KINDS,
    REFUND_POLICIES: E.REFUND_POLICIES,
    AGE_POLICIES: E.AGE_POLICIES,
    ACADEMY_REGISTRATION_STATUSES: E.ACADEMY_REGISTRATION_STATUSES,
    STUDENT_AGE_BANDS: E.STUDENT_AGE_BANDS,
    PRODUCTS: E.PRODUCTS,
  };
  for (const [name, values] of Object.entries(checked))
    for (const v of values) assert.ok(SQL.includes(`'${v}'`), `${name}: '${v}' missing from 0012/0013`);
  assert.ok(E.isOneOf(E.ORDER_STATUSES, 'paid'));
  assert.ok(!E.isOneOf(E.ORDER_STATUSES, 'canceled'), 'legacy spelling is not a status new code writes');
  assert.ok(!E.isOneOf(E.ORDER_STATUSES, 42));
});

test('enum values round-trip through the database CHECKs (sample: scan results, providers, age bands)', async () => {
  const d1 = await createMigratedD1();
  const s = d1.sqlite;
  s.exec(
    "INSERT INTO organizations (id, name, slug, type, status, created_at) VALUES ('org_s', 'Sample Church', 'sample-church', 'church', 'active', 1); INSERT INTO organizer_profiles (id, organization_id, created_at) VALUES ('op_s', 'org_s', 1); INSERT INTO events (id, organizer_id, title, slug, category, description, venue_name, city, state, starts_at, status, created_at) VALUES ('evt_s', 'op_s', 'Sample', 'sample', 'concert', 'Sample event', 'Hall', 'Phoenix', 'AZ', 2000000000, 'approved', 1);",
  );
  const scan = s.prepare(
    "INSERT INTO ticket_scan_events (id, event_id, direction, result, override_reason, received_at) VALUES (?, 'evt_s', 'in', ?, 'Supervisor check', 1)",
  );
  E.SCAN_RESULTS.forEach((r, i) => scan.run(`scan_${i}`, r));
  assert.throws(() => scan.run('scan_bad', 'maybe'), /CHECK/);
  s.exec(
    "INSERT INTO persons (id, email_normalized, email_verified_at, created_at, updated_at) VALUES ('per_s', 'sample@example.org', 1, 1, 1)",
  );
  const provider = s.prepare(
    "INSERT INTO provider_profiles (id, person_id, role, product_origin, display_name, status, created_at, updated_at) VALUES (?, 'per_s', ?, 'live', 'Sample', ?, 1, 1)",
  );
  E.PROVIDER_ROLES.forEach((role, i) =>
    provider.run(`pp_${i}`, role, E.PROVIDER_STATUSES[i % E.PROVIDER_STATUSES.length]),
  );
  assert.throws(() => provider.run('pp_bad', 'deacon', 'draft'), /CHECK/);
});

test('policy defaults match the design table and the database defaults', async () => {
  assert.deepEqual(EVENT_POLICY_DEFAULTS, {
    reentryAllowed: true,
    reentryLimit: null,
    refundPolicy: 'until_48h',
    refundCutoffHours: 48,
    transferAllowed: true,
    transferCutoffHours: 0,
    maxTransfersPerTicket: 3,
    attendeeNamesRequired: false,
    maxTicketsPerOrder: 10,
    doorSalesEnabled: false,
    doorSalesMethods: [],
    agePolicy: 'all_ages',
    minAge: null,
    scanOpensMinutesBefore: 120,
  });
  const d1 = await createMigratedD1();
  d1.sqlite.exec(
    "INSERT INTO organizations (id, name, slug, type, status, created_at) VALUES ('org_s', 'Sample', 's', 'church', 'active', 1); INSERT INTO organizer_profiles (id, organization_id, created_at) VALUES ('op_s', 'org_s', 1); INSERT INTO events (id, organizer_id, title, slug, category, description, venue_name, city, state, starts_at, status, created_at) VALUES ('evt_s', 'op_s', 'Sample', 'sample', 'concert', 'x', 'Hall', 'Phoenix', 'AZ', 2000000000, 'approved', 1); INSERT INTO event_policies (event_id, created_at, updated_at) VALUES ('evt_s', 1, 1);",
  );
  const row = d1.sqlite.prepare('SELECT * FROM event_policies').get() as any;
  assert.deepEqual(eventPolicyFromRow(row), EVENT_POLICY_DEFAULTS);
  const { event_id: _e, ...dbDefaults } = eventPolicyToRow('evt_s', EVENT_POLICY_DEFAULTS);
  for (const [k, v] of Object.entries(dbDefaults)) {
    if (k === 'refund_cutoff_hours') continue; // derived in code; NULL in a bare row
    assert.deepEqual(row[k], v, k);
  }
  assert.deepEqual(eventPolicyFromRow(null), EVENT_POLICY_DEFAULTS);
});

test('normalizeEventPolicy accepts valid input, derives implied fields and round-trips through the table', async () => {
  const r = normalizeEventPolicy({
    reentryAllowed: 'true',
    reentryLimit: '2',
    refundPolicy: 'until_7d',
    transferAllowed: false,
    maxTicketsPerOrder: 20,
    doorSalesEnabled: 'on',
    doorSalesMethods: 'free_issue, cash_recorded, free_issue',
    agePolicy: 'min_age',
    minAge: 18,
    scanOpensMinutesBefore: 0,
  });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  assert.equal(r.policy.refundCutoffHours, 168);
  assert.equal(r.policy.maxTransfersPerTicket, 0, 'transfers off → 0 per ticket');
  assert.deepEqual(r.policy.doorSalesMethods, ['free_issue', 'cash_recorded']);
  assert.equal(maxEntriesPerDay(r.policy), 3);
  assert.equal(maxEntriesPerDay({ reentryAllowed: false, reentryLimit: null }), 1);
  assert.equal(maxEntriesPerDay(EVENT_POLICY_DEFAULTS), null);
  for (const [policy, hours] of Object.entries(REFUND_CUTOFF_HOURS)) {
    const p = normalizeEventPolicy({ refundPolicy: policy });
    assert.ok(p.ok && p.policy.refundCutoffHours === hours, policy);
  }

  const d1 = await createMigratedD1();
  d1.sqlite.exec(
    "INSERT INTO organizations (id, name, slug, type, status, created_at) VALUES ('org_s', 'Sample', 's', 'church', 'active', 1); INSERT INTO organizer_profiles (id, organization_id, created_at) VALUES ('op_s', 'org_s', 1); INSERT INTO events (id, organizer_id, title, slug, category, description, venue_name, city, state, starts_at, status, created_at) VALUES ('evt_s', 'op_s', 'Sample', 'sample', 'concert', 'x', 'Hall', 'Phoenix', 'AZ', 2000000000, 'approved', 1);",
  );
  const row = eventPolicyToRow('evt_s', r.policy);
  const cols = Object.keys(row);
  d1.sqlite
    .prepare(
      `INSERT INTO event_policies (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, 1, 1)`,
    )
    .run(...(Object.values(row) as Array<string | number | null>));
  assert.deepEqual(
    eventPolicyFromRow(d1.sqlite.prepare('SELECT * FROM event_policies').get() as any),
    r.policy,
  );
  assert.deepEqual(JSON.parse(policySnapshotJson(r.policy)), { v: 1, ...r.policy });
});

test('normalizeEventPolicy rejects out-of-bound or conflicting input with next-step messages', () => {
  const bad = normalizeEventPolicy({
    reentryLimit: 21,
    refundPolicy: 'forever',
    transferCutoffHours: 169,
    maxTransfersPerTicket: 4,
    maxTicketsPerOrder: 0,
    scanOpensMinutesBefore: 721,
    agePolicy: 'min_age',
    minAge: 30,
    attendeeNamesRequired: 'maybe',
    doorSalesEnabled: true,
    doorSalesMethods: ['card'],
  });
  assert.equal(bad.ok, false);
  const errors = !bad.ok ? bad.errors : [];
  const byField = Object.fromEntries(errors.map((e) => [e.field, e]));
  assert.deepEqual(Object.keys(byField).sort(), [
    'attendeeNamesRequired',
    'doorSalesMethods',
    'maxTicketsPerOrder',
    'maxTransfersPerTicket',
    'minAge',
    'reentryLimit',
    'refundPolicy',
    'scanOpensMinutesBefore',
    'transferCutoffHours',
  ]);
  assert.equal(byField.maxTicketsPerOrder.message, 'Tickets per order: choose from 1 to 20 tickets.');
  assert.match(byField.doorSalesMethods.message, /card payments at the door are not available/);
  assert.match(byField.attendeeNamesRequired.message, /choose yes or no/);
  for (const e of errors)
    assert.match(e.message, /choose|enter|turn/i, `${e.field} tells the user what to do`);

  const conflicts = normalizeEventPolicy({
    reentryAllowed: false,
    reentryLimit: 3,
    minAge: 18,
    doorSalesEnabled: true,
  });
  assert.equal(conflicts.ok, false);
  assert.deepEqual(!conflicts.ok && conflicts.errors.map((e) => `${e.field}:${e.code}`), [
    'reentryLimit:conflict',
    'minAge:conflict',
    'doorSalesMethods:conflict',
  ]);
  const missingAge = normalizeEventPolicy({ agePolicy: 'min_age' });
  assert.equal(!missingAge.ok && missingAge.errors[0].message, 'Minimum age: enter an age from 1 to 21.');
  const notInt = normalizeEventPolicy({ maxTicketsPerOrder: 2.5 });
  assert.equal(!notInt.ok && notInt.errors[0].code, 'invalid_type');
  assert.ok(normalizeEventPolicy().ok);
  assert.ok(normalizeEventPolicy({ reentryLimit: '', minAge: null }).ok, 'blank means default');
});

test('toEpochSeconds accepts Drizzle Dates and numbers', () => {
  assert.equal(toEpochSeconds(new Date(1_900_000_000_500)), 1_900_000_000);
  assert.equal(toEpochSeconds(1_900_000_000.9), 1_900_000_000);
});
