import type { APIRoute } from 'astro';
import { builderRoute } from '../../../../../lib/forms-builder/api';

export const prerender = false;

/** POST /api/forms/{id}/questions: add a question (`section`, `type`, `revision`, optional `after`, `op_id`). */
export const POST: APIRoute = (context) => builderRoute(context, 'question.add');
