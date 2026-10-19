/**
 * Data for church verification and provider review. Read-only: decisions are POSTed to the profile page.
 * Every list is a D1 query; an empty result is an empty state, never sample rows.
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
import { asSqlDatabase } from '@gamo/domain/security';
import type { ProviderRole } from '@gamo/domain/types';
import { OPEN_PROFILE_STATUSES, STATUS_FILTERS } from './review-scope';

export const QUEUE_LIMIT = 100;

/** What an admin decision did, read from the redirect that follows it. Only fixed vocabulary is ever shown. */
const DONE_LABELS: Record<string, string> = {
  schedule_meeting: 'Meeting scheduled.',
  start_review: 'Marked as in review.',
  verify: 'Verified.',
  request_changes: 'Changes requested.',
  reject: 'Rejected.',
  suspend: 'Suspended.',
  reinstate: 'Reinstated for review.',
};
const EMAIL_TEXT: Record<string, string> = {
  sent: ' The provider was emailed.',
  delivered: ' The provider was emailed.',
  queued: ' The provider was emailed.',
  not_configured: ' Email is not configured here, so the provider was NOT emailed — tell them another way.',
  failed: ' The email could not be sent; it will be retried.',
};

export function outcomeFrom(url: URL): string | null {
  const done = url.searchParams.get('done');
  if (!done || !(done in DONE_LABELS)) return null;
  return `${DONE_LABELS[done]}${EMAIL_TEXT[url.searchParams.get('email') ?? ''] ?? ''}`;
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
    role: ProviderRole;
    roleLabel: string;
    status: string;
    statusLabel: string;
    productOrigin: string;
    updatedAt: number;
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
      id: i.id,
      displayName: i.displayName,
      role: i.role,
      roleLabel: roleLabel(i.role),
      status: i.status,
      statusLabel: providerStatusLabel(i.status),
      productOrigin: i.productOrigin,
      updatedAt: i.updatedAt,
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
