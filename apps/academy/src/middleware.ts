import { defineMiddleware } from 'astro:middleware';
import { applicationPages } from '@gamo/domain/page-middleware';

export const onRequest = defineMiddleware(applicationPages('academy'));
