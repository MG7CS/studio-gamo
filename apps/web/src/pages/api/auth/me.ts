import type { APIRoute } from 'astro';
import { meGET } from '@gamo/domain';
export const prerender = false;
export const GET: APIRoute = meGET;
