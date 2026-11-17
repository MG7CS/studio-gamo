import type { APIRoute } from 'astro';
import { jsonResponse } from '@gamo/domain';
import { FormsError } from '@gamo/domain/forms';
import { domainErrorResponse } from '../../../../lib/domain-errors';
import { submissionsApi } from '../../../../lib/submissions/context';
import { submissionIdParam } from '../../../../lib/submissions/input';

export const prerender = false;

/**
 * GET /api/submissions/{id}: the submission with the form version the person answered (schema), their
 * answers and binds, and the uploads (stream each through GET /files/{id}). Staff only.
 */
export const GET: APIRoute = async (context) => {
  try {
    const { forms } = await submissionsApi(context);
    const detail = await forms.getSubmission(submissionIdParam(context.params));
    if (!detail) throw new FormsError('NOT_FOUND', 'This submission does not exist.');
    const s = detail.submission;
    return jsonResponse({
      id: s.id,
      reference: s.reference,
      formId: s.formId,
      formVersionId: s.formVersionId,
      kind: detail.form.kind,
      status: s.status,
      submitterName: s.submitterName,
      submitterEmail: s.submitterEmail,
      submitterPhone: s.submitterPhone,
      schema: detail.version.schema,
      answers: s.answers,
      binds: s.binds,
      uploads: detail.uploads.map((u) => ({
        id: u.id,
        questionId: u.questionId,
        kind: u.kind,
        filename: u.originalName ?? 'file',
        contentType: u.contentType,
        bytes: u.bytes,
        status: u.status === 'verified' ? 'verified' : 'pending',
      })),
      staffNotes: s.staffNotes,
      submittedAt: s.submittedAt,
      reviewedAt: s.reviewedAt,
    });
  } catch (err) {
    return domainErrorResponse(err);
  }
};
