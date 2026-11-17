/**
 * The staff actions of the roster and request screens, one function each. The pages (form posts) and the
 * API routes (JSON) both call these, so a rule lives once. Every function takes an explicit context, throws
 * `WorshipError` for expected refusals (classified by `notices.ts`) and never returns or logs an offer link.
 *
 * Ranking and listing never use anything commercial: candidates are ordered by display name, then id.
 */
import {
  getRequest,
  getRosterMember,
  isIsoDate,
  markW9Received,
  searchRoster,
  sendOffer,
  setRequestStatus,
  setRosterStatus,
  withdrawOffer,
  WorshipError,
  sameRole,
  STAFF_REQUEST_STATUSES,
  ROSTER_STATUSES,
  type Db,
  type RequestDetail,
  type RosterMember,
  type RosterStatus,
  type WorshipEnv,
} from '@gamo/domain/worship';
import { siteOrigin } from '@studio-gamo/ui/lib/sites';
import { dollarsToCents, parseCents, validateOfferCents } from './money';

type SendOfferOptions = Parameters<typeof sendOffer>[3];

export interface WorshipCtx {
  sql: Db;
  env: WorshipEnv;
  /** The acting staff user's id (audit rows). */
  staffId: string;
  /** Epoch seconds. */
  now: number;
  /** Outbox options (tests pass a fake fetch). */
  mail?: SendOfferOptions;
}

/** The public web origin that serves `/worship/offers/{token}` (the wrangler var, else the shared helper). */
export function publicWebOrigin(env: WorshipEnv): string {
  const explicit = (env as { PUBLIC_SITE_URL_WEB?: string }).PUBLIC_SITE_URL_WEB?.trim();
  if (explicit) {
    try {
      const url = new URL(explicit);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
    } catch {
      // fall through to the shared helper
    }
  }
  return siteOrigin('web');
}

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

// ---- offers ----------------------------------------------------------------------------------------

export interface ProposeInput {
  rosterMemberId?: unknown;
  role?: unknown;
  /** The API contract field: integer USD cents. Wins over `payDollars` when both are sent. */
  payCents?: unknown;
  /** The screen's field: dollars typed by staff, converted to integer cents here. */
  payDollars?: unknown;
}

export interface ProposedOffer {
  offerId: string;
  /** Epoch seconds. */
  expiresAt: number;
  memberName: string;
  role: string;
  payCents: number;
  requestStatus: string;
  /** False when the email could not be handed to the provider (the offer exists; staff may withdraw it). */
  emailed: boolean;
}

const UNDELIVERED = new Set(['failed', 'not_configured', 'suppressed', 'bounced', 'complained']);

function payCentsOf(input: ProposeInput): number | null {
  if (input.payCents !== undefined && input.payCents !== '') return parseCents(input.payCents);
  return dollarsToCents(input.payDollars);
}

/**
 * Sends an offer. The emailed link is created inside `sendOffer` and dropped here: the result carries
 * the offer id, expiry, the musician's name and the request's new status, nothing that reveals the token.
 */
export async function proposeOffer(
  ctx: WorshipCtx,
  requestId: string,
  input: ProposeInput,
): Promise<ProposedOffer> {
  const rosterMemberId = typeof input.rosterMemberId === 'string' ? input.rosterMemberId.trim() : '';
  if (!rosterMemberId || rosterMemberId.length > 100)
    throw new WorshipError('INVALID_INPUT', 'roster member is required');
  const role = typeof input.role === 'string' ? input.role.trim() : '';
  if (!role || role.length > 60) throw new WorshipError('INVALID_INPUT', 'invalid role');
  const payCents = payCentsOf(input);
  if (!validateOfferCents(payCents))
    throw new WorshipError('INVALID_INPUT', 'payCents must be a positive integer within the cap');

  const sent = await sendOffer(
    ctx.sql,
    ctx.env,
    {
      requestId,
      rosterMemberId,
      role,
      payCents,
      staffId: ctx.staffId,
      siteOrigin: publicWebOrigin(ctx.env),
      now: ctx.now,
    },
    ctx.mail,
  );
  const [member, request] = await Promise.all([
    getRosterMember(ctx.sql, rosterMemberId),
    getRequest(ctx.sql, requestId),
  ]);
  const offer = request?.offers.find((o) => o.id === sent.offerId);
  return {
    offerId: sent.offerId,
    expiresAt: sent.expiresAt,
    memberName: member?.displayName ?? '',
    role: offer?.role ?? role,
    payCents,
    requestStatus: request?.status ?? 'offered',
    emailed: !UNDELIVERED.has(sent.emailStatus),
  };
}

export interface WithdrawnOffer {
  offerId: string;
  requestId: string;
  status: 'withdrawn';
}

/** Withdraws a pending offer; repeating it is harmless. The request id is returned for the redirect. */
export async function withdrawPendingOffer(ctx: WorshipCtx, offerId: string): Promise<WithdrawnOffer> {
  const row = (await ctx.sql.prepare('SELECT request_id FROM offers WHERE id = ?').bind(offerId).first()) as {
    request_id: string;
  } | null;
  if (!row) throw new WorshipError('NOT_FOUND', 'offer not found');
  const out = await withdrawOffer(ctx.sql, { offerId, staffId: ctx.staffId, now: ctx.now });
  return { offerId: out.offerId, requestId: row.request_id, status: 'withdrawn' };
}

// ---- roster ----------------------------------------------------------------------------------------

export interface RosterStatusResult {
  member: RosterMember;
  changed: boolean;
}

export async function changeRosterStatus(
  ctx: WorshipCtx,
  rosterMemberId: string,
  status: unknown,
): Promise<RosterStatusResult> {
  if (typeof status !== 'string' || !(ROSTER_STATUSES as readonly string[]).includes(status))
    throw new WorshipError('INVALID_INPUT', 'unknown roster status');
  const before = await getRosterMember(ctx.sql, rosterMemberId);
  if (!before) throw new WorshipError('NOT_FOUND', 'roster member not found');
  const member = await setRosterStatus(ctx.sql, {
    rosterMemberId,
    status: status as RosterStatus,
    staffId: ctx.staffId,
    now: ctx.now,
  });
  return { member, changed: before.status !== member.status };
}

/** The most W-9 dates may lie in the future (time-zone slack): one day. */
const FUTURE_SLACK_SECONDS = 86_400;

/**
 * Records the date a W-9 arrived (a date only; no tax identifiers exist anywhere). `date` is `YYYY-MM-DD`,
 * empty means "today", and `clear` removes the record. Stored as that date at UTC midnight.
 */
export async function recordW9(
  ctx: WorshipCtx,
  rosterMemberId: string,
  input: { date?: unknown; clear?: boolean },
): Promise<RosterMember> {
  if (input.clear) return markW9Received(ctx.sql, { ...base(ctx, rosterMemberId), receivedAt: null });
  const raw = typeof input.date === 'string' ? input.date.trim() : '';
  if (!raw) return markW9Received(ctx.sql, base(ctx, rosterMemberId));
  if (!isIsoDate(raw)) throw new WorshipError('INVALID_INPUT', 'invalid received date');
  const receivedAt = Date.parse(`${raw}T00:00:00Z`) / 1000;
  if (receivedAt > ctx.now + FUTURE_SLACK_SECONDS)
    throw new WorshipError('INVALID_INPUT', 'invalid received date');
  return markW9Received(ctx.sql, { ...base(ctx, rosterMemberId), receivedAt });
}

const base = (ctx: WorshipCtx, rosterMemberId: string) => ({
  rosterMemberId,
  staffId: ctx.staffId,
  now: ctx.now,
});

// ---- requests --------------------------------------------------------------------------------------

export type StaffRequestStatus = (typeof STAFF_REQUEST_STATUSES)[number];

export interface RequestStatusResult {
  status: string;
  changed: boolean;
}

/**
 * matching, completed or cancelled. Cancelling needs `confirm` (the form's tick box) so a stray click
 * cannot cancel a church's booking; the domain then withdraws every pending offer.
 */
export async function changeRequestStatus(
  ctx: WorshipCtx,
  requestId: string,
  input: { status?: unknown; confirm?: unknown },
): Promise<RequestStatusResult> {
  const status = input.status;
  if (typeof status !== 'string' || !(STAFF_REQUEST_STATUSES as readonly string[]).includes(status))
    throw new WorshipError('INVALID_INPUT', 'status is managed by the offer flow');
  if (status === 'cancelled' && !isTicked(input.confirm))
    throw new WorshipError('INVALID_INPUT', 'cancel needs confirmation');
  const before = await getRequest(ctx.sql, requestId);
  if (!before) throw new WorshipError('NOT_FOUND', 'request not found');
  const after = await setRequestStatus(ctx.sql, {
    requestId,
    status: status as StaffRequestStatus,
    staffId: ctx.staffId,
    now: ctx.now,
  });
  return { status: after.status, changed: before.status !== after.status };
}

const isTicked = (v: unknown): boolean =>
  v === true || v === 'yes' || v === 'on' || v === 'true' || v === '1';

// ---- candidates ------------------------------------------------------------------------------------

export interface RoleCandidate {
  member: RosterMember;
  /** An offer already pending for this member and role (so the form is replaced by a note). */
  pendingOfferId: string | null;
}

export interface RolePanel {
  /** The role as the request spells it. */
  role: string;
  candidates: RoleCandidate[];
  /** The member who accepted this role, if any. */
  acceptedBy: { name: string; offerId: string } | null;
}

const CANDIDATE_LIMIT = 100;

/**
 * Candidates for one needed role: active roster members who list the role (case-insensitive) in the
 * request's city when that can be read from the address, ordered by name then id. A member in another city
 * is not shown; when no one in the city holds the role the panel says so and `widenCity` shows the rest.
 * Availability is not modelled anywhere: staff check it by contact.
 */
export async function candidatesForRole(
  sql: Db,
  request: RequestDetail,
  role: string,
  options: { city: string | null; widenCity?: boolean },
): Promise<RolePanel> {
  const page = await searchRoster(sql, {
    role,
    status: 'active',
    program: request.program === 'production' ? 'production' : 'worship',
    ...(options.city && !options.widenCity ? { city: options.city } : {}),
    limit: CANDIDATE_LIMIT,
  });
  const pending = new Map(
    request.offers
      .filter((o) => o.status === 'pending' && sameRole(o.role, role))
      .map((o) => [o.rosterMemberId, o.id] as const),
  );
  const accepted = request.offers.find((o) => o.status === 'accepted' && sameRole(o.role, role));
  return {
    role,
    candidates: page.members.map((member) => ({ member, pendingOfferId: pending.get(member.id) ?? null })),
    acceptedBy: accepted ? { name: accepted.memberName, offerId: accepted.id } : null,
  };
}
