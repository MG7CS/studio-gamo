import type { APIRoute } from 'astro';
import { builderRoute } from '../../../../lib/forms-builder/api';

export const prerender = false;

/** POST /api/forms/{id}/reopen: accept submissions again. */
export const POST: APIRoute = (context) => builderRoute(context, 'form.reopen');
