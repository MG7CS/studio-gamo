import { defineMiddleware } from 'astro:middleware';
import { applicationPages } from '@gamo/domain/src/api/page-middleware';
import { legacyRedirects } from './lib/legacy-redirects';

export const onRequest = defineMiddleware(applicationPages('web', { legacyRedirects }));
