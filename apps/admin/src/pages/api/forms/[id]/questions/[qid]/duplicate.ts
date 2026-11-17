import type { APIRoute } from 'astro';
import { builderRoute } from '../../../../../../lib/forms-builder/api';

export const prerender = false;

/** POST /api/forms/{id}/questions/{qid}/duplicate: Duplicate a question (copy label, no system field; `op_id` makes it idempotent). */
export const POST: APIRoute = (context) =>
  builderRoute(context, 'question.duplicate', { params: { qid: 'qid' } });
