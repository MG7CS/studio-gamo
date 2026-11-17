import type { APIRoute } from 'astro';
import { adminApi } from '../../../lib/admin-page';
import { domainErrorResponse } from '../../../lib/domain-errors';
import { handleListRoster } from '../../../lib/worship/http';

export const prerender = false;

/**
 * GET /api/roster (operationId `listRoster`): the private roster for matching, staff only.
 * Filters: `role` (contained in roles, case-insensitive), `city`, `status`, `program`; keyset paging with
 * `limit` and `cursor`. Ordered by display name then id; nothing commercial ever orders it.
 */
export const GET: APIRoute = async (context) => {
  try {
    const admin = await adminApi(context);
    return await handleListRoster(admin, new URL(context.request.url));
  } catch (err) {
    return domainErrorResponse(err);
  }
};
