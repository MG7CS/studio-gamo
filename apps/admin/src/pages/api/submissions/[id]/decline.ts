import type { APIRoute } from 'astro';
import { declineApplication } from '@gamo/domain/worship';
import { jsonOrSee, readBody } from '../../../../lib/admin-page';
import { statusOf } from '../../../../lib/submissions/bulk';
import { submissionsApi, uploadsFor, worshipEnv } from '../../../../lib/submissions/context';
import { returnTo, submissionIdParam, text } from '../../../../lib/submissions/input';
import { failure } from '../../../../lib/submissions/respond';

export const prerender = false;

/**
 * POST /api/submissions/{id}/decline: decline a musician or technician application. Keeps the record 12
 * months, moves uploaded files to the declined area (kept 90 days), and sends the decline email with the
 * optional note (the only reason the applicant ever sees). A repeat changes nothing and retries the file
 * move. Other kinds answer 409.
 */
export const POST: APIRoute = async (context) => {
  let location = '/submissions';
  try {
    const ctx = await submissionsApi(context);
    const id = submissionIdParam(context.params);
    location = `/submissions/${id}`;
    const body = await readBody(context.request);
    location = returnTo(body, location);
    const before = await statusOf(ctx.db, id);
    let filesPending = false;
    const result = await declineApplication(ctx.db, worshipEnv(ctx), {
      submissionId: id,
      staffId: ctx.staffId,
      note: text(body, 'notes', 600) || undefined,
      now: Math.floor(Date.now() / 1000),
      // The decision is already stored when this runs: a failed move is reported, never undone.
      onDeclined: async (submissionId) => {
        try {
          await uploadsFor(ctx).moveToDeclined(submissionId);
        } catch (err) {
          filesPending = true;
          console.error('[admin] moving declined files failed:', err instanceof Error ? err.name : 'unknown');
        }
      },
    });
    const changed = before !== 'declined';
    return jsonOrSee(context.request, {
      data: { id: result.submissionId, status: 'declined', rosterMemberId: null, changed },
      location,
      notice: filesPending ? 'declined-files-pending' : changed ? 'declined' : 'already-decided',
    });
  } catch (err) {
    return failure(err, context.request, location);
  }
};
