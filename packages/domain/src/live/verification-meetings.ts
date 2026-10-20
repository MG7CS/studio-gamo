/**
 * Verifying a Gamo Live organization through a meeting with Gamo, by video call or in person
 * (docs/LIVE_REQUIREMENTS.md §8 items 7 and 33, owner decision 12; docs/LIVE_DATA_MODEL.md §8; migration 0011).
 *
 *   none / declined ──request──▶ requested ──schedule──▶ meeting_scheduled ──held──▶ meeting_held ──verify──▶ verified
 *                                    ▲                    │ reschedule (cancel + new)        │
 *                                    └──── cancel ────────┘                                  └──decline──▶ declined
 *
 * An owner requests; only Gamo (the admin) schedules, marks held, verifies or declines. Verifying needs a held
 * meeting. Every step is one batch whose first statement records the decision (`review_decisions`) only while the
 * organization is still in the expected status; every other write waits on that row, so two admin decisions on one
 * verification cannot both win (the loser gets `PaidError('stale')`). The partial unique index keeps one scheduled
 * meeting per subject. `verification_meetings.subject_type` leaves room for churches and providers; this module
 * handles `organization` only for now.
 *
 * Every step returns the owners' emails and the email to send each of them (`verification-mail.ts`); the caller
 * sends them. Payment, sponsorship or partnership never changes verification.
 */
import { newPrefixedId } from '../security/ids.ts';
import {
  allRows,
  runBatch,
  type SqlDatabase,
  type SqlParam,
  type SqlStatementSpec,
} from '../security/sql-database.ts';
import { isTimeZone, zonedLocalToEpochSeconds } from '../services/meeting-time.ts';
import type { LiveEmail } from './mail.ts';
import {
  MEETING_FORMATS,
  PAID_ID_PREFIX,
  PaidError,
  type MeetingFormat,
  type MeetingStatus,
  type VerificationStatus,
} from './paid-types.ts';
import {
  MEETING_FORMAT_LABELS,
  meetingCanceledEmail,
  meetingHeldEmail,
  meetingScheduledEmail,
  meetingWhenLabel,
  organizationVerifiedEmail,
  verificationDeclinedEmail,
  verificationRequestedEmail,
} from './verification-mail.ts';

export { DEFAULT_MEETING_TIME_ZONE } from '../services/meeting-time.ts';

export const MEETING_LOCATION_MAX = 300;
export const MEETING_NOTE_MAX = 500;
export const DECISION_NOTE_MAX = 2000;

// --- Reading ---------------------------------------------------------------------------------------

interface OrgRow {
  id: string;
  name: string;
  status: string;
  verification_status: VerificationStatus;
  verification_requested_at: number | null;
  verified_at: number | null;
}

async function loadOrganization(db: SqlDatabase, organizationId: string): Promise<OrgRow> {
  const row = (
    await allRows<OrgRow>(db, {
      sql: `SELECT id, name, status, verification_status, verification_requested_at, verified_at
              FROM organizations WHERE id = ?1`,
      params: [organizationId],
    })
  )[0];
  if (!row) throw new PaidError('not_found');
  return row;
}

/** Emails of the organization's owners, oldest membership first. */
export async function ownerEmailsOf(db: SqlDatabase, organizationId: string): Promise<string[]> {
  const rows = await allRows<{ email: string }>(db, {
    sql: `SELECT o.email FROM memberships m JOIN organizers o ON o.id = m.organizer_id
           WHERE m.organization_id = ?1 AND m.role = 'owner' ORDER BY m.created_at, o.email`,
    params: [organizationId],
  });
  return rows.map((r) => r.email);
}

export interface VerificationMeeting {
  id: string;
  startsAt: number;
  timeZone: string;
  /** "Tuesday, November 10, 2026, 3:00 PM MST", in the meeting's zone. */
  whenLabel: string;
  format: MeetingFormat;
  formatLabel: string;
  /** The video link or the place. */
  location: string;
  note: string | null;
  status: MeetingStatus;
  heldAt: number | null;
  canceledAt: number | null;
  createdAt: number;
}

const toMeeting = (r: Record<string, unknown>): VerificationMeeting => ({
  id: String(r.id),
  startsAt: Number(r.starts_at),
  timeZone: String(r.timezone),
  whenLabel: meetingWhenLabel(Number(r.starts_at), String(r.timezone)),
  format: r.format as MeetingFormat,
  formatLabel: MEETING_FORMAT_LABELS[r.format as MeetingFormat] ?? String(r.format),
  location: String(r.location),
  note: r.note == null ? null : String(r.note),
  status: r.status as MeetingStatus,
  heldAt: r.held_at == null ? null : Number(r.held_at),
  canceledAt: r.canceled_at == null ? null : Number(r.canceled_at),
  createdAt: Number(r.created_at),
});

async function meetingsOf(db: SqlDatabase, organizationId: string): Promise<VerificationMeeting[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT id, starts_at, timezone, format, location, note, status, held_at, canceled_at, created_at
            FROM verification_meetings WHERE subject_type = 'organization' AND subject_id = ?1
           ORDER BY created_at DESC, rowid DESC LIMIT 50`,
    params: [organizationId],
  });
  return rows.map(toMeeting);
}

// --- Steps -----------------------------------------------------------------------------------------

export interface VerificationStepResult {
  organizationId: string;
  organizationName: string;
  status: VerificationStatus;
  ownerEmails: string[];
  /** One email per owner, ready for `sendLiveEmail`. */
  emails: LiveEmail[];
  /** The meeting this step scheduled, held or canceled. */
  meeting?: VerificationMeeting;
}

const DECIDED = (n: number) => `EXISTS (SELECT 1 FROM review_decisions WHERE id = ?${n})`;

/**
 * Runs one step: the decision row is inserted only while `guard` holds for the organization (`?2` is its id, `?5` the
 * time, extra guard parameters from `?6`), and `rest(decidedParam)` writes only when that row exists. Throws
 * `stale` when another decision won first.
 */
async function runStep(
  db: SqlDatabase,
  input: {
    organizationId: string;
    decision: string;
    note: string | null;
    now: number;
    guard: string;
    guardParams?: SqlParam[];
    rest: (
      decided: (n: number) => string,
    ) => Array<{ sql: string; params: (decisionId: string) => SqlParam[] }>;
  },
): Promise<void> {
  const decisionId = newPrefixedId('dec');
  const statements: SqlStatementSpec[] = [
    {
      sql: `INSERT INTO review_decisions (id, subject_type, subject_id, decision, note, decided_at)
            SELECT ?1, 'organization', ?2, ?3, ?4, ?5 FROM organizations g WHERE g.id = ?2 AND (${input.guard})`,
      params: [
        decisionId,
        input.organizationId,
        input.decision,
        input.note,
        input.now,
        ...(input.guardParams ?? []),
      ],
    },
    ...input.rest(DECIDED).map((s) => ({ sql: s.sql, params: s.params(decisionId) })),
  ];
  try {
    await runBatch(db, statements);
  } catch (error) {
    // The one-scheduled-meeting index: another schedule won between the read and this batch.
    if (/UNIQUE|constraint/i.test(String((error as Error)?.message))) throw new PaidError('stale');
    throw error;
  }
  const recorded = await allRows(db, {
    sql: 'SELECT 1 AS ok FROM review_decisions WHERE id = ?1',
    params: [decisionId],
  });
  if (recorded.length === 0) throw new PaidError('stale');
}

const cleanNote = (value: string | null | undefined, max: number) => {
  const text = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
  return text.length > max ? null : text;
};

function requireNote(value: string | null | undefined): string {
  const note = cleanNote(value, DECISION_NOTE_MAX);
  if (note === null) throw new PaidError('invalid', { detail: 'note' });
  if (!note) throw new PaidError('invalid', { detail: 'note_required' });
  return note;
}

async function result(
  db: SqlDatabase,
  org: OrgRow,
  status: VerificationStatus,
  email: (to: string) => LiveEmail,
  meeting?: VerificationMeeting,
): Promise<VerificationStepResult> {
  const ownerEmails = await ownerEmailsOf(db, org.id);
  return {
    organizationId: org.id,
    organizationName: org.name,
    status,
    ownerEmails,
    emails: ownerEmails.map(email),
    ...(meeting ? { meeting } : {}),
  };
}

/** An owner asks Gamo to verify the organization. Allowed when it is not verified and not already in progress. */
export async function requestVerification(
  db: SqlDatabase,
  input: { organizationId: string; organizerId: string; now: number },
): Promise<VerificationStepResult> {
  const org = await loadOrganization(db, input.organizationId);
  const owner = await allRows(db, {
    sql: `SELECT 1 AS ok FROM memberships WHERE organization_id = ?1 AND organizer_id = ?2 AND role = 'owner'`,
    params: [input.organizationId, input.organizerId],
  });
  if (owner.length === 0) throw new PaidError('forbidden');
  if (org.status !== 'active') throw new PaidError('forbidden', { detail: 'suspended' });
  if (org.verified_at != null || !['none', 'declined'].includes(org.verification_status))
    throw new PaidError('already_done');
  await runStep(db, {
    organizationId: org.id,
    decision: 'verification_requested',
    note: null,
    now: input.now,
    guard: `g.status = 'active' AND g.verified_at IS NULL AND g.verification_status IN ('none', 'declined')
            AND EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = g.id AND m.organizer_id = ?6 AND m.role = 'owner')`,
    guardParams: [input.organizerId],
    rest: (decided) => [
      {
        sql: `UPDATE organizations SET verification_status = 'requested', verification_requested_at = ?2, updated_at = ?2
               WHERE id = ?1 AND ${decided(3)}`,
        params: (id) => [org.id, input.now, id],
      },
    ],
  });
  return result(db, org, 'requested', (to) => verificationRequestedEmail(to, org.name));
}

export interface MeetingInput {
  /** `YYYY-MM-DD` in the meeting's zone. */
  date: string;
  /** `HH:MM` (24-hour) in the meeting's zone. */
  time: string;
  /** IANA zone, for example `DEFAULT_MEETING_TIME_ZONE`. */
  timeZone: string;
  format: string;
  /** The video link (https) or the place, at most 300 characters. */
  location: string;
  note?: string | null;
}

export interface ValidMeeting {
  startsAt: number;
  timeZone: string;
  format: MeetingFormat;
  location: string;
  note: string | null;
}

/** Checks a meeting form. Throws `PaidError('invalid', { detail: field })`. The meeting must start after `now`. */
export function validateMeeting(input: MeetingInput, now: number): ValidMeeting {
  const timeZone = String(input.timeZone ?? '').trim();
  if (!timeZone || !isTimeZone(timeZone)) throw new PaidError('invalid', { detail: 'timeZone' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date ?? '').trim()))
    throw new PaidError('invalid', { detail: 'date' });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.time ?? '').trim()))
    throw new PaidError('invalid', { detail: 'time' });
  const [y, mo, d] = input.date.trim().split('-').map(Number);
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d)
    throw new PaidError('invalid', { detail: 'date' });
  const startsAt = zonedLocalToEpochSeconds(`${input.date.trim()}T${input.time.trim()}`, timeZone);
  if (startsAt == null) throw new PaidError('invalid', { detail: 'date' });
  if (startsAt <= now) throw new PaidError('invalid', { detail: 'date' });
  if (!(MEETING_FORMATS as readonly string[]).includes(input.format))
    throw new PaidError('invalid', { detail: 'format' });
  const location = String(input.location ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!location || location.length > MEETING_LOCATION_MAX)
    throw new PaidError('invalid', { detail: 'location' });
  const note = cleanNote(input.note, MEETING_NOTE_MAX);
  if (note === null) throw new PaidError('invalid', { detail: 'note' });
  return { startsAt, timeZone, format: input.format as MeetingFormat, location, note: note || null };
}

function insertMeeting(
  organizationId: string,
  meetingId: string,
  m: ValidMeeting,
  now: number,
  decided: (n: number) => string,
) {
  return {
    sql: `INSERT INTO verification_meetings (id, subject_type, subject_id, starts_at, timezone, format, location, note, status, created_at, updated_at)
          SELECT ?1, 'organization', ?2, ?3, ?4, ?5, ?6, ?7, 'scheduled', ?8, ?8 WHERE ${decided(9)}`,
    params: (id: string) => [
      meetingId,
      organizationId,
      m.startsAt,
      m.timeZone,
      m.format,
      m.location,
      m.note,
      now,
      id,
    ],
  };
}

async function readMeeting(db: SqlDatabase, meetingId: string): Promise<VerificationMeeting> {
  const row = (
    await allRows<Record<string, unknown>>(db, {
      sql: `SELECT id, starts_at, timezone, format, location, note, status, held_at, canceled_at, created_at
              FROM verification_meetings WHERE id = ?1`,
      params: [meetingId],
    })
  )[0];
  if (!row) throw new PaidError('stale');
  return toMeeting(row);
}

const SCHEDULED_MEETING = `EXISTS (SELECT 1 FROM verification_meetings vm
  WHERE vm.subject_type = 'organization' AND vm.subject_id = g.id AND vm.status = 'scheduled')`;

/** Gamo schedules the meeting for a requested verification (one scheduled meeting at a time). */
export async function scheduleVerificationMeeting(
  db: SqlDatabase,
  input: { organizationId: string; meeting: MeetingInput; now: number },
): Promise<VerificationStepResult> {
  const org = await loadOrganization(db, input.organizationId);
  const m = validateMeeting(input.meeting, input.now);
  if (org.verification_status !== 'requested')
    throw new PaidError(org.verification_status === 'meeting_scheduled' ? 'stale' : 'invalid', {
      detail: org.verification_status === 'meeting_scheduled' ? 'meeting_scheduled' : 'not_requested',
    });
  const meetingId = newPrefixedId(PAID_ID_PREFIX.meeting);
  await runStep(db, {
    organizationId: org.id,
    decision: 'meeting_scheduled',
    note: m.note,
    now: input.now,
    guard: `g.verification_status = 'requested' AND NOT ${SCHEDULED_MEETING}`,
    rest: (decided) => [
      insertMeeting(org.id, meetingId, m, input.now, decided),
      {
        sql: `UPDATE organizations SET verification_status = 'meeting_scheduled', updated_at = ?2 WHERE id = ?1 AND ${decided(3)}`,
        params: (id) => [org.id, input.now, id],
      },
    ],
  });
  const meeting = await readMeeting(db, meetingId);
  return result(db, org, 'meeting_scheduled', (to) => meetingScheduledEmail(to, org.name, m), meeting);
}

/** A new time (or format or place) for the scheduled meeting: the old one is canceled and a new one scheduled. */
export async function rescheduleVerificationMeeting(
  db: SqlDatabase,
  input: { organizationId: string; meeting: MeetingInput; now: number },
): Promise<VerificationStepResult> {
  const org = await loadOrganization(db, input.organizationId);
  const m = validateMeeting(input.meeting, input.now);
  if (org.verification_status !== 'meeting_scheduled') throw new PaidError('stale');
  const meetingId = newPrefixedId(PAID_ID_PREFIX.meeting);
  await runStep(db, {
    organizationId: org.id,
    decision: 'meeting_scheduled',
    note: m.note ? `Rescheduled. ${m.note}` : 'Rescheduled.',
    now: input.now,
    guard: `g.verification_status = 'meeting_scheduled' AND ${SCHEDULED_MEETING}`,
    rest: (decided) => [
      {
        sql: `UPDATE verification_meetings SET status = 'canceled', canceled_at = ?2, updated_at = ?2
               WHERE subject_type = 'organization' AND subject_id = ?1 AND status = 'scheduled' AND ${decided(3)}`,
        params: (id) => [org.id, input.now, id],
      },
      insertMeeting(org.id, meetingId, m, input.now, decided),
      {
        sql: `UPDATE organizations SET updated_at = ?2 WHERE id = ?1 AND ${decided(3)}`,
        params: (id) => [org.id, input.now, id],
      },
    ],
  });
  const meeting = await readMeeting(db, meetingId);
  return result(
    db,
    org,
    'meeting_scheduled',
    (to) => meetingScheduledEmail(to, org.name, m, { rescheduled: true }),
    meeting,
  );
}

/** Cancels the scheduled meeting; the request stays open (status back to `requested`) for a new time. */
export async function cancelVerificationMeeting(
  db: SqlDatabase,
  input: { organizationId: string; note?: string | null; now: number },
): Promise<VerificationStepResult> {
  const org = await loadOrganization(db, input.organizationId);
  const note = cleanNote(input.note, DECISION_NOTE_MAX);
  if (note === null) throw new PaidError('invalid', { detail: 'note' });
  if (org.verification_status !== 'meeting_scheduled') throw new PaidError('stale');
  const current = (await meetingsOf(db, org.id)).find((x) => x.status === 'scheduled');
  await runStep(db, {
    organizationId: org.id,
    decision: 'meeting_canceled',
    note: note || null,
    now: input.now,
    guard: `g.verification_status = 'meeting_scheduled' AND ${SCHEDULED_MEETING}`,
    rest: (decided) => [
      {
        sql: `UPDATE verification_meetings SET status = 'canceled', canceled_at = ?2, updated_at = ?2
               WHERE subject_type = 'organization' AND subject_id = ?1 AND status = 'scheduled' AND ${decided(3)}`,
        params: (id) => [org.id, input.now, id],
      },
      {
        sql: `UPDATE organizations SET verification_status = 'requested', updated_at = ?2 WHERE id = ?1 AND ${decided(3)}`,
        params: (id) => [org.id, input.now, id],
      },
    ],
  });
  const meeting = current ? await readMeeting(db, current.id) : undefined;
  return result(db, org, 'requested', (to) => meetingCanceledEmail(to, org.name, note || null), meeting);
}

/** Marks the scheduled meeting as held. Only once its start time has passed. */
export async function markVerificationMeetingHeld(
  db: SqlDatabase,
  input: { organizationId: string; now: number },
): Promise<VerificationStepResult> {
  const org = await loadOrganization(db, input.organizationId);
  if (org.verification_status !== 'meeting_scheduled') throw new PaidError('stale');
  const current = (await meetingsOf(db, org.id)).find((x) => x.status === 'scheduled');
  if (!current) throw new PaidError('stale');
  if (current.startsAt > input.now) throw new PaidError('invalid', { detail: 'meeting_not_started' });
  await runStep(db, {
    organizationId: org.id,
    decision: 'meeting_held',
    note: null,
    now: input.now,
    guard: `g.verification_status = 'meeting_scheduled' AND EXISTS (SELECT 1 FROM verification_meetings vm
              WHERE vm.id = ?6 AND vm.subject_type = 'organization' AND vm.subject_id = g.id
                AND vm.status = 'scheduled' AND vm.starts_at <= ?5)`,
    guardParams: [current.id],
    rest: (decided) => [
      {
        sql: `UPDATE verification_meetings SET status = 'held', held_at = ?2, updated_at = ?2
               WHERE id = ?1 AND status = 'scheduled' AND ${decided(3)}`,
        params: (id) => [current.id, input.now, id],
      },
      {
        sql: `UPDATE organizations SET verification_status = 'meeting_held', updated_at = ?2 WHERE id = ?1 AND ${decided(3)}`,
        params: (id) => [org.id, input.now, id],
      },
    ],
  });
  const meeting = await readMeeting(db, current.id);
  return result(db, org, 'meeting_held', (to) => meetingHeldEmail(to, org.name), meeting);
}

/** Verifies the organization (sets `verified_at`, the source of the Verified label). Needs a held meeting and a note. */
export async function verifyOrganization(
  db: SqlDatabase,
  input: { organizationId: string; note: string; now: number },
): Promise<VerificationStepResult> {
  const note = requireNote(input.note);
  const org = await loadOrganization(db, input.organizationId);
  if (
    org.verification_status === 'requested' ||
    org.verification_status === 'meeting_scheduled' ||
    org.verification_status === 'none'
  )
    throw new PaidError('invalid', { detail: 'meeting_not_held' });
  if (org.verification_status !== 'meeting_held') throw new PaidError('stale');
  await runStep(db, {
    organizationId: org.id,
    decision: 'verified',
    note,
    now: input.now,
    guard: `g.verification_status = 'meeting_held' AND EXISTS (SELECT 1 FROM verification_meetings vm
              WHERE vm.subject_type = 'organization' AND vm.subject_id = g.id AND vm.status = 'held')`,
    rest: (decided) => [
      {
        sql: `UPDATE organizations SET verification_status = 'verified', verified_at = ?2, updated_at = ?2
               WHERE id = ?1 AND ${decided(3)}`,
        params: (id) => [org.id, input.now, id],
      },
    ],
  });
  return result(db, org, 'verified', (to) => organizationVerifiedEmail(to, org.name, note));
}

/** Declines a verification in progress (a scheduled meeting is canceled). A note says why; the owners may ask again. */
export async function declineVerification(
  db: SqlDatabase,
  input: { organizationId: string; note: string; now: number },
): Promise<VerificationStepResult> {
  const note = requireNote(input.note);
  const org = await loadOrganization(db, input.organizationId);
  const open = ['requested', 'meeting_scheduled', 'meeting_held'];
  if (!open.includes(org.verification_status)) throw new PaidError('stale');
  await runStep(db, {
    organizationId: org.id,
    decision: 'declined',
    note,
    now: input.now,
    guard: `g.verification_status IN ('requested', 'meeting_scheduled', 'meeting_held')`,
    rest: (decided) => [
      {
        sql: `UPDATE verification_meetings SET status = 'canceled', canceled_at = ?2, updated_at = ?2
               WHERE subject_type = 'organization' AND subject_id = ?1 AND status = 'scheduled' AND ${decided(3)}`,
        params: (id) => [org.id, input.now, id],
      },
      {
        sql: `UPDATE organizations SET verification_status = 'declined', updated_at = ?2 WHERE id = ?1 AND ${decided(3)}`,
        params: (id) => [org.id, input.now, id],
      },
    ],
  });
  return result(db, org, 'declined', (to) => verificationDeclinedEmail(to, org.name, note));
}

/**
 * Removes verification from a verified organization (decision `unverified`, note required). The status returns to
 * `none`, so the owners can request it again. No email: the admin tells the owners in their own words if needed.
 */
export async function removeVerification(
  db: SqlDatabase,
  input: { organizationId: string; note: string; now: number },
): Promise<VerificationStepResult> {
  const note = requireNote(input.note);
  const org = await loadOrganization(db, input.organizationId);
  if (org.verified_at == null) throw new PaidError('stale');
  await runStep(db, {
    organizationId: org.id,
    decision: 'unverified',
    note,
    now: input.now,
    guard: 'g.verified_at IS NOT NULL',
    rest: (decided) => [
      {
        sql: `UPDATE organizations SET verified_at = NULL, verification_status = 'none', updated_at = ?2
               WHERE id = ?1 AND ${decided(3)}`,
        params: (id) => [org.id, input.now, id],
      },
    ],
  });
  const ownerEmails = await ownerEmailsOf(db, org.id);
  return { organizationId: org.id, organizationName: org.name, status: 'none', ownerEmails, emails: [] };
}

// --- Views -----------------------------------------------------------------------------------------

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  none: 'Not verified',
  requested: 'Verification requested',
  meeting_scheduled: 'Meeting scheduled',
  meeting_held: 'Meeting held, decision pending',
  verified: 'Verified',
  declined: 'Not verified (declined)',
};

const VERIFICATION_DECISIONS = [
  'verification_requested',
  'meeting_scheduled',
  'meeting_held',
  'meeting_canceled',
  'verified',
  'declined',
  'unverified',
];

export interface OrganizationVerificationView {
  status: VerificationStatus;
  statusLabel: string;
  verified: boolean;
  verifiedAt: number | null;
  requestedAt: number | null;
  /** An owner may request verification now (the caller checks that the viewer is an owner). */
  canRequest: boolean;
  /** One sentence on what happens next. */
  message: string;
  /** The scheduled meeting, while one is scheduled. */
  meeting: VerificationMeeting | null;
  /** Gamo's note on the latest decline. */
  declineNote: string | null;
}

/** For the organizer's verification card (Organization area): the status, the meeting when scheduled, what to do. */
export async function organizationVerificationView(
  db: SqlDatabase,
  organizationId: string,
): Promise<OrganizationVerificationView> {
  const org = await loadOrganization(db, organizationId);
  const status = org.verification_status;
  const meeting =
    status === 'meeting_scheduled'
      ? ((await meetingsOf(db, org.id)).find((m) => m.status === 'scheduled') ?? null)
      : null;
  const declineNote =
    status === 'declined'
      ? ((
          await allRows<{ note: string | null }>(db, {
            sql: `SELECT note FROM review_decisions WHERE subject_type = 'organization' AND subject_id = ?1 AND decision = 'declined'
                   ORDER BY decided_at DESC, rowid DESC LIMIT 1`,
            params: [org.id],
          })
        )[0]?.note ?? null)
      : null;
  const canRequest =
    org.status === 'active' && org.verified_at == null && (status === 'none' || status === 'declined');
  const message: Record<VerificationStatus, string> = {
    none: 'Gamo verifies every organization through a short meeting (video call or in person). Request verification to start.',
    requested: 'Verification requested. Gamo will email the owners a meeting time.',
    meeting_scheduled: 'Your verification meeting with Gamo is scheduled.',
    meeting_held: 'Thank you for meeting with Gamo. The decision will be emailed to the owners.',
    verified: 'Verified by Gamo after a meeting.',
    declined: 'Gamo could not verify this organization. You can request verification again.',
  };
  return {
    status,
    statusLabel: VERIFICATION_STATUS_LABELS[status],
    verified: org.verified_at != null,
    verifiedAt: org.verified_at == null ? null : Number(org.verified_at),
    requestedAt: org.verification_requested_at == null ? null : Number(org.verification_requested_at),
    canRequest,
    message:
      org.status !== 'active' && (status === 'none' || status === 'declined')
        ? 'This organization is suspended; verification cannot be requested.'
        : message[status],
    meeting,
    declineNote,
  };
}

export type VerificationAction =
  'schedule' | 'reschedule' | 'cancel_meeting' | 'mark_held' | 'verify' | 'decline' | 'remove';

export interface AdminVerificationView {
  status: VerificationStatus;
  statusLabel: string;
  requestedAt: number | null;
  verifiedAt: number | null;
  /** The scheduled meeting, while one is scheduled. */
  currentMeeting: VerificationMeeting | null;
  /** Every meeting, newest first. */
  meetings: VerificationMeeting[];
  /** The verification decisions, newest first. */
  decisions: Array<{ decision: string; note: string | null; decidedAt: number }>;
  /** What the admin can do now. `mark_held` appears only once the meeting has started. */
  actions: VerificationAction[];
}

/** For the admin's organization page: the meeting history, the decisions and the actions open now. */
export async function adminVerificationView(
  db: SqlDatabase,
  organizationId: string,
  now: number,
): Promise<AdminVerificationView> {
  const org = await loadOrganization(db, organizationId);
  const [meetings, decisions] = await Promise.all([
    meetingsOf(db, org.id),
    allRows<{ decision: string; note: string | null; decided_at: number }>(db, {
      sql: `SELECT decision, note, decided_at FROM review_decisions
             WHERE subject_type = 'organization' AND subject_id = ?1
               AND decision IN (${VERIFICATION_DECISIONS.map((d) => `'${d}'`).join(', ')})
             ORDER BY decided_at DESC, rowid DESC LIMIT 50`,
      params: [org.id],
    }),
  ]);
  const currentMeeting = meetings.find((m) => m.status === 'scheduled') ?? null;
  const actions: VerificationAction[] = [];
  const status = org.verification_status;
  if (status === 'requested') actions.push('schedule', 'decline');
  if (status === 'meeting_scheduled') {
    if (currentMeeting && currentMeeting.startsAt <= now) actions.push('mark_held');
    actions.push('reschedule', 'cancel_meeting', 'decline');
  }
  if (status === 'meeting_held') actions.push('verify', 'decline');
  if (org.verified_at != null) actions.push('remove');
  return {
    status,
    statusLabel: VERIFICATION_STATUS_LABELS[status],
    requestedAt: org.verification_requested_at == null ? null : Number(org.verification_requested_at),
    verifiedAt: org.verified_at == null ? null : Number(org.verified_at),
    currentMeeting,
    meetings,
    decisions: decisions.map((d) => ({
      decision: d.decision,
      note: d.note,
      decidedAt: Number(d.decided_at),
    })),
    actions,
  };
}

/** The admin's verification queues: requested ("to schedule"), meeting scheduled, meeting held ("to decide"). */
export type VerificationQueueStatus = 'requested' | 'meeting_scheduled' | 'meeting_held';

/** SQL condition on `organizations g` for each queue; the counts in `admin.ts` use the same text. */
export const VERIFICATION_QUEUE_WHERE: Record<VerificationQueueStatus, string> = {
  requested: "g.verification_status = 'requested'",
  meeting_scheduled: "g.verification_status = 'meeting_scheduled'",
  meeting_held: "g.verification_status = 'meeting_held'",
};

export interface VerificationQueueRow {
  organizationId: string;
  name: string;
  kind: string;
  city: string | null;
  state: string | null;
  suspended: boolean;
  status: VerificationStatus;
  requestedAt: number | null;
  /** The scheduled meeting (meeting_scheduled) or the held one (meeting_held). */
  meeting: { startsAt: number; timeZone: string; whenLabel: string; format: MeetingFormat } | null;
}

export async function listVerificationQueue(
  db: SqlDatabase,
  input: { status: VerificationQueueStatus },
): Promise<VerificationQueueRow[]> {
  const where = VERIFICATION_QUEUE_WHERE[input.status];
  if (!where) throw new PaidError('invalid', { detail: 'status' });
  const meetingStatus = input.status === 'meeting_held' ? 'held' : 'scheduled';
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT g.id, g.name, g.kind, g.city, g.state, g.status, g.verification_status, g.verification_requested_at,
                 vm.starts_at, vm.timezone, vm.format
            FROM organizations g
            LEFT JOIN verification_meetings vm ON vm.id = (
              SELECT id FROM verification_meetings WHERE subject_type = 'organization' AND subject_id = g.id AND status = ?1
               ORDER BY created_at DESC, rowid DESC LIMIT 1)
           WHERE ${where}
           ORDER BY ${input.status === 'meeting_scheduled' ? 'vm.starts_at,' : ''} g.verification_requested_at, g.name`,
    params: [meetingStatus],
  });
  return rows.map((r) => ({
    organizationId: String(r.id),
    name: String(r.name),
    kind: String(r.kind),
    city: r.city == null ? null : String(r.city),
    state: r.state == null ? null : String(r.state),
    suspended: r.status === 'suspended',
    status: r.verification_status as VerificationStatus,
    requestedAt: r.verification_requested_at == null ? null : Number(r.verification_requested_at),
    meeting:
      r.starts_at == null
        ? null
        : {
            startsAt: Number(r.starts_at),
            timeZone: String(r.timezone),
            whenLabel: meetingWhenLabel(Number(r.starts_at), String(r.timezone)),
            format: r.format as MeetingFormat,
          },
  }));
}
