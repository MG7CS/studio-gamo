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

  // Email delivery webhooks (Resend → /api/webhook/resend, Svix signature)
  RESEND_WEBHOOK_SECRET?: string;

  // Payments (Stripe test mode only)
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** `true` opens the test-mode paid checkout path in local/preview only; fatal in production (design T-05). */
  STRIPE_TEST_CHECKOUT?: string;

  // Identity secrets (design §10; each ≥ 32 characters, never shared with SESSION_SECRET)
  /** HMAC key for customer manage/recovery link tokens. */
  CUSTOMER_LINK_SECRET?: string;
  /** HMAC key for hashed IPs and emails (consents, logs, rate limits, suppressions). */
  PII_HASH_SECRET?: string;

  // Cloudflare Turnstile (public forms). The site key is public; the secret is a secret.
  PUBLIC_TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;

  // Brand configuration
  PLATFORM_BRAND?: string;
  PLATFORM_BRAND_TAGLINE?: string;
  PLATFORM_PRIMARY_DOMAIN?: string;
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

  // Local-only flags (also require a loopback request host)
  ALLOW_DEMO_SESSION?: string;
  ALLOW_AUTH_SIMULATION?: string;
  ALLOW_PUBLIC_DEMO_WORKSPACES?: string;

  // Clerk (`CLERK_*`, `CLERK_*_<PRODUCT>`, incl. `CLERK_WEBHOOK_SECRET_<APP>` and
  // `CLERK_GOOGLE_ENABLED_<APP>` — see CLERK_WEBHOOK_SECRET_NAMES / CLERK_GOOGLE_ENABLED_NAMES)
  // and public site URLs (`PUBLIC_*`)
  [key: `CLERK_${string}`]: string | undefined;
  [key: `PUBLIC_${string}`]: string | undefined;
}

/** Svix signing secret for `POST /api/webhook/clerk`, one per product (design §4.3). */
export const CLERK_WEBHOOK_SECRET_NAMES = [
  'CLERK_WEBHOOK_SECRET_WEB',
  'CLERK_WEBHOOK_SECRET_WORSHIP',
  'CLERK_WEBHOOK_SECRET_ACADEMY',
  'CLERK_WEBHOOK_SECRET_PRODUCTION',
] as const;

/** `true` shows "Continue with Google" for that product (only when its Clerk app has Google enabled). */
export const CLERK_GOOGLE_ENABLED_NAMES = [
  'CLERK_GOOGLE_ENABLED_WEB',
  'CLERK_GOOGLE_ENABLED_WORSHIP',
  'CLERK_GOOGLE_ENABLED_ACADEMY',
  'CLERK_GOOGLE_ENABLED_PRODUCTION',
] as const;

/** Identity secrets that must be ≥ 32 characters when set (design §10). */
export const HMAC_SECRET_NAMES = ['CUSTOMER_LINK_SECRET', 'PII_HASH_SECRET'] as const;
