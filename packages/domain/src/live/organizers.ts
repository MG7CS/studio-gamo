/**
 * Organizers, their sessions, organizations, members and invitations for Gamo Live
 * (docs/LIVE_DATA_MODEL.md, docs/LIVE_SCREENS.md §B). The cookie holds a random token; only its SHA-256
 * hash is stored. Authorization is by membership, checked here, never by what the browser says.
 */
import { bytesToBase64Url, randomBytes, sha256Hex } from '../security/crypto.ts';
import { resolveEnvSecret } from '../security/env-secret.ts';
import { newPrefixedId } from '../security/ids.ts';
import { hashEmail, isPlausibleEmail, normalizeEmail } from '../security/pii-hash.ts';
import { checkRateLimits, rateLimitBucket } from '../security/rate-limit.ts';
import { allRows, changesOf, runBatch, type SqlDatabase } from '../security/sql-database.ts';

export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const INVITATION_SECONDS = 7 * 24 * 60 * 60;
/** Abuse limits per organizer / organization (owner-approved numbers are proposals until published). */
export const MAX_OWNED_ORGANIZATIONS = 5;
export const MAX_EVENTS_PER_ORGANIZATION = 100;
export const MAX_PENDING_INVITATIONS = 20;
const INVITES_PER_ORGANIZATION_PER_DAY = 20;
const INVITES_PER_ADDRESS_PER_DAY = 3;
export const ORGANIZATION_KINDS = ['church', 'ministry', 'artist', 'organizer'] as const;
export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number];
export const ORGANIZATION_KIND_LABELS: Record<OrganizationKind, string> = {
  church: 'Church',
  ministry: 'Ministry',
  artist: 'Artist or band',
  organizer: 'Event organizer',
};

export type OrganizerErrorCode =
  | 'invalid'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'invitation_invalid'
  | 'invitation_expired'
  | 'invitation_wrong_email'
  | 'last_owner'
  | 'suspended'
  | 'status_locked'
  | 'capacity_low'
  | 'quota'
  | 'not_ready';

/** Friendly sentences for the codes a form cannot show next to a field. `invalid` is handled per field. */
export const ORGANIZER_ERROR_MESSAGES: Partial<Record<OrganizerErrorCode, string>> = {
  forbidden: 'Only owners can do that.',
  rate_limited: 'Too many tries. Please wait a while and try again.',
  last_owner: 'An organization needs at least one owner.',
  suspended: 'This organization is suspended.',
  status_locked: 'This event can no longer be edited.',
  invitation_invalid: 'This invitation can no longer be used.',
  invitation_expired: 'This invitation has expired. Ask the owner to send a new one.',
  not_ready:
    'You can invite people after Gamo approves your first event. Until then, only you manage this organization.',
  quota:
    'This limit has been reached (up to 5 organizations per person, 100 events and 20 open invitations per organization). Remove something first or write to hello@gamostudio.org.',
};

export function organizerErrorMessage(code: OrganizerErrorCode): string {
  return ORGANIZER_ERROR_MESSAGES[code] ?? 'That could not be done.';
}

export class OrganizerError extends Error {
  readonly code: OrganizerErrorCode;
  /** Field name for `invalid`, so a form can show the message next to it. */
  readonly field?: string;
  constructor(code: OrganizerErrorCode, field?: string) {
    super(code);
    this.name = 'OrganizerError';
    this.code = code;
    this.field = field;
  }
}

type Env = { ENVIRONMENT?: unknown };
const secretOf = (env: Env) => resolveEnvSecret(env as Record<string, unknown>, 'PII_HASH_SECRET');

export interface Organizer {
  id: string;
  email: string;
  displayName: string | null;
}

// --- Sessions ---------------------------------------------------------------------------------------

export interface StartedSession {
  /** Value for the cookie. */
  token: string;
  expiresAt: number;
  organizer: Organizer;
}

/** Creates or updates the organizer for a verified Clerk identity and starts a session. */
export async function startOrganizerSession(
  db: SqlDatabase,
  input: { clerkUserId: string; email: string; displayName: string | null; now: number },
): Promise<StartedSession> {
  const email = normalizeEmail(input.email);
  if (!isPlausibleEmail(email) || !input.clerkUserId) throw new OrganizerError('invalid', 'email');
  const id = newPrefixedId('usr');
  const token = bytesToBase64Url(randomBytes(32));
  const expiresAt = input.now + SESSION_SECONDS;
  const rows = await runBatch(db, [
    {
      sql: `INSERT INTO organizers (id, clerk_user_id, email, display_name, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT (clerk_user_id) DO UPDATE SET email = excluded.email,
              display_name = COALESCE(excluded.display_name, organizers.display_name)`,
      params: [id, input.clerkUserId, email, input.displayName, input.now],
    },
    {
      sql: 'DELETE FROM organizer_sessions WHERE expires_at <= ?1',
      params: [input.now],
    },
    {
      sql: `INSERT INTO organizer_sessions (id, organizer_id, expires_at, last_seen_at, created_at)
            SELECT ?1, o.id, ?2, ?3, ?3 FROM organizers o WHERE o.clerk_user_id = ?4`,
      params: [await sha256Hex(token), expiresAt, input.now, input.clerkUserId],
    },
    {
      sql: 'SELECT id, email, display_name FROM organizers WHERE clerk_user_id = ?1',
      params: [input.clerkUserId],
    },
  ]);
  const row = rows[3][0] as { id: string; email: string; display_name: string | null } | undefined;
  if (!row) throw new OrganizerError('not_found');
  return { token, expiresAt, organizer: { id: row.id, email: row.email, displayName: row.display_name } };
}

/** The organizer behind a session cookie value, or null (unknown, expired). */
export async function resolveOrganizerSession(
  db: SqlDatabase,
  token: string | null | undefined,
  now: number,
): Promise<Organizer | null> {
  if (!token || token.length < 32 || token.length > 128) return null;
  const rows = await allRows<{ id: string; email: string; display_name: string | null; session_id: string }>(
    db,
    {
      sql: `SELECT o.id, o.email, o.display_name, s.id AS session_id
            FROM organizer_sessions s JOIN organizers o ON o.id = s.organizer_id
           WHERE s.id = ?1 AND s.expires_at > ?2`,
      params: [await sha256Hex(token), now],
    },
  );
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, email: row.email, displayName: row.display_name };
}

export async function endOrganizerSession(db: SqlDatabase, token: string | null | undefined): Promise<void> {
  if (!token) return;
  await db
    .prepare('DELETE FROM organizer_sessions WHERE id = ?1')
    .bind(await sha256Hex(token))
    .run();
}

// --- Organizations ----------------------------------------------------------------------------------

export interface MembershipSummary {
  organizationId: string;
  name: string;
  slug: string;
  kind: OrganizationKind;
  role: 'owner' | 'member';
  status: 'active' | 'suspended';
  verified: boolean;
}

export async function listMemberships(db: SqlDatabase, organizerId: string): Promise<MembershipSummary[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT g.id, g.name, g.slug, g.kind, g.status, g.verified_at, m.role
            FROM memberships m JOIN organizations g ON g.id = m.organization_id
           WHERE m.organizer_id = ?1 ORDER BY m.created_at, g.name`,
    params: [organizerId],
  });
  return rows.map((r) => ({
    organizationId: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    kind: r.kind as OrganizationKind,
    role: r.role as 'owner' | 'member',
    status: r.status as 'active' | 'suspended',
    verified: r.verified_at != null,
  }));
}

export interface OrganizationProfile {
  id: string;
  name: string;
  slug: string;
  kind: OrganizationKind;
  city: string | null;
  state: string | null;
  website: string | null;
  contactEmail: string | null;
  description: string | null;
  status: 'active' | 'suspended';
  verified: boolean;
  reviewEveryEvent: boolean;
}

export interface OrganizationInput {
  name: string;
  kind: string;
  city?: string;
  state?: string;
  website?: string;
  contactEmail?: string;
  description?: string;
}

const clean = (v: string | undefined) => (v ?? '').trim();

/** Validates a profile form. Returns clean values or throws `OrganizerError('invalid', field)`. */
export function validateOrganization(
  input: OrganizationInput,
): Required<OrganizationInput> & { kind: OrganizationKind } {
  const name = clean(input.name);
  if (name.length < 2 || name.length > 120) throw new OrganizerError('invalid', 'name');
  if (!(ORGANIZATION_KINDS as readonly string[]).includes(input.kind))
    throw new OrganizerError('invalid', 'kind');
  const city = clean(input.city);
  const state = clean(input.state).toUpperCase();
  if (city.length > 80) throw new OrganizerError('invalid', 'city');
  if (state && !/^[A-Z]{2}$/.test(state)) throw new OrganizerError('invalid', 'state');
  let website = clean(input.website);
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    try {
      const url = new URL(website);
      if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.') || website.length > 300)
        throw new Error();
      website = url.toString();
    } catch {
      throw new OrganizerError('invalid', 'website');
    }
  }
  const contactEmail = normalizeEmail(clean(input.contactEmail));
  if (contactEmail && !isPlausibleEmail(contactEmail)) throw new OrganizerError('invalid', 'contactEmail');
  const description = clean(input.description);
  if (description.length > 1000) throw new OrganizerError('invalid', 'description');
  return { name, kind: input.kind as OrganizationKind, city, state, website, contactEmail, description };
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'organization';

/** Creates an organization with the organizer as its owner and records their organizer-terms acceptance. */
export async function createOrganization(
  db: SqlDatabase,
  input: { organizerId: string; profile: OrganizationInput; termsVersion: string; now: number },
): Promise<{ organizationId: string; slug: string }> {
  const profile = validateOrganization(input.profile);
  const owned = await allRows<{ n: number }>(db, {
    sql: "SELECT COUNT(*) AS n FROM memberships WHERE organizer_id = ?1 AND role = 'owner'",
    params: [input.organizerId],
  });
  if (Number(owned[0]?.n ?? 0) >= MAX_OWNED_ORGANIZATIONS) throw new OrganizerError('quota');
  const id = newPrefixedId('org');
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug =
      attempt === 0
        ? slugify(profile.name)
        : `${slugify(profile.name)}-${bytesToBase64Url(randomBytes(3))
            .toLowerCase()
            .replace(/[^a-z0-9]/g, 'x')
            .slice(0, 4)}`;
    try {
      await runBatch(db, [
        {
          sql: `INSERT INTO organizations (id, name, slug, kind, city, state, website, contact_email, description, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
          params: [
            id,
            profile.name,
            slug,
            profile.kind,
            profile.city || null,
            profile.state || null,
            profile.website || null,
            profile.contactEmail || null,
            profile.description || null,
            input.now,
          ],
        },
        {
          sql: "INSERT INTO memberships (organization_id, organizer_id, role, created_at) VALUES (?1, ?2, 'owner', ?3)",
          params: [id, input.organizerId, input.now],
        },
        {
          sql: `INSERT OR IGNORE INTO terms_acceptances (organizer_id, document, version, accepted_at)
                VALUES (?1, 'organizer-terms', ?2, ?3)`,
          params: [input.organizerId, input.termsVersion, input.now],
        },
      ]);
      return { organizationId: id, slug };
    } catch (error) {
      if (!/UNIQUE|constraint/i.test(String((error as Error)?.message)) || attempt === 3) throw error;
    }
  }
  throw new OrganizerError('invalid', 'name');
}

/**
 * Call before creating a new event: throws `OrganizerError('quota')` when the organization already has
 * `MAX_EVENTS_PER_ORGANIZATION` events that are not canceled (drafts, pending, published, rejected, hidden).
 */
export async function assertEventQuota(db: SqlDatabase, organizationId: string): Promise<void> {
  const rows = await allRows<{ n: number }>(db, {
    sql: "SELECT COUNT(*) AS n FROM events WHERE organization_id = ?1 AND status <> 'canceled'",
    params: [organizationId],
  });
  if (Number(rows[0]?.n ?? 0) >= MAX_EVENTS_PER_ORGANIZATION) throw new OrganizerError('quota');
}

export async function membershipRole(
  db: SqlDatabase,
  organizationId: string,
  organizerId: string,
): Promise<'owner' | 'member' | null> {
  const rows = await allRows<{ role: 'owner' | 'member' }>(db, {
    sql: 'SELECT role FROM memberships WHERE organization_id = ?1 AND organizer_id = ?2',
    params: [organizationId, organizerId],
  });
  return rows[0]?.role ?? null;
}

export async function getOrganization(
  db: SqlDatabase,
  organizationId: string,
): Promise<OrganizationProfile | null> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: 'SELECT * FROM organizations WHERE id = ?1',
    params: [organizationId],
  });
  const r = rows[0];
  if (!r) return null;
  const s = (v: unknown) => (v == null ? null : String(v));
  return {
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    kind: r.kind as OrganizationKind,
    city: s(r.city),
    state: s(r.state),
    website: s(r.website),
    contactEmail: s(r.contact_email),
    description: s(r.description),
    status: r.status as 'active' | 'suspended',
    verified: r.verified_at != null,
    reviewEveryEvent: Number(r.review_every_event) === 1,
  };
}

/** Owners edit the profile. Verification, suspension and review settings are never touched here. */
export async function updateOrganization(
  db: SqlDatabase,
  input: { organizationId: string; organizerId: string; profile: OrganizationInput; now: number },
): Promise<void> {
  if ((await membershipRole(db, input.organizationId, input.organizerId)) !== 'owner')
    throw new OrganizerError('forbidden');
  const p = validateOrganization(input.profile);
  const result = await db
    .prepare(
      `UPDATE organizations SET name = ?2, kind = ?3, city = ?4, state = ?5, website = ?6, contact_email = ?7,
              description = ?8, updated_at = ?9 WHERE id = ?1`,
    )
    .bind(
      input.organizationId,
      p.name,
      p.kind,
      p.city || null,
      p.state || null,
      p.website || null,
      p.contactEmail || null,
      p.description || null,
      input.now,
    )
    .run();
  if (changesOf(result) === 0) throw new OrganizerError('not_found');
}

// --- Members and invitations ------------------------------------------------------------------------

export interface MemberView {
  organizerId: string;
  email: string;
  displayName: string | null;
  role: 'owner' | 'member';
}

export async function listMembers(db: SqlDatabase, organizationId: string): Promise<MemberView[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT o.id, o.email, o.display_name, m.role FROM memberships m JOIN organizers o ON o.id = m.organizer_id
           WHERE m.organization_id = ?1 ORDER BY (m.role = 'owner') DESC, m.created_at`,
    params: [organizationId],
  });
  return rows.map((r) => ({
    organizerId: String(r.id),
    email: String(r.email),
    displayName: r.display_name == null ? null : String(r.display_name),
    role: r.role as 'owner' | 'member',
  }));
}

/** Removes a member (owners only; an owner may also leave). The last owner cannot be removed. */
export async function removeMember(
  db: SqlDatabase,
  input: { organizationId: string; actorId: string; targetId: string },
): Promise<void> {
  const actor = await membershipRole(db, input.organizationId, input.actorId);
  if (actor !== 'owner' && !(actor === 'member' && input.actorId === input.targetId))
    throw new OrganizerError('forbidden');
  const result = await db
    .prepare(
      `DELETE FROM memberships WHERE organization_id = ?1 AND organizer_id = ?2
         AND NOT (role = 'owner' AND (SELECT COUNT(*) FROM memberships WHERE organization_id = ?1 AND role = 'owner') <= 1)`,
    )
    .bind(input.organizationId, input.targetId)
    .run();
  if (changesOf(result) === 0) {
    if ((await membershipRole(db, input.organizationId, input.targetId)) === 'owner')
      throw new OrganizerError('last_owner');
    throw new OrganizerError('not_found');
  }
}

export interface InvitationView {
  id: string;
  email: string;
  expiresAt: number;
}

export async function listInvitations(
  db: SqlDatabase,
  organizationId: string,
  now: number,
): Promise<InvitationView[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT id, email, expires_at FROM invitations
           WHERE organization_id = ?1 AND accepted_at IS NULL AND expires_at > ?2 ORDER BY created_at DESC`,
    params: [organizationId, now],
  });
  return rows.map((r) => ({
    id: String(r.id),
    email: String(r.email ?? ''),
    expiresAt: Number(r.expires_at),
  }));
}

/** Owners invite by email. Returns the one-time token for the emailed link; only its hash is stored. */
export async function createInvitation(
  db: SqlDatabase,
  env: Env,
  input: { organizationId: string; organizerId: string; email: string; now: number },
): Promise<{ token: string; email: string }> {
  if ((await membershipRole(db, input.organizationId, input.organizerId)) !== 'owner')
    throw new OrganizerError('forbidden');
  const email = normalizeEmail(input.email);
  if (!isPlausibleEmail(email)) throw new OrganizerError('invalid', 'email');
  const secret = secretOf(env);
  const emailHash = await hashEmail(email, secret);
  const state = await allRows<{ first_event_approved_at: number | null; status: string }>(db, {
    sql: 'SELECT first_event_approved_at, status FROM organizations WHERE id = ?1',
    params: [input.organizationId],
  });
  if (!state[0]) throw new OrganizerError('not_found');
  if (state[0].status !== 'active') throw new OrganizerError('suspended');
  // Only organizations Gamo has already reviewed can bring other people in.
  if (state[0].first_event_approved_at == null) throw new OrganizerError('not_ready');
  // Re-inviting the same address replaces its open invitation, so it does not count against the cap.
  const pending = await allRows<{ n: number }>(db, {
    sql: `SELECT COUNT(*) AS n FROM invitations
           WHERE organization_id = ?1 AND accepted_at IS NULL AND expires_at > ?2 AND email_hash <> ?3`,
    params: [input.organizationId, input.now, emailHash],
  });
  if (Number(pending[0]?.n ?? 0) >= MAX_PENDING_INVITATIONS) throw new OrganizerError('quota');
  const organizationKey = await hashEmail(input.organizationId, secret);
  const limit = await checkRateLimits(
    db,
    [
      {
        bucket: rateLimitBucket('live.invite', 'key', organizationKey),
        limit: INVITES_PER_ORGANIZATION_PER_DAY,
        windowSeconds: 86400,
      },
      {
        // Creating and re-sending to one address share this budget.
        bucket: rateLimitBucket(
          'live.invite-to',
          'key',
          await hashEmail(`${input.organizationId}|${email}`, secret),
        ),
        limit: INVITES_PER_ADDRESS_PER_DAY,
        windowSeconds: 86400,
      },
    ],
    input.now,
  );
  if (!limit.allowed) throw new OrganizerError('rate_limited');
  const token = bytesToBase64Url(randomBytes(32));
  await runBatch(db, [
    {
      sql: `DELETE FROM invitations WHERE organization_id = ?1 AND accepted_at IS NULL
              AND (email_hash = ?2 OR expires_at <= ?3)`,
      params: [input.organizationId, emailHash, input.now],
    },
    {
      sql: `INSERT INTO invitations (id, organization_id, email_hash, email, token_hash, expires_at, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      params: [
        newPrefixedId('inv'),
        input.organizationId,
        emailHash,
        email,
        await sha256Hex(token),
        input.now + INVITATION_SECONDS,
        input.now,
      ],
    },
  ]);
  return { token, email };
}

export async function revokeInvitation(
  db: SqlDatabase,
  input: { organizationId: string; organizerId: string; invitationId: string },
): Promise<void> {
  if ((await membershipRole(db, input.organizationId, input.organizerId)) !== 'owner')
    throw new OrganizerError('forbidden');
  await db
    .prepare('DELETE FROM invitations WHERE id = ?1 AND organization_id = ?2 AND accepted_at IS NULL')
    .bind(input.invitationId, input.organizationId)
    .run();
}

export interface InvitationPreview {
  organizationName: string;
  email: string;
}

async function findInvitation(db: SqlDatabase, token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT i.id, i.organization_id, i.email_hash, i.email, i.expires_at, i.accepted_at, g.name, g.status
            FROM invitations i JOIN organizations g ON g.id = i.organization_id WHERE i.token_hash = ?1`,
    params: [await sha256Hex(token)],
  });
  return rows[0] ?? null;
}

/**
 * What an invitation link is for, without accepting it. Null when the link is unknown, already accepted,
 * expired, or the organization is suspended.
 */
export async function previewInvitation(
  db: SqlDatabase,
  token: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<InvitationPreview | null> {
  const row = await findInvitation(db, token);
  if (!row || row.accepted_at != null || row.status !== 'active' || Number(row.expires_at) <= now)
    return null;
  return { organizationName: String(row.name), email: String(row.email ?? '') };
}

/** Accepting needs the signed-in organizer's verified email to be the invited address. */
export async function acceptInvitation(
  db: SqlDatabase,
  env: Env,
  input: { token: string; organizer: Organizer; now: number },
): Promise<{ organizationId: string }> {
  const row = await findInvitation(db, input.token);
  if (!row || row.accepted_at != null || row.status !== 'active')
    throw new OrganizerError('invitation_invalid');
  if (Number(row.expires_at) <= input.now) throw new OrganizerError('invitation_expired');
  if ((await hashEmail(input.organizer.email, secretOf(env))) !== row.email_hash)
    throw new OrganizerError('invitation_wrong_email');
  // Claim the invitation first (only while it is still open and unexpired), so it can never be used twice.
  const claimed = await db
    .prepare(
      'UPDATE invitations SET accepted_at = ?2 WHERE id = ?1 AND accepted_at IS NULL AND expires_at > ?2',
    )
    .bind(String(row.id), input.now)
    .run();
  if (changesOf(claimed) === 0) throw new OrganizerError('invitation_invalid');
  await db
    .prepare(
      `INSERT OR IGNORE INTO memberships (organization_id, organizer_id, role, created_at) VALUES (?1, ?2, 'member', ?3)`,
    )
    .bind(String(row.organization_id), input.organizer.id, input.now)
    .run();
  return { organizationId: String(row.organization_id) };
}

// --- Overview numbers -------------------------------------------------------------------------------

export interface OrganizationCounts {
  eventsByStatus: Record<string, number>;
  upcomingOccurrences: number;
  confirmedRegistrations: number;
}

export async function organizationCounts(
  db: SqlDatabase,
  organizationId: string,
  now: number,
): Promise<OrganizationCounts> {
  const rows = await runBatch(db, [
    {
      sql: 'SELECT status, COUNT(*) AS n FROM events WHERE organization_id = ?1 GROUP BY status',
      params: [organizationId],
    },
    {
      sql: `SELECT COUNT(*) AS n FROM event_occurrences o JOIN events e ON e.id = o.event_id
             WHERE e.organization_id = ?1 AND e.status = 'published' AND o.status = 'scheduled' AND o.starts_at >= ?2`,
      params: [organizationId, now],
    },
    {
      sql: `SELECT COALESCE(SUM(r.party_size), 0) AS n FROM registrations r
              JOIN event_occurrences o ON o.id = r.occurrence_id JOIN events e ON e.id = o.event_id
             WHERE e.organization_id = ?1 AND r.status = 'confirmed'`,
      params: [organizationId],
    },
  ]);
  const eventsByStatus: Record<string, number> = {};
  for (const r of rows[0] as Array<{ status: string; n: number }>) eventsByStatus[r.status] = Number(r.n);
  return {
    eventsByStatus,
    upcomingOccurrences: Number((rows[1][0] as { n: number } | undefined)?.n ?? 0),
    confirmedRegistrations: Number((rows[2][0] as { n: number } | undefined)?.n ?? 0),
  };
}

/** 30 sign-in attempts per hour per requester. */
export async function signInRateLimit(
  db: SqlDatabase,
  ipHash: string,
  now: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const result = await checkRateLimits(
    db,
    [{ bucket: rateLimitBucket('live.signin', 'ip', ipHash), limit: 30, windowSeconds: 3600 }],
    now,
  );
  return { allowed: result.allowed, retryAfterSeconds: result.retryAfterSeconds };
}
