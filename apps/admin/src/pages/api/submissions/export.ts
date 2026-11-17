import type { APIRoute } from 'astro';
import { errorResponse } from '@gamo/domain';
import { auditStatement } from '@gamo/domain/worship';
import { readBody, see, wantsJson } from '../../../lib/admin-page';
import { submissionsApi } from '../../../lib/submissions/context';
import { parseInboxQuery } from '../../../lib/submissions/filters';
import { returnTo } from '../../../lib/submissions/input';
import { failure } from '../../../lib/submissions/respond';
import { csvResponse } from '../../../lib/submissions/export';

export const prerender = false;

/**
 * POST /api/submissions/export: the safe CSV of one form's submissions that match the filter (form id,
 * version, status, from, to, attachments, q). Same-origin staff POST only; every exported submission gets
 * an `export` event and the export is written to the audit log. Answers a `text/csv` attachment with
 * `nosniff`; `X-Export-Truncated: true` says the 5000-row cap cut the file.
 */
export const POST: APIRoute = async (context) => {
  let location = '/submissions';
  try {
    const ctx = await submissionsApi(context);
    const body = await readBody(context.request);
    location = returnTo(body, location);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (key !== 'return' && typeof value === 'string') params.set(key, value);
    }
    if (!params.has('form') && params.has('formId')) params.set('form', params.get('formId')!);
    const query = parseInboxQuery(params);
    const { formId, ...rest } = query.filter;
    if (!formId) {
      if (wantsJson(context.request)) return errorResponse('INVALID_INPUT', 'Choose a form to export.', 400);
      return see(location, 'export-needs-form');
    }
    const now = Math.floor(Date.now() / 1000);
    const result = await ctx.forms.exportCsv({ formId, staffId: ctx.staffId, now, ...rest });
    await ctx.db.batch([
      auditStatement(ctx.db, {
        actorId: ctx.staffId,
        action: 'submissions.exported',
        entityType: 'form',
        entityId: formId,
        payload: { rows: result.rows, truncated: result.truncated ? 1 : 0 },
        now,
      }),
    ]);
    return csvResponse(result);
  } catch (err) {
    return failure(err, context.request, location);
  }
};
