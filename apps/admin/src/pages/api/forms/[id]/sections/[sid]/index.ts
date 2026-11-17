import type { APIRoute } from 'astro';
import { builderRoute } from '../../../../../../lib/forms-builder/api';

export const prerender = false;

/** POST|PUT /api/forms/{id}/sections/{sid}: rename a section or change its description. */
export const POST: APIRoute = (context) =>
  builderRoute(context, 'section.update', { params: { sid: 'sid' } });
export const PUT: APIRoute = (context) => builderRoute(context, 'section.update', { params: { sid: 'sid' } });
