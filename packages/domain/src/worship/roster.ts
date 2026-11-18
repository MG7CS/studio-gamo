/**
 * The private roster (design 2026-11-16, Worship / Production flow). A musician or technician application
 * reaches the roster only through staff review (`approveApplication`); there is no public directory.
 *
 *   const member = await approveApplication(db, env, { submissionId, staffId, now });
 *   const page = await searchRoster(db, { role: 'Drums', city: 'Phoenix', status: 'active', limit: 25 });
 *
 * Rules:
 * - Approve and decline each claim the submission with one conditional UPDATE (status new/in_review), so
 *   two staff clicking at once produce one roster row and one event. A repeat approve returns the existing
 *   row; a repeat decline is a no-op.
 * - Decline sets `delete_after` = now + 365 days (retention: declined records 12 months). Moving the
 *   applicant's uploaded files to the declined area is the caller's job, through `onDeclined` (it receives
 *   the submission id, runs after the decision is stored, and runs again on a repeat decline, so it must be
 *   idempotent).
 * - Search order is display name then id, nothing else. Payment, sponsorship, pay rates or approval order
 *   never influence who is listed first (mission rule: commercial factors never affect vetting or rank).
 * - W-9 is a received date only; no tax identifiers are stored.
 * - Emails go through the outbox with key `{kind}:{submissionId}`; a failed send never undoes the decision.
 * - Audit rows and submission events hold ids only, never names, emails or phone numbers.
 */
import { emailIdempotencyKey } from '../email/registry.ts';
import { renderApplicationApproved, renderApplicationDeclined } from '../email/templates.ts';
import { newPrefixedId } from '../security/ids.ts';
import type { OutboxOptions } from '../services/email-outbox.ts';
import {
  allRows,
  auditStatement,
  bindBool,
  bindEmail,
  bindList,
  bindString,
  clampLimit,
  decodeCursor,
  encodeCursor,
  firstRow,
  parseBinds,
  parseStringList,
  SECONDS_PER_DAY,
  sendEmailSafely,
  submissionEventStatement,
  WorshipError,
  type Db,
  type WorshipEnv,
  type WorshipProgram,
} from './common.ts';

export const ROSTER_STATUSES = ['active', 'paused', 'removed'] as const;
export type RosterStatus = (typeof ROSTER_STATUSES)[number];

export const APPLICATION_KINDS = ['musician_application', 'technician_application'] as const;

/** Declined applications are kept 12 months (files are removed earlier by the retention job). */
export const DECLINED_RETENTION_DAYS = 365;

export interface RosterMember {
  id: string;
  submissionId: string;
  program: WorshipProgram;
  displayName: string;
  email: string;
  phone: string | null;
  roles: string[];
  city: string | null;
  canTeach: boolean;
  status: RosterStatus;
  /** Epoch seconds the W-9 arrived; null until then. */
  w9ReceivedAt: number | null;
  approvedAt: number;
}

interface RosterRow {
  id: string;
  submission_id: string;
  program: WorshipProgram;
  display_name: string;
  email_normalized: string;
  phone: string | null;
  roles_json: string;
  city: string | null;
  can_teach: number;
  status: RosterStatus;
  w9_received_at: number | null;
  approved_at: number;
}

const ROSTER_COLUMNS = `id, submission_id, program, display_name, email_normalized, phone, roles_json, city,
  can_teach, status, w9_received_at, approved_at`;

export function rosterMemberFromRow(r: RosterRow): RosterMember {
  return {
    id: r.id,
    submissionId: r.submission_id,
    program: r.program,
    displayName: r.display_name,
    email: r.email_normalized,
    phone: r.phone,
    roles: parseStringList(r.roles_json),
    city: r.city,
    canTeach: r.can_teach === 1,
    status: r.status,
    w9ReceivedAt: r.w9_received_at,
    approvedAt: r.approved_at,
  };
}

export async function getRosterMember(db: Db, id: string): Promise<RosterMember | null> {
  const row = await firstRow<RosterRow>(db, `SELECT ${ROSTER_COLUMNS} FROM roster_members WHERE id = ?`, id);
  return row ? rosterMemberFromRow(row) : null;
}

async function rosterBySubmission(db: Db, submissionId: string): Promise<RosterMember | null> {
  const row = await firstRow<RosterRow>(
    db,
    `SELECT ${ROSTER_COLUMNS} FROM roster_members WHERE submission_id = ?`,
    submissionId,
  );
  return row ? rosterMemberFromRow(row) : null;
}

interface ApplicationRow {
  id: string;
  status: string;
  reference: string;
  binds_json: string;
  submitter_email_normalized: string | null;
  submitter_name: string | null;
  kind: string;
  program: WorshipProgram;
}

async function loadApplication(db: Db, submissionId: string): Promise<ApplicationRow> {
  const row = await firstRow<ApplicationRow>(
    db,
    `SELECT s.id, s.status, s.reference, s.binds_json, s.submitter_email_normalized, s.submitter_name,
            f.kind, f.program
       FROM form_submissions s JOIN forms f ON f.id = s.form_id WHERE s.id = ?`,
    submissionId,
  );
  if (!row) throw new WorshipError('NOT_FOUND', 'submission not found');
  if (!(APPLICATION_KINDS as readonly string[]).includes(row.kind))
    throw new WorshipError('NOT_AN_APPLICATION', 'submission is not a musician or technician application');
  return row;
}

export interface ApproveInput {
  submissionId: string;
  staffId: string;
  /** Epoch seconds. */
  now: number;
}

/**
 * Approves an application: one roster row (a repeat call returns it), submission status `approved`,
 * a `status` event, and the `application_approved` email.
 */
export async function approveApplication(
  db: Db,
  env: WorshipEnv,
  input: ApproveInput,
  options: OutboxOptions = {},
): Promise<RosterMember> {
  const { submissionId, staffId, now } = input;
  const sub = await loadApplication(db, submissionId);
  const binds = parseBinds(sub.binds_json);
  const displayName = bindString(binds, 'contact.name', 120);
  const email = bindEmail(binds, 'contact.email');
  const roles = bindList(binds, 'roster.roles');

  let member = await rosterBySubmission(db, submissionId);
  if (!member) {
    if (sub.status !== 'new' && sub.status !== 'in_review' && sub.status !== 'approved')
      throw new WorshipError('INVALID_STATE', `application is ${sub.status}`);
    if (!displayName || !email || roles.length === 0)
      throw new WorshipError('INVALID_INPUT', 'application is missing a name, valid email or role');

    const claimed = await firstRow<{ id: string }>(
      db,
      `UPDATE form_submissions SET status = 'approved', reviewed_by_user_id = ?2, reviewed_at = ?3
        WHERE id = ?1 AND status IN ('new', 'in_review') RETURNING id`,
      submissionId,
      staffId,
      now,
    );
    if (!claimed) {
      // Another staff member decided or moved the application after it was loaded: only an approval that
      // already happened may continue (the insert below is then a no-op), anything else must not join the roster.
      const current = await firstRow<{ status: string }>(
        db,
        'SELECT status FROM form_submissions WHERE id = ?1',
        submissionId,
      );
      if (current?.status !== 'approved')
        throw new WorshipError('INVALID_STATE', `application is ${current?.status ?? 'missing'}`);
    }
    const rosterId = newPrefixedId('ros');
    const statements = [
      db
        .prepare(
          `INSERT INTO roster_members (id, submission_id, program, display_name, email_normalized, phone,
             roles_json, city, can_teach, status, approved_by_user_id, approved_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'active', ?10, ?11)
           ON CONFLICT(submission_id) DO NOTHING`,
        )
        .bind(
          rosterId,
          submissionId,
          sub.program,
          displayName,
          email,
          bindString(binds, 'contact.phone', 40),
          JSON.stringify(roles),
          bindString(binds, 'roster.city', 120),
          bindBool(binds, 'roster.can_teach') ? 1 : 0,
          staffId,
          now,
        ),
    ];
    if (claimed) {
      statements.push(
        submissionEventStatement(db, {
          submissionId,
          kind: 'status',
          actorId: staffId,
          body: 'approved: added to roster',
          now,
        }),
        auditStatement(db, {
          actorId: staffId,
          action: 'roster.approved',
          entityType: 'form_submission',
          entityId: submissionId,
          payload: { rosterMemberId: rosterId },
          now,
        }),
      );
    }
    await db.batch(statements);
    member = await rosterBySubmission(db, submissionId);
    if (!member) throw new WorshipError('INVALID_STATE', 'roster row was not created');
  }

  const rendered = renderApplicationApproved({
    program: member.program,
    recipientName: member.displayName,
    reference: sub.reference,
  });
  await sendEmailSafely(
    db,
    env,
    {
      kind: 'application_approved',
      idempotencyKey: emailIdempotencyKey('application_approved', submissionId),
      to: member.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      relatedType: 'form_submission',
      relatedId: submissionId,
      product: member.program === 'production' ? 'production' : 'worship',
      now,
    },
    options,
  );
  return member;
}

export interface DeclineInput {
  submissionId: string;
  staffId: string;
  /** A short note shown to the applicant (the only reason they ever see). Also kept as an internal note. */
  note?: string;
  now: number;
  /** Moves the applicant's uploads to the declined area. Idempotent; see the module header. */
  onDeclined?: (submissionId: string) => Promise<void>;
}

export interface DeclineResult {
  submissionId: string;
  status: 'declined';
  /** Epoch seconds after which the retention job deletes the record. */
  deleteAfter: number;
}

export async function declineApplication(
  db: Db,
  env: WorshipEnv,
  input: DeclineInput,
  options: OutboxOptions = {},
): Promise<DeclineResult> {
  const { submissionId, staffId, now } = input;
  const note = input.note?.trim().slice(0, 600) || undefined;
  const sub = await loadApplication(db, submissionId);
  const deleteAfter = now + DECLINED_RETENTION_DAYS * SECONDS_PER_DAY;

  const claimed = await firstRow<{ id: string }>(
    db,
    `UPDATE form_submissions SET status = 'declined', reviewed_by_user_id = ?2, reviewed_at = ?3, delete_after = ?4
      WHERE id = ?1 AND status IN ('new', 'in_review') RETURNING id`,
    submissionId,
    staffId,
    now,
    deleteAfter,
  );
  if (!claimed && sub.status !== 'declined')
    throw new WorshipError('INVALID_STATE', `application is ${sub.status}`);

  let storedDeleteAfter = deleteAfter;
  if (claimed) {
    const statements = [
      submissionEventStatement(db, {
        submissionId,
        kind: 'status',
        actorId: staffId,
        body: 'declined',
        now,
      }),
      auditStatement(db, {
        actorId: staffId,
        action: 'application.declined',
        entityType: 'form_submission',
        entityId: submissionId,
        now,
      }),
    ];
    if (note)
      statements.push(
        submissionEventStatement(db, { submissionId, kind: 'note', actorId: staffId, body: note, now }),
      );
    await db.batch(statements);
  } else {
    const row = await firstRow<{ delete_after: number | null }>(
      db,
      'SELECT delete_after FROM form_submissions WHERE id = ?',
      submissionId,
    );
    storedDeleteAfter = row?.delete_after ?? deleteAfter;
  }

  const binds = parseBinds(sub.binds_json);
  const to = sub.submitter_email_normalized ?? bindEmail(binds, 'contact.email');
  if (to) {
    const rendered = renderApplicationDeclined({
      program: sub.program,
      recipientName: sub.submitter_name ?? bindString(binds, 'contact.name', 120) ?? undefined,
      reference: sub.reference,
      staffNote: note,
    });
    await sendEmailSafely(
      db,
      env,
      {
        kind: 'application_declined',
        idempotencyKey: emailIdempotencyKey('application_declined', submissionId),
        to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        relatedType: 'form_submission',
        relatedId: submissionId,
        product: sub.program === 'production' ? 'production' : 'worship',
        now,
      },
      options,
    );
  }

  await input.onDeclined?.(submissionId);
  return { submissionId, status: 'declined', deleteAfter: storedDeleteAfter };
}

export interface RosterSearch {
  program?: WorshipProgram;
  /** Case-insensitive; matches a member who lists this role. */
  role?: string;
  /** Case-insensitive exact city. */
  city?: string;
  /** Omit to include every status. */
  status?: RosterStatus;
  /** 1 to 100; default 25. */
  limit?: number;
  /** `nextCursor` of the previous page. */
  cursor?: string;
}

export interface RosterPage {
  members: RosterMember[];
  nextCursor: string | null;
}

/** Keyset-paged search ordered by display name (case-insensitive) then id. Nothing commercial orders it. */
export async function searchRoster(db: Db, search: RosterSearch = {}): Promise<RosterPage> {
  const limit = clampLimit(search.limit);
  const where: string[] = [];
  const params: Array<string | number> = [];
  const add = (clause: string, ...values: Array<string | number>) => {
    where.push(clause);
    params.push(...values);
  };
  if (search.program) add('program = ?', search.program);
  if (search.status) add('status = ?', search.status);
  if (search.city?.trim()) add('lower(city) = lower(?)', search.city.trim());
  if (search.role?.trim())
    add(
      'EXISTS (SELECT 1 FROM json_each(roster_members.roles_json) WHERE lower(json_each.value) = lower(?))',
      search.role.trim(),
    );
  if (search.cursor) {
    const [name, id] = decodeCursor(search.cursor);
    add('(display_name COLLATE NOCASE > ? OR (display_name COLLATE NOCASE = ? AND id > ?))', name, name, id);
  }
  const rows = await allRows<RosterRow>(
    db,
    `SELECT ${ROSTER_COLUMNS} FROM roster_members
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY display_name COLLATE NOCASE, id LIMIT ?`,
    ...params,
    limit + 1,
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    members: page.map(rosterMemberFromRow),
    nextCursor: rows.length > limit && last ? encodeCursor(last.display_name, last.id) : null,
  };
}

export interface SetRosterStatusInput {
  rosterMemberId: string;
  status: RosterStatus;
  staffId: string;
  now: number;
}

/**
 * Activates, pauses or removes a member. Pausing or removing withdraws their pending offers so an old
 * emailed link can no longer be accepted.
 */
export async function setRosterStatus(db: Db, input: SetRosterStatusInput): Promise<RosterMember> {
  const { rosterMemberId, status, staffId, now } = input;
  if (!(ROSTER_STATUSES as readonly string[]).includes(status))
    throw new WorshipError('INVALID_INPUT', 'unknown roster status');
  const existing = await getRosterMember(db, rosterMemberId);
  if (!existing) throw new WorshipError('NOT_FOUND', 'roster member not found');
  if (existing.status === status) return existing;
  const statements = [
    db.prepare('UPDATE roster_members SET status = ?2 WHERE id = ?1').bind(rosterMemberId, status),
    auditStatement(db, {
      actorId: staffId,
      action: 'roster.status_changed',
      entityType: 'roster_member',
      entityId: rosterMemberId,
      payload: { from: existing.status, to: status },
      now,
    }),
  ];
  if (status !== 'active') {
    statements.push(
      db
        .prepare(`UPDATE offers SET status = 'withdrawn' WHERE roster_member_id = ?1 AND status = 'pending'`)
        .bind(rosterMemberId),
      db
        .prepare(
          `UPDATE service_requests SET status = 'matching'
            WHERE status = 'offered'
              AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.request_id = service_requests.id AND o.status = 'pending')`,
        )
        .bind(),
    );
  }
  await db.batch(statements);
  return (await getRosterMember(db, rosterMemberId)) as RosterMember;
}

export interface MarkW9Input {
  rosterMemberId: string;
  staffId: string;
  now: number;
  /** Epoch seconds the form arrived; defaults to `now`. Pass null to clear. */
  receivedAt?: number | null;
}

/** Records only the date a W-9 was received (no tax identifiers are stored anywhere). */
export async function markW9Received(db: Db, input: MarkW9Input): Promise<RosterMember> {
  const { rosterMemberId, staffId, now } = input;
  const receivedAt = input.receivedAt === undefined ? now : input.receivedAt;
  if (receivedAt !== null && (!Number.isSafeInteger(receivedAt) || receivedAt < 0))
    throw new WorshipError('INVALID_INPUT', 'invalid received date');
  const existing = await getRosterMember(db, rosterMemberId);
  if (!existing) throw new WorshipError('NOT_FOUND', 'roster member not found');
  await db.batch([
    db
      .prepare('UPDATE roster_members SET w9_received_at = ?2 WHERE id = ?1')
      .bind(rosterMemberId, receivedAt),
    auditStatement(db, {
      actorId: staffId,
      action: receivedAt === null ? 'roster.w9_cleared' : 'roster.w9_received',
      entityType: 'roster_member',
      entityId: rosterMemberId,
      now,
    }),
  ]);
  return (await getRosterMember(db, rosterMemberId)) as RosterMember;
}
