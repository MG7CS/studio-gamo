/**
 * What counts as "waiting for staff" in each review queue. The queue pages, the status filters and the
 * sidebar counts all read these, so a badge always matches the list it links to.
 */
import type { ProviderRole, ProviderStatus } from '@gamo/domain/types';

export const CHURCH_ROLES: readonly ProviderRole[] = ['church'];
export const PROVIDER_REVIEW_ROLES: readonly ProviderRole[] = [
  'musician',
  'technician',
  'teacher',
  'artist',
  'agent',
];

/** Profile statuses that need a staff decision. */
export const OPEN_PROFILE_STATUSES: readonly ProviderStatus[] = [
  'submitted',
  'meeting_scheduled',
  'in_review',
];

export const STATUS_FILTERS: Readonly<Record<string, readonly ProviderStatus[]>> = {
  open: OPEN_PROFILE_STATUSES,
  changes_requested: ['changes_requested'],
  verified: ['verified'],
  rejected: ['rejected'],
  suspended: ['suspended'],
  draft: ['draft'],
};
