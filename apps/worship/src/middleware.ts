import { defineMiddleware } from 'astro:middleware';
import { applicationPages } from '@gamo/site/lib/page-middleware';
import { legacyRedirects } from './lib/legacy-redirects';

export const onRequest = defineMiddleware(applicationPages('worship', { legacyRedirects }));
