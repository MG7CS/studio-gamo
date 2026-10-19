import type { GamoEnv } from '@gamo/config/env';
import type { ResolvedProductClerkConfig } from './clerk.ts';
import type { SessionData } from './index.ts';
import type { PublicApp } from './page-access.ts';

/**
 * Request-scoped values set by middleware (`applicationPages()` in public apps) and read by pages and shared components.
 */
export interface GamoLocals {
  /** App that served the request. */
  product?: PublicApp;
  /** Signed-in identity with access to this product, or null. */
  auth?: SessionData | null;
  runtimeEnv?: GamoEnv;
  clerkConfig?: ResolvedProductClerkConfig;
  /** Explicitly enabled loopback demo (fictional workspace data, no sign-in). */
  isolatedDemo?: boolean;
  noindexPage?: boolean;
  /**
   * Per-page header additions requested with `requestSecurityHeaders(Astro.locals, …)` from
   * `@gamo/domain` in the page frontmatter; read by the page middleware when it sets the CSP and
   * Permissions-Policy. Origins are filtered to exact https origins there.
   */
  securityRequest?: { formActionOrigins?: readonly string[]; camera?: boolean; noReferrer?: boolean };
}
