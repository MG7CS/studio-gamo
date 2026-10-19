import type { GamoEnv } from '@gamo/config/env';
import type { PublicApp } from './page-access.ts';

/**
 * Request-scoped values set by the page middleware (`applicationPages()`) and read by pages and shared components.
 */
export interface GamoLocals {
  /** App that served the request. */
  product?: PublicApp;
  runtimeEnv?: GamoEnv;
  /** Per-page header additions requested with `requestSecurityHeaders(Astro.locals, …)`. */
  securityRequest?: {
    formActionOrigins?: readonly string[];
    camera?: boolean;
    noReferrer?: boolean;
    clerkFrontendApi?: string;
  };
}
