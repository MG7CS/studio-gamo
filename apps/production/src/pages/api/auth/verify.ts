import type { APIRoute } from 'astro';
import { createAuthHandlers } from '@gamo/domain';
export const prerender = false;
export const POST: APIRoute = createAuthHandlers('production').verifyPOST;
