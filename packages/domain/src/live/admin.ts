/**
 * Gamo's side of Gamo Live (apps/admin, one admin behind Cloudflare Access): the event review queue, organization
 * verification, suspension and the "review every event" switch, the editorial catalog, and the numbers for the Inbox.
 * Decisions are kept as a history the organizer can see (`review_decisions`); there is no audit-log claim.
 *
 * Paid ticketing (docs/LIVE_REQUIREMENTS.md §8 items 6, 33, 35, 38): an organization is verified only through a held
 * meeting (`verification-meetings.ts`); approving a paid event records the organization's first paid approval; the
 * review card reads the paid details with `paidEventReviewDetails`; the Overview counts verifications to schedule,
 * meetings to decide, open disputes and refund requests where Gamo is the seller, each with a list of the same length.
 *
 * "Organizations waiting" (`ORG_WAITING`, the `organizations` count and the `waiting` filter) changed meaning with
 * meeting-based verification: it used to be "active, unverified organizations with events in review or published"
 * (Gamo chased them); now an organization asks, so it is "organizations whose verification needs an admin action":
 * requested (to schedule) or meeting held (to decide). It equals `verifications + meetingsToDecide`.
 */
import { newPrefixedId } from '../security/ids.ts';
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import {
  assertMaySellTickets,
  expandOccurrences,
  parseRevision,
  revisionApplyStatements,
  type EventRevisionPayload,
} from './events.ts';
import {
  ownerEmailsOf,
  removeVerification,
  verifyOrganization,
  VERIFICATION_QUEUE_WHERE,
  type VerificationStepResult,
} from './verification-meetings.ts';

export type LiveAdminErrorCode =
  | 'not_found'
  | 'conflict'
  | 'note_required'
  | 'no_future_date'
  | 'stale'
  /** A paid event of an organization that is not verified cannot be approved (§8 item 7). */
  | 'not_verified';

export class LiveAdminError extends Error {
  readonly code: LiveAdminErrorCode;
  constructor(code: LiveAdminErrorCode) {
    super(code);
    this.name = 'LiveAdminError';
    this.code = code;
  }
}

const n = (v: unknown) => (v == null ? null : Number(v));
const s = (v: unknown) => (v == null ? null : String(v));
const like = (text: string) =>
  `%${text
    .trim()
    .toLowerCase()
    .replace(/[\\%_]/g, '\\$&')}%`;

// --- Counts and the Inbox --------------------------------------------------------------------------

export interface LiveQueueCounts {
  events: number;
  /** Organizations whose verification needs an admin action (`verifications + meetingsToDecide`). */
  organizations: number;
  catalog: number;
  /** Verification requested, meeting to schedule: `listVerificationQueue(db, { status: 'requested' })`. */
  verifications: number;
  /** Meeting held, verify or decline: `listVerificationQueue(db, { status: 'meeting_held' })`. */
  meetingsToDecide: number;
  /** Open disputes (`closed_at IS NULL`): `listOpenDisputes(db)`. */
  disputes: number;
  /** Refunds requested on orders Gamo sold (Mode B): `listGamoRefundRequests(db)`. */
  refundRequests: number;
}

const ORG_WAITING = `(${VERIFICATION_QUEUE_WHERE.requested} OR ${VERIFICATION_QUEUE_WHERE.meeting_held})`;
/** On `disputes d JOIN orders o`. */
const DISPUTE_OPEN = 'd.closed_at IS NULL';
/** On `refunds r JOIN orders o`: waiting for Gamo's decision because Gamo is the seller. Preview orders never count. */
const GAMO_REFUND_REQUEST = "r.status = 'requested' AND o.seller = 'gamo' AND o.is_preview = 0";

/**
 * Every Live queue count in one round trip: one batch of single counts (D1 refuses a compound SELECT of more than five
 * terms, so these are not one UNION query).
 */
export async function liveQueueCounts(db: SqlDatabase): Promise<LiveQueueCounts> {
  const queries: Record<keyof LiveQueueCounts, string> = {
    events: "SELECT COUNT(*) AS n FROM events WHERE status = 'pending_review' AND origin = 'organizer'",
    organizations: `SELECT COUNT(*) AS n FROM organizations g WHERE ${ORG_WAITING}`,
    catalog: "SELECT COUNT(*) AS n FROM events WHERE status = 'pending_review' AND origin = 'catalog'",
    verifications: `SELECT COUNT(*) AS n FROM organizations g WHERE ${VERIFICATION_QUEUE_WHERE.requested}`,
    meetingsToDecide: `SELECT COUNT(*) AS n FROM organizations g WHERE ${VERIFICATION_QUEUE_WHERE.meeting_held}`,
    disputes: `SELECT COUNT(*) AS n FROM disputes d JOIN orders o ON o.id = d.order_id WHERE ${DISPUTE_OPEN}`,
    refundRequests: `SELECT COUNT(*) AS n FROM refunds r JOIN orders o ON o.id = r.order_id WHERE ${GAMO_REFUND_REQUEST}`,
  };
  const keys = Object.keys(queries) as (keyof LiveQueueCounts)[];
  const results = await runBatch(
    db,
    keys.map((k) => ({ sql: queries[k], params: [] })),
  );
  const out = {} as LiveQueueCounts;
  keys.forEach((k, i) => (out[k] = Number((results[i][0] as { n?: number } | undefined)?.n ?? 0)));
  return out;
}

export interface AdminDisputeRow {
  id: string;
  orderId: string;
  orderReference: string;
  eventId: string;
  eventTitle: string;
  organizationId: string;
  organizationName: string;
  seller: 'organization' | 'gamo';
  amountCents: number;
  currency: string;
  reason: string | null;
  status: string;
  createdAt: number;
}

/** Every open dispute, oldest first (the list behind `disputes`). */
export async function listOpenDisputes(db: SqlDatabase): Promise<AdminDisputeRow[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT d.id, d.order_id, o.reference, o.event_id, e.title, o.organization_id, g.name AS org_name, o.seller,
                 d.amount_cents, d.currency, d.reason, d.status, d.created_at
            FROM disputes d JOIN orders o ON o.id = d.order_id JOIN events e ON e.id = o.event_id
                 JOIN organizations g ON g.id = o.organization_id
           WHERE ${DISPUTE_OPEN}
           ORDER BY d.created_at, d.id`,
    params: [],
  });
  return rows.map((r) => ({
    id: String(r.id),
    orderId: String(r.order_id),
    orderReference: String(r.reference),
    eventId: String(r.event_id),
    eventTitle: String(r.title),
    organizationId: String(r.organization_id),
    organizationName: String(r.org_name),
    seller: r.seller as 'organization' | 'gamo',
    amountCents: Number(r.amount_cents),
    currency: String(r.currency),
    reason: s(r.reason),
    status: String(r.status),
    createdAt: Number(r.created_at),
  }));
}

export interface AdminRefundRequestRow {
  id: string;
  orderId: string;
  orderReference: string;
  eventId: string;
  eventTitle: string;
  organizationId: string;
  organizationName: string;
  amountCents: number;
  currency: string;
  requestedBy: string;
  reason: string | null;
  createdAt: number;
}

/** Refunds waiting for Gamo's decision on orders Gamo sold, oldest first (the list behind `refundRequests`). */
export async function listGamoRefundRequests(db: SqlDatabase): Promise<AdminRefundRequestRow[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT r.id, r.order_id, o.reference, o.event_id, e.title, o.organization_id, g.name AS org_name,
                 r.amount_cents, r.currency, r.requested_by, r.reason, r.created_at
            FROM refunds r JOIN orders o ON o.id = r.order_id JOIN events e ON e.id = o.event_id
                 JOIN organizations g ON g.id = o.organization_id
           WHERE ${GAMO_REFUND_REQUEST}
           ORDER BY r.created_at, r.id`,
    params: [],
  });
  return rows.map((r) => ({
    id: String(r.id),
    orderId: String(r.order_id),
    orderReference: String(r.reference),
    eventId: String(r.event_id),
    eventTitle: String(r.title),
    organizationId: String(r.organization_id),
    organizationName: String(r.org_name),
    amountCents: Number(r.amount_cents),
    currency: String(r.currency),
    requestedBy: String(r.requested_by),
    reason: s(r.reason),
    createdAt: Number(r.created_at),
  }));
}

export interface LiveWaitingItem {
  kind: 'Event review' | 'Organization verification' | 'Catalog listing';
  id: string;
  title: string;
  since: number;
}

export async function liveOldestWaiting(db: SqlDatabase, limit: number): Promise<LiveWaitingItem[]> {
  const rows = await allRows<{ k: string; id: string; title: string; since: number }>(db, {
    sql: `SELECT 'events' AS k, e.id, e.title, e.updated_at AS since FROM events e WHERE e.origin = 'organizer' AND (e.status = 'pending_review' OR (e.status = 'published' AND EXISTS (SELECT 1 FROM event_revisions WHERE event_id = e.id)))
          UNION ALL SELECT 'organizations', g.id, g.name, COALESCE(g.verification_requested_at, g.created_at) FROM organizations g WHERE ${ORG_WAITING}
          UNION ALL SELECT 'catalog', e.id, e.title, e.updated_at FROM events e WHERE e.status = 'pending_review' AND e.origin = 'catalog'
          ORDER BY since ASC, title ASC LIMIT ?1`,
    params: [limit],
  });
  return rows.map((r) => ({
    kind:
      r.k === 'events'
        ? 'Event review'
        : r.k === 'organizations'
          ? 'Organization verification'
          : 'Catalog listing',
    id: r.id,
    title: r.title,
    since: Number(r.since),
  }));
}

// --- Event review ----------------------------------------------------------------------------------

export interface LivePendingEvent {
  id: string;
  title: string;
  category: string;
  description: string;
  venue: string;
  address: string | null;
  city: string;
  state: string;
  timezone: string;
  admission: string;
  externalUrl: string | null;
  priceText: string | null;
  refundPolicyText: string | null;
  capacity: number | null;
  qrCheckin: boolean;
  recurring: boolean;
  firstStartsAt: number | null;
  occurrenceCount: number;
  performers: string[];
  submittedAt: number;
  organizationId: string;
  organizationName: string;
  organizationKind: string;
  organizationVerified: boolean;
  website: string | null;
  /** Why it waits: the organization's first event, its first paid event, or "review every event" (also tickets elsewhere). */
  reason: 'first_event' | 'first_paid_event' | 'every_event';
  /** A change to an event that is already published; the current version stays live until this is decided. */
  isChange: boolean;
  /** What the public sees now, when this is a change. */
  current: {
    venue: string;
    city: string;
    state: string;
    admission: string;
    firstStartsAt: number | null;
  } | null;
}

export async function listPendingEvents(db: SqlDatabase): Promise<LivePendingEvent[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT e.id, e.title, e.category, e.description, e.timezone, e.admission, e.external_url, e.price_text,
                 e.refund_policy_text, e.capacity, e.qr_checkin, e.recurrence, e.updated_at,
                 COALESCE(e.venue_name, v.name) AS venue_name, COALESCE(e.venue_address, v.address) AS address, v.city, v.state,
                 g.id AS org_id, g.name AS org_name, g.kind AS org_kind, g.verified_at, g.website,
                 g.first_event_approved_at, g.first_paid_event_approved_at, g.review_every_event, e.status AS event_status, rv.payload AS revision_payload,
                 COALESCE(rv.created_at, e.updated_at) AS waiting_since, v.city AS live_city, v.state AS live_state,
                 (SELECT MIN(starts_at) FROM event_occurrences WHERE event_id = e.id) AS first_at,
                 (SELECT COUNT(*) FROM event_occurrences WHERE event_id = e.id) AS occurrences
            FROM events e JOIN venues v ON v.id = e.venue_id JOIN organizations g ON g.id = e.organization_id
                 LEFT JOIN event_revisions rv ON rv.event_id = e.id
           WHERE e.origin = 'organizer' AND (e.status = 'pending_review' OR (e.status = 'published' AND rv.event_id IS NOT NULL))
           ORDER BY waiting_since ASC, e.id ASC`,
    params: [],
  });
  const ids = rows.map((r) => String(r.id));
  const performers = new Map<string, string[]>();
  if (ids.length > 0) {
    const ps = await allRows<{ event_id: string; name: string; role: string | null }>(db, {
      sql: `SELECT event_id, name, role FROM event_performers WHERE event_id IN (${ids.map((_, i) => `?${i + 1}`).join(',')}) ORDER BY event_id, position`,
      params: ids,
    });
    for (const p of ps) {
      const list = performers.get(p.event_id) ?? [];
      list.push(p.role ? `${p.name} (${p.role})` : p.name);
      performers.set(p.event_id, list);
    }
  }
  return rows.map((r) => {
    const revision = parseRevision(r.revision_payload);
    const proposed = r.event_status === 'published' ? revision : null;
    let proposedDates: Array<{ startsAt: number }> | null = null;
    if (proposed) {
      try {
        proposedDates = expandOccurrences(proposed as EventRevisionPayload);
      } catch {
        proposedDates = null;
      }
    }
    return {
      id: String(r.id),
      title: String(r.title),
      category: String(r.category),
      description: s(r.description) ?? '',
      venue: proposed?.venueName ?? String(r.venue_name),
      address: proposed ? (proposed.address ?? null) : s(r.address),
      city: proposed?.city ?? String(r.city),
      state: proposed?.state ?? String(r.state),
      timezone: proposed?.timezone ?? String(r.timezone),
      admission: proposed?.admission ?? String(r.admission),
      externalUrl: proposed ? (proposed.externalUrl ?? null) : s(r.external_url),
      priceText: s(r.price_text),
      refundPolicyText: s(r.refund_policy_text),
      capacity: proposed ? (proposed.capacity ?? null) : n(r.capacity),
      qrCheckin: proposed ? Boolean(proposed.qrCheckin) : Number(r.qr_checkin) === 1,
      recurring: proposed ? proposed.schedule !== 'once' : r.recurrence != null,
      firstStartsAt: proposedDates ? (proposedDates[0]?.startsAt ?? null) : n(r.first_at),
      occurrenceCount: proposedDates ? proposedDates.length : Number(r.occurrences),
      performers: performers.get(String(r.id)) ?? [],
      submittedAt: Number(r.waiting_since),
      organizationId: String(r.org_id),
      organizationName: String(r.org_name),
      organizationKind: String(r.org_kind),
      organizationVerified: r.verified_at != null,
      website: s(r.website),
      reason:
        r.first_event_approved_at == null
          ? 'first_event'
          : (proposed?.admission ?? String(r.admission)) === 'paid_tickets' &&
              r.first_paid_event_approved_at == null &&
              Number(r.review_every_event) !== 1
            ? 'first_paid_event'
            : 'every_event',
      isChange: r.event_status === 'published',
      current:
        r.event_status === 'published'
          ? {
              venue: String(r.venue_name),
              city: String(r.live_city),
              state: String(r.live_state),
              admission: String(r.admission),
              firstStartsAt: n(r.first_at),
            }
          : null,
    };
  });
}

export type EventDecision = 'approved' | 'changes_requested' | 'rejected';

export interface EventDecisionResult {
  eventId: string;
  title: string;
  slug: string;
  organizationId: string;
  /** True when this approval was the organization's first. */
  firstApproval: boolean;
  /** True when this approval was the organization's first paid event. */
  firstPaidApproval: boolean;
}

/**
 * Decides one event waiting for review. The status change, the history row and (on a first approval) the
 * organization's `first_event_approved_at` happen in one batch, and only while the event is still waiting, so two
 * decisions cannot both win. Approving needs at least one date that has not passed. Approving a paid event needs a
 * verified organization and records its first paid approval (`first_paid_event_approved_at`), after which its paid
 * events follow the normal review rule.
 */
export async function reviewLiveEvent(
  db: SqlDatabase,
  input: {
    eventId: string;
    decision: EventDecision;
    note?: string;
    now: number;
    /** The `submittedAt` the admin was looking at. When given, a decision on newer content is refused as stale. */
    seenAt?: number;
  },
): Promise<EventDecisionResult> {
  const note = (input.note ?? '').trim().slice(0, 2000);
  if (input.decision !== 'approved' && !note) throw new LiveAdminError('note_required');
  const event = (
    await allRows<{
      status: string;
      title: string;
      slug: string;
      admission: string;
      organization_id: string;
      first_event_approved_at: number | null;
      first_paid_event_approved_at: number | null;
      verified_at: number | null;
      future: number;
      revision: string | null;
      revision_at: number | null;
      updated_at: number;
      held: number;
    }>(db, {
      sql: `SELECT e.status, e.title, e.slug, e.admission, e.organization_id, g.first_event_approved_at,
                   g.first_paid_event_approved_at, g.verified_at,
                   (SELECT payload FROM event_revisions WHERE event_id = e.id) AS revision,
                   (SELECT created_at FROM event_revisions WHERE event_id = e.id) AS revision_at, e.updated_at,
                   (SELECT COUNT(*) FROM registrations r JOIN event_occurrences q ON q.id = r.occurrence_id
                     WHERE q.event_id = e.id AND (r.status = 'confirmed' OR (r.status = 'pending' AND r.expires_at > ?2)))
                   + (SELECT COUNT(*) FROM orders od WHERE od.event_id = e.id)
                   + (SELECT COUNT(*) FROM cash_sessions cs WHERE cs.event_id = e.id) AS held,
                   (SELECT COUNT(*) FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled' AND o.starts_at > ?2) AS future
              FROM events e JOIN organizations g ON g.id = e.organization_id
             WHERE e.id = ?1 AND e.origin = 'organizer'`,
      params: [input.eventId, input.now],
    })
  )[0];
  if (!event) throw new LiveAdminError('not_found');
  // Either a new event waiting for its first review, or a published event with a proposed change (its current
  // version stays live whatever the decision is).
  const isChange = event.status === 'published' && event.revision != null;
  if (event.status !== 'pending_review' && !isChange) throw new LiveAdminError('conflict');
  if (!isChange && input.decision === 'approved' && Number(event.future) === 0)
    throw new LiveAdminError('no_future_date');
  // The content the admin read must be the content being decided: an organizer edit since then makes it stale.
  const waitingSince = Number(isChange ? event.revision_at : event.updated_at);
  if (input.seenAt != null && input.seenAt !== waitingSince) throw new LiveAdminError('stale');
  let revision: EventRevisionPayload | null = null;
  if (isChange) {
    try {
      revision = JSON.parse(String(event.revision)) as EventRevisionPayload;
    } catch {
      throw new LiveAdminError('conflict');
    }
  }

  // The admission that will be live after an approval (a locked schedule keeps the current one).
  const admission = isChange && revision && Number(event.held) === 0 ? revision.admission : event.admission;
  const approvingPaid = input.decision === 'approved' && admission === 'paid_tickets';
  if (approvingPaid && event.verified_at == null) throw new LiveAdminError('not_verified');
  // The rest of "who may sell" (payments ready, organizer terms accepted) holds at approval too.
  if (approvingPaid) await assertMaySellTickets(db, String(event.organization_id));

  const status = input.decision === 'approved' ? 'published' : input.decision;
  const decisionId = newPrefixedId('dec');
  await runBatch(db, [
    isChange
      ? {
          sql: `UPDATE events SET updated_at = updated_at WHERE id = ?1 AND status = 'published'
                  AND EXISTS (SELECT 1 FROM event_revisions WHERE event_id = ?1)`,
          params: [input.eventId],
        }
      : {
          sql: `UPDATE events SET status = ?2, published_at = CASE WHEN ?2 = 'published' THEN COALESCE(published_at, ?3) ELSE published_at END,
                   updated_at = ?3 WHERE id = ?1 AND status = 'pending_review'`,
          params: [input.eventId, status, input.now],
        },
    {
      sql: `INSERT INTO review_decisions (id, subject_type, subject_id, decision, note, decided_at)
            SELECT ?1, 'event', ?2, ?3, ?4, ?5 WHERE changes() = 1`,
      params: [decisionId, input.eventId, input.decision, note || null, input.now],
    },
    {
      sql: `UPDATE organizations SET first_event_approved_at = COALESCE(first_event_approved_at, ?2), updated_at = ?2
             WHERE id = ?1 AND ?3 = 'approved' AND changes() = 1`,
      params: [event.organization_id, input.now, input.decision],
    },
    {
      sql: `UPDATE organizations SET first_paid_event_approved_at = COALESCE(first_paid_event_approved_at, ?2), updated_at = ?2
             WHERE id = ?1 AND ?3 = 1 AND EXISTS (SELECT 1 FROM review_decisions WHERE id = ?4)`,
      params: [event.organization_id, input.now, approvingPaid ? 1 : 0, decisionId],
    },
    ...(isChange && revision
      ? input.decision === 'approved'
        ? revisionApplyStatements({
            eventId: input.eventId,
            revision,
            decisionId,
            now: input.now,
            scheduleLocked: Number(event.held) > 0,
          })
        : [
            {
              sql: `DELETE FROM event_revisions WHERE event_id = ?1
                      AND EXISTS (SELECT 1 FROM review_decisions WHERE id = ?2)`,
              params: [input.eventId, decisionId],
            },
          ]
      : []),
  ]);
  const recorded = await allRows(db, {
    sql: 'SELECT 1 AS ok FROM review_decisions WHERE id = ?1',
    params: [decisionId],
  });
  if (recorded.length === 0) throw new LiveAdminError('conflict');
  return {
    eventId: input.eventId,
    title: event.title,
    slug: event.slug,
    organizationId: event.organization_id,
    firstApproval: input.decision === 'approved' && event.first_event_approved_at == null,
    firstPaidApproval: approvingPaid && event.first_paid_event_approved_at == null,
  };
}

/** Emails of the organization's owners, for telling them a decision. */
export async function organizationOwnerEmails(db: SqlDatabase, organizationId: string): Promise<string[]> {
  return ownerEmailsOf(db, organizationId);
}

// --- Paid details on the review card ---------------------------------------------------------------

export interface PaidEventReviewDetails {
  currency: string;
  /** `buyer`: the Gamo fee is passed on; `organizer`: the organization absorbs it. Null until policies are saved. */
  feePayer: 'buyer' | 'organizer' | null;
  policies: {
    refundPolicy: string;
    refundHours: number | null;
    transfersAllowed: boolean;
    transferCutoffHours: number;
    reentryAllowed: boolean;
    entryNotes: string | null;
    namesRequired: boolean;
    maxTicketsPerOrder: number;
  } | null;
  giftsEnabled: boolean;
  doorSalesEnabled: boolean;
  ticketTypes: Array<{
    id: string;
    name: string;
    kind: string;
    description: string | null;
    priceCents: number;
    peoplePerTicket: number;
    /** Per date; null = only the event's cap. */
    capacity: number | null;
    doorAllocation: number;
    doorUsesOnline: boolean;
    perOrderLimit: number;
    salesStartAt: number | null;
    salesEndAt: number | null;
    status: string;
    /** Early-bird prices, soonest deadline first. */
    priceDeadlines: Array<{ priceCents: number; endsAt: number }>;
  }>;
  /** Promo and access codes (counts only). */
  codes: { promo: number; access: number };
}

/**
 * What the admin's review card shows for a paid event (§8 item 6, item 35): ticket types with prices and capacities,
 * the fee choice, the policies, gifts and door sales. Null when the event has no ticketing set up and no ticket types.
 */
export async function paidEventReviewDetails(
  db: SqlDatabase,
  eventId: string,
): Promise<PaidEventReviewDetails | null> {
  const [ticketing, types, deadlines, codes] = await Promise.all([
    allRows<Record<string, unknown>>(db, {
      sql: 'SELECT * FROM event_ticketing WHERE event_id = ?1',
      params: [eventId],
    }),
    allRows<Record<string, unknown>>(db, {
      sql: `SELECT id, name, kind, description, price_cents, people_per_ticket, capacity, door_allocation, door_uses_online,
                   per_order_limit, sales_start_at, sales_end_at, status
              FROM ticket_types WHERE event_id = ?1 ORDER BY position, created_at, id`,
      params: [eventId],
    }),
    allRows<{ ticket_type_id: string; price_cents: number; ends_at: number }>(db, {
      sql: `SELECT d.ticket_type_id, d.price_cents, d.ends_at FROM price_deadlines d
              JOIN ticket_types t ON t.id = d.ticket_type_id WHERE t.event_id = ?1 ORDER BY d.ends_at`,
      params: [eventId],
    }),
    allRows<{ kind: string; n: number }>(db, {
      sql: 'SELECT kind, COUNT(*) AS n FROM event_codes WHERE event_id = ?1 GROUP BY kind',
      params: [eventId],
    }),
  ]);
  const t = ticketing[0];
  if (!t && types.length === 0) return null;
  return {
    currency: String(t?.currency ?? 'usd'),
    feePayer: t ? (t.fee_payer as 'buyer' | 'organizer') : null,
    policies: t
      ? {
          refundPolicy: String(t.refund_policy),
          refundHours: n(t.refund_hours),
          transfersAllowed: Number(t.transfers_allowed) === 1,
          transferCutoffHours: Number(t.transfer_cutoff_hours),
          reentryAllowed: Number(t.reentry_allowed) === 1,
          entryNotes: s(t.entry_notes),
          namesRequired: Number(t.names_required) === 1,
          maxTicketsPerOrder: Number(t.max_tickets_per_order),
        }
      : null,
    giftsEnabled: Number(t?.gifts_enabled ?? 0) === 1,
    doorSalesEnabled: Number(t?.door_sales_enabled ?? 0) === 1,
    ticketTypes: types.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      kind: String(r.kind),
      description: s(r.description),
      priceCents: Number(r.price_cents),
      peoplePerTicket: Number(r.people_per_ticket),
      capacity: n(r.capacity),
      doorAllocation: Number(r.door_allocation),
      doorUsesOnline: Number(r.door_uses_online) === 1,
      perOrderLimit: Number(r.per_order_limit),
      salesStartAt: n(r.sales_start_at),
      salesEndAt: n(r.sales_end_at),
      status: String(r.status),
      priceDeadlines: deadlines
        .filter((d) => d.ticket_type_id === r.id)
        .map((d) => ({ priceCents: Number(d.price_cents), endsAt: Number(d.ends_at) })),
    })),
    codes: {
      promo: Number(codes.find((c) => c.kind === 'promo')?.n ?? 0),
      access: Number(codes.find((c) => c.kind === 'access')?.n ?? 0),
    },
  };
}

// --- Organizations ---------------------------------------------------------------------------------

export type OrganizationFilter = 'waiting' | 'verified' | 'suspended' | 'all';

export interface AdminOrganizationRow {
  id: string;
  name: string;
  kind: string;
  city: string | null;
  state: string | null;
  status: 'active' | 'suspended';
  verified: boolean;
  /** none, requested, meeting_scheduled, meeting_held, verified or declined. */
  verificationStatus: string;
  reviewEveryEvent: boolean;
  firstEventApproved: boolean;
  createdAt: number;
  events: number;
  published: number;
  pending: number;
  members: number;
}

const ORG_SELECT = `
  SELECT g.id, g.name, g.kind, g.city, g.state, g.status, g.verified_at, g.verification_status, g.review_every_event, g.first_event_approved_at, g.created_at,
         (SELECT COUNT(*) FROM events WHERE organization_id = g.id) AS events,
         (SELECT COUNT(*) FROM events WHERE organization_id = g.id AND status = 'published') AS published,
         (SELECT COUNT(*) FROM events e WHERE e.organization_id = g.id AND (e.status = 'pending_review' OR (e.status = 'published' AND EXISTS (SELECT 1 FROM event_revisions WHERE event_id = e.id)))) AS pending,
         (SELECT COUNT(*) FROM memberships WHERE organization_id = g.id) AS members
    FROM organizations g`;

const toOrg = (r: Record<string, unknown>): AdminOrganizationRow => ({
  id: String(r.id),
  name: String(r.name),
  kind: String(r.kind),
  city: s(r.city),
  state: s(r.state),
  status: r.status as 'active' | 'suspended',
  verified: r.verified_at != null,
  verificationStatus: String(r.verification_status ?? 'none'),
  reviewEveryEvent: Number(r.review_every_event) === 1,
  firstEventApproved: r.first_event_approved_at != null,
  createdAt: Number(r.created_at),
  events: Number(r.events),
  published: Number(r.published),
  pending: Number(r.pending),
  members: Number(r.members),
});

export async function listAdminOrganizations(
  db: SqlDatabase,
  filters: { filter?: OrganizationFilter; q?: string } = {},
): Promise<AdminOrganizationRow[]> {
  const params: string[] = [];
  const where: string[] = [];
  const filter = filters.filter ?? 'waiting';
  if (filter === 'waiting') where.push(ORG_WAITING);
  else if (filter === 'verified') where.push('g.verified_at IS NOT NULL');
  else if (filter === 'suspended') where.push("g.status = 'suspended'");
  if (filters.q?.trim()) {
    params.push(like(filters.q));
    where.push(`LOWER(g.name) LIKE ?${params.length} ESCAPE '\\'`);
  }
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `${ORG_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY g.created_at ASC, g.name LIMIT 300`,
    params,
  });
  return rows.map(toOrg);
}

export interface AdminOrganizationDetail extends AdminOrganizationRow {
  slug: string;
  website: string | null;
  contactEmail: string | null;
  description: string | null;
  memberList: Array<{ email: string; displayName: string | null; role: string }>;
  eventList: Array<{ id: string; title: string; status: string; origin: string }>;
  decisions: Array<{ decision: string; note: string | null; decidedAt: number }>;
}

export async function getAdminOrganization(
  db: SqlDatabase,
  id: string,
): Promise<AdminOrganizationDetail | null> {
  const row = (
    await allRows<Record<string, unknown>>(db, { sql: `${ORG_SELECT} WHERE g.id = ?1`, params: [id] })
  )[0];
  if (!row) return null;
  const [extra, members, events, decisions] = await Promise.all([
    allRows<Record<string, unknown>>(db, {
      sql: 'SELECT slug, website, contact_email, description FROM organizations WHERE id = ?1',
      params: [id],
    }),
    allRows<{ email: string; display_name: string | null; role: string }>(db, {
      sql: `SELECT o.email, o.display_name, m.role FROM memberships m JOIN organizers o ON o.id = m.organizer_id
             WHERE m.organization_id = ?1 ORDER BY (m.role = 'owner') DESC, m.created_at`,
      params: [id],
    }),
    allRows<{ id: string; title: string; status: string; origin: string }>(db, {
      sql: 'SELECT id, title, status, origin FROM events WHERE organization_id = ?1 ORDER BY updated_at DESC LIMIT 50',
      params: [id],
    }),
    allRows<{ decision: string; note: string | null; decided_at: number }>(db, {
      sql: `SELECT decision, note, decided_at FROM review_decisions WHERE subject_type = 'organization' AND subject_id = ?1
             ORDER BY decided_at DESC, rowid DESC LIMIT 20`,
      params: [id],
    }),
  ]);
  return {
    ...toOrg(row),
    slug: String(extra[0]?.slug ?? ''),
    website: s(extra[0]?.website),
    contactEmail: s(extra[0]?.contact_email),
    description: s(extra[0]?.description),
    memberList: members.map((m) => ({ email: m.email, displayName: m.display_name, role: m.role })),
    eventList: events,
    decisions: decisions.map((d) => ({
      decision: d.decision,
      note: d.note,
      decidedAt: Number(d.decided_at),
    })),
  };
}

async function recordOrganizationDecision(
  db: SqlDatabase,
  input: {
    organizationId: string;
    decision: string;
    note?: string;
    now: number;
    update: { sql: string; params: (string | number | null)[] };
  },
): Promise<void> {
  const rows = await runBatch(db, [
    { sql: `${input.update.sql} RETURNING id`, params: input.update.params },
    {
      sql: `INSERT INTO review_decisions (id, subject_type, subject_id, decision, note, decided_at)
            SELECT ?1, 'organization', ?2, ?3, ?4, ?5 WHERE changes() = 1`,
      params: [
        newPrefixedId('dec'),
        input.organizationId,
        input.decision,
        (input.note ?? '').trim().slice(0, 2000) || null,
        input.now,
      ],
    },
  ]);
  if (rows[0].length === 0) throw new LiveAdminError('not_found');
}

/**
 * Verify or remove verification. Only Gamo sets this; payment or partnership never does. Verifying goes through the
 * meeting flow (`verifyOrganization`: a held meeting and a note are required); removing needs a note and a verified
 * organization (`removeVerification`). Both are guarded, so two decisions cannot both win; the loser gets
 * `PaidError('stale')`. A missing note is `LiveAdminError('note_required')`, as for the other decisions here.
 */
export async function setOrganizationVerified(
  db: SqlDatabase,
  input: { organizationId: string; verified: boolean; note?: string; now: number },
): Promise<VerificationStepResult> {
  const note = (input.note ?? '').trim().slice(0, 2000);
  if (!note) throw new LiveAdminError('note_required');
  return input.verified
    ? verifyOrganization(db, { organizationId: input.organizationId, note, now: input.now })
    : removeVerification(db, { organizationId: input.organizationId, note, now: input.now });
}

/** Suspending hides the organization's events everywhere; a note says why. Reinstating restores them. */
export async function setOrganizationSuspended(
  db: SqlDatabase,
  input: { organizationId: string; suspended: boolean; note?: string; now: number },
): Promise<void> {
  if (input.suspended && !(input.note ?? '').trim()) throw new LiveAdminError('note_required');
  await recordOrganizationDecision(db, {
    organizationId: input.organizationId,
    decision: input.suspended ? 'suspended' : 'reinstated',
    note: input.note,
    now: input.now,
    update: {
      sql: 'UPDATE organizations SET status = ?2, updated_at = ?3 WHERE id = ?1',
      params: [input.organizationId, input.suspended ? 'suspended' : 'active', input.now],
    },
  });
}

export async function setReviewEveryEvent(
  db: SqlDatabase,
  input: { organizationId: string; on: boolean; now: number },
): Promise<void> {
  const rows = await allRows(db, {
    sql: 'UPDATE organizations SET review_every_event = ?2, updated_at = ?3 WHERE id = ?1 RETURNING id',
    params: [input.organizationId, input.on ? 1 : 0, input.now],
  });
  if (rows.length === 0) throw new LiveAdminError('not_found');
}

// --- Catalog ---------------------------------------------------------------------------------------

export interface AdminCatalogRow {
  id: string;
  title: string;
  status: string;
  featured: boolean;
  startsAt: number | null;
  timezone: string;
  venue: string;
  city: string;
  state: string;
  provider: string | null;
  externalUrl: string | null;
  sourceUrls: string[];
  lastVerifiedAt: number | null;
}

function parseSources(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? '[]'));
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function listAdminCatalog(db: SqlDatabase): Promise<AdminCatalogRow[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT e.id, e.title, e.status, e.featured, e.timezone, e.external_url, COALESCE(e.venue_name, v.name) AS venue_name, v.city, v.state,
                 cs.provider, cs.source_urls, cs.last_verified_at,
                 (SELECT MIN(starts_at) FROM event_occurrences WHERE event_id = e.id) AS starts_at
            FROM events e JOIN venues v ON v.id = e.venue_id LEFT JOIN catalog_sources cs ON cs.event_id = e.id
           WHERE e.origin = 'catalog'
           ORDER BY (e.status = 'pending_review') DESC, starts_at, e.title`,
    params: [],
  });
  return rows.map((r) => {
    const sources = parseSources(r.source_urls);
    return {
      id: String(r.id),
      title: String(r.title),
      status: String(r.status),
      featured: Number(r.featured) === 1,
      startsAt: n(r.starts_at),
      timezone: String(r.timezone),
      venue: String(r.venue_name),
      city: String(r.city),
      state: String(r.state),
      provider: s(r.provider),
      externalUrl: s(r.external_url),
      sourceUrls: sources,
      lastVerifiedAt: n(r.last_verified_at),
    };
  });
}

/** "Featured" is editorial, set only here, and always labeled on the public pages. */
export async function setCatalogFeatured(
  db: SqlDatabase,
  input: { eventId: string; featured: boolean; now: number },
): Promise<void> {
  const rows = await allRows(db, {
    sql: `UPDATE events SET featured = ?2, updated_at = ?3 WHERE id = ?1 AND origin = 'catalog' AND status = 'published' RETURNING id`,
    params: [input.eventId, input.featured ? 1 : 0, input.now],
  });
  if (rows.length === 0) throw new LiveAdminError('conflict');
}

// --- Published events: hide and restore -------------------------------------------------------------

export interface AdminPublishedEvent {
  id: string;
  title: string;
  status: 'published' | 'hidden';
  organizationId: string;
  organizationName: string;
  city: string;
  state: string;
  admission: string;
  firstStartsAt: number | null;
  timezone: string;
  slug: string;
}

/** Organizer events that are live or hidden, newest change first, so Gamo can pull one down or put it back. */
export async function listPublishedOrganizerEvents(db: SqlDatabase): Promise<AdminPublishedEvent[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT e.id, e.slug, e.title, e.status, e.admission, e.timezone, v.city, v.state, g.id AS org_id, g.name AS org_name,
                 (SELECT MIN(starts_at) FROM event_occurrences WHERE event_id = e.id) AS first_at
            FROM events e JOIN venues v ON v.id = e.venue_id JOIN organizations g ON g.id = e.organization_id
           WHERE e.origin = 'organizer' AND e.status IN ('published', 'hidden')
           ORDER BY (e.status = 'hidden') DESC, e.updated_at DESC LIMIT 200`,
    params: [],
  });
  return rows.map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    status: r.status as 'published' | 'hidden',
    organizationId: String(r.org_id),
    organizationName: String(r.org_name),
    city: String(r.city),
    state: String(r.state),
    admission: String(r.admission),
    firstStartsAt: n(r.first_at),
    timezone: String(r.timezone),
  }));
}

/** Hides a published organizer event from every public page (a note says why), or restores a hidden one. */
export async function setOrganizerEventHidden(
  db: SqlDatabase,
  input: { eventId: string; hidden: boolean; note?: string; now: number },
): Promise<{ title: string; organizationId: string; slug: string }> {
  const note = (input.note ?? '').trim().slice(0, 2000);
  if (input.hidden && !note) throw new LiveAdminError('note_required');
  const decisionId = newPrefixedId('dec');
  const rows = await runBatch(db, [
    {
      sql: `UPDATE events SET status = ?2, updated_at = ?3
             WHERE id = ?1 AND origin = 'organizer' AND status = ?4 RETURNING title, organization_id, slug`,
      params: [
        input.eventId,
        input.hidden ? 'hidden' : 'published',
        input.now,
        input.hidden ? 'published' : 'hidden',
      ],
    },
    {
      sql: `INSERT INTO review_decisions (id, subject_type, subject_id, decision, note, decided_at)
            SELECT ?1, 'event', ?2, ?3, ?4, ?5 WHERE changes() = 1`,
      params: [decisionId, input.eventId, input.hidden ? 'hidden' : 'restored', note || null, input.now],
    },
  ]);
  const row = rows[0][0] as { title: string; organization_id: string; slug: string } | undefined;
  if (!row) throw new LiveAdminError('conflict');
  return { title: row.title, organizationId: row.organization_id, slug: row.slug };
}
