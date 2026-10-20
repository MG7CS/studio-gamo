/**
 * Stripe Terminal card readers for door sales (docs/LIVE_REQUIREMENTS.md §8.3 item 22, docs/LIVE_PAYMENTS.md §7).
 *
 * Server-driven smart readers: an owner pairs a reader with its one-time registration code to the organization's
 * Terminal location on the account charges go to (Mode A: the organization's connected account; Mode B: Gamo's own
 * account). The location is created once per organization and account. Members may assign a reader to an event and
 * see its status; only owners pair and remove. `terminal.reader.action_succeeded` / `action_failed` update the reader's
 * action state; the order itself is completed by the `payment_intent.succeeded` handler.
 */
import { sha256Hex } from '../security/crypto.ts';
import { newPrefixedId } from '../security/ids.ts';
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import {
  PAID_ID_PREFIX,
  PaidError,
  type HandlerResult,
  type ReaderActionStatus,
  type ReaderStatus,
  type StripeEvent,
  type StripeEventHandler,
  type WebhookContext,
} from './paid-types.ts';
import {
  StripeApiError,
  type LocationParams,
  type PaymentRouting,
  type StripeGateway,
  type StripeReader,
} from './payments/types.ts';

export const READER_LABEL_MAX = 60;

export type OrganizationRole = 'owner' | 'member';

/** Where a reader call goes: a routing (its gateway and charge account) or a gateway with an explicit account. */
export type ReaderConnection =
  { routing: PaymentRouting } | { gateway: StripeGateway; accountId: string | null };

function connectionOf(c: ReaderConnection): { gateway: StripeGateway; accountId: string | null } {
  return 'routing' in c ? { gateway: c.routing.gateway, accountId: c.routing.chargeAccountId } : c;
}

function requireOwner(role: OrganizationRole): void {
  if (role !== 'owner') throw new PaidError('forbidden', { detail: 'owner' });
}

/** Maps a Stripe refusal to a `PaidError` with Stripe's code (for example `terminal_reader_offline`). */
export function readerStripeError(error: unknown): PaidError {
  if (error instanceof StripeApiError)
    return new PaidError('stripe_error', { detail: error.stripeCode ?? `http_${error.status}` });
  return new PaidError('stripe_error', { detail: 'network' });
}

export interface ReaderAddress {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
}

/** Checks a US address for the Terminal location. Throws `invalid` with the field. */
export function cleanReaderAddress(address: Partial<ReaderAddress>): LocationParams['address'] {
  const text = (v: unknown, max: number, field: string) => {
    const t = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
    if (t.length < 1 || t.length > max) throw new PaidError('invalid', { detail: field });
    return t;
  };
  const state = text(address.state, 2, 'state').toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) throw new PaidError('invalid', { detail: 'state' });
  const postalCode = text(address.postalCode, 10, 'postalCode');
  if (!/^\d{5}(-\d{4})?$/.test(postalCode)) throw new PaidError('invalid', { detail: 'postalCode' });
  return {
    line1: text(address.line1, 200, 'line1'),
    city: text(address.city, 100, 'city'),
    state,
    postalCode,
    country: 'US',
  };
}

export interface Reader {
  id: string;
  organizationId: string;
  eventId: string | null;
  label: string;
  stripeReaderId: string;
  stripeAccountId: string | null;
  deviceType: string | null;
  status: ReaderStatus;
  actionStatus: ReaderActionStatus;
  actionOrderId: string | null;
  actionFailure: string | null;
  lastSeenAt: number | null;
  createdAt: number;
  removedAt: number | null;
}

const READER_SELECT = `SELECT id, organization_id, event_id, label, stripe_reader_id, stripe_account_id, device_type, status,
                              action_status, action_order_id, action_failure, last_seen_at, created_at, removed_at
                         FROM readers`;

function readerOf(r: Record<string, unknown>): Reader {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    eventId: (r.event_id as string | null) ?? null,
    label: String(r.label),
    stripeReaderId: String(r.stripe_reader_id),
    stripeAccountId: (r.stripe_account_id as string | null) ?? null,
    deviceType: (r.device_type as string | null) ?? null,
    status: (r.status as ReaderStatus) ?? 'unknown',
    actionStatus: (r.action_status as ReaderActionStatus) ?? 'idle',
    actionOrderId: (r.action_order_id as string | null) ?? null,
    actionFailure: (r.action_failure as string | null) ?? null,
    lastSeenAt: r.last_seen_at == null ? null : Number(r.last_seen_at),
    createdAt: Number(r.created_at),
    removedAt: r.removed_at == null ? null : Number(r.removed_at),
  };
}

/** One reader of this organization (removed ones included), or null. */
export async function getReader(
  db: SqlDatabase,
  organizationId: string,
  readerId: string,
): Promise<Reader | null> {
  const [r] = await allRows<Record<string, unknown>>(db, {
    sql: `${READER_SELECT} WHERE id = ?1 AND organization_id = ?2`,
    params: [readerId, organizationId],
  });
  return r ? readerOf(r) : null;
}

/**
 * The organization's readers that are not removed. With `eventId`, only those assigned to that event or to no event
 * (what the door screen may use).
 */
export async function listReaders(
  db: SqlDatabase,
  input: { organizationId: string; eventId?: string | null },
): Promise<Reader[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: input.eventId
      ? `${READER_SELECT} WHERE organization_id = ?1 AND removed_at IS NULL AND (event_id IS NULL OR event_id = ?2) ORDER BY label, id`
      : `${READER_SELECT} WHERE organization_id = ?1 AND removed_at IS NULL ORDER BY label, id`,
    params: input.eventId ? [input.organizationId, input.eventId] : [input.organizationId],
  });
  return rows.map(readerOf);
}

const readerStatusOf = (s: StripeReader['status']): ReaderStatus =>
  s === 'online' || s === 'offline' ? s : 'unknown';

/** The organization's Terminal location on this account, created at Stripe the first time. */
async function ensureLocation(
  db: SqlDatabase,
  input: {
    organizationId: string;
    gateway: StripeGateway;
    accountId: string | null;
    /** Read only when the location has to be created. */
    address: () => LocationParams['address'];
    now: number;
  },
): Promise<{ id: string; stripeLocationId: string }> {
  const find = () =>
    allRows<{ id: string; stripe_location_id: string }>(db, {
      sql: `SELECT id, stripe_location_id FROM terminal_locations
             WHERE organization_id = ?1 AND stripe_account_id IS ?2 ORDER BY created_at, id LIMIT 1`,
      params: [input.organizationId, input.accountId],
    });
  const [existing] = await find();
  if (existing) return { id: existing.id, stripeLocationId: existing.stripe_location_id };
  const [org] = await allRows<{ name: string }>(db, {
    sql: 'SELECT name FROM organizations WHERE id = ?1',
    params: [input.organizationId],
  });
  if (!org) throw new PaidError('not_found');
  const address = input.address();
  let location;
  try {
    location = await input.gateway.createLocation(
      {
        displayName: org.name.slice(0, 100),
        address,
        metadata: { organization_id: input.organizationId },
      },
      {
        account: input.accountId,
        idempotencyKey: `location_${input.organizationId}_${input.accountId ?? 'gamo'}`,
      },
    );
  } catch (error) {
    throw readerStripeError(error);
  }
  const id = newPrefixedId(PAID_ID_PREFIX.location);
  await runBatch(db, [
    {
      sql: `INSERT INTO terminal_locations (id, organization_id, stripe_location_id, stripe_account_id, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (stripe_location_id) DO NOTHING`,
      params: [id, input.organizationId, location.id, input.accountId, input.now],
    },
  ]);
  const [row] = await find();
  if (!row) throw new PaidError('stale');
  return { id: row.id, stripeLocationId: row.stripe_location_id };
}

export type PairReaderInput = ReaderConnection & {
  organizationId: string;
  /** The caller's role in the organization (only owners pair). */
  role: OrganizationRole;
  label: string;
  /** The one-time code the reader shows (or `simulated-s700` / `simulated-wpe` in test mode). */
  registrationCode: string;
  /** Needed the first time, to create the organization's Terminal location. */
  address: Partial<ReaderAddress> | null;
  eventId?: string | null;
  now: number;
};

/** Pairs a reader to the organization (owners only). Never stores the registration code. */
export async function pairReader(db: SqlDatabase, input: PairReaderInput): Promise<Reader> {
  requireOwner(input.role);
  const { gateway, accountId } = connectionOf(input);
  const label = typeof input.label === 'string' ? input.label.trim().replace(/\s+/g, ' ') : '';
  if (label.length < 1 || label.length > READER_LABEL_MAX)
    throw new PaidError('invalid', { detail: 'label' });
  const code = typeof input.registrationCode === 'string' ? input.registrationCode.trim() : '';
  if (!/^[A-Za-z0-9-]{3,64}$/.test(code)) throw new PaidError('invalid', { detail: 'registrationCode' });
  if (input.eventId) await requireEventOfOrganization(db, input.organizationId, input.eventId);

  const location = await ensureLocation(db, {
    organizationId: input.organizationId,
    gateway,
    accountId,
    address: () => cleanReaderAddress(input.address ?? {}),
    now: input.now,
  });

  let reader: StripeReader;
  try {
    reader = await gateway.registerReader(
      { registrationCode: code, label, location: location.stripeLocationId },
      {
        account: accountId,
        idempotencyKey: `reader_${(await sha256Hex(`${input.organizationId}:${accountId ?? 'gamo'}:${code}`)).slice(0, 40)}`,
      },
    );
  } catch (error) {
    throw readerStripeError(error);
  }
  const id = newPrefixedId(PAID_ID_PREFIX.reader);
  try {
    await runBatch(db, [
      {
        sql: `INSERT INTO readers (id, organization_id, location_id, event_id, label, stripe_reader_id, stripe_account_id,
                                   device_type, status, last_seen_at, created_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
        params: [
          id,
          input.organizationId,
          location.id,
          input.eventId ?? null,
          label,
          reader.id,
          accountId,
          reader.device_type ?? null,
          readerStatusOf(reader.status),
          reader.status === 'online' ? input.now : null,
          input.now,
        ],
      },
    ]);
  } catch (error) {
    if (/UNIQUE/i.test(String((error as Error)?.message)))
      throw new PaidError('already_done', { detail: 'reader' });
    throw error;
  }
  const saved = await getReader(db, input.organizationId, id);
  if (!saved) throw new PaidError('not_found');
  return saved;
}

async function requireEventOfOrganization(
  db: SqlDatabase,
  organizationId: string,
  eventId: string,
): Promise<void> {
  const rows = await allRows(db, {
    sql: 'SELECT 1 AS ok FROM events WHERE id = ?1 AND organization_id = ?2',
    params: [eventId, organizationId],
  });
  if (rows.length === 0) throw new PaidError('not_found');
}

/** Assigns a reader to one event, or to none (`eventId: null`). */
export async function assignReader(
  db: SqlDatabase,
  input: { organizationId: string; readerId: string; eventId: string | null },
): Promise<void> {
  if (input.eventId) await requireEventOfOrganization(db, input.organizationId, input.eventId);
  const [rows] = await runBatch(db, [
    {
      sql: 'UPDATE readers SET event_id = ?3 WHERE id = ?1 AND organization_id = ?2 AND removed_at IS NULL RETURNING id',
      params: [input.readerId, input.organizationId, input.eventId],
    },
  ]);
  if (rows.length === 0) throw new PaidError('not_found');
}

/** Asks Stripe for the reader's status and stores it. */
export async function refreshReaderStatus(
  db: SqlDatabase,
  input: { organizationId: string; readerId: string; gateway: StripeGateway; now: number },
): Promise<Reader> {
  const reader = await getReader(db, input.organizationId, input.readerId);
  if (!reader || reader.removedAt !== null) throw new PaidError('not_found');
  let remote: StripeReader;
  try {
    remote = await input.gateway.retrieveReader(reader.stripeReaderId, { account: reader.stripeAccountId });
  } catch (error) {
    throw readerStripeError(error);
  }
  const status = readerStatusOf(remote.status);
  await runBatch(db, [
    {
      sql: `UPDATE readers SET status = ?2, device_type = COALESCE(?3, device_type),
                               last_seen_at = CASE WHEN ?2 = 'online' THEN ?4 ELSE last_seen_at END
             WHERE id = ?1`,
      params: [reader.id, status, remote.device_type ?? null, input.now],
    },
  ]);
  return (await getReader(db, input.organizationId, input.readerId)) ?? reader;
}

/** Removes a reader (owners only): deleted at Stripe, kept here as removed for history. */
export async function removeReader(
  db: SqlDatabase,
  input: {
    organizationId: string;
    role: OrganizationRole;
    readerId: string;
    gateway: StripeGateway;
    now: number;
  },
): Promise<void> {
  requireOwner(input.role);
  const reader = await getReader(db, input.organizationId, input.readerId);
  if (!reader || reader.removedAt !== null) throw new PaidError('not_found');
  try {
    await input.gateway.deleteReader(reader.stripeReaderId, { account: reader.stripeAccountId });
  } catch (error) {
    // Already gone at Stripe: removing it here is still right.
    if (!(error instanceof StripeApiError && error.status === 404)) throw readerStripeError(error);
  }
  await runBatch(db, [
    {
      sql: `UPDATE readers SET removed_at = ?3, event_id = NULL, action_status = 'idle', action_order_id = NULL
             WHERE id = ?1 AND organization_id = ?2 AND removed_at IS NULL`,
      params: [reader.id, input.organizationId, input.now],
    },
  ]);
}

// ── Webhooks ───────────────────────────────────────────────────────────────────────────────────────────────────

function readerFromEvent(event: StripeEvent): StripeReader | null {
  const obj = event.data?.object as Partial<StripeReader> | undefined;
  if (!obj || obj.object !== 'terminal.reader' || typeof obj.id !== 'string') return null;
  return obj as StripeReader;
}

async function applyReaderAction(
  event: StripeEvent,
  ctx: WebhookContext,
  status: 'succeeded' | 'failed',
): Promise<HandlerResult> {
  const reader = readerFromEvent(event);
  if (!reader) return 'ignored';
  // Connect events carry the account; platform events are on Gamo's own account.
  const account = ctx.endpoint === 'connect' ? (event.account ?? null) : null;
  const paymentIntentId = reader.action?.process_payment_intent?.payment_intent ?? null;
  const failure =
    status === 'failed'
      ? (reader.action?.failure_code ?? reader.action?.failure_message ?? 'failed').slice(0, 200)
      : null;
  // Only the action for the order this reader is working on (a late event for an earlier sale changes nothing).
  const [rows] = await runBatch(ctx.db, [
    {
      sql: `UPDATE readers SET action_status = ?3, action_failure = ?4, last_seen_at = ?5, status = 'online'
             WHERE stripe_reader_id = ?1 AND stripe_account_id IS ?2 AND removed_at IS NULL
               AND (?6 IS NULL OR action_order_id IN (SELECT id FROM orders WHERE payment_intent_id = ?6))
         RETURNING id`,
      params: [reader.id, account, status, failure, ctx.now, paymentIntentId],
    },
    ...(status === 'failed' && paymentIntentId
      ? [
          {
            sql: `UPDATE payments SET failure_code = ?2, updated_at = ?3
                   WHERE provider_ref = ?1 AND kind = 'card_present' AND status = 'pending'`,
            params: [paymentIntentId, failure, ctx.now],
          },
        ]
      : []),
  ]);
  return rows.length > 0 ? 'processed' : 'ignored';
}

export const handleReaderActionSucceeded: StripeEventHandler = (event, ctx) =>
  applyReaderAction(event, ctx, 'succeeded');
export const handleReaderActionFailed: StripeEventHandler = (event, ctx) =>
  applyReaderAction(event, ctx, 'failed');

/** Handlers this module owns, for the webhook dispatcher. */
export const readerWebhookHandlers = {
  'terminal.reader.action_succeeded': handleReaderActionSucceeded,
  'terminal.reader.action_failed': handleReaderActionFailed,
} as const satisfies Record<string, StripeEventHandler>;
