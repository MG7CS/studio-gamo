/**
 * The HTTP side of the roster and request areas: JSON and form-post answers for the API routes, and the
 * page POST handlers. Each function receives the already authenticated `AdminContext` (the route or page
 * calls `adminApi` / `adminPage`, which also enforce same origin), so these only read the body, run the
 * action and answer.
 *
 * Answers: JSON clients get `{ success, data }` or the standard error body; browsers get `303` back to the
 * screen with `?notice=<key>`. No answer, notice or log ever contains an offer link or token.
 */
import { errorResponse, jsonResponse } from '@gamo/domain';
import { WorshipError, searchRoster, type RosterMember } from '@gamo/domain/worship';
import { jsonOrSee, readBody, see, wantsJson, type AdminContext } from '../admin-page';
import {
  changeRequestStatus,
  changeRosterStatus,
  nowSeconds,
  proposeOffer,
  recordW9,
  withdrawPendingOffer,
  type WorshipCtx,
} from './actions';
import { parseRosterFilters } from './filters';
import { classifyWorshipError, errorEntry, type ErrorSubject } from './notices';

export interface HandlerDeps {
  now?: number;
  mail?: WorshipCtx['mail'];
}

export const ID_SHAPE = /^[A-Za-z0-9_-]{1,100}$/;

function worshipCtx(admin: AdminContext, deps: HandlerDeps = {}): WorshipCtx {
  return {
    sql: admin.db,
    env: admin.env,
    staffId: admin.auth.user.id,
    now: deps.now ?? nowSeconds(),
    ...(deps.mail ? { mail: deps.mail } : {}),
  };
}

const iso = (epoch: number | null): string | null =>
  epoch === null ? null : new Date(epoch * 1000).toISOString();

const requestPath = (id: string, fragment = '', query = '') =>
  `/requests/${encodeURIComponent(id)}${query ? `?${query}` : ''}${fragment}`;
const rosterPath = (id: string, fragment = '') => `/roster/${encodeURIComponent(id)}${fragment}`;

/**
 * A refused action: the JSON error (status from the catalog) or the redirect with the error notice.
 * Anything that is not an expected domain refusal is rethrown.
 */
function refuse(request: Request, location: string, err: unknown, subject: ErrorSubject): Response {
  const classified = classifyWorshipError(err, subject);
  if (!classified) throw err;
  if (wantsJson(request)) return errorResponse(classified.code, classified.text, classified.status);
  return see(location, classified.key);
}

const notFound = (request: Request, location: string): Response =>
  refuse(request, location, new WorshipError('NOT_FOUND', 'record not found'), 'request');

/** Reads the body; a malformed or oversized one is the `Response` `readBody` throws. */
async function body(request: Request): Promise<Record<string, string | string[]> | Response> {
  try {
    return await readBody(request);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

// ---- GET /api/roster -------------------------------------------------------------------------------

/** The OpenAPI `RosterMember` shape: timestamps as ISO strings, no tax identifiers. */
export function rosterMemberJson(m: RosterMember) {
  return {
    id: m.id,
    submissionId: m.submissionId,
    program: m.program,
    displayName: m.displayName,
    email: m.email,
    phone: m.phone,
    roles: m.roles,
    city: m.city,
    canTeach: m.canTeach,
    status: m.status,
    w9ReceivedAt: iso(m.w9ReceivedAt),
    approvedAt: iso(m.approvedAt),
  };
}

export async function handleListRoster(admin: AdminContext, url: URL): Promise<Response> {
  const { search, invalid } = parseRosterFilters(url.searchParams);
  if (invalid.length > 0) {
    const e = errorEntry('filter-invalid');
    return errorResponse(e.code, e.text, e.status);
  }
  try {
    const page = await searchRoster(admin.db, search);
    return jsonResponse(
      page.members.map(rosterMemberJson),
      200,
      { nextCursor: page.nextCursor },
      {
        'Cache-Control': 'no-store',
      },
    );
  } catch (err) {
    const classified = classifyWorshipError(err, 'roster');
    if (!classified) throw err;
    return errorResponse(classified.code, classified.text, classified.status);
  }
}

// ---- POST /api/requests/{id}/offers ----------------------------------------------------------------

export async function handleSendOffer(
  admin: AdminContext,
  request: Request,
  requestId: string,
  deps: HandlerDeps = {},
): Promise<Response> {
  const fallback = requestPath(requestId);
  const fields = await body(request);
  if (fields instanceof Response) return fields;
  if (!ID_SHAPE.test(requestId)) return notFound(request, '/requests');
  try {
    const offer = await proposeOffer(worshipCtx(admin, deps), requestId, {
      rosterMemberId: one(fields.rosterMemberId),
      role: one(fields.role),
      payCents: one(fields.payCents),
      payDollars: one(fields.payDollars),
    });
    return jsonOrSee(request, {
      // The contract answers with the offer id and expiry only; the link is never part of an answer.
      data: { offerId: offer.offerId, expiresAt: iso(offer.expiresAt) },
      // `offer` lets the page say "Offer sent to <name>" and the expiry; an offer id is not a secret.
      location: requestPath(requestId, '', `offer=${encodeURIComponent(offer.offerId)}`),
      notice: offer.emailed ? 'offer-sent' : 'offer-sent-email-failed',
    });
  } catch (err) {
    return refuse(request, fallback, err, 'offer_request');
  }
}

// ---- POST /api/offers/{id}/withdraw ----------------------------------------------------------------

export async function handleWithdrawOffer(
  admin: AdminContext,
  request: Request,
  offerId: string,
  deps: HandlerDeps = {},
): Promise<Response> {
  const fields = await body(request);
  if (fields instanceof Response) return fields;
  const returnTo = safeRequestId(one(fields.requestId));
  const fallback = returnTo ? requestPath(returnTo) : '/requests';
  if (!ID_SHAPE.test(offerId)) return notFound(request, fallback);
  try {
    const out = await withdrawPendingOffer(worshipCtx(admin, deps), offerId);
    return jsonOrSee(request, {
      data: { offerId: out.offerId, status: out.status },
      location: requestPath(out.requestId),
      notice: 'offer-withdrawn',
    });
  } catch (err) {
    return refuse(request, fallback, err, 'request');
  }
}

/** The optional `requestId` a form sends so a refused withdraw can return to the same request. */
function safeRequestId(value: string | undefined): string | null {
  return value && ID_SHAPE.test(value) ? value : null;
}

// ---- page POSTs: roster member and request detail --------------------------------------------------

/** `intent=status` (status + Apply) or `intent=w9` (mark or clear the W-9 date) on `/roster/{id}`. */
export async function handleRosterPost(
  admin: AdminContext,
  request: Request,
  id: string,
  deps: HandlerDeps = {},
): Promise<Response> {
  const location = rosterPath(id);
  const fields = await body(request);
  if (fields instanceof Response) return fields;
  if (!ID_SHAPE.test(id))
    return refuse(request, '/roster', new WorshipError('NOT_FOUND', 'roster member not found'), 'roster');
  const ctx = worshipCtx(admin, deps);
  try {
    if (one(fields.intent) === 'w9') {
      const clear = one(fields.clear) !== undefined;
      await recordW9(ctx, id, { date: one(fields.date), clear });
      return jsonOrSee(request, {
        data: { id },
        location,
        notice: clear ? 'w9-cleared' : 'w9-recorded',
      });
    }
    const out = await changeRosterStatus(ctx, id, one(fields.status));
    return jsonOrSee(request, {
      data: { id, status: out.member.status },
      location,
      notice: out.changed ? `status-${out.member.status}` : 'status-unchanged',
    });
  } catch (err) {
    return refuse(request, location, err, 'roster');
  }
}

/** `status` (+ `confirm` for cancel) on `/requests/{id}`. */
export async function handleRequestPost(
  admin: AdminContext,
  request: Request,
  id: string,
  deps: HandlerDeps = {},
): Promise<Response> {
  const location = requestPath(id);
  const fields = await body(request);
  if (fields instanceof Response) return fields;
  if (!ID_SHAPE.test(id)) return notFound(request, '/requests');
  try {
    const out = await changeRequestStatus(worshipCtx(admin, deps), id, {
      status: one(fields.status),
      confirm: one(fields.confirm),
    });
    return jsonOrSee(request, {
      data: { id, status: out.status },
      location,
      notice: out.changed ? `status-${out.status}` : 'status-unchanged',
    });
  } catch (err) {
    return refuse(request, location, err, 'request');
  }
}
