/**
 * Offers with one-click emailed links (design 2026-11-16, Worship / Production flow; Task 3.2).
 *
 *   const { offerId, url } = await sendOffer(db, env, { requestId, rosterMemberId, role, payCents,
 *     staffId, siteOrigin: 'https://gamostudio.org', now });
 *   const view = await getOfferByToken(db, token, now);          // GET page: read-only
 *   const out = await respondToOffer(db, env, { token, action: 'accept', now });   // POST page: acts
 *
 * Research (one-click email action links, checked 2026-11-16): email security scanners and link
 * prefetchers open every URL in a message with GET, so a link that changes state on GET gets "clicked"
 * by machines. The accepted pattern is a read-only confirmation page on GET and the state change on a
 * POST from a visible button, with a server-side token check and a single conditional update so repeats
 * are harmless. Sources:
 *   - RFC 9110 section 9.2.1, safe methods (GET must not be expected to change server state):
 *     https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1
 *   - RFC 8058, one-click unsubscribe uses a POST sent after the user consents (the same GET-versus-POST
 *     principle for header links): https://www.rfc-editor.org/rfc/rfc8058
 *   - "Build scanner-safe double opt-in" (GET shows a page, POST confirms; GET-only scanners cannot
 *     confirm): https://flaviocopes.com/scanner-safe-double-opt-in/
 *   - "Can a link scanner use up your one-time email link?" (do not consume a token on GET):
 *     https://safeguard.sh/resources/blog/one-time-email-links-and-automatic-get-requests
 * Consequences here: `getOfferByToken` never writes; `respondToOffer` is the only mover, and it is called
 * from a POST handler (same-origin check and rate limit belong to that handler).
 *
 * Rules:
 * - Token: 32 random bytes, base64url. Only its SHA-256 (hex) is stored; the raw token exists in the
 *   emailed link and in the `sendOffer` result (the caller must not log it).
 * - Expiry: the earlier of now + 72 h and the service start (date + start time in `SERVICE_TIME_ZONE`;
 *   midnight when no start time was given). An offer that would already be expired is refused.
 * - `respondToOffer` decides with one conditional UPDATE `WHERE token_hash = ? AND status = 'pending' AND
 *   expires_at > now`. A repeat click returns the current state. Accept also loses to a role that is
 *   already filled: accepting closes the other pending offers for that request and role, and the partial
 *   UNIQUE index `offers_one_accepted_per_role` stops a race that slips through.
 * - Request status is derived: every needed role accepted -> confirmed; otherwise pending offers remain ->
 *   offered; otherwise matching. (A request that names no roles is confirmed by its first acceptance.)
 * - Emails: offer_sent to the musician; on accept offer_accepted_church (musician FIRST name only) and
 *   offer_accepted_staff; on decline offer_declined_staff. Keys are `{kind}:{offerId}`; a failed send
 *   never undoes the decision. The church confirmation says arrival time is "to be confirmed" because the
 *   offer does not store one.
 * - Audit rows hold ids, role and amount only; no names, emails or links.
 */
import { emailIdempotencyKey } from '../email/registry.ts';
import {
  renderOfferAcceptedChurch,
  renderOfferAcceptedStaff,
  renderOfferDeclinedStaff,
  renderOfferSent,
} from '../email/templates.ts';
import { bytesToBase64Url, randomBytes, sha256Hex } from '../security/crypto.ts';
import { newPrefixedId } from '../security/ids.ts';
import type { OutboxOptions, OutboxStatus } from '../services/email-outbox.ts';
import { getRosterMember } from './roster.ts';
import { getServiceRequest, type OfferStatus } from './requests.ts';
import {
  adminUrl,
  allRows,
  auditStatement,
  firstName,
  firstRow,
  formatClockTime,
  formatServiceDate,
  parseStringList,
  sameRole,
  sendEmailSafely,
  serviceTimeZone,
  staffInbox,
  wallTimeToEpoch,
  WorshipError,
  type Db,
  type WorshipEnv,
  type WorshipProgram,
} from './common.ts';

export const OFFER_TTL_SECONDS = 72 * 60 * 60;
const TO_BE_CONFIRMED = 'To be confirmed';

/** The roster programs map to a product label for the outbox (production technicians vs worship). */
const productOf = (program: WorshipProgram) => (program === 'production' ? 'production' : 'worship');

// ---- token -----------------------------------------------------------------------------------------

/** 32 random bytes as base64url (43 characters). */
export function newOfferToken(): string {
  return bytesToBase64Url(randomBytes(32));
}

export async function hashOfferToken(token: string): Promise<string> {
  return sha256Hex(token);
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,64}$/;

// ---- location --------------------------------------------------------------------------------------

/** Best-effort city from `street, City, ST 12345`; null when the address does not look like that. */
export function cityFromAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 0 && /^(usa|u\.s\.a\.|united states)$/i.test(parts[parts.length - 1]!)) parts.pop();
  const stateZip = /^[A-Za-z]{2}(\s+\d{5}(-\d{4})?)?$/;
  const last = parts[parts.length - 1];
  if (parts.length >= 3 && last && stateZip.test(last)) return parts[parts.length - 2]!.slice(0, 80);
  if (parts.length === 2 && last && stateZip.test(last)) return parts[0]!.slice(0, 80);
  return null;
}

function locationText(address: string | null): string {
  return cityFromAddress(address) ?? (address ? address.slice(0, 80) : 'Location to be confirmed');
}

// ---- request status --------------------------------------------------------------------------------

/**
 * Recomputes a request's status from its offers (see the module header). Leaves completed and cancelled
 * requests alone. Safe to run any number of times.
 */
export async function refreshRequestStatus(db: Db, requestId: string): Promise<void> {
  const request = await firstRow<{ status: string; roles_needed_json: string }>(
    db,
    'SELECT status, roles_needed_json FROM service_requests WHERE id = ?',
    requestId,
  );
  if (!request || !['new', 'matching', 'offered', 'confirmed'].includes(request.status)) return;
  const needed = parseStringList(request.roles_needed_json);
  const offers = await allRows<{ role: string; status: string }>(
    db,
    `SELECT role, status FROM offers WHERE request_id = ? AND status IN ('accepted', 'pending')`,
    requestId,
  );
  const accepted = offers.filter((o) => o.status === 'accepted').map((o) => o.role);
  const pending = offers.some((o) => o.status === 'pending');
  const complete =
    accepted.length > 0 && (needed.length === 0 || needed.every((r) => accepted.some((a) => sameRole(a, r))));
  const next = complete ? 'confirmed' : pending ? 'offered' : 'matching';
  if (next === request.status) return;
  await db
    .prepare(
      `UPDATE service_requests SET status = ?2 WHERE id = ?1 AND status IN ('new', 'matching', 'offered', 'confirmed')`,
    )
    .bind(requestId, next)
    .run();
}

// ---- send ------------------------------------------------------------------------------------------

export interface SendOfferInput {
  requestId: string;
  rosterMemberId: string;
  role: string;
  /** Integer USD cents offered to the musician; a positive amount. Never reduced by any Gamo allocation. */
  payCents: number;
  staffId: string;
  /** Public origin of the site that serves `/worship/offers/{token}`, e.g. `https://gamostudio.org`. */
  siteOrigin: string;
  /** Epoch seconds. */
  now: number;
}

export interface SendOfferResult {
  offerId: string;
  /** The emailed link. Contains the raw token: show it to no one and never log it. */
  url: string;
  expiresAt: number;
  /** The outbox outcome for the musician's email (`failed` when it could not be recorded). */
  emailStatus: OutboxStatus | 'failed';
}

function originOf(siteOrigin: string): string {
  try {
    const u = new URL(siteOrigin);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
    return u.origin;
  } catch {
    throw new WorshipError('INVALID_INPUT', 'siteOrigin must be an http(s) origin');
  }
}

export async function sendOffer(
  db: Db,
  env: WorshipEnv,
  input: SendOfferInput,
  options: OutboxOptions = {},
): Promise<SendOfferResult> {
  const { requestId, rosterMemberId, staffId, now } = input;
  const origin = originOf(input.siteOrigin);
  if (!Number.isSafeInteger(input.payCents) || input.payCents <= 0)
    throw new WorshipError('INVALID_INPUT', 'payCents must be a positive integer');
  const requestedRole = input.role.trim();
  if (requestedRole.length < 1 || requestedRole.length > 60)
    throw new WorshipError('INVALID_INPUT', 'invalid role');

  const request = await getServiceRequest(db, requestId);
  if (!request) throw new WorshipError('NOT_FOUND', 'request not found');
  if (!['new', 'matching', 'offered'].includes(request.status))
    throw new WorshipError('INVALID_STATE', `request is ${request.status}`);
  const member = await getRosterMember(db, rosterMemberId);
  if (!member) throw new WorshipError('NOT_FOUND', 'roster member not found');
  if (member.status !== 'active') throw new WorshipError('INVALID_STATE', 'roster member is not active');
  const memberRole = member.roles.find((r) => sameRole(r, requestedRole));
  if (!memberRole) throw new WorshipError('INVALID_INPUT', 'roster member does not have this role');
  const neededRole = request.rolesNeeded.find((r) => sameRole(r, requestedRole));
  if (request.rolesNeeded.length > 0 && !neededRole)
    throw new WorshipError('INVALID_INPUT', 'role is not needed by this request');
  const role = neededRole ?? memberRole;

  const clash = await firstRow<{ status: string }>(
    db,
    `SELECT status FROM offers WHERE request_id = ?1 AND lower(role) = lower(?2)
       AND (status = 'accepted' OR (status = 'pending' AND roster_member_id = ?3)) LIMIT 1`,
    requestId,
    role,
    rosterMemberId,
  );
  if (clash)
    throw new WorshipError(
      'INVALID_STATE',
      clash.status === 'accepted' ? 'this role is already filled' : 'an offer is already pending',
    );

  const start = wallTimeToEpoch(request.serviceDate, request.startTime, serviceTimeZone(env));
  const expiresAt = Math.min(now + OFFER_TTL_SECONDS, start);
  if (expiresAt <= now) throw new WorshipError('INVALID_STATE', 'the service has already started');

  const token = newOfferToken();
  const offerId = newPrefixedId('off');
  await db.batch([
    db
      .prepare(
        `INSERT INTO offers (id, request_id, roster_member_id, role, pay_cents, token_hash, expires_at, status, sent_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8)`,
      )
      .bind(
        offerId,
        requestId,
        rosterMemberId,
        role,
        input.payCents,
        await hashOfferToken(token),
        expiresAt,
        now,
      ),
    db
      .prepare(
        `UPDATE service_requests SET status = 'offered' WHERE id = ?1 AND status IN ('new', 'matching')`,
      )
      .bind(requestId),
    auditStatement(db, {
      actorId: staffId,
      action: 'offer.sent',
      entityType: 'offer',
      entityId: offerId,
      payload: { requestId, rosterMemberId, role, payCents: input.payCents, expiresAt },
      now,
    }),
  ]);

  const url = `${origin}/worship/offers/${token}`;
  const rendered = renderOfferSent({
    musicianName: member.displayName,
    churchName: request.churchName,
    city: locationText(request.address),
    role,
    serviceDate: formatServiceDate(request.serviceDate),
    startTime: request.startTime ? formatClockTime(request.startTime) : TO_BE_CONFIRMED,
    payCents: input.payCents,
    offerUrl: url,
    expiresAtText: new Intl.DateTimeFormat('en-US', {
      timeZone: serviceTimeZone(env),
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(expiresAt * 1000)),
    program: request.program,
  });
  const sent = await sendEmailSafely(
    db,
    env,
    {
      kind: 'offer_sent',
      idempotencyKey: emailIdempotencyKey('offer_sent', offerId),
      to: member.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      relatedType: 'offer',
      relatedId: offerId,
      product: productOf(request.program),
      now,
    },
    options,
  );
  return { offerId, url, expiresAt, emailStatus: sent?.status ?? 'failed' };
}

// ---- view (GET) ------------------------------------------------------------------------------------

export type OfferState = OfferStatus;

export interface OfferDetails {
  churchName: string;
  /** Best-effort city, else the start of the address, else "Location to be confirmed". */
  city: string;
  /** The full address, shown only while the offer is pending or accepted. */
  address: string | null;
  /** `YYYY-MM-DD`. */
  serviceDate: string;
  serviceDateText: string;
  /** `HH:MM` or null. */
  startTime: string | null;
  startTimeText: string | null;
  role: string;
  /** Integer cents; the caller formats it. */
  payCents: number;
  expiresAt: number;
  program: WorshipProgram;
}

export interface OfferView {
  offerId: string;
  state: OfferState;
  /** Null when the offer is withdrawn or expired (nothing about the service is disclosed). */
  details: OfferDetails | null;
}

interface OfferJoinRow {
  id: string;
  request_id: string;
  roster_member_id: string;
  role: string;
  pay_cents: number;
  status: OfferStatus;
  expires_at: number;
  church_name: string;
  contact_name: string | null;
  contact_email_normalized: string;
  service_date: string;
  start_time: string | null;
  address: string | null;
  program: WorshipProgram;
  display_name: string;
}

const OFFER_JOIN = `SELECT o.id, o.request_id, o.roster_member_id, o.role, o.pay_cents, o.status, o.expires_at,
    r.church_name, r.contact_name, r.contact_email_normalized, r.service_date, r.start_time, r.address, r.program,
    m.display_name
  FROM offers o
  JOIN service_requests r ON r.id = o.request_id
  JOIN roster_members m ON m.id = o.roster_member_id`;

async function offerByToken(db: Db, token: string): Promise<OfferJoinRow | null> {
  if (!TOKEN_SHAPE.test(token)) return null;
  return firstRow<OfferJoinRow>(db, `${OFFER_JOIN} WHERE o.token_hash = ?`, await hashOfferToken(token));
}

function stateOf(row: Pick<OfferJoinRow, 'status' | 'expires_at'>, now: number): OfferState {
  return row.status === 'pending' && row.expires_at <= now ? 'expired' : row.status;
}

/** Read-only: never changes anything, so scanners and prefetchers can open the link safely. Null: unknown token. */
export async function getOfferByToken(db: Db, token: string, now: number): Promise<OfferView | null> {
  const row = await offerByToken(db, token);
  if (!row) return null;
  const state = stateOf(row, now);
  if (state === 'withdrawn' || state === 'expired') return { offerId: row.id, state, details: null };
  const open = state === 'pending' || state === 'accepted';
  return {
    offerId: row.id,
    state,
    details: {
      churchName: row.church_name,
      city: locationText(row.address),
      address: open ? row.address : null,
      serviceDate: row.service_date,
      serviceDateText: formatServiceDate(row.service_date),
      startTime: row.start_time,
      startTimeText: row.start_time ? formatClockTime(row.start_time) : null,
      role: row.role,
      payCents: row.pay_cents,
      expiresAt: row.expires_at,
      program: row.program,
    },
  };
}

// ---- respond (POST) --------------------------------------------------------------------------------

export type OfferResponseState =
  'accepted' | 'declined' | 'already_accepted' | 'already_declined' | 'unavailable';

export interface RespondInput {
  token: string;
  action: 'accept' | 'decline';
  /** Epoch seconds. */
  now: number;
}

function currentState(
  row: { status: OfferStatus; expires_at: number } | null,
  now: number,
): OfferResponseState {
  if (!row) return 'unavailable';
  const state = stateOf(row, now);
  if (state === 'accepted') return 'already_accepted';
  if (state === 'declined') return 'already_declined';
  return 'unavailable';
}

const isUniqueViolation = (error: unknown) =>
  /UNIQUE constraint failed/i.test(String((error as Error)?.message));

/**
 * Accepts or declines an offer. Returns `unavailable` for an unknown, withdrawn, expired or superseded
 * offer, and the current state (`already_*`) for a repeat. Call it only from a POST handler.
 */
export async function respondToOffer(
  db: Db,
  env: WorshipEnv,
  input: RespondInput,
  options: OutboxOptions = {},
): Promise<{ state: OfferResponseState }> {
  const { token, action, now } = input;
  if (action !== 'accept' && action !== 'decline') throw new WorshipError('INVALID_INPUT', 'unknown action');
  if (!TOKEN_SHAPE.test(token)) return { state: 'unavailable' };
  const tokenHash = await hashOfferToken(token);

  const decide = async () =>
    action === 'accept'
      ? firstRow<{ id: string; request_id: string; role: string }>(
          db,
          `UPDATE offers SET status = 'accepted', responded_at = ?2
            WHERE token_hash = ?1 AND status = 'pending' AND expires_at > ?2
              AND EXISTS (SELECT 1 FROM service_requests r WHERE r.id = offers.request_id AND r.status IN ('new', 'matching', 'offered'))
              AND EXISTS (SELECT 1 FROM roster_members m WHERE m.id = offers.roster_member_id AND m.status = 'active')
          RETURNING id, request_id, role`,
          tokenHash,
          now,
        )
      : firstRow<{ id: string; request_id: string; role: string }>(
          db,
          `UPDATE offers SET status = 'declined', responded_at = ?2
            WHERE token_hash = ?1 AND status = 'pending' AND expires_at > ?2
          RETURNING id, request_id, role`,
          tokenHash,
          now,
        );

  let won: { id: string; request_id: string; role: string } | null;
  try {
    won = await decide();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Another offer for this request and role was accepted first: this one is closed.
    await db
      .prepare(`UPDATE offers SET status = 'withdrawn' WHERE token_hash = ? AND status = 'pending'`)
      .bind(tokenHash)
      .run();
    return { state: 'unavailable' };
  }

  if (!won) {
    const row = await offerByToken(db, token);
    if (row && row.status === 'pending' && row.expires_at <= now)
      await db
        .prepare(
          `UPDATE offers SET status = 'expired' WHERE id = ? AND status = 'pending' AND expires_at <= ?`,
        )
        .bind(row.id, now)
        .run();
    return { state: currentState(row, now) };
  }

  const row = (await firstRow<OfferJoinRow>(db, `${OFFER_JOIN} WHERE o.id = ?`, won.id)) as OfferJoinRow;
  const base = { offerId: won.id, requestId: won.request_id, role: won.role };
  if (action === 'accept') {
    await db.batch([
      db
        .prepare(
          `UPDATE offers SET status = 'withdrawn'
            WHERE request_id = ?1 AND lower(role) = lower(?2) AND status = 'pending' AND id != ?3`,
        )
        .bind(won.request_id, won.role, won.id),
      auditStatement(db, {
        action: 'offer.accepted',
        entityType: 'offer',
        entityId: won.id,
        payload: base,
        now,
      }),
    ]);
    await refreshRequestStatus(db, won.request_id);
    await sendAcceptEmails(db, env, row, options, now);
    return { state: 'accepted' };
  }
  await db.batch([
    auditStatement(db, {
      action: 'offer.declined',
      entityType: 'offer',
      entityId: won.id,
      payload: base,
      now,
    }),
  ]);
  await refreshRequestStatus(db, won.request_id);
  await sendStaffNotice(db, env, row, false, options, now);
  return { state: 'declined' };
}

async function sendStaffNotice(
  db: Db,
  env: WorshipEnv,
  row: OfferJoinRow,
  accepted: boolean,
  options: OutboxOptions,
  now: number,
): Promise<void> {
  const to = staffInbox(env);
  if (!to) {
    console.warn(
      `[worship] offer ${accepted ? 'accepted' : 'declined'} staff notice skipped: INQUIRY_INBOX_EMAIL is not set`,
    );
    return;
  }
  const payload = {
    musicianName: row.display_name,
    churchName: row.church_name,
    role: row.role,
    serviceDate: formatServiceDate(row.service_date),
    adminUrl: adminUrl(env, `/requests/${row.request_id}`),
  };
  const kind = accepted ? 'offer_accepted_staff' : 'offer_declined_staff';
  const rendered = accepted ? renderOfferAcceptedStaff(payload) : renderOfferDeclinedStaff(payload);
  await sendEmailSafely(
    db,
    env,
    {
      kind,
      idempotencyKey: emailIdempotencyKey(kind, row.id),
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      relatedType: 'offer',
      relatedId: row.id,
      product: 'admin',
      now,
    },
    options,
  );
}

async function sendAcceptEmails(
  db: Db,
  env: WorshipEnv,
  row: OfferJoinRow,
  options: OutboxOptions,
  now: number,
): Promise<void> {
  const church = renderOfferAcceptedChurch({
    churchName: row.church_name,
    contactName: row.contact_name ?? undefined,
    musicianFirstName: firstName(row.display_name) || 'Your musician',
    role: row.role,
    serviceDate: formatServiceDate(row.service_date),
    arrivalTime: `${TO_BE_CONFIRMED} by Gamo Studios`,
    program: row.program,
  });
  await sendEmailSafely(
    db,
    env,
    {
      kind: 'offer_accepted_church',
      idempotencyKey: emailIdempotencyKey('offer_accepted_church', row.id),
      to: row.contact_email_normalized,
      subject: church.subject,
      text: church.text,
      html: church.html,
      relatedType: 'offer',
      relatedId: row.id,
      product: productOf(row.program),
      now,
    },
    options,
  );
  await sendStaffNotice(db, env, row, true, options, now);
}

// ---- withdraw / expire -----------------------------------------------------------------------------

export interface WithdrawInput {
  offerId: string;
  staffId: string;
  now: number;
}

/** Staff withdraws a pending offer; its link then shows "no longer available". Repeating it is harmless. */
export async function withdrawOffer(
  db: Db,
  input: WithdrawInput,
): Promise<{ offerId: string; status: 'withdrawn' }> {
  const { offerId, staffId, now } = input;
  const withdrawn = await firstRow<{ request_id: string; role: string }>(
    db,
    `UPDATE offers SET status = 'withdrawn' WHERE id = ? AND status = 'pending' RETURNING request_id, role`,
    offerId,
  );
  if (!withdrawn) {
    const row = await firstRow<{ status: OfferStatus }>(
      db,
      'SELECT status FROM offers WHERE id = ?',
      offerId,
    );
    if (!row) throw new WorshipError('NOT_FOUND', 'offer not found');
    if (row.status === 'withdrawn') return { offerId, status: 'withdrawn' };
    throw new WorshipError('INVALID_STATE', `offer is ${row.status}`);
  }
  await auditStatement(db, {
    actorId: staffId,
    action: 'offer.withdrawn',
    entityType: 'offer',
    entityId: offerId,
    payload: { requestId: withdrawn.request_id, role: withdrawn.role },
    now,
  }).run();
  await refreshRequestStatus(db, withdrawn.request_id);
  return { offerId, status: 'withdrawn' };
}

/** Marks every pending offer past its expiry as expired (the daily job). Returns how many. */
export async function expireOffers(db: Db, now: number): Promise<number> {
  const rows = await allRows<{ id: string; request_id: string }>(
    db,
    `UPDATE offers SET status = 'expired' WHERE status = 'pending' AND expires_at <= ? RETURNING id, request_id`,
    now,
  );
  if (rows.length === 0) return 0;
  await db.batch(
    rows.map((r) =>
      auditStatement(db, {
        action: 'offer.expired',
        entityType: 'offer',
        entityId: r.id,
        payload: { requestId: r.request_id },
        now,
      }),
    ),
  );
  for (const requestId of new Set(rows.map((r) => r.request_id))) await refreshRequestStatus(db, requestId);
  return rows.length;
}
