import type { APIRoute } from 'astro';
import { sessionPOST, sessionDELETE } from '@gamo/domain';
export const prerender = false;
export const POST: APIRoute = sessionPOST;
export const DELETE: APIRoute = sessionDELETE;
