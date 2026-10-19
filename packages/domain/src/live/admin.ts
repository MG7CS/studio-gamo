/**
 * Gamo's side of Gamo Live (apps/admin, one admin behind Cloudflare Access): the event review queue, organization
 * verification, suspension and the "review every event" switch, the editorial catalog, and the numbers for the Inbox.
 * Decisions are kept as a history the organizer can see (`review_decisions`); there is no audit-log claim.
 */
import { newPrefixedId } from '../security/ids.ts';
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';

export type LiveAdminErrorCode = 'not_found' | 'conflict' | 'note_required' | 'no_future_date';

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
  organizations: number;
  catalog: number;
}

const ORG_WAITING = `g.status = 'active' AND g.verified_at IS NULL
  AND EXISTS (SELECT 1 FROM events e WHERE e.organization_id = g.id AND e.status IN ('pending_review', 'published'))`;

export async function liveQueueCounts(db: SqlDatabase): Promise<LiveQueueCounts> {
  const rows = await allRows<{ k: string; n: number }>(db, {
    sql: `SELECT 'events' AS k, COUNT(*) AS n FROM events WHERE status = 'pending_review' AND origin = 'organizer'
          UNION ALL SELECT 'organizations', COUNT(*) FROM organizations g WHERE ${ORG_WAITING}
          UNION ALL SELECT 'catalog', COUNT(*) FROM events WHERE status = 'pending_review' AND origin = 'catalog'`,
    params: [],
  });
  const out: LiveQueueCounts = { events: 0, organizations: 0, catalog: 0 };
  for (const r of rows) if (r.k in out) out[r.k as keyof LiveQueueCounts] = Number(r.n);
  return out;
}

export interface LiveWaitingItem {
  kind: 'Event review' | 'Organization verification' | 'Catalog listing';
  id: string;
  title: string;
  since: number;
}

export async function liveOldestWaiting(db: SqlDatabase, limit: number): Promise<LiveWaitingItem[]> {
  const rows = await allRows<{ k: string; id: string; title: string; since: number }>(db, {
    sql: `SELECT 'events' AS k, e.id, e.title, e.updated_at AS since FROM events e WHERE e.status = 'pending_review' AND e.origin = 'organizer'
          UNION ALL SELECT 'organizations', g.id, g.name, g.created_at FROM organizations g WHERE ${ORG_WAITING}
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
  reason: 'first_event' | 'every_event';
}

export async function listPendingEvents(db: SqlDatabase): Promise<LivePendingEvent[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT e.id, e.title, e.category, e.description, e.timezone, e.admission, e.external_url, e.price_text,
                 e.refund_policy_text, e.capacity, e.qr_checkin, e.recurrence, e.updated_at,
                 v.name AS venue_name, v.address, v.city, v.state,
                 g.id AS org_id, g.name AS org_name, g.kind AS org_kind, g.verified_at, g.website,
                 g.first_event_approved_at, g.review_every_event,
                 (SELECT MIN(starts_at) FROM event_occurrences WHERE event_id = e.id) AS first_at,
                 (SELECT COUNT(*) FROM event_occurrences WHERE event_id = e.id) AS occurrences
            FROM events e JOIN venues v ON v.id = e.venue_id JOIN organizations g ON g.id = e.organization_id
           WHERE e.status = 'pending_review' AND e.origin = 'organizer'
           ORDER BY e.updated_at ASC, e.id ASC`,
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
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    category: String(r.category),
    description: s(r.description) ?? '',
    venue: String(r.venue_name),
    address: s(r.address),
    city: String(r.city),
    state: String(r.state),
    timezone: String(r.timezone),
    admission: String(r.admission),
    externalUrl: s(r.external_url),
    priceText: s(r.price_text),
    refundPolicyText: s(r.refund_policy_text),
    capacity: n(r.capacity),
    qrCheckin: Number(r.qr_checkin) === 1,
    recurring: r.recurrence != null,
    firstStartsAt: n(r.first_at),
    occurrenceCount: Number(r.occurrences),
    performers: performers.get(String(r.id)) ?? [],
    submittedAt: Number(r.updated_at),
    organizationId: String(r.org_id),
    organizationName: String(r.org_name),
    organizationKind: String(r.org_kind),
    organizationVerified: r.verified_at != null,
    website: s(r.website),
    reason: r.first_event_approved_at == null ? 'first_event' : 'every_event',
  }));
}

export type EventDecision = 'approved' | 'changes_requested' | 'rejected';

export interface EventDecisionResult {
  eventId: string;
  title: string;
  slug: string;
  organizationId: string;
  /** True when this approval was the organization's first. */
  firstApproval: boolean;
}

/**
 * Decides one event waiting for review. The status change, the history row and (on a first approval) the
 * organization's `first_event_approved_at` happen in one batch, and only while the event is still waiting, so two
 * decisions cannot both win. Approving needs at least one date that has not passed.
 */
export async function reviewLiveEvent(
  db: SqlDatabase,
  input: { eventId: string; decision: EventDecision; note?: string; now: number },
): Promise<EventDecisionResult> {
  const note = (input.note ?? '').trim().slice(0, 2000);
  if (input.decision !== 'approved' && !note) throw new LiveAdminError('note_required');
  const event = (
    await allRows<{
      status: string;
      title: string;
      slug: string;
      organization_id: string;
      first_event_approved_at: number | null;
      future: number;
    }>(db, {
      sql: `SELECT e.status, e.title, e.slug, e.organization_id, g.first_event_approved_at,
                   (SELECT COUNT(*) FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled' AND o.starts_at > ?2) AS future
              FROM events e JOIN organizations g ON g.id = e.organization_id
             WHERE e.id = ?1 AND e.origin = 'organizer'`,
      params: [input.eventId, input.now],
    })
  )[0];
  if (!event) throw new LiveAdminError('not_found');
  if (event.status !== 'pending_review') throw new LiveAdminError('conflict');
  if (input.decision === 'approved' && Number(event.future) === 0) throw new LiveAdminError('no_future_date');

  const status = input.decision === 'approved' ? 'published' : input.decision;
  const decisionId = newPrefixedId('dec');
  await runBatch(db, [
    {
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
  };
}

/** Emails of the organization's owners, for telling them a decision. */
export async function organizationOwnerEmails(db: SqlDatabase, organizationId: string): Promise<string[]> {
  const rows = await allRows<{ email: string }>(db, {
    sql: `SELECT o.email FROM memberships m JOIN organizers o ON o.id = m.organizer_id
           WHERE m.organization_id = ?1 AND m.role = 'owner' ORDER BY m.created_at`,
    params: [organizationId],
  });
  return rows.map((r) => r.email);
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
  reviewEveryEvent: boolean;
  firstEventApproved: boolean;
  createdAt: number;
  events: number;
  published: number;
  pending: number;
  members: number;
}

const ORG_SELECT = `
  SELECT g.id, g.name, g.kind, g.city, g.state, g.status, g.verified_at, g.review_every_event, g.first_event_approved_at, g.created_at,
         (SELECT COUNT(*) FROM events WHERE organization_id = g.id) AS events,
         (SELECT COUNT(*) FROM events WHERE organization_id = g.id AND status = 'published') AS published,
         (SELECT COUNT(*) FROM events WHERE organization_id = g.id AND status = 'pending_review') AS pending,
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

/** Verify or remove verification. Only Gamo sets this; payment or partnership never does. */
export async function setOrganizationVerified(
  db: SqlDatabase,
  input: { organizationId: string; verified: boolean; note?: string; now: number },
): Promise<void> {
  await recordOrganizationDecision(db, {
    organizationId: input.organizationId,
    decision: input.verified ? 'verified' : 'unverified',
    note: input.note,
    now: input.now,
    update: {
      sql: 'UPDATE organizations SET verified_at = ?2, updated_at = ?3 WHERE id = ?1',
      params: [input.organizationId, input.verified ? input.now : null, input.now],
    },
  });
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
    sql: `SELECT e.id, e.title, e.status, e.featured, e.timezone, e.external_url, v.name AS venue_name, v.city, v.state,
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
