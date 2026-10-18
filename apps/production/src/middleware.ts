import { defineMiddleware } from 'astro:middleware';
import { applicationPages } from '@gamo/domain/page-middleware';
import { legacyRedirects } from './lib/legacy-redirects';

export const onRequest = defineMiddleware(applicationPages('production', { legacyRedirects }));
