import type { APIRoute } from 'astro';
import { builderRoute } from '../../../../lib/forms-builder/api';

export const prerender = false;

/** POST /api/forms/{id}/restore: copy `version` into the draft (needs `revision`; `op_id` makes it idempotent). */
export const POST: APIRoute = (context) => builderRoute(context, 'version.restore');
