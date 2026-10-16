import type { APIRoute } from 'astro';
import { createAuthHandlers } from '@gamo/domain';
export const prerender = false;
export const GET: APIRoute = createAuthHandlers('production').meGET;
