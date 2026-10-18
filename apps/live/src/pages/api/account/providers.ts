import type { APIRoute } from 'astro';
import { createAccountHandlers } from '@gamo/domain';
export const prerender = false;
export const POST: APIRoute = createAccountHandlers('live').providersPOST;
