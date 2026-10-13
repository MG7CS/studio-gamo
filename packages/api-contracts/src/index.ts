import createClient from 'openapi-fetch';
import type { paths } from './public.js';
export type { paths, components, operations } from './public.js';
/** Supply the owning application origin. Internal staff operations are excluded. */
export const createApiClient = (baseUrl: string) => createClient<paths>({ baseUrl, credentials: 'include' });
