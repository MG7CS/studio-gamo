import type { APIRoute } from 'astro';
import { verifyPOST } from '@gamo/domain';
export const prerender = false;
export const POST: APIRoute = verifyPOST;
