import type { GamoEnv } from '@gamo/config/env';
import type { SessionData } from './index.ts';
import type { PublicApp } from './page-access.ts';

/**
 * Request-scoped values set by middleware (`applicationPages()` in public apps, the admin
 * gateway in apps/admin) and read by pages and shared components. Public apps have no sessions.
 */
export interface GamoLocals {
  /** App that served the request. */
  product?: PublicApp;
  runtimeEnv?: GamoEnv;
  noindexPage?: boolean;
  /**
   * Per-page header additions requested with `requestSecurityHeaders(Astro.locals, …)` from
   * `@gamo/domain` in the page frontmatter; read by the page middleware when it sets the CSP and
   * Permissions-Policy. Origins are filtered to exact https origins there.
   */
  securityRequest?: { formActionOrigins?: readonly string[]; camera?: boolean; noReferrer?: boolean };
  /** apps/admin: D1 staff session that passed the admin gateway. */
  adminAuthSession?: SessionData;
  /** apps/admin: identity asserted by Cloudflare Access. */
  staffEmail?: string;
  staffSubject?: string;
}
