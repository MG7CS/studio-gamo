import type { APIRoute } from 'astro';
import { builderRoute } from '../../../../../../lib/forms-builder/api';

export const prerender = false;

/** POST /api/forms/{id}/questions/{qid}/move: Move up or down (`dir`) or to a position (`to`, 1-based). */
export const POST: APIRoute = (context) => builderRoute(context, 'question.move', { params: { qid: 'qid' } });
