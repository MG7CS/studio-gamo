/**
 * Staff review of provider profiles (design §4.4) and organizers' first events.
 *
 * Church verification:  submitted → meeting_scheduled → verified (staff name, meeting date, notes) → the
 * church publishes. Other providers (musician, technician, teacher, artist, agent): the same without the
 * required meeting (a meeting may still be scheduled).
 *
 * Every decision is ONE D1 batch: a conditional status UPDATE (`WHERE status = <the status the staff
 * member saw>`), then the append-only `verification_records` row, guarded by
 * `changes() = 1` so it is written only when the UPDATE moved the row. A stale form or a concurrent
 * decision therefore changes nothing and is reported as a conflict. There is one admin (Cloudflare Access,
 * docs/ADMIN_REQUIREMENTS.md): the record carries the admin's name and the fixed actor id `admin`, with no
 * user account and no self-review rule. The provider is emailed through the outbox (kind
 * `provider_status`), honestly reported when email is not configured.
 *
 * All times are epoch seconds.
 */
import type { GamoEnv } from '@gamo/config/env';
import { newPrefixedId } from '../security/ids.ts';
import { allRows, runBatch, type SqlDatabase, type SqlStatementSpec } from '../security/sql-database.ts';
import type { ProviderRole, ProviderStatus } from '../types/enums.ts';
import { sendOutboxEmail } from './email-outbox.ts';
import {
  getProviderProfile,
  requiresMeeting,
  roleLabel,
  toProviderProfile,
  type ProviderProfile,
} from './providers.ts';

export const PROVIDER_REVIEW_ACTIONS = [
  'schedule_meeting',
  'start_review',
  'verify',
  'request_changes',
  'reject',
  'suspend',
  'reinstate',
] as const;
export type ProviderReviewAction = (typeof PROVIDER_REVIEW_ACTIONS)[number];

/** Status → statuses a decision may move it to, per action. */
const TRANSITIONS: Readonly<
  Record<ProviderReviewAction, { from: readonly ProviderStatus[]; to: ProviderStatus }>
> = {
  schedule_meeting: { from: ['submitted', 'meeting_scheduled', 'in_review'], to: 'meeting_scheduled' },
  start_review: { from: ['submitted'], to: 'in_review' },
  verify: { from: ['submitted', 'meeting_scheduled', 'in_review'], to: 'verified' },
  request_changes: { from: ['submitted', 'meeting_scheduled', 'in_review'], to: 'changes_requested' },
  reject: { from: ['submitted', 'meeting_scheduled', 'in_review', 'changes_requested'], to: 'rejected' },
  suspend: {
    from: [
      'draft',
      'submitted',
      'meeting_scheduled',
      'in_review',
      'changes_requested',
      'verified',
      'rejected',
    ],
    to: 'suspended',
  },
  reinstate: { from: ['suspended'], to: 'in_review' },
};

/** The actions staff may take on a profile in its current status (for the detail page buttons). */
export function availableReviewActions(
  profile: Pick<ProviderProfile, 'role' | 'status'>,
): ProviderReviewAction[] {
  return PROVIDER_REVIEW_ACTIONS.filter((action) => {
    if (!TRANSITIONS[action].from.includes(profile.status)) return false;
    // A church is verified only after the in-person meeting has been scheduled (owner decision 4).
    if (action === 'verify' && requiresMeeting(profile.role) && profile.status !== 'meeting_scheduled')
      return false;
    return true;
  });
}

export class ReviewError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'INVALID' | 'CONFLICT' | 'FORBIDDEN',
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ReviewError';
  }
}

/** The id written to `verification_records.staff_user_id` (a plain column, not a foreign key): there is one admin. */
export const ADMIN_ACTOR_ID = 'admin';

/** Who decided. There is one admin; the name shown on the record is the admin's email address. */
export interface AdminActor {
  name: string;
}

export interface ProviderReviewInput {
  profileId: string;
  action: ProviderReviewAction;
  /** The status the staff member saw when they opened the form (stale-form guard). */
  expectedStatus: string;
  actor: AdminActor;
  /** Required for verify (internal notes), request_changes (message to the provider), reject, suspend. */
  notes?: string | null;
  /** schedule_meeting: when (epoch seconds), where, and which staff member will attend. */
  meetingAt?: number | null;
  meetingLocation?: string | null;
  meetingStaff?: string | null;
  now: number;
}

export interface ProviderReviewResult {
  profile: ProviderProfile;
  recordId: string;
  from: ProviderStatus;
  to: ProviderStatus;
}

function clean(value: string | null | undefined, max: number): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function personEmail(db: SqlDatabase, personId: string): Promise<string | null> {
  const [row] = await allRows<{ email_normalized: string; erased_at: number | null }>(db, {
    sql: 'SELECT email_normalized, erased_at FROM persons WHERE id = ?1',
    params: [personId],
  });
  if (!row || row.erased_at !== null) return null;
  return row.email_normalized;
}

/** The meeting date on record for a church (the latest `schedule_meeting`), if any. */
export async function latestMeeting(
  db: SqlDatabase,
  profileId: string,
): Promise<{ meetingAt: number; location: string | null; staffName: string | null } | null> {
  const [row] = await allRows<{ meeting_at: number; meeting_location: string | null; notes: string | null }>(
    db,
    {
      sql: `SELECT meeting_at, meeting_location, notes FROM verification_records
           WHERE subject_type = 'provider_profile' AND subject_id = ?1 AND action = 'schedule_meeting'
           ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      params: [profileId],
    },
  );
  return row
    ? { meetingAt: Number(row.meeting_at), location: row.meeting_location, staffName: row.notes }
    : null;
}

/**
 * Applies one staff decision. Throws `ReviewError` (message safe for the staff page) for an invalid
 * action, missing fields, self-review or a stale/concurrent decision.
 */
export async function reviewProviderProfile(
  db: SqlDatabase,
  input: ProviderReviewInput,
): Promise<ProviderReviewResult> {
  const transition = TRANSITIONS[input.action];
  if (!transition) throw new ReviewError('INVALID', 'Choose one of the review actions.');
  const profile = await getProviderProfile(db, input.profileId);
  if (!profile) throw new ReviewError('NOT_FOUND', 'That profile no longer exists.');
  if (!clean(input.actor.name, 120)) throw new ReviewError('FORBIDDEN', 'The admin identity is missing.');

  if (profile.status !== input.expectedStatus)
    throw new ReviewError(
      'CONFLICT',
      `This profile is now “${profile.status.replace(/_/g, ' ')}” — someone else decided first. Reload to see the latest.`,
    );
  if (!availableReviewActions(profile).includes(input.action))
    throw new ReviewError(
      'INVALID',
      input.action === 'verify' && requiresMeeting(profile.role)
        ? 'Schedule and hold the in-person meeting before verifying a church.'
        : `“${input.action.replace(/_/g, ' ')}” is not possible while the profile is ${profile.status.replace(/_/g, ' ')}.`,
    );

  const notes = clean(input.notes, 2000);
  let meetingAt: number | null = null;
  let meetingLocation: string | null = null;
  let recordNotes: string | null = notes || null;

  switch (input.action) {
    case 'schedule_meeting': {
      if (!input.meetingAt || !Number.isFinite(input.meetingAt))
        throw new ReviewError('INVALID', 'Enter the meeting date and time.', 'meeting_at');
      if (input.meetingAt < input.now - 24 * 60 * 60)
        throw new ReviewError(
          'INVALID',
          'The meeting date is in the past. Enter the planned date.',
          'meeting_at',
        );
      meetingLocation = clean(input.meetingLocation, 300);
      if (!meetingLocation)
        throw new ReviewError('INVALID', 'Enter where the meeting will take place.', 'meeting_location');
      const attendee = clean(input.meetingStaff, 120);
      if (!attendee)
        throw new ReviewError('INVALID', 'Enter which staff member will attend.', 'meeting_staff');
      meetingAt = Math.floor(input.meetingAt);
      recordNotes = notes ? `Staff attending: ${attendee}. ${notes}` : `Staff attending: ${attendee}.`;
      break;
    }
    case 'verify': {
      if (!notes)
        throw new ReviewError('INVALID', 'Add verification notes (what was checked and with whom).', 'notes');
      if (requiresMeeting(profile.role)) {
        const meeting = await latestMeeting(db, profile.id);
        if (!meeting)
          throw new ReviewError('INVALID', 'Schedule the in-person meeting before verifying a church.');
        meetingAt = meeting.meetingAt;
        meetingLocation = meeting.location;
      }
      break;
    }
    case 'request_changes':
      if (!notes)
        throw new ReviewError(
          'INVALID',
          'Write the message to the provider: what should they change?',
          'notes',
        );
      break;
    case 'reject':
    case 'suspend':
      if (!notes)
        throw new ReviewError(
          'INVALID',
          'Give the reason (it is recorded and sent to the provider).',
          'notes',
        );
      break;
    default:
      break;
  }

  const recordId = newPrefixedId('ver');
  const clearsPublication = input.action === 'suspend' || input.action === 'reject';
  const specs: SqlStatementSpec[] = [
    {
      sql: `UPDATE provider_profiles SET status = ?3, updated_at = ?4${clearsPublication ? ', published_at = NULL' : ''}
             WHERE id = ?1 AND status = ?2`,
      params: [profile.id, profile.status, transition.to, input.now],
    },
    {
      sql: `INSERT INTO verification_records (id, subject_type, subject_id, action, from_status, to_status, staff_user_id, staff_name, meeting_at, meeting_location, notes, created_at)
            SELECT ?1, 'provider_profile', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11 WHERE changes() = 1`,
      params: [
        recordId,
        profile.id,
        input.action,
        profile.status,
        transition.to,
        ADMIN_ACTOR_ID,
        clean(input.actor.name, 120),
        meetingAt,
        meetingLocation,
        recordNotes,
        input.now,
      ],
    },
    {
      sql: 'SELECT id, person_id, role, product_origin, organization_id, display_name, profile_json, status, published_at, requires_staff_review, created_at, updated_at FROM provider_profiles WHERE id = ?1',
      params: [profile.id],
    },
    { sql: 'SELECT id FROM verification_records WHERE id = ?1', params: [recordId] },
  ];
  const results = await runBatch(db, specs);
  const written = (results[3] as unknown[]).length === 1;
  if (!written)
    throw new ReviewError(
      'CONFLICT',
      'Someone else decided on this profile at the same time. Reload to see the latest.',
    );
  const updated = toProviderProfile((results[2] as Parameters<typeof toProviderProfile>[0][])[0]);
  return { profile: updated, recordId, from: profile.status, to: transition.to };
}

const DECISION_COPY: Partial<
  Record<ProviderReviewAction, (role: string) => { subject: string; body: string }>
> = {
  schedule_meeting: (role) => ({
    subject: `Your ${role} verification meeting is scheduled`,
    body: 'Gamo Studios staff scheduled an in-person verification meeting.',
  }),
  verify: (role) => ({
    subject: `Your ${role} profile is verified`,
    body: 'Gamo Studios staff verified your profile. You can now publish it from your account.',
  }),
  request_changes: (role) => ({
    subject: `Changes requested on your ${role} profile`,
    body: 'Gamo Studios staff asked for a few changes before they can verify your profile.',
  }),
  reject: (role) => ({
    subject: `Update on your ${role} profile`,
    body: 'Gamo Studios staff could not approve your profile at this time.',
  }),
  suspend: (role) => ({
    subject: `Your ${role} profile is suspended`,
    body: 'Gamo Studios staff suspended your profile. It is no longer shown publicly.',
  }),
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export function formatMeeting(meetingAt: number, timeZone = 'America/Phoenix'): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(meetingAt * 1000));
}

/**
 * Emails the provider about a decision (outbox kind `provider_status`, one message per verification
 * record). Returns the outbox status so the staff page can say honestly whether it was sent.
 */
export async function notifyProviderOfDecision(
  db: SqlDatabase,
  env: GamoEnv,
  input: {
    result: ProviderReviewResult;
    action: ProviderReviewAction;
    message?: string | null;
    meeting?: { at: number; location: string | null; timeZone?: string } | null;
    accountUrl: string;
    now: number;
  },
): Promise<{ status: string }> {
  const copy = DECISION_COPY[input.action];
  if (!copy) return { status: 'skipped' };
  const to = await personEmail(db, input.result.profile.personId);
  if (!to) return { status: 'skipped' };
  const role = roleLabel(input.result.profile.role as ProviderRole).toLowerCase();
  const { subject, body } = copy(role);
  const lines = [body];
  if (input.meeting) {
    lines.push(`When: ${formatMeeting(input.meeting.at, input.meeting.timeZone)}`);
    if (input.meeting.location) lines.push(`Where: ${input.meeting.location}`);
  }
  if (input.message && input.action !== 'verify') lines.push(`Message from staff: ${input.message}`);
  lines.push(`Your account: ${input.accountUrl}`);
  lines.push('Questions? Reply to hello@gamostudio.org.');
  const text = lines.join('\n\n');
  const html = lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('');
  try {
    const sent = await sendOutboxEmail(db, env, {
      kind: 'provider_status',
      idempotencyKey: `provider_status:${input.result.recordId}`,
      to,
      subject,
      text,
      html,
      relatedType: 'provider_profile',
      relatedId: input.result.profile.id,
      product: input.result.profile.productOrigin,
      now: input.now,
    });
    return { status: sent.status };
  } catch (err) {
    console.error(`[provider-review] notify failed: ${err instanceof Error ? err.name : 'unknown'}`);
    return { status: 'failed' };
  }
}

export interface ReviewQueueItem {
  id: string;
  role: ProviderRole;
  displayName: string;
  status: ProviderStatus;
  productOrigin: string;
  updatedAt: number;
}

/** Profiles for a staff queue, filtered by role group and status. */
export async function listReviewQueue(
  db: SqlDatabase,
  input: { roles: readonly ProviderRole[]; statuses?: readonly ProviderStatus[]; limit?: number },
): Promise<ReviewQueueItem[]> {
  const roles = input.roles.length ? input.roles : ['church'];
  const statuses = input.statuses?.length
    ? input.statuses
    : (['submitted', 'meeting_scheduled', 'in_review'] as const);
  const params: (string | number)[] = [...roles, ...statuses, Math.min(input.limit ?? 100, 500)];
  const rolePlaceholders = roles.map((_, i) => `?${i + 1}`).join(', ');
  const statusPlaceholders = statuses.map((_, i) => `?${roles.length + i + 1}`).join(', ');
  const rows = await allRows<{
    id: string;
    role: string;
    display_name: string;
    status: string;
    product_origin: string;
    updated_at: number;
  }>(db, {
    sql: `SELECT id, role, display_name, status, product_origin, updated_at FROM provider_profiles
           WHERE role IN (${rolePlaceholders}) AND status IN (${statusPlaceholders})
           ORDER BY updated_at ASC LIMIT ?${params.length}`,
    params,
  });
  return rows.map((r) => ({
    id: r.id,
    role: r.role as ProviderRole,
    displayName: r.display_name,
    status: r.status as ProviderStatus,
    productOrigin: r.product_origin,
    updatedAt: Number(r.updated_at),
  }));
}

export interface VerificationRecordView {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  staffName: string | null;
  meetingAt: number | null;
  meetingLocation: string | null;
  notes: string | null;
  createdAt: number;
}

export async function listVerificationRecords(
  db: SqlDatabase,
  subjectType: 'provider_profile' | 'event' | 'organizer',
  subjectId: string,
): Promise<VerificationRecordView[]> {
  const rows = await allRows<{
    id: string;
    action: string;
    from_status: string | null;
    to_status: string | null;
    staff_name: string | null;
    meeting_at: number | null;
    meeting_location: string | null;
    notes: string | null;
    created_at: number;
  }>(db, {
    sql: `SELECT id, action, from_status, to_status, staff_name, meeting_at, meeting_location, notes, created_at
            FROM verification_records WHERE subject_type = ?1 AND subject_id = ?2
           ORDER BY created_at DESC, rowid DESC`,
    params: [subjectType, subjectId],
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    staffName: r.staff_name,
    meetingAt: r.meeting_at === null ? null : Number(r.meeting_at),
    meetingLocation: r.meeting_location,
    notes: r.notes,
    createdAt: Number(r.created_at),
  }));
}
