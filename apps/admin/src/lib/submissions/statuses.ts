/**
 * Submission status vocabulary for the admin inbox: labels, the statuses staff may set directly, and the
 * bulk actions. `approved` and `declined` are reached only through the approve/decline actions (they feed the
 * roster and send an email), never through the status select.
 */
import { SUBMISSION_STATUSES, type SubmissionStatus } from '@gamo/domain/forms';

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  new: 'New',
  in_review: 'In review',
  handled: 'Handled',
  spam: 'Spam',
  archived: 'Archived',
  approved: 'Approved',
  declined: 'Declined',
};

/** Statuses a staff member may choose in the "Change status" form. */
export const SETTABLE_STATUSES = ['new', 'in_review', 'handled', 'spam', 'archived'] as const;
export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

/**
 * The contract (openapi `SubmissionStatusInput`) still says `closed`; the service says `handled`.
 * `closed` is accepted as an alias of `handled` until the contract is updated.
 */
export function parseSettableStatus(value: unknown): SettableStatus | null {
  if (typeof value !== 'string') return null;
  const v = value === 'closed' ? 'handled' : value;
  return (SETTABLE_STATUSES as readonly string[]).includes(v) ? (v as SettableStatus) : null;
}

export function isSubmissionStatus(value: unknown): value is SubmissionStatus {
  return typeof value === 'string' && (SUBMISSION_STATUSES as readonly string[]).includes(value);
}

export interface BulkAction {
  /** Value of the "Action" select and of the `action` form field. */
  id: 'handled' | 'archived' | 'spam';
  label: string;
  status: SettableStatus;
  /** Needs a confirmation page that states the count (these statuses make a record eligible for deletion). */
  destructive: boolean;
}

export const BULK_ACTIONS: readonly BulkAction[] = [
  { id: 'handled', label: 'Mark handled', status: 'handled', destructive: false },
  { id: 'archived', label: 'Archive', status: 'archived', destructive: true },
  { id: 'spam', label: 'Mark as spam', status: 'spam', destructive: true },
];

export function bulkActionFor(value: unknown): BulkAction | null {
  return BULK_ACTIONS.find((a) => a.id === value) ?? null;
}

/** Bulk changes never touch a decided application (its decision created a roster row or sent an email). */
export const BULK_PROTECTED_STATUSES: readonly SubmissionStatus[] = ['approved', 'declined'];

/** Hard cap on one bulk request (a page of the inbox is at most this many rows). */
export const BULK_MAX = 100;
export const INBOX_PAGE_SIZE = 25;

/** Safe id shape of submissions and uploads (prefix_random); anything else is never looked up. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
