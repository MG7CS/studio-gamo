/**
 * Test helpers for the ticketing services (node tests only; never imported by Workers).
 * A migrated in-memory D1, a local environment (simulated Stripe and email, local development keys),
 * an in-memory KV for the local test inbox, and a sample organizer with a published event.
 * All people, emails and events are fictional and labelled Sample (example.org / example.invalid).
 */
import { createMigratedD1, type SqliteD1 } from '@gamo/db/testing';
import { createOrganizerEvent, type CategoryInput, type EventInput } from './events.ts';
import { utcToZonedLocal } from './events-time.ts';
import type { PublicFormBody } from '../../api/public-form-guard.ts';
import { getTermsDocument } from '../../terms/registry.ts';
import { randomBase32 } from '../../security/base32.ts';
import type { EventPolicyInput } from '../../types/policy.ts';
import type { OrderRequest } from './checkout.ts';

export class MemoryKv {
  map = new Map<string, string>();
  async put(key: string, value: string) {
    this.map.set(key, value);
  }
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async list({ prefix }: { prefix: string }) {
    return { keys: [...this.map.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) };
  }
}

export interface TicketingFixture {
  d1: SqliteD1;
  env: Record<string, unknown>;
  kv: MemoryKv;
  orgId: string;
  userId: string;
  q: <T = Record<string, unknown>>(sql: string, ...params: Array<string | number | null>) => T;
  all: <T = Record<string, unknown>>(sql: string, ...params: Array<string | number | null>) => T[];
}

export const ORIGIN = 'http://127.0.0.1:4324';

export async function ticketingFixture(extraEnv: Record<string, unknown> = {}): Promise<TicketingFixture> {
  const d1 = await createMigratedD1();
  const kv = new MemoryKv();
  const now = Math.floor(Date.now() / 1000);
  d1.sqlite.exec(
    `INSERT INTO users (id, email, display_name, status, verified_email_at, created_at) VALUES ('usr_sample_owner', 'owner@example.invalid', 'Sample Owner', 'active', ${now}, ${now});
     INSERT INTO organizations (id, name, slug, type, status, created_at) VALUES ('org_sample', 'Sample Church', 'sample-church', 'church', 'active', ${now});
     INSERT INTO organization_members (id, organization_id, user_id, role, status, created_at) VALUES ('mem_sample', 'org_sample', 'usr_sample_owner', 'owner', 'active', ${now});`,
  );
  return {
    d1,
    kv,
    orgId: 'org_sample',
    userId: 'usr_sample_owner',
    env: { DB: d1, ENVIRONMENT: 'local', STRIPE_TEST_CHECKOUT: 'true', SESSION_KV: kv, ...extraEnv },
    q: (sql, ...p) => ({ ...(d1.sqlite.prepare(sql).get(...p) as object) }) as never,
    all: (sql, ...p) => (d1.sqlite.prepare(sql).all(...p) as object[]).map((r) => ({ ...r })) as never,
  };
}

export function sampleEventInput(
  f: Pick<TicketingFixture, 'orgId'>,
  opts: {
    title?: string;
    admissionType?: 'free' | 'paid';
    categories?: CategoryInput[];
    policy?: EventPolicyInput;
    startsInDays?: number;
    timezone?: string;
  } = {},
): EventInput {
  const zone = opts.timezone ?? 'America/Phoenix';
  const start = utcToZonedLocal(Math.floor(Date.now() / 1000) + (opts.startsInDays ?? 30) * 86400, zone);
  return {
    organizationId: f.orgId,
    title: opts.title ?? 'Sample Worship Night',
    category: 'worship',
    description: 'A sample worship gathering used only in automated tests.',
    venueName: 'Sample Fellowship Hall',
    address: '100 Sample Street',
    city: 'Phoenix',
    state: 'AZ',
    timezone: zone,
    start: { date: start.date, time: '19:00' },
    admissionType: opts.admissionType ?? 'free',
    categories: opts.categories ?? [
      { name: 'General admission', kind: 'general', price: '0', capacity: '50' },
    ],
    policy: opts.policy ?? {},
  };
}

/** Creates an event and publishes it (as staff approval would). */
export async function publishedEvent(f: TicketingFixture, opts: Parameters<typeof sampleEventInput>[1] = {}) {
  const created = await createOrganizerEvent(f.d1, {
    event: sampleEventInput(f, opts),
    actorUserId: f.userId,
    now: Math.floor(Date.now() / 1000),
  });
  f.d1.sqlite.prepare("UPDATE events SET status = 'approved' WHERE id = ?").run(created.eventId);
  const categories = f.all<{ id: string; name: string; kind: string }>(
    'SELECT id, name, kind FROM ticket_tiers WHERE event_id = ? ORDER BY sort_order',
    created.eventId,
  );
  return { ...created, categories };
}

export function sampleOrderRequest(
  eventId: string,
  items: Array<{ categoryId: string; quantity: number; sectionId?: string | null }>,
  overrides: Partial<OrderRequest> = {},
): OrderRequest {
  const email = overrides.email ?? `buyer-${randomBase32(6).toLowerCase()}@example.org`;
  return {
    eventId,
    items: items.map((i) => ({
      categoryId: i.categoryId,
      quantity: i.quantity,
      sectionId: i.sectionId ?? null,
    })),
    purchaserName: 'Sample Buyer',
    email,
    emailConfirm: email,
    attendeeNames: [],
    termsAccepted: true,
    termsDocuments: ['ticket-terms', 'privacy-policy'].map((slug) => ({
      slug,
      version: getTermsDocument(slug)!.version,
    })),
    marketingOptIn: false,
    idempotencyKey: `idem_${randomBase32(24)}`,
    ...overrides,
  };
}

/** A form body for parse tests. */
export function formBody(entries: Array<[string, string]>): PublicFormBody {
  const form = new FormData();
  for (const [k, v] of entries) form.append(k, v);
  const strings = (name: string) => form.getAll(name).filter((v): v is string => typeof v === 'string');
  return { type: 'form', form, get: (n) => strings(n)[0] ?? null, getAll: strings };
}
