/**
 * Data for the staff review pages (`/review/churches`, `/review/providers`, `/review/providers/[id]`).
 * Every page requires a staff gateway session whose identity matches Cloudflare Access
 * (`requireStaff` + `verifyStaffBoundaryIdentity`, as `participation.astro`'s API does); without one the
 * page shows a sign-in notice instead of data.
 */
import { getDb } from '@gamo/db';
import { requireStaff, verifyStaffBoundaryIdentity, type SessionData } from '@gamo/auth';
import {
  availableReviewActions,
  getProviderProfile,
  getRuntimeEnv,
  listReviewQueue,
  listVerificationRecords,
  ONBOARDING_STEPS,
  providerStatusLabel,
  roleLabel,
  type ProviderProfile,
} from '@gamo/domain';
import { asSqlDatabase } from '@gamo/domain/security';
import type { ProviderRole, ProviderStatus } from '@gamo/domain/types';

export const CHURCH_ROLES: readonly ProviderRole[] = ['church'];
export const PROVIDER_REVIEW_ROLES: readonly ProviderRole[] = [
  'musician',
  'technician',
  'teacher',
  'artist',
  'agent',
];
const OPEN: readonly ProviderStatus[] = ['submitted', 'meeting_scheduled', 'in_review'];
const STATUS_FILTERS: Record<string, readonly ProviderStatus[]> = {
  open: OPEN,
  changes_requested: ['changes_requested'],
  verified: ['verified'],
  rejected: ['rejected'],
  suspended: ['suspended'],
  draft: ['draft'],
};

type AstroLike = { request: Request; locals: unknown; url: URL };

export async function staffContext(
  astro: AstroLike,
): Promise<{ auth: SessionData; env: Awaited<ReturnType<typeof getRuntimeEnv>> } | null> {
  try {
    const env = await getRuntimeEnv(astro);
    const db = getDb(env.DB);
    const auth = await requireStaff(astro.request, db, env.SESSION_SECRET);
    await verifyStaffBoundaryIdentity(
      db,
      auth,
      astro.locals as Parameters<typeof verifyStaffBoundaryIdentity>[2],
    );
    return { auth, env };
  } catch {
    return null;
  }
}

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
  };
  return { tone: 'success', text: `${labels[done] ?? 'Saved.'}${emailText}` };
}

export async function loadQueue(env: { DB?: unknown }, roles: readonly ProviderRole[], url: URL) {
  const filter = url.searchParams.get('status') ?? 'open';
  const statuses = STATUS_FILTERS[filter] ?? OPEN;
  const roleFilter = url.searchParams.get('role');
  const activeRoles =
    roleFilter && roles.includes(roleFilter as ProviderRole) ? [roleFilter as ProviderRole] : roles;
  const items = await listReviewQueue(asSqlDatabase(env.DB), { roles: activeRoles, statuses });
  return {
    filter,
    roleFilter: activeRoles.length === 1 && roles.length > 1 ? activeRoles[0] : null,
    filters: Object.keys(STATUS_FILTERS),
    items: items.map((i) => ({
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

export async function loadProviderDetail(
  env: { DB?: unknown },
  id: string,
): Promise<ProviderDetailView | null> {
  const db = asSqlDatabase(env.DB);
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
