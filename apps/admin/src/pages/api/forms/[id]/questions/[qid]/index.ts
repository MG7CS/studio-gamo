import type { APIRoute } from 'astro';
import { builderRoute } from '../../../../../../lib/forms-builder/api';

export const prerender = false;

/** POST /api/forms/{id}/questions/{qid}: Save one question (form fields or a whole `question` object); needs `revision`. */
export const POST: APIRoute = (context) => builderRoute(context, 'question.save', { params: { qid: 'qid' } });
export const PUT: APIRoute = (context) => builderRoute(context, 'question.save', { params: { qid: 'qid' } });
