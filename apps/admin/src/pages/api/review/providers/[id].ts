import type { APIRoute } from 'astro';
import { providerReviewPOST } from '@gamo/domain';
export const prerender = false;
export const POST: APIRoute = providerReviewPOST;
