import type { APIRoute } from 'astro';
import { jsonOrSee, readBody } from '../../../../lib/admin-page';
import { submissionsApi } from '../../../../lib/submissions/context';
import { returnTo, submissionIdParam, text } from '../../../../lib/submissions/input';
import { failure } from '../../../../lib/submissions/respond';

export const prerender = false;

/**
 * POST /api/submissions/{id}/note: append an internal note (never shown to the submitter; notes cannot be
 * edited or deleted). Form posts answer 303 back to the notes; JSON clients get `{ id, noteId }`.
 */
export const POST: APIRoute = async (context) => {
  let location = '/submissions';
  try {
    const ctx = await submissionsApi(context);
    const id = submissionIdParam(context.params);
    location = `/submissions/${id}`;
    const body = await readBody(context.request);
    location = returnTo(body, location);
    const event = await ctx.forms.addNote({
      submissionId: id,
      note: text(body, 'note', 4000),
      staffId: ctx.staffId,
    });
    return jsonOrSee(context.request, {
      data: { id, noteId: event.id },
      location,
      notice: 'note-added',
      status: 201,
    });
  } catch (err) {
    return failure(err, context.request, location);
  }
};
