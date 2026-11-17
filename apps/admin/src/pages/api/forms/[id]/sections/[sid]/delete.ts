import type { APIRoute } from 'astro';
import { builderRoute } from '../../../../../../lib/forms-builder/api';

export const prerender = false;

/** POST /api/forms/{id}/sections/{sid}/delete: delete an empty section. */
export const POST: APIRoute = (context) =>
  builderRoute(context, 'section.delete', { params: { sid: 'sid' } });
