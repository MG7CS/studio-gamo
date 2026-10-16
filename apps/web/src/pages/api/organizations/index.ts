import type { APIRoute } from 'astro';
import { organizationsPOST } from '@gamo/domain';
export const prerender = false;
export const POST: APIRoute = organizationsPOST;
