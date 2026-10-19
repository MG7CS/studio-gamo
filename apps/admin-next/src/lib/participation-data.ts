/**
 * Participation requests for staff. The list is a direct D1 read with the same `status = 'pending'` rule the
 * sidebar badge counts; reviewing goes through ParticipationService (audit log, self-review refusal).
 */
import { allRows, asSqlDatabase } from '@gamo/domain/security';

export const INQUIRY_LIMIT = 100;

export const INQUIRY_FILTERS = ['pending', 'reviewed', 'closed', 'all'] as const;
export type InquiryFilter = (typeof INQUIRY_FILTERS)[number];

export const INQUIRY_FILTER_LABELS: Record<InquiryFilter, string> = {
  pending: 'Waiting for review',
  reviewed: 'Reviewed',
  closed: 'Closed',
  all: 'All',
};

export function inquiryFilterFrom(url: URL): InquiryFilter {
  const value = url.searchParams.get('status');
  return INQUIRY_FILTERS.includes(value as InquiryFilter) ? (value as InquiryFilter) : 'pending';
}

export interface InquiryRow {
  id: string;
  userId: string;
  kind: string;
  interest: string;
  name: string;
  organization: string | null;
  message: string;
  status: 'pending' | 'reviewed' | 'closed';
  reviewNotes: string | null;
  /** Epoch seconds. */
  createdAt: number;
}

export async function loadInquiries(
  binding: unknown,
  filter: InquiryFilter,
): Promise<{ items: InquiryRow[]; truncated: boolean }> {
  const where = filter === 'all' ? '' : 'WHERE status = ?1';
  const rows = await allRows<{
    id: string;
    user_id: string;
    kind: string;
    interest: string;
    name: string;
    organization: string | null;
    message: string;
    status: InquiryRow['status'];
    review_notes: string | null;
    created_at: number;
  }>(asSqlDatabase(binding), {
    sql: `SELECT id, user_id, kind, interest, name, organization, message, status, review_notes, created_at
            FROM participation_inquiries ${where}
           ORDER BY created_at DESC, id ASC LIMIT ${INQUIRY_LIMIT + 1}`,
    params: filter === 'all' ? [] : [filter],
  });
  return {
    truncated: rows.length > INQUIRY_LIMIT,
    items: rows.slice(0, INQUIRY_LIMIT).map((r) => ({
      id: r.id,
      userId: r.user_id,
      kind: r.kind,
      interest: r.interest,
      name: r.name,
      organization: r.organization,
      message: r.message,
      status: r.status,
      reviewNotes: r.review_notes,
      createdAt: Number(r.created_at),
    })),
  };
}

/** Maps a failed review to text for the staff user. Only the domain's leading error codes are trusted. */
export function reviewFailureMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : '';
  if (text.startsWith('NOT_FOUND')) return 'That inquiry no longer exists.';
  if (text.startsWith('FORBIDDEN')) return 'You cannot review your own inquiry.';
  if (text.startsWith('CONFLICT')) return 'That inquiry is already closed. Reload to see the latest.';
  if (error instanceof Error && error.name === 'ZodError')
    return 'Add an update for the participant (1–2000 characters).';
  console.error(`[admin] participation review failed: ${error instanceof Error ? error.name : 'unknown'}`);
  return 'Something went wrong. Try again in a moment.';
}
