import type { APIRoute } from 'astro';
import { eventReviewPOST } from '@gamo/domain';
export const prerender = false;
export const POST: APIRoute = eventReviewPOST;
