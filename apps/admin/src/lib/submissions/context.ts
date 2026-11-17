/**
 * What every submissions page and route starts with: the staff context from the admin foundation plus the
 * forms service. Uploads and the worship services are created where they are used (they need the media
 * bucket and the email environment).
 */
import { FormsService, uploadServiceFromEnv, type UploadService } from '@gamo/domain/forms';
import type { WorshipEnv } from '@gamo/domain/worship';
import { adminApi, adminPage, type AdminContext } from '../admin-page.ts';

export interface SubmissionsContext extends AdminContext {
  forms: FormsService;
  /** The staff member acting (audit rows, status events, notes). */
  staffId: string;
}

function withServices(admin: AdminContext): SubmissionsContext {
  return { ...admin, forms: new FormsService(admin.db), staffId: admin.staff.userId };
}

/** For `.astro` pages: throws a `Response` (401/403/503) the page returns as is. */
export async function submissionsPage(astro: Parameters<typeof adminPage>[0]): Promise<SubmissionsContext> {
  return withServices(await adminPage(astro));
}

/** For API routes: staff session, Access identity and same origin; throws `AuthError`. */
export async function submissionsApi(context: Parameters<typeof adminApi>[0]): Promise<SubmissionsContext> {
  return withServices(await adminApi(context));
}

export function uploadsFor(ctx: SubmissionsContext): UploadService {
  return uploadServiceFromEnv(ctx.db, ctx.env);
}

export function worshipEnv(ctx: SubmissionsContext): WorshipEnv {
  return ctx.env as WorshipEnv;
}
