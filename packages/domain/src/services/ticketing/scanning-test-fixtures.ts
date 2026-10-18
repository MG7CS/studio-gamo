/**
 * Test fixtures for the scanner, manifest, venue map and dashboard tests (Agent C). Test-only: it
 * imports the node:sqlite D1 adapter. Fictional sample data with example.org addresses.
 *
 * Tickets are created directly with the Phase 1 SQL builders (hold batch → convert → insert ticket),
 * the same statements checkout and issuance use.
 */
import { createMigratedD1, type SqliteD1 } from '@gamo/db/testing';
import { newOrderReference, newPrefixedId, newTicketId } from '../../security/ids.ts';
import { newQrSalt, signTicketQr, type QrKeyring } from '../../security/ticket-qr.ts';
import { runBatch, type SqlDatabase, type SqlStatementSpec } from '../../security/sql-database.ts';
import { EVENT_POLICY_DEFAULTS, HOLD_DURATION_SECONDS, policySnapshotJson } from '../../types/policy.ts';
import {
  buildHoldBatch,
  convertOrderHoldsStatement,
  insertTicketStatement,
  transitionOrderStatement,
} from '../../ticketing/sql.ts';
import {
  createScannerSession,
  readScannerDevice,
  unlockScannerSession,
  SCANNER_COOKIE_NAME,
  type NewScannerSessionInput,
} from './scanner-sessions.ts';

export const QR_KEYS: QrKeyring = { GL1: 'ticket-qr-secret-for-scanner-tests-0001' };
export const TEST_ENV = {
  ENVIRONMENT: 'production',
  SCANNER_SESSION_SECRET: 'scanner-session-secret-for-tests-only-000001',
  PII_HASH_SECRET: 'pii-hash-secret-for-scanner-tests-only-0000001',
  TICKET_QR_SECRET_GL1: QR_KEYS.GL1,
};

export interface SeedOptions {
  eventId?: string;
  title?: string;
  startsAt: number;
  endsAt?: number | null;
  timezone?: string;
  tiers?: Array<{
    id: string;
    capacity: number;
    price?: number;
    seats?: number;
    zones?: string[];
    validDays?: string[];
    name?: string;
  }>;
  sections?: Array<{
    id: string;
    tierId: string;
    capacity: number;
    price?: number | null;
    zone?: string | null;
  }>;
  policy?: Partial<{
    reentry_allowed: number;
    reentry_limit: number | null;
    scan_opens_minutes_before: number;
    door_sales_enabled: number;
    door_sales_methods_json: string;
  }>;
  admission?: 'free' | 'paid';
}

export interface Fixture {
  d1: SqliteD1;
  db: SqlDatabase;
  q: (sql: string, ...params: Array<string | number | null>) => Record<string, unknown>;
  all: (sql: string, ...params: Array<string | number | null>) => Record<string, unknown>[];
}

export async function createFixture(): Promise<Fixture> {
  const d1 = await createMigratedD1();
  return {
    d1,
    db: d1,
    q: (sql, ...p) => ({ ...((d1.sqlite.prepare(sql).get(...p) as Record<string, unknown>) ?? {}) }),
    all: (sql, ...p) =>
      (d1.sqlite.prepare(sql).all(...p) as Record<string, unknown>[]).map((r) => ({ ...r })),
  };
}

/** One approved event (Sample Church organizer, owner user `usr_owner`). */
export function seedEvent(f: Fixture, o: SeedOptions): string {
  const eventId = o.eventId ?? 'evt_sample';
  const s = f.d1.sqlite;
  const created = o.startsAt - 30 * 86400;
  s.exec(
    `INSERT OR IGNORE INTO organizations (id, name, slug, type, status, created_at) VALUES ('org_sample', 'Sample Church', 'sample-church', 'church', 'active', ${created});
     INSERT OR IGNORE INTO organizer_profiles (id, organization_id, created_at) VALUES ('op_sample', 'org_sample', ${created});
     INSERT OR IGNORE INTO users (id, email, verified_email_at, status, created_at, display_name) VALUES ('usr_owner', 'owner@example.org', ${created}, 'active', ${created}, 'Sample Owner');
     INSERT OR IGNORE INTO organization_members (id, organization_id, user_id, role, status, created_at) VALUES ('om_owner', 'org_sample', 'usr_owner', 'owner', 'active', ${created});`,
  );
  s.prepare(
    "INSERT INTO events (id, organizer_id, title, slug, category, description, venue_name, city, state, starts_at, ends_at, timezone, admission_type, status, created_at) VALUES (?, 'op_sample', ?, ?, 'concert', 'Sample event', 'Sample Hall', 'Phoenix', 'AZ', ?, ?, ?, ?, 'approved', ?)",
  ).run(
    eventId,
    o.title ?? 'Sample Night of Worship',
    eventId,
    o.startsAt,
    o.endsAt === undefined ? o.startsAt + 3 * 3600 : o.endsAt,
    o.timezone ?? 'America/Phoenix',
    o.admission ?? 'paid',
    created,
  );
  for (const t of o.tiers ?? [{ id: `${eventId}_ga`, capacity: 50, price: 2500 }])
    s.prepare(
      'INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, reserved_count, seats_per_ticket, zone_codes_json, valid_days_json, status) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)',
    ).run(
      t.id,
      eventId,
      t.name ?? `Sample ${t.id}`,
      t.price ?? 2500,
      t.capacity,
      t.seats ?? 1,
      t.zones ? JSON.stringify(t.zones) : null,
      t.validDays ? JSON.stringify(t.validDays) : null,
      'active',
    );
  for (const sec of o.sections ?? [])
    s.prepare(
      'INSERT INTO venue_sections (id, event_id, tier_id, code, name, price_cents, capacity, zone_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      sec.id,
      eventId,
      sec.tierId,
      sec.id.toUpperCase(),
      `Section ${sec.id}`,
      sec.price ?? null,
      sec.capacity,
      sec.zone ?? null,
      created,
      created,
    );
  if (o.policy) {
    const p = {
      reentry_allowed: 1,
      reentry_limit: null,
      scan_opens_minutes_before: 120,
      door_sales_enabled: 0,
      door_sales_methods_json: '[]',
      ...o.policy,
    };
    s.prepare(
      'INSERT INTO event_policies (event_id, reentry_allowed, reentry_limit, scan_opens_minutes_before, door_sales_enabled, door_sales_methods_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      eventId,
      p.reentry_allowed,
      p.reentry_limit,
      p.scan_opens_minutes_before,
      p.door_sales_enabled,
      p.door_sales_methods_json,
      created,
      created,
    );
  }
  return eventId;
}

export interface IssuedTicket {
  id: string;
  payload: string;
  salt: string;
  orderId: string;
}

/** Sells `quantity` tickets of a category (optionally a section) and issues them; returns ids + QR payloads. */
export async function issueTickets(
  f: Fixture,
  input: {
    eventId: string;
    categoryId: string;
    sectionId?: string | null;
    quantity: number;
    holderName?: string;
    email?: string;
    now: number;
  },
): Promise<IssuedTicket[]> {
  const orderId = newPrefixedId('ord');
  const itemId = newPrefixedId('oit');
  const email = input.email ?? 'sample.buyer@example.org';
  await runBatch(
    f.db,
    buildHoldBatch({
      order: {
        id: orderId,
        reference: newOrderReference(),
        eventId: input.eventId,
        customerProfileId: null,
        purchaserName: input.holderName ?? 'Sample Buyer',
        purchaserEmail: email,
        kind: 'paid',
        status: 'pending_payment',
        idempotencyKey: newPrefixedId('idem'),
        holdExpiresAt: input.now + HOLD_DURATION_SECONDS,
        policySnapshotJson: policySnapshotJson(EVENT_POLICY_DEFAULTS),
        now: input.now,
      },
      items: [
        {
          item: {
            id: itemId,
            categoryId: input.categoryId,
            sectionId: input.sectionId ?? null,
            quantity: input.quantity,
          },
          holdId: newPrefixedId('hold'),
        },
      ],
    }),
  );
  const issue: SqlStatementSpec[] = [
    transitionOrderStatement({ orderId, from: ['pending_payment'], to: 'paid', now: input.now }),
    convertOrderHoldsStatement({ orderId, now: input.now }),
  ];
  const out: IssuedTicket[] = [];
  for (let seq = 1; seq <= input.quantity; seq++) {
    const id = newTicketId();
    const salt = newQrSalt();
    const sig = await signTicketQr({ ticketId: id, version: 1, eventId: input.eventId, salt }, QR_KEYS);
    if (!sig.ok) throw new Error('sign failed');
    issue.push(
      insertTicketStatement({
        id,
        orderId,
        orderItemId: itemId,
        eventId: input.eventId,
        categoryId: input.categoryId,
        sectionId: input.sectionId ?? null,
        holderName: input.holderName ?? 'Sample Holder',
        holderEmail: email,
        seq,
        qrKeyId: sig.keyId,
        qrSalt: salt,
        qrSignatureHash: sig.macDigest,
        now: input.now,
      }),
    );
    out.push({ id, payload: sig.payload, salt, orderId });
  }
  await runBatch(f.db, issue);
  return out;
}

/** Creates a gate session, unlocks it with its PIN and returns the device context (as the API would). */
export async function scannerDevice(
  f: Fixture,
  input: Omit<NewScannerSessionInput, 'createdByUserId' | 'label' | 'allowedDirections'> &
    Partial<Pick<NewScannerSessionInput, 'label' | 'allowedDirections'>>,
) {
  const created = await createScannerSession(f.db, TEST_ENV, {
    label: 'Sample Gate A',
    allowedDirections: 'both',
    createdByUserId: 'usr_owner',
    ...input,
  });
  const unlocked = await unlockScannerSession(f.db, TEST_ENV, {
    token: created.token,
    pin: created.pin,
    ipHash: null,
    now: input.now,
  });
  if (!unlocked.ok) throw new Error(`unlock failed: ${unlocked.reason}`);
  const request = new Request('https://live.example.test/scan/x', {
    headers: { cookie: `${SCANNER_COOKIE_NAME}=${encodeURIComponent(unlocked.cookieValue)}` },
  });
  const device = await readScannerDevice(f.db, TEST_ENV, request, input.now);
  if (!device) throw new Error('device not readable');
  return { created, unlocked, device };
}
