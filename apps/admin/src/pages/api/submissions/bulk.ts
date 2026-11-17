import type { APIRoute } from 'astro';
import { errorResponse } from '@gamo/domain';
import { FormsError } from '@gamo/domain/forms';
import { jsonOrSee, readBody, see, wantsJson } from '../../../lib/admin-page';
import { applyBulk, bulkTargets } from '../../../lib/submissions/bulk';
import { submissionsApi } from '../../../lib/submissions/context';
import { flag, ids, returnTo, text } from '../../../lib/submissions/input';
import { failure } from '../../../lib/submissions/respond';
import { bulkActionFor } from '../../../lib/submissions/statuses';

export const prerender = false;

/**
 * POST /api/submissions/bulk: one status action on the ticked rows (`ids`), which are the only rows touched.
 * `action` is handled, archived or spam. Archive and spam make a record eligible for deletion, so a form
 * post without `confirm=1` is sent to the confirmation page (`/submissions/confirm`), which states the
 * count; JSON clients must send `confirm: true`. Decided applications are skipped.
 */
export const POST: APIRoute = async (context) => {
  let location = '/submissions';
  try {
    const ctx = await submissionsApi(context);
    const body = await readBody(context.request);
    location = returnTo(body, location);
    const action = bulkActionFor(text(body, 'action', 20));
    if (!action) {
      if (wantsJson(context.request)) return errorResponse('INVALID_INPUT', 'Choose an action.', 400);
      return see(location, 'bulk-bad-action');
    }
    let selected: string[];
    try {
      selected = ids(body);
    } catch (err) {
      if (err instanceof FormsError && !wantsJson(context.request)) return see(location, 'bulk-too-many');
      throw err;
    }
    if (selected.length === 0) {
      if (wantsJson(context.request))
        return errorResponse('INVALID_INPUT', 'Select at least one submission.', 400);
      return see(location, 'bulk-none');
    }

    if (action.destructive && !flag(body, 'confirm')) {
      if (wantsJson(context.request)) {
        return errorResponse('CONFIRMATION_REQUIRED', 'Send confirm: true to apply this action.', 400);
      }
      const query = new URLSearchParams({ action: action.id, return: location });
      for (const id of selected) query.append('ids', id);
      return see(`/submissions/confirm?${query.toString()}`);
    }

    const targets = await bulkTargets(ctx.db, selected);
    const result = await applyBulk(ctx.forms, targets, action, ctx.staffId);
    return jsonOrSee(context.request, {
      data: {
        action: action.id,
        changed: result.changed,
        unchanged: result.unchanged,
        skipped: result.skipped,
      },
      location,
      notice: result.skipped > 0 ? 'bulk-partial' : 'bulk-done',
    });
  } catch (err) {
    return failure(err, context.request, location);
  }
};
