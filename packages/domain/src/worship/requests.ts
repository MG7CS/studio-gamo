/**
 * Service requests (design 2026-11-16, Worship / Production flow): a church or production request
 * submission becomes one `service_requests` row that staff match to roster members in admin.
 *
 *   const request = await createRequestFromSubmission(db, { submissionId, now });   // idempotent
 *   const page = await listRequests(db, { status: 'matching', limit: 25 });
 *   const detail = await getRequest(db, request.id);                                 // with its offers
 *
 * Rules:
 * - `createRequestFromSubmission` reads only the form's binds (`request.*`, `contact.*`). It is idempotent
 *   by `submission_id UNIQUE`: a second call returns the existing request and changes nothing.
 * - `offered`, `confirmed` are system-managed (offers.ts). Staff set `matching`, `completed` (from
 *   confirmed) or `cancelled`; cancelling withdraws every pending offer so old links stop working.
 * - Offer rows are returned without their token hash; the emailed token is never recoverable.
 * - The listing is ordered by service date then id; nothing commercial affects order.
 */
import { newPrefixedId } from '../security/ids.ts';
import {
  allRows,
  auditStatement,
  bindEmail,
  bindList,
  bindString,
  clampLimit,
  decodeCursor,
  encodeCursor,
  firstRow,
  isClockTime,
  isIsoDate,
  parseBinds,
  parseStringList,
  WorshipError,
  type Db,
  type WorshipProgram,
} from './common.ts';

export const REQUEST_STATUSES = [
  'new',
  'matching',
  'offered',
  'confirmed',
  'completed',
  'cancelled',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_KINDS = ['church_request', 'production_request'] as const;

/** Statuses staff may set directly. */
export const STAFF_REQUEST_STATUSES = ['matching', 'completed', 'cancelled'] as const;

export interface ServiceRequest {
  id: string;
  submissionId: string;
  program: WorshipProgram;
  churchName: string;
  contactName: string | null;
  contactEmail: string;
  contactPhone: string | null;
  /** `YYYY-MM-DD`, the church's local calendar date. */
  serviceDate: string;
  /** `HH:MM`, the church's local time. */
  startTime: string | null;
  address: string | null;
  rolesNeeded: string[];
  status: RequestStatus;
  createdAt: number;
}

interface RequestRow {
  id: string;
  submission_id: string;
  program: WorshipProgram;
  church_name: string;
  contact_name: string | null;
  contact_email_normalized: string;
  contact_phone: string | null;
  service_date: string;
  start_time: string | null;
  address: string | null;
  roles_needed_json: string;
  status: RequestStatus;
  created_at: number;
}

const REQUEST_COLUMNS = `id, submission_id, program, church_name, contact_name, contact_email_normalized,
  contact_phone, service_date, start_time, address, roles_needed_json, status, created_at`;

export function serviceRequestFromRow(r: RequestRow): ServiceRequest {
  return {
    id: r.id,
    submissionId: r.submission_id,
    program: r.program,
    churchName: r.church_name,
    contactName: r.contact_name,
    contactEmail: r.contact_email_normalized,
    contactPhone: r.contact_phone,
    serviceDate: r.service_date,
    startTime: r.start_time,
    address: r.address,
    rolesNeeded: parseStringList(r.roles_needed_json),
    status: r.status,
    createdAt: r.created_at,
  };
}

async function requestBySubmission(db: Db, submissionId: string): Promise<ServiceRequest | null> {
  const row = await firstRow<RequestRow>(
    db,
    `SELECT ${REQUEST_COLUMNS} FROM service_requests WHERE submission_id = ?`,
    submissionId,
  );
  return row ? serviceRequestFromRow(row) : null;
}

export interface CreateRequestInput {
  submissionId: string;
  /** Epoch seconds. */
  now: number;
}

/** Creates the service request for a stored church/production request submission (idempotent). */
export async function createRequestFromSubmission(
  db: Db,
  input: CreateRequestInput,
): Promise<ServiceRequest> {
  const { submissionId, now } = input;
  const existing = await requestBySubmission(db, submissionId);
  if (existing) return existing;

  const sub = await firstRow<{ binds_json: string; kind: string; program: WorshipProgram }>(
    db,
    `SELECT s.binds_json, f.kind, f.program FROM form_submissions s JOIN forms f ON f.id = s.form_id WHERE s.id = ?`,
    submissionId,
  );
  if (!sub) throw new WorshipError('NOT_FOUND', 'submission not found');
  if (!(REQUEST_KINDS as readonly string[]).includes(sub.kind))
    throw new WorshipError('NOT_A_REQUEST', 'submission is not a church or production request');

  const binds = parseBinds(sub.binds_json);
  const churchName = bindString(binds, 'request.church_name', 200);
  const email = bindEmail(binds, 'contact.email');
  const date = bindString(binds, 'request.date', 10);
  const time = bindString(binds, 'request.start_time', 5);
  if (!churchName || !email || !date || !isIsoDate(date))
    throw new WorshipError('INVALID_INPUT', 'request is missing a church name, valid email or valid date');
  if (time && !isClockTime(time)) throw new WorshipError('INVALID_INPUT', 'invalid start time');

  await db
    .prepare(
      `INSERT INTO service_requests (id, submission_id, program, church_name, contact_name,
         contact_email_normalized, contact_phone, service_date, start_time, address, roles_needed_json,
         status, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'new', ?12)
       ON CONFLICT(submission_id) DO NOTHING`,
    )
    .bind(
      newPrefixedId('req'),
      submissionId,
      sub.program,
      churchName,
      bindString(binds, 'contact.name', 120),
      email,
      bindString(binds, 'contact.phone', 40),
      date,
      time,
      bindString(binds, 'request.address', 300),
      JSON.stringify(bindList(binds, 'request.roles_needed')),
      now,
    )
    .run();
  const created = await requestBySubmission(db, submissionId);
  if (!created) throw new WorshipError('INVALID_STATE', 'request row was not created');
  return created;
}

export async function getServiceRequest(db: Db, id: string): Promise<ServiceRequest | null> {
  const row = await firstRow<RequestRow>(
    db,
    `SELECT ${REQUEST_COLUMNS} FROM service_requests WHERE id = ?`,
    id,
  );
  return row ? serviceRequestFromRow(row) : null;
}

export interface RequestFilter {
  status?: RequestStatus | RequestStatus[];
  program?: WorshipProgram;
  /** Inclusive `YYYY-MM-DD` bounds on the service date. */
  fromDate?: string;
  toDate?: string;
  limit?: number;
  cursor?: string;
}

export interface RequestPage {
  requests: ServiceRequest[];
  nextCursor: string | null;
}

export async function listRequests(db: Db, filter: RequestFilter = {}): Promise<RequestPage> {
  const limit = clampLimit(filter.limit);
  const where: string[] = [];
  const params: Array<string | number> = [];
  const statuses =
    filter.status === undefined ? [] : Array.isArray(filter.status) ? filter.status : [filter.status];
  if (statuses.length) {
    where.push(`status IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
  }
  if (filter.program) {
    where.push('program = ?');
    params.push(filter.program);
  }
  for (const [value, clause] of [
    [filter.fromDate, 'service_date >= ?'],
    [filter.toDate, 'service_date <= ?'],
  ] as const) {
    if (value === undefined) continue;
    if (!isIsoDate(value)) throw new WorshipError('INVALID_INPUT', 'invalid date filter');
    where.push(clause);
    params.push(value);
  }
  if (filter.cursor) {
    const [date, id] = decodeCursor(filter.cursor);
    where.push('(service_date > ? OR (service_date = ? AND id > ?))');
    params.push(date, date, id);
  }
  const rows = await allRows<RequestRow>(
    db,
    `SELECT ${REQUEST_COLUMNS} FROM service_requests ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY service_date, id LIMIT ?`,
    ...params,
    limit + 1,
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    requests: page.map(serviceRequestFromRow),
    nextCursor: rows.length > limit && last ? encodeCursor(last.service_date, last.id) : null,
  };
}

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';

/** An offer as staff see it. The token hash is never included. */
export interface OfferSummary {
  id: string;
  rosterMemberId: string;
  /** The musician's display name, for the staff screen. */
  memberName: string;
  role: string;
  payCents: number;
  status: OfferStatus;
  sentAt: number;
  expiresAt: number;
  respondedAt: number | null;
}

export interface RequestDetail extends ServiceRequest {
  offers: OfferSummary[];
}

export async function getRequest(db: Db, id: string): Promise<RequestDetail | null> {
  const request = await getServiceRequest(db, id);
  if (!request) return null;
  const rows = await allRows<{
    id: string;
    roster_member_id: string;
    display_name: string;
    role: string;
    pay_cents: number;
    status: OfferStatus;
    sent_at: number;
    expires_at: number;
    responded_at: number | null;
  }>(
    db,
    `SELECT o.id, o.roster_member_id, m.display_name, o.role, o.pay_cents, o.status, o.sent_at, o.expires_at,
            o.responded_at
       FROM offers o JOIN roster_members m ON m.id = o.roster_member_id
      WHERE o.request_id = ? ORDER BY o.sent_at, o.id`,
    id,
  );
  return {
    ...request,
    offers: rows.map((r) => ({
      id: r.id,
      rosterMemberId: r.roster_member_id,
      memberName: r.display_name,
      role: r.role,
      payCents: r.pay_cents,
      status: r.status,
      sentAt: r.sent_at,
      expiresAt: r.expires_at,
      respondedAt: r.responded_at,
    })),
  };
}

export interface SetRequestStatusInput {
  requestId: string;
  status: (typeof STAFF_REQUEST_STATUSES)[number];
  staffId: string;
  now: number;
}

/** Staff status change: matching (reopen), completed (from confirmed) or cancelled (withdraws pending offers). */
export async function setRequestStatus(db: Db, input: SetRequestStatusInput): Promise<ServiceRequest> {
  const { requestId, status, staffId, now } = input;
  if (!(STAFF_REQUEST_STATUSES as readonly string[]).includes(status))
    throw new WorshipError('INVALID_INPUT', 'status is managed by the offer flow');
  const current = await getServiceRequest(db, requestId);
  if (!current) throw new WorshipError('NOT_FOUND', 'request not found');
  if (current.status === status) return current;
  if (current.status === 'completed' || current.status === 'cancelled')
    throw new WorshipError('INVALID_STATE', `request is ${current.status}`);
  if (status === 'completed' && current.status !== 'confirmed')
    throw new WorshipError('INVALID_STATE', 'only a confirmed request can be completed');

  const statements = [
    db.prepare('UPDATE service_requests SET status = ?2 WHERE id = ?1').bind(requestId, status),
    auditStatement(db, {
      actorId: staffId,
      action: 'request.status_changed',
      entityType: 'service_request',
      entityId: requestId,
      payload: { from: current.status, to: status },
      now,
    }),
  ];
  if (status === 'cancelled')
    statements.push(
      db
        .prepare(`UPDATE offers SET status = 'withdrawn' WHERE request_id = ?1 AND status = 'pending'`)
        .bind(requestId),
    );
  await db.batch(statements);
  return (await getServiceRequest(db, requestId)) as ServiceRequest;
}
