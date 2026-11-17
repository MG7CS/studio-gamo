import type { APIRoute } from 'astro';
import { jsonResponse } from '@gamo/domain';
import { FormsService } from '@gamo/domain/forms';
import { adminApi } from '../../../lib/admin-page';
import { domainErrorResponse } from '../../../lib/domain-errors';
import { builderRoute } from '../../../lib/forms-builder/api';

export const prerender = false;

/** GET /api/forms (listForms): every form with its status and latest published version. */
export const GET: APIRoute = async (context) => {
  try {
    const admin = await adminApi(context);
    const forms = await new FormsService(admin.db).listForms();
    return jsonResponse(
      forms.map((f) => ({
        id: f.id,
        slug: f.slug,
        program: f.program,
        kind: f.kind,
        title: f.title,
        status: f.status,
        currentVersion: f.publishedVersion,
        updatedAt: f.updatedAt,
      })),
      200,
      undefined,
      { 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    return domainErrorResponse(error);
  }
};

/** POST /api/forms (createForm): a draft with one empty section; 303 to the builder for a browser. */
export const POST: APIRoute = (context) => builderRoute(context, 'form.create');
