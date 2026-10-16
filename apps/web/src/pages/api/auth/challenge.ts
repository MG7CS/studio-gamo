import type { APIRoute } from 'astro';
import { challengePOST } from '@gamo/domain';
export const prerender = false;
export const POST: APIRoute = challengePOST;
