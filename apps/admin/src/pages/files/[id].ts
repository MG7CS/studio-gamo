import type { APIRoute } from 'astro';
import { domainErrorResponse } from '../../lib/domain-errors';
import { serveUpload } from '../../lib/submissions/files';
import { submissionsApi, uploadsFor } from '../../lib/submissions/context';

export const prerender = false;

/**
 * GET /files/{id}: streams a verified upload to a signed-in staff member (images and video inline, everything
 * else as a download), with Range support for video. Applicant files are never public: this is the only way
 * they are read. Unknown, rejected, unverified and deleted uploads answer 404; storage keys are never shown.
 */
export const GET: APIRoute = async (context) => {
  try {
    const ctx = await submissionsApi(context);
    const uploads = uploadsFor(ctx);
    return await serveUpload(context.request, context.params.id ?? '', (id, options) =>
      uploads.getForServing(id, options),
    );
  } catch (err) {
    return domainErrorResponse(err);
  }
};
