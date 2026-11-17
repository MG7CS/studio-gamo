import type { APIRoute } from 'astro';
import { builderRoute } from '../../../../lib/forms-builder/api';

export const prerender = false;

/** POST /api/forms/{id}/close: stop accepting submissions (the published version stays). */
export const POST: APIRoute = (context) => builderRoute(context, 'form.close');
