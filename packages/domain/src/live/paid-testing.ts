/**
 * Test fixtures for paid ticketing (used by the `*.test.ts` files next to the paid modules, never by app code).
 * `paidTestDatabase()` applies every Live migration to an in-memory database; `seedPaidEvent()` adds a verified
 * organization with one owner, a published paid event with one future date, two ticket types with their inventory
 * rows, and (optionally) a chosen funds-flow mode with a ready connected account.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createSqliteD1 } from '@gamo/db/testing';
import type { SqlDatabase } from '../security/sql-database.ts';
import type { FundsFlow } from './paid-types.ts';

const MIGRATIONS = new URL('../../../db/live/migrations/', import.meta.url);

/** 1 November 2026 (UTC). Tests pass `now` explicitly; nothing reads the clock. */
export const PAID_NOW = Date.UTC(2026, 10, 1) / 1000;
/** A local environment: secrets fall back to the fixed development keys, the stand-in is allowed. */
export const PAID_ENV = { ENVIRONMENT: 'local', ALLOW_STRIPE_STANDIN: 'true' } as const;

export async function paidTestDatabase() {
  const d1 = createSqliteD1();
  for (const name of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await d1.exec(readFileSync(new URL(name, MIGRATIONS), 'utf8'));
  return { d1, db: d1 as unknown as SqlDatabase };
}

export interface SeedPaidEventOptions {
  /** Funds-flow default; omit to leave it `not_chosen`. */
  flow?: FundsFlow;
  /** The organization's connected account is ready (default true when `flow` is set). */
  accountReady?: boolean;
  /** Event capacity in people (null = only the ticket types' capacities). */
  eventCapacity?: number | null;
  /** Start of the one date, default 30 days after PAID_NOW. */
  startsAt?: number;
  feePayer?: 'buyer' | 'organizer';
  refundPolicy?: 'none' | 'until_hours_before' | 'until_start';
  refundHours?: number | null;
  transfersAllowed?: boolean;
  giftsEnabled?: boolean;
  doorSalesEnabled?: boolean;
  namesRequired?: boolean;
  verified?: boolean;
}

export interface SeededPaidEvent {
  organizationId: string;
  organizerId: string;
  eventId: string;
  occurrenceId: string;
  /** $20.00, 100 per date, no door allocation. */
  generalTypeId: string;
  /** $50.00, 10 per date, 2 held for the door, door may not use the online pool. */
  vipTypeId: string;
  connectedAccountId: string | null;
}

/** Seeds one organization and paid event; call again with `suffix` for a second one. */
export function seedPaidEvent(
  d1: { sqlite: { exec(sql: string): void } },
  options: SeedPaidEventOptions = {},
  suffix = '1',
): SeededPaidEvent {
  const s = suffix;
  const startsAt = options.startsAt ?? PAID_NOW + 30 * 86_400;
  const flow = options.flow ?? null;
  const ready = options.accountReady ?? flow !== null;
  const account = flow ? `acct_test_${s}` : null;
  const verified = options.verified ?? true;
  const cap = options.eventCapacity === undefined ? null : options.eventCapacity;
  const q = (v: string | number | null) =>
    v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v}'`;
  d1.sqlite.exec(`
    INSERT INTO organizers (id, clerk_user_id, email, display_name) VALUES ('usr_${s}', 'clerk_${s}', 'owner${s}@example.org', 'Owner ${s}');
    INSERT INTO organizations (id, name, slug, kind, status, verified_at, verification_status, first_event_approved_at, first_paid_event_approved_at)
      VALUES ('org_${s}', 'Grace Church ${s}', 'grace-${s}', 'church', 'active', ${verified ? PAID_NOW - 86_400 : 'NULL'}, '${verified ? 'verified' : 'none'}', ${PAID_NOW - 86_400}, ${PAID_NOW - 86_400});
    INSERT INTO memberships (organization_id, organizer_id, role) VALUES ('org_${s}', 'usr_${s}', 'owner');
    INSERT INTO venues (id, name, address, city, state, timezone) VALUES ('ven_${s}', 'Grace Hall ${s}', '1 Main St', 'Phoenix', 'AZ', 'America/Phoenix');
    INSERT INTO events (id, organization_id, origin, slug, title, category, venue_id, timezone, admission, capacity, qr_checkin, status, published_at, venue_name, venue_address)
      VALUES ('evt_${s}', 'org_${s}', 'organizer', 'gospel-night-${s}', 'Gospel Night ${s}', 'concert', 'ven_${s}', 'America/Phoenix', 'paid_tickets', ${q(cap)}, 1, 'published', ${PAID_NOW - 86_400}, 'Grace Hall ${s}', '1 Main St');
    INSERT INTO event_occurrences (id, event_id, starts_at, ends_at) VALUES ('occ_${s}', 'evt_${s}', ${startsAt}, ${startsAt + 3 * 3600});
    INSERT INTO event_ticketing (event_id, fee_payer, refund_policy, refund_hours, transfers_allowed, gifts_enabled, gift_presets, door_sales_enabled, names_required)
      VALUES ('evt_${s}', '${options.feePayer ?? 'buyer'}', '${options.refundPolicy ?? 'until_hours_before'}', ${q(options.refundPolicy === 'until_hours_before' || options.refundPolicy === undefined ? (options.refundHours ?? 48) : null)},
              ${options.transfersAllowed === false ? 0 : 1}, ${options.giftsEnabled ? 1 : 0}, '[500,1000,2500]', ${options.doorSalesEnabled === false ? 0 : 1}, ${options.namesRequired ? 1 : 0});
    INSERT INTO ticket_types (id, event_id, name, kind, price_cents, capacity, door_allocation, door_uses_online, per_order_limit, position)
      VALUES ('tty_general_${s}', 'evt_${s}', 'General', 'general', 2000, 100, 0, 1, 10, 0),
             ('tty_vip_${s}', 'evt_${s}', 'VIP', 'vip', 5000, 10, 2, 0, 4, 1);
    INSERT INTO ticket_inventory (ticket_type_id, occurrence_id, capacity, door_allocation, door_uses_online)
      VALUES ('tty_general_${s}', 'occ_${s}', 100, 0, 1), ('tty_vip_${s}', 'occ_${s}', 10, 2, 0);
    INSERT INTO occurrence_inventory (occurrence_id, capacity) VALUES ('occ_${s}', ${q(cap)});
    INSERT INTO terms_acceptances (organizer_id, document, version, accepted_at) VALUES ('usr_${s}', 'organizer-terms', '2026-10-19-draft.3', ${PAID_NOW - 86_400});
  `);
  if (flow) {
    d1.sqlite.exec(`
      UPDATE payment_settings SET funds_flow_default = '${flow}' WHERE id = 1;
      INSERT INTO organization_payments (organization_id, connected_account_id, charges_enabled, payouts_enabled, details_submitted, checked_at)
        VALUES ('org_${s}', '${account}', ${ready ? 1 : 0}, ${ready ? 1 : 0}, ${ready ? 1 : 0}, ${PAID_NOW});
    `);
  }
  return {
    organizationId: `org_${s}`,
    organizerId: `usr_${s}`,
    eventId: `evt_${s}`,
    occurrenceId: `occ_${s}`,
    generalTypeId: `tty_general_${s}`,
    vipTypeId: `tty_vip_${s}`,
    connectedAccountId: account,
  };
}
