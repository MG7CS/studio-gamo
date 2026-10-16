import { defineMiddleware } from 'astro:middleware';
import { applicationPages } from '@gamo/domain/src/api/page-middleware';
export const onRequest = defineMiddleware(applicationPages('web'));
