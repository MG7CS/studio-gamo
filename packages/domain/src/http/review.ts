/**
 * Admin review form handlers (apps/admin, behind Cloudflare Access + the staff gateway session):
 *
 *   POST /api/review/providers/{id}   church verification and provider review decisions
 *   POST /api/review/events/{id}      organizer first-event review (wraps AdminService.reviewEvent)
 *   POST /api/review/organizers/{id}  "review every event" toggle
 *
 * Order: staff session + Access identity match → same origin → bounded body → validation → one D1 batch.
 * Plain HTML form posts that 303 back to the review pages with the outcome in the query string.
 */
import {
  AuthError,
  requireSameOrigin,
  requireStaff,
  verifyStaffBoundaryIdentity,
  type SessionData,
} from '@gamo/auth';
import { getDb } from '@gamo/db';
import { ContractValidationError, validateContract } from '@gamo/api-contracts/runtime';
import { getRuntimeEnv } from '../api/response.ts';
import { readPublicFormBody, type PublicFormBody } from '../api/public-form-guard.ts';
import { asSqlDatabase, allRows } from '../security/sql-database.ts';
import { AdminService } from '../services/admin.ts';
import {
  notifyProviderOfDecision,
  recordEventReviewDecision,
  reviewProviderProfile,
  ReviewError,
  setOrganizerAlwaysReview,
  latestMeeting,
  assertNotSelfReview,
  type ProviderReviewAction,
  type StaffActor,
} from '../services/provider-review.ts';
import { seeOther } from './account.ts';

type Context = { request: Request; locals?: unknown; params?: Record<string, string | undefined> };

export const DEFAULT_MEETING_TIME_ZONE = 'America/Phoenix';

function formObject(body: PublicFormBody): Record<string, string> {
  const out: Record<string, string> = {};
  if (body.form)
    for (const [k, v] of body.form.entries()) if (typeof v === 'string' && !(k in out)) out[k] = v;
  return out;
}

function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - utcMs;
}

/**
 * `YYYY-MM-DDTHH:MM` wall-clock time in an IANA zone → epoch seconds (DST-safe: the offset is re-read at
 * the candidate instant). Returns null for malformed input or an unknown zone.
 */
export function zonedLocalToEpochSeconds(local: string, timeZone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m || !isTimeZone(timeZone)) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let t = wall - zoneOffsetMs(wall, timeZone);
  t = wall - zoneOffsetMs(t, timeZone);
  return Math.floor(t / 1000);
}

async function staffContext(context: Context) {
  const env = await getRuntimeEnv(context);
  const db = getDb(env.DB);
  const auth: SessionData = await requireStaff(context.request, db, env.SESSION_SECRET);
  await verifyStaffBoundaryIdentity(
    db,
    auth,
    context.locals as Parameters<typeof verifyStaffBoundaryIdentity>[2],
  );
  requireSameOrigin(context.request);
  const staff: StaffActor = {
    userId: auth.user.id,
    name: auth.user.displayName?.trim() || auth.user.email,
    email: auth.user.email,
    personId: auth.personId ?? null,
  };
  return { env, db, sql: asSqlDatabase(env.DB), auth, staff };
}

function query(path: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(path, 'https://gamo.invalid');
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return url.pathname + url.search;
}

function failure(path: string, err: unknown): Response {
  if (err instanceof AuthError)
    return new Response('Staff sign-in required.', {
      status: err.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  if (err instanceof ContractValidationError)
    return seeOther(
      query(path, { error: 'BAD_REQUEST', message: 'The form was incomplete. Reload and try again.' }),
    );
  if (err instanceof ReviewError)
    return seeOther(query(path, { error: err.code, message: err.message, field: err.field }));
  const code = err instanceof Error ? /^([A-Z_]+):/.exec(err.message)?.[1] : undefined;
  if (code === 'CONFLICT')
    return seeOther(
      query(path, {
        error: 'CONFLICT',
        message: 'This event was already reviewed. Reload to see the latest.',
      }),
    );
  if (code === 'FORBIDDEN')
    return seeOther(query(path, { error: 'FORBIDDEN', message: 'You cannot review your own organization.' }));
  if (code === 'NOT_FOUND')
    return seeOther(query(path, { error: 'NOT_FOUND', message: 'That item no longer exists.' }));
  console.error(`[review] failed: ${err instanceof Error ? err.name : 'unknown'}`);
  return seeOther(
    query(path, { error: 'UNAVAILABLE', message: 'Something went wrong. Try again in a moment.' }),
  );
}

/** POST /api/review/providers/{id} */
export async function providerReviewPOST(context: Context): Promise<Response> {
  const id = String(context.params?.id ?? '');
  const detail = `/review/providers/${encodeURIComponent(id)}`;
  try {
    const { env, sql, staff } = await staffContext(context);
    const read = await readPublicFormBody(context.request);
    if (!read.ok) return seeOther(query(detail, { error: read.error.code, message: read.error.message }));
    const form = validateContract('ProviderReviewForm', formObject(read.body));
    const zone = form.meeting_zone?.trim() || DEFAULT_MEETING_TIME_ZONE;
    if (form.action === 'schedule_meeting' && !isTimeZone(zone))
      return seeOther(
        query(detail, { error: 'INVALID', message: 'Choose a valid time zone.', field: 'meeting_zone' }),
      );
    const meetingAt = form.meeting_at ? zonedLocalToEpochSeconds(form.meeting_at, zone) : null;
    if (form.action === 'schedule_meeting' && form.meeting_at && meetingAt === null)
      return seeOther(
        query(detail, { error: 'INVALID', message: 'Enter the meeting date and time.', field: 'meeting_at' }),
      );
    const now = Math.floor(Date.now() / 1000);
    const result = await reviewProviderProfile(sql, {
      profileId: id,
      action: form.action as ProviderReviewAction,
      expectedStatus: form.expected_status,
      staff,
      notes: form.notes,
      meetingAt,
      meetingLocation: form.meeting_location,
      meetingStaff: form.meeting_staff,
      now,
    });
    const meeting =
      form.action === 'schedule_meeting' && meetingAt
        ? { at: meetingAt, location: form.meeting_location ?? null, timeZone: zone }
        : form.action === 'verify'
          ? await latestMeeting(sql, id).then((m) =>
              m ? { at: m.meetingAt, location: m.location, timeZone: zone } : null,
            )
          : null;
    const productSites = (env as Record<string, unknown>)[
      `PUBLIC_SITE_URL_${result.profile.productOrigin.toUpperCase()}`
    ];
    const accountUrl = `${typeof productSites === 'string' ? productSites.replace(/\/+$/, '') : ''}/account/profile`;
    const notified = await notifyProviderOfDecision(sql, env, {
      result,
      action: form.action as ProviderReviewAction,
      message: form.notes ?? null,
      meeting,
      accountUrl,
      now,
    });
    return seeOther(query(detail, { done: form.action, email: notified.status }));
  } catch (err) {
    return failure(detail, err);
  }
}

/** POST /api/review/events/{id} */
export async function eventReviewPOST(context: Context): Promise<Response> {
  const id = String(context.params?.id ?? '');
  const list = '/review/events';
  try {
    const { db, sql, staff } = await staffContext(context);
    const read = await readPublicFormBody(context.request);
    if (!read.ok) return seeOther(query(list, { error: read.error.code, message: read.error.message }));
    const form = validateContract('EventReviewForm', formObject(read.body));
    const [event] = await allRows<{ organizer_id: string }>(sql, {
      sql: 'SELECT organizer_id FROM events WHERE id = ?1',
      params: [id],
    });
    if (!event) return seeOther(query(list, { error: 'NOT_FOUND', message: 'That event no longer exists.' }));
    if (form.decision !== 'approved' && !form.notes?.trim())
      return seeOther(
        query(list, {
          error: 'INVALID',
          message: 'Add a note for the organizer explaining the decision.',
          event: id,
        }),
      );
    // Same self-moderation rule as every other review action, before the event changes (D-106).
    await assertNotSelfReview(
      sql,
      staff,
      { kind: 'organizer', organizerProfileId: event.organizer_id },
      Math.floor(Date.now() / 1000),
    );
    await new AdminService(db).reviewEvent(staff.userId, id, { decision: form.decision, notes: form.notes });
    const recorded = await recordEventReviewDecision(sql, {
      eventId: id,
      organizerProfileId: event.organizer_id,
      decision: form.decision,
      staff,
      notes: form.notes,
      now: Math.floor(Date.now() / 1000),
    });
    return seeOther(query(list, { done: form.decision, first: recorded.firstApproval ? '1' : null }));
  } catch (err) {
    return failure(list, err);
  }
}

/** POST /api/review/organizers/{id} */
export async function organizerReviewPOST(context: Context): Promise<Response> {
  const id = String(context.params?.id ?? '');
  const list = '/review/events';
  try {
    const { sql, staff } = await staffContext(context);
    const read = await readPublicFormBody(context.request);
    if (!read.ok) return seeOther(query(list, { error: read.error.code, message: read.error.message }));
    const form = validateContract('OrganizerReviewForm', formObject(read.body));
    const changed = await setOrganizerAlwaysReview(sql, {
      organizerProfileId: id,
      alwaysReview: form.always_review === 'on',
      staff,
      now: Math.floor(Date.now() / 1000),
    });
    if (!changed)
      return seeOther(query(list, { error: 'NOT_FOUND', message: 'That organizer no longer exists.' }));
    return seeOther(
      query(list, { done: form.always_review === 'on' ? 'always_review_on' : 'always_review_off' }),
    );
  } catch (err) {
    return failure(list, err);
  }
}
