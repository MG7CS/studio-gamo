import type { APIRoute } from 'astro';
import { builderRoute } from '../../../../../../lib/forms-builder/api';

export const prerender = false;

/** POST /api/forms/{id}/questions/{qid}/type: Change the question type; discards what the new type cannot hold. */
export const POST: APIRoute = (context) =>
  builderRoute(context, 'question.type', { params: { qid: 'qid' }, confirmForJson: true });
