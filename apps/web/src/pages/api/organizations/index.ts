import { readContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import { requireVerifiedAuth } from '@gamo/auth';
import {
  IdentityService,
  createOrganizationSchema,
  jsonResponse,
  handleApiError,
  getRuntimeEnv,
} from '@gamo/domain';

export const prerender = false;

/**
 * POST /api/organizations — Onboards a new organization and assigns the verified authenticated caller as owner.
 */
export const POST: APIRoute = async (context) => {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const signingSecret =
      runtimeEnv.SESSION_SECRET ||
      import.meta.env?.SESSION_SECRET ||
      (globalThis as Record<string, any>).process?.env?.SESSION_SECRET ||
      (runtimeEnv.ENVIRONMENT === 'local'
        ? 'gamo_local_dev_fallback_secret_min_32_bytes_change_in_prod'
        : undefined);

    const auth = await requireVerifiedAuth(context.request, db, signingSecret);

    const body = await readContract(context.request, 'CreateOrganizationInput');
    const validated = createOrganizationSchema.parse(body);

    const identityService = new IdentityService(db);
    const organization = await identityService.createOrganization(
      validated.name,
      validated.slug,
      validated.type,
      auth.user.id
    );

    return jsonResponse(
      {
        organization,
        membershipRole: 'owner' as const,
        message: 'Organization created and owner membership assigned.',
      },
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
};
