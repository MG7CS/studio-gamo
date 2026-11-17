import type { APIRoute } from 'astro';
import { builderRoute } from '../../../../lib/forms-builder/api';

export const prerender = false;

/** POST /api/forms/{id}/publish (publishForm): snapshot the draft; needs `expected_revision` (409 when stale). */
export const POST: APIRoute = (context) => builderRoute(context, 'publish');
