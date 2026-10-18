/**
 * Cloudflare Worker environment shared by all Gamo Studios apps: bindings from wrangler.toml
 * plus `[vars]` and secrets. Every value is optional at the type level because availability
 * differs per app and per environment; `validateEnv()` reports what each app requires.
 *
 * Bindings are typed `unknown` on purpose: consumers validate them at the boundary
 * (e.g. `getDb(env.DB)` checks for a D1 binding) instead of trusting an ambient type.
 */
export type RuntimeEnvironment = 'local' | 'preview' | 'production';

export interface GamoEnv {
  // Bindings
  DB?: unknown;
  MEDIA_BUCKET?: unknown;
  SESSION?: unknown;
  SESSION_KV?: unknown;

  // Core
  ENVIRONMENT?: RuntimeEnvironment | (string & {});
  SESSION_SECRET?: string;

  // Email
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;

  // Payments (Gamo Live, Stripe test mode only)
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;

  // Gamo Live brand configuration
  PLATFORM_BRAND?: string;
  PLATFORM_BRAND_TAGLINE?: string;
  PLATFORM_PRIMARY_DOMAIN?: string;
  PLATFORM_IS_LIVE_DOMAIN?: string;
  PLATFORM_SUPPORT_EMAIL?: string;
  PLATFORM_SENDER_NAME?: string;
  PLATFORM_SENDER_EMAIL?: string;
  PLATFORM_LOGO_MARK?: string;

  // Admin access
  REQUIRE_ADMIN_AUTH?: string;
  CF_ACCESS_TEAM_NAME?: string;
  CF_ACCESS_AUD?: string;
  ENABLE_BREAK_GLASS_AUTH?: string;
  ADMIN_ACCESS_TOKEN?: string;
  ADMIN_SECRET_KEY?: string;
  ADMIN_BASIC_AUTH_USER?: string;
  ADMIN_BASIC_AUTH_PASS?: string;

  // Gamo Live: seed the bundled verified catalog on page requests (on by default only when ENVIRONMENT=local)
  LIVE_CATALOG_AUTOSEED?: string;

  // Local-only flags (also require a loopback request host)
  ALLOW_DEMO_SESSION?: string;
  ALLOW_AUTH_SIMULATION?: string;
  ALLOW_PUBLIC_DEMO_WORKSPACES?: string;

  // Clerk (`CLERK_*`, `CLERK_*_<PRODUCT>`) and public site URLs (`PUBLIC_*`)
  [key: `CLERK_${string}`]: string | undefined;
  [key: `PUBLIC_${string}`]: string | undefined;
}
