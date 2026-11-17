import type { APIRoute } from 'astro';
import { builderRoute } from '../../../../lib/forms-builder/api';

export const prerender = false;

/** POST|PUT /api/forms/{id}/settings: title, description, confirmation message, retention months. */
export const POST: APIRoute = (context) => builderRoute(context, 'settings.save');
export const PUT: APIRoute = (context) => builderRoute(context, 'settings.save');
