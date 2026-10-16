import type { APIRoute } from 'astro';
import { createAuthHandlers } from '@gamo/domain';
const handlers = createAuthHandlers('worship');
export const prerender = false;
export const POST: APIRoute = handlers.sessionPOST;
export const DELETE: APIRoute = handlers.sessionDELETE;
