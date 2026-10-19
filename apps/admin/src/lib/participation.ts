/**
 * Participation requests: what people send through the public sites. The list is a direct D1 read with the same
 * `status = 'pending'` rule the sidebar badge counts; a reply goes through ParticipationService.review, and
 * what is written is visible to the person who sent the inquiry.
 */
import { requireSameOrigin } from '@gamo/auth';
import type { GamoEnv } from '@gamo/config/env';
import { getDb } from '@gamo/db';
import { ParticipationService, participationReviewSchema } from '@gamo/domain';
import { allRows, asSqlDatabase } from '@gamo/domain/security';

export const INQUIRY_LIMIT = 100;

export const INQUIRY_FILTERS = ['pending', 'reviewed', 'closed', 'all'] as const;
export type InquiryFilter = (typeof INQUIRY_FILTERS)[number];

export const INQUIRY_FILTER_LABELS: Record<InquiryFilter, string> = {
  pending: 'Waiting for you',
  reviewed: 'Replied',
  closed: 'Closed',
  all: 'All',
};

export function inquiryFilterFrom(url: URL): InquiryFilter {
  const value = url.searchParams.get('status');
  return INQUIRY_FILTERS.includes(value as InquiryFilter) ? (value as InquiryFilter) : 'pending';
}

export interface InquiryRow {
  id: string;
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
  const rows = await allRows<{
    id: string;
    kind: string;
    interest: string;
    name: string;
    organization: string | null;
    message: string;
    status: InquiryRow['status'];
    review_notes: string | null;
    created_at: number;
  }>(asSqlDatabase(binding), {
    // Waiting items oldest first (the longest wait on top); everything else newest first.
    sql: `SELECT id, kind, interest, name, organization, message, status, review_notes, created_at
            FROM participation_inquiries ${filter === 'all' ? '' : 'WHERE status = ?1'}
           ORDER BY created_at ${filter === 'pending' ? 'ASC' : 'DESC'}, id ASC LIMIT ${INQUIRY_LIMIT + 1}`,
    params: filter === 'all' ? [] : [filter],
  });
  return {
    truncated: rows.length > INQUIRY_LIMIT,
    items: rows.slice(0, INQUIRY_LIMIT).map((r) => ({
      id: r.id,
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

export type ReplyOutcome = { ok: true; location: string } | { ok: false; status: number; message: string };

const fail = (status: number, message: string): ReplyOutcome => ({ ok: false, status, message });

/** Saves the admin's reply (status `reviewed` or `closed`) from the page's form POST. */
export async function handleReply(request: Request, env: GamoEnv): Promise<ReplyOutcome> {
  try {
    requireSameOrigin(request);
  } catch {
    return fail(403, 'That request came from another site and was refused.');
  }
  const form = await request.formData();
  const field = (name: string) => (typeof form.get(name) === 'string' ? (form.get(name) as string) : '');
  const parsed = participationReviewSchema.safeParse({ status: field('status'), notes: field('notes') });
  if (!parsed.success) return fail(400, 'Write a reply for the person (1–2000 characters).');
  const id = field('id');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return fail(400, 'The form was incomplete. Reload and try again.');
  try {
    await new ParticipationService(getDb(env.DB)).review(id, parsed.data);
    return { ok: true, location: `/participation?done=${parsed.data.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('NOT_FOUND')) return fail(404, 'That inquiry no longer exists.');
    if (message.startsWith('CONFLICT'))
      return fail(409, 'That inquiry is already closed. Reload to see the latest.');
    console.error(`[admin] participation reply failed: ${error instanceof Error ? error.name : 'unknown'}`);
    return fail(500, 'Something went wrong. Try again in a moment.');
  }
}

const DONE_TEXT: Record<string, string> = {
  reviewed: 'Reply saved. The person can see it in their account.',
  closed: 'Reply saved and the inquiry is closed.',
};

export function outcomeFrom(url: URL): string | null {
  const done = url.searchParams.get('done') ?? '';
  return done in DONE_TEXT ? DONE_TEXT[done] : null;
}
