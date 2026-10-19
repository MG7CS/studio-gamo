/**
 * Data for the review pages (`/review/churches`, `/review/providers`, `/review/providers/[id]`,
 * `/review/events`). Read-only: decisions are POSTed to the `/api/review/*` routes. Every list comes from a
 * D1 query; an empty result is shown as an empty state, never replaced with sample rows.
 */
import {
  availableReviewActions,
  getProviderProfile,
  listReviewQueue,
  listVerificationRecords,
  ONBOARDING_STEPS,
  providerStatusLabel,
  roleLabel,
  type ProviderProfile,
} from '@gamo/domain';
import { allRows, asSqlDatabase } from '@gamo/domain/security';
import type { ProviderRole } from '@gamo/domain/types';
import { OPEN_PROFILE_STATUSES, STATUS_FILTERS } from './review-scope';

export const QUEUE_LIMIT = 100;

/** The result of a staff decision, read from the redirect's query string (see packages/domain/src/http/review.ts). */
export function outcomeFrom(url: URL): { tone: 'success' | 'error'; text: string } | null {
  const message = url.searchParams.get('message');
  if (url.searchParams.get('error'))
    return { tone: 'error', text: message || 'That did not work. Reload and try again.' };
  const done = url.searchParams.get('done');
  if (!done) return null;
  const email = url.searchParams.get('email');
  const emailText =
    email === 'sent' || email === 'delivered' || email === 'queued'
      ? ' The provider was emailed.'
      : email === 'not_configured'
        ? ' Email is not configured here, so the provider was NOT emailed — tell them another way.'
        : email && email !== 'skipped'
          ? ` The email could not be sent (${email}); it will be retried.`
          : '';
  const labels: Record<string, string> = {
    schedule_meeting: 'Meeting scheduled.',
    start_review: 'Marked as in review.',
    verify: 'Verified.',
    request_changes: 'Changes requested.',
    reject: 'Rejected.',
    suspend: 'Suspended.',
    reinstate: 'Reinstated for review.',
    approved: 'Event approved.',
    rejected: 'Event rejected.',
    revision_requested: 'Revision requested.',
    always_review_on: 'Every event of this organizer will now be reviewed.',
    always_review_off: 'Only the first event of this organizer is reviewed now.',
  };
  const first =
    url.searchParams.get('first') === '1' ? ' This was the organizer’s first approved event.' : '';
  return { tone: 'success', text: `${labels[done] ?? 'Saved.'}${first}${emailText}` };
}

export interface QueueView {
  filter: string;
  roleFilter: string | null;
  filters: string[];
  /** True when the list was cut off at QUEUE_LIMIT. */
  truncated: boolean;
  items: {
    id: string;
    displayName: string;
    roleLabel: string;
    statusLabel: string;
    productOrigin: string;
    updatedAt: number;
    href: string;
  }[];
}

export async function loadQueue(
  binding: unknown,
  roles: readonly ProviderRole[],
  url: URL,
): Promise<QueueView> {
  const requested = url.searchParams.get('status') ?? 'open';
  const filter = requested in STATUS_FILTERS ? requested : 'open';
  const statuses = STATUS_FILTERS[filter] ?? OPEN_PROFILE_STATUSES;
  const roleFilter = url.searchParams.get('role');
  const activeRoles =
    roleFilter && roles.includes(roleFilter as ProviderRole) ? [roleFilter as ProviderRole] : roles;
  // One extra row tells us whether the list was cut off.
  const items = await listReviewQueue(asSqlDatabase(binding), {
    roles: activeRoles,
    statuses,
    limit: QUEUE_LIMIT + 1,
  });
  return {
    filter,
    roleFilter: activeRoles.length === 1 && roles.length > 1 ? activeRoles[0] : null,
    filters: Object.keys(STATUS_FILTERS),
    truncated: items.length > QUEUE_LIMIT,
    items: items.slice(0, QUEUE_LIMIT).map((i) => ({
      ...i,
      roleLabel: roleLabel(i.role),
      statusLabel: providerStatusLabel(i.status),
      href: `/review/providers/${encodeURIComponent(i.id)}`,
    })),
  };
}

export interface ProviderDetailView {
  profile: ProviderProfile;
  roleLabel: string;
  statusLabel: string;
  personEmail: string | null;
  fields: { label: string; value: string }[];
  actions: string[];
  history: Awaited<ReturnType<typeof listVerificationRecords>>;
}

export async function loadProviderDetail(binding: unknown, id: string): Promise<ProviderDetailView | null> {
  const db = asSqlDatabase(binding);
  const profile = await getProviderProfile(db, id);
  if (!profile) return null;
  const person = (await db
    .prepare('SELECT email_normalized, erased_at FROM persons WHERE id = ?1')
    .bind(profile.personId)
    .first()) as { email_normalized: string; erased_at: number | null } | null;
  const fields = ONBOARDING_STEPS[profile.role].flatMap((step) =>
    step.fields.map((f) => {
      const v = profile.fields[f.name];
      const value = Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : (v ?? '');
      return { label: f.label.replace(/ \(optional\)$/, ''), value: value || '—' };
    }),
  );
  return {
    profile,
    roleLabel: roleLabel(profile.role),
    statusLabel: providerStatusLabel(profile.status),
    personEmail: person && person.erased_at === null ? person.email_normalized : null,
    fields,
    actions: availableReviewActions(profile),
    history: await listVerificationRecords(db, 'provider_profile', id),
  };
}

export interface PendingEvent {
  id: string;
  title: string;
  organizationName: string;
  /** Epoch seconds. */
  startsAt: number;
  timezone: string;
  organizerId: string;
  /** The organizer has no approved event yet. */
  firstEvent: boolean;
  alwaysReview: boolean;
}

/** Events in `pending_review`, newest submission first: the same rows the sidebar count tallies. */
export async function loadPendingEvents(binding: unknown): Promise<PendingEvent[]> {
  const rows = await allRows<{
    id: string;
    title: string;
    organization_name: string;
    starts_at: number;
    timezone: string | null;
    organizer_id: string;
    first_event_approved_at: number | null;
    always_review: number;
  }>(asSqlDatabase(binding), {
    sql: `SELECT e.id, e.title, g.name AS organization_name, e.starts_at, e.timezone,
                 o.id AS organizer_id, o.first_event_approved_at, o.always_review
            FROM events e
            JOIN organizer_profiles o ON o.id = e.organizer_id
            JOIN organizations g ON g.id = o.organization_id
           WHERE e.status = 'pending_review'
           ORDER BY e.created_at DESC`,
    params: [],
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    organizationName: r.organization_name,
    startsAt: Number(r.starts_at),
    timezone: r.timezone || 'America/Phoenix',
    organizerId: r.organizer_id,
    firstEvent: r.first_event_approved_at === null,
    alwaysReview: Number(r.always_review) === 1,
  }));
}
