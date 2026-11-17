import type { APIRoute } from 'astro';
import { approveApplication } from '@gamo/domain/worship';
import { jsonOrSee, readBody } from '../../../../lib/admin-page';
import { statusOf } from '../../../../lib/submissions/bulk';
import { submissionsApi, worshipEnv } from '../../../../lib/submissions/context';
import { returnTo, submissionIdParam, text } from '../../../../lib/submissions/input';
import { failure } from '../../../../lib/submissions/respond';

export const prerender = false;

/**
 * POST /api/submissions/{id}/approve: approve a musician or technician application. Creates one private
 * roster member from the bind keys and sends the approval email; a repeat changes nothing (`changed:
 * false`). Other kinds answer 409. An optional note is kept as an internal note.
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
    const member = await approveApplication(ctx.db, worshipEnv(ctx), {
      submissionId: id,
      staffId: ctx.staffId,
      now: Math.floor(Date.now() / 1000),
    });
    const changed = before !== 'approved';
    const note = text(body, 'notes', 4000);
    if (note && changed) await ctx.forms.addNote({ submissionId: id, note, staffId: ctx.staffId });
    return jsonOrSee(context.request, {
      data: { id, status: 'approved', rosterMemberId: member.id, changed },
      location,
      notice: changed ? 'approved' : 'already-decided',
    });
  } catch (err) {
    return failure(err, context.request, location);
  }
};
