import type { APIRoute } from 'astro';
import { organizerReviewPOST } from '@gamo/domain';
export const prerender = false;
export const POST: APIRoute = organizerReviewPOST;
