import type { APIRoute } from 'astro';
import { FormsError } from '@gamo/domain/forms';
import { jsonOrSee, readBody } from '../../../../lib/admin-page';
import { submissionsApi } from '../../../../lib/submissions/context';
import { returnTo, submissionIdParam, text } from '../../../../lib/submissions/input';
import { failure } from '../../../../lib/submissions/respond';
import { parseSettableStatus } from '../../../../lib/submissions/statuses';

export const prerender = false;

/**
 * POST /api/submissions/{id}/status: set new, in_review, handled, spam or archived (`closed` is accepted as
 * `handled`) with an optional note. Approve and decline are separate actions. Setting the current status
 * again changes nothing. Form posts answer 303 back to the submission; JSON clients get `{ id, status }`.
 */
export const POST: APIRoute = async (context) => {
  let location = '/submissions';
  try {
    const ctx = await submissionsApi(context);
    const id = submissionIdParam(context.params);
    location = `/submissions/${id}`;
    const body = await readBody(context.request);
    location = returnTo(body, location);
    const status = parseSettableStatus(text(body, 'status', 30));
    if (!status) throw new FormsError('INVALID_INPUT', 'Choose a status from the list.');
    const note = text(body, 'notes', 4000) || text(body, 'note', 4000);
    const result = await ctx.forms.setStatus({
      submissionId: id,
      status,
      note: note || null,
      staffId: ctx.staffId,
    });
    return jsonOrSee(context.request, {
      data: { id, status: result.status },
      location,
      notice: result.changed ? 'status-changed' : 'status-unchanged',
    });
  } catch (err) {
    return failure(err, context.request, location);
  }
};
