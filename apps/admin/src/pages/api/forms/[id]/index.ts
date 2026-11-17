import type { APIRoute } from 'astro';
import { jsonResponse } from '@gamo/domain';
import { FormsService } from '@gamo/domain/forms';
import { adminApi } from '../../../../lib/admin-page';
import { domainErrorResponse } from '../../../../lib/domain-errors';
import { builderRoute } from '../../../../lib/forms-builder/api';

export const prerender = false;

/** GET /api/forms/{id} (getForm): the form with its draft schema and the draft `revision` to save against. */
export const GET: APIRoute = async (context) => {
  try {
    const admin = await adminApi(context);
    const edit = await new FormsService(admin.db).getForEdit(context.params.id ?? '');
    const { form } = edit;
    return jsonResponse(
      {
        id: form.id,
        slug: form.slug,
        program: form.program,
        kind: form.kind,
        title: form.title,
        description: form.description,
        status: form.status,
        confirmationMessage: form.confirmationMessage,
        currentVersionId: form.currentVersionId,
        currentVersion: edit.latestVersion?.version ?? null,
        draftSchema: edit.draft,
        revision: edit.revision,
        updatedAt: form.updatedAt,
      },
      200,
      undefined,
      { 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    return domainErrorResponse(error);
  }
};

/** PUT /api/forms/{id} (saveFormDraft): replaces the draft; needs `revision` (409 when stale). */
export const PUT: APIRoute = (context) => builderRoute(context, 'draft.save');
/** POST /api/forms/{id}: the form-post variant of PUT (HTML forms cannot send PUT). */
export const POST: APIRoute = (context) => builderRoute(context, 'draft.save');
