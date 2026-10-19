/**
 * First-event review. Every organizer's first event is reviewed; later events publish directly unless the
 * organizer is set to "review every event". The list is the same query the sidebar count tallies (status
 * `pending_review`), oldest submission first. Decisions go through AdminService.reviewEvent (conditional status
 * change plus a `verification_records` row); the organizer switch through setOrganizerAlwaysReview.
 */
import { requireSameOrigin } from '@gamo/auth';
import type { GamoEnv } from '@gamo/config/env';
import { getDb } from '@gamo/db';
import { AdminService, setOrganizerAlwaysReview } from '@gamo/domain';
import { allRows, asSqlDatabase } from '@gamo/domain/security';

export interface PendingEvent {
  id: string;
  title: string;
  tagline: string | null;
  category: string;
  description: string;
  venue: string;
  city: string;
  state: string;
  admission: string;
  organizationName: string;
  /** Epoch seconds. */
  startsAt: number;
  timezone: string;
  submittedAt: number;
  organizerId: string;
  /** The organizer has no approved event yet. */
  firstEvent: boolean;
  alwaysReview: boolean;
}

export async function loadPendingEvents(binding: unknown): Promise<PendingEvent[]> {
  const rows = await allRows<{
    id: string;
    title: string;
    tagline: string | null;
    category: string;
    description: string;
    venue_name: string;
    city: string;
    state: string;
    admission_type: string;
    organization_name: string;
    starts_at: number;
    timezone: string | null;
    created_at: number;
    organizer_id: string;
    first_event_approved_at: number | null;
    always_review: number;
  }>(asSqlDatabase(binding), {
    sql: `SELECT e.id, e.title, e.tagline, e.category, e.description, e.venue_name, e.city, e.state,
                 e.admission_type, g.name AS organization_name, e.starts_at, e.timezone, e.created_at,
                 o.id AS organizer_id, o.first_event_approved_at, o.always_review
            FROM events e
            JOIN organizer_profiles o ON o.id = e.organizer_id
            JOIN organizations g ON g.id = o.organization_id
           WHERE e.status = 'pending_review'
           ORDER BY e.created_at ASC, e.id ASC`,
    params: [],
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    tagline: r.tagline,
    category: r.category,
    description: r.description,
    venue: r.venue_name,
    city: r.city,
    state: r.state,
    admission: r.admission_type,
    organizationName: r.organization_name,
    startsAt: Number(r.starts_at),
    timezone: r.timezone || 'America/Phoenix',
    submittedAt: Number(r.created_at),
    organizerId: r.organizer_id,
    firstEvent: r.first_event_approved_at === null,
    alwaysReview: Number(r.always_review) === 1,
  }));
}

/** What a decision did, from the redirect that follows it. Only fixed vocabulary is ever shown. */
const DONE_TEXT: Record<string, string> = {
  approved: 'Event approved.',
  rejected: 'Event rejected.',
  revision_requested: 'Changes requested.',
  always_review_on: 'Every event of this organizer will now be reviewed.',
  always_review_off: 'Only the first event of this organizer is reviewed now.',
};

export function outcomeFrom(url: URL): string | null {
  const done = url.searchParams.get('done');
  if (!done || !(done in DONE_TEXT)) return null;
  return `${DONE_TEXT[done]}${url.searchParams.get('first') === '1' ? ' This was the organizer’s first approved event.' : ''}`;
}

export type EventOutcome = { ok: true; location: string } | { ok: false; status: number; message: string };

const fail = (status: number, message: string): EventOutcome => ({ ok: false, status, message });
const text = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

/** Applies one form POST from the events page: a decision on an event, or the organizer's review switch. */
export async function handleEventForm(
  request: Request,
  env: GamoEnv,
  adminName: string,
): Promise<EventOutcome> {
  try {
    requireSameOrigin(request);
  } catch {
    return fail(403, 'That request came from another site and was refused.');
  }
  const form = await request.formData();
  const kind = text(form, 'kind');
  try {
    if (kind === 'organizer') {
      const on = text(form, 'always_review') === 'on';
      const changed = await setOrganizerAlwaysReview(asSqlDatabase(env.DB), {
        organizerProfileId: text(form, 'organizer_id'),
        alwaysReview: on,
        actor: { name: adminName },
        now: Math.floor(Date.now() / 1000),
      });
      if (!changed) return fail(404, 'That organizer no longer exists.');
      return { ok: true, location: `/events?done=${on ? 'always_review_on' : 'always_review_off'}` };
    }
    if (kind === 'decision') {
      const decision = text(form, 'decision');
      if (decision !== 'approved' && decision !== 'rejected' && decision !== 'revision_requested')
        return fail(400, 'Choose approve, ask for changes or reject.');
      const notes = text(form, 'notes').trim().slice(0, 2000);
      if (decision !== 'approved' && !notes) return fail(400, 'Add a note explaining the decision.');
      const result = await new AdminService(getDb(env.DB)).reviewEvent(
        { name: adminName },
        text(form, 'event_id'),
        {
          decision,
          notes: notes || undefined,
        },
      );
      return { ok: true, location: `/events?done=${decision}${result.firstApproval ? '&first=1' : ''}` };
    }
    return fail(400, 'The form was incomplete. Reload and try again.');
  } catch (error) {
    const code = error instanceof Error ? /^([A-Z_]+):/.exec(error.message)?.[1] : undefined;
    if (code === 'CONFLICT') return fail(409, 'That event was already reviewed. Reload to see the latest.');
    if (code === 'NOT_FOUND') return fail(404, 'That event no longer exists.');
    console.error(`[admin] event review failed: ${error instanceof Error ? error.name : 'unknown'}`);
    return fail(500, 'Something went wrong. Try again in a moment.');
  }
}
