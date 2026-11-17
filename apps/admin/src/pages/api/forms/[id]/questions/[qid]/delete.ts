import type { APIRoute } from 'astro';
import { builderRoute } from '../../../../../../lib/forms-builder/api';

export const prerender = false;

/** POST /api/forms/{id}/questions/{qid}/delete: Delete a question; refused (409) while other questions depend on it. */
export const POST: APIRoute = (context) =>
  builderRoute(context, 'question.delete', { params: { qid: 'qid' }, confirmForJson: true });
