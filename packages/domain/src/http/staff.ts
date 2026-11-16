/**
 * The gate every admin action passes (apps/admin, behind Cloudflare Access + the staff gateway session):
 * staff session → Access identity match → same origin. Callers then read the bounded body and validate.
 */
import { requireSameOrigin, requireStaff, verifyStaffBoundaryIdentity, type SessionData } from '@gamo/auth';
import { getDb } from '@gamo/db';
import { getRuntimeEnv } from '../api/response.ts';
import { asSqlDatabase } from '../security/sql-database.ts';

type Context = { request: Request; locals?: unknown; params?: Record<string, string | undefined> };

/** The staff member acting, as recorded on audit rows and decisions. */
export interface StaffActor {
  userId: string;
  name: string;
  email: string;
}

export async function staffContext(context: Context) {
  const env = await getRuntimeEnv(context);
  const db = getDb(env.DB);
  const auth: SessionData = await requireStaff(context.request, db, env.SESSION_SECRET);
  await verifyStaffBoundaryIdentity(
    db,
    auth,
    context.locals as Parameters<typeof verifyStaffBoundaryIdentity>[2],
  );
  requireSameOrigin(context.request);
  const staff: StaffActor = {
    userId: auth.user.id,
    name: auth.user.displayName?.trim() || auth.user.email,
    email: auth.user.email,
  };
  return { env, db, sql: asSqlDatabase(env.DB), auth, staff };
}
