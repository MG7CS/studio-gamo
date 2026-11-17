import type { APIRoute } from 'astro';
import { errorResponse, jsonResponse } from '@gamo/domain';
import { domainErrorResponse } from '../../../lib/domain-errors';
import { submissionsApi } from '../../../lib/submissions/context';
import { parseInboxQuery } from '../../../lib/submissions/filters';
import { INBOX_PAGE_SIZE } from '../../../lib/submissions/statuses';

export const prerender = false;

/**
 * GET /api/submissions: newest first (`submittedAt` then `id`), keyset-paged. Filters: formId (or form),
 * version, status, from, to (UTC days), attachments=1, q. `limit` 1-100 (default 25), `cursor` from
 * `meta.nextCursor`. Staff only. The contract's `program` filter is not supported by `FormsService`.
 */
export const GET: APIRoute = async (context) => {
  try {
    const { forms } = await submissionsApi(context);
    const params = new URLSearchParams(context.url.search);
    if (!params.has('form') && params.has('formId')) params.set('form', params.get('formId')!);
    const query = parseInboxQuery(params);
    if (query.ignored.length > 0) {
      return errorResponse('INVALID_INPUT', 'Some filters were not understood.', 400, [
        ...query.ignored.map((field) => ({ field, message: 'Not understood.', code: 'invalid' })),
      ]);
    }
    const rawLimit = params.get('limit');
    const limit = rawLimit === null ? INBOX_PAGE_SIZE : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return errorResponse('INVALID_INPUT', 'The limit must be a whole number from 1 to 100.', 400);
    }
    const page = await forms.listSubmissions({ ...query.filter, cursor: query.cursor, limit });
    return jsonResponse(page.items, 200, { nextCursor: page.nextCursor });
  } catch (err) {
    return domainErrorResponse(err);
  }
};
