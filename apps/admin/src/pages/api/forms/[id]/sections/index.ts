import type { APIRoute } from 'astro';
import { builderRoute } from '../../../../../lib/forms-builder/api';

export const prerender = false;

/** POST /api/forms/{id}/sections: add a section at the end (`title`, `revision`, `op_id`). */
export const POST: APIRoute = (context) => builderRoute(context, 'section.add');
