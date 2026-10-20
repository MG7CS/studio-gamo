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
  /** Gamo Live's own D1 database (docs/LIVE_DATA_MODEL.md). */
  LIVE_DB?: unknown;
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

  // Payments (Gamo Live, Stripe test mode only)
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** `true` opens the test-mode paid checkout path in local/preview only; fatal in production (design T-05). */
  STRIPE_TEST_CHECKOUT?: string;

  // Identity and ticketing secrets (design §10; each ≥ 32 characters, never shared with SESSION_SECRET)
  /** Ticket QR HMAC key, generation 1 (`GL1.…` payloads). A later rotation adds TICKET_QR_SECRET_GL2. */
  TICKET_QR_SECRET_GL1?: string;
  TICKET_QR_SECRET_GL2?: string;
  /** HMAC key for customer manage/recovery link tokens. */
  CUSTOMER_LINK_SECRET?: string;
  /** HMAC key for hashed IPs and emails (consents, logs, rate limits, suppressions). */
  PII_HASH_SECRET?: string;
  /** Signs door-staff scanner cookies and peppers scanner PINs. */
  SCANNER_SESSION_SECRET?: string;

  // Gamo Live sign-in (its own Clerk application; the publishable key is `PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE`)
  CLERK_SECRET_KEY_LIVE?: string;
  /** PEM public key: verify Clerk session tokens without a network call. */
  CLERK_JWT_KEY_LIVE?: string;
  /** Comma-separated origins allowed as the session token's `azp`. */
  CLERK_AUTHORIZED_PARTIES_LIVE?: string;

  // Cloudflare Turnstile (public forms). The site key is public; the secret is a secret.
  PUBLIC_TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;

  // Gamo Live brand configuration
  PLATFORM_BRAND?: string;
  PLATFORM_BRAND_TAGLINE?: string;
  PLATFORM_PRIMARY_DOMAIN?: string;
  PLATFORM_IS_LIVE_DOMAIN?: string;
  PLATFORM_SUPPORT_EMAIL?: string;
  PLATFORM_SENDER_NAME?: string;
  PLATFORM_SENDER_EMAIL?: string;
  PLATFORM_LOGO_MARK?: string;

  // Admin access: one admin, Cloudflare Access only (docs/ADMIN_REQUIREMENTS.md)
  CF_ACCESS_TEAM_NAME?: string;
  CF_ACCESS_AUD?: string;
  /** The single admin's email; every admin request must carry an Access assertion for exactly this address. */
  ADMIN_EMAIL?: string;

  // Gamo Live: seed the bundled verified catalog on page requests (on by default only when ENVIRONMENT=local)
  LIVE_CATALOG_AUTOSEED?: string;

  // Local-only flags (also require a loopback request host)
  ALLOW_DEMO_SESSION?: string;
  ALLOW_AUTH_SIMULATION?: string;
  ALLOW_PUBLIC_DEMO_WORKSPACES?: string;
  /** Admin only: act as ADMIN_EMAIL without Cloudflare Access (loopback + ENVIRONMENT=local). */
  ALLOW_LOCAL_ADMIN_IDENTITY?: string;
  /** Admin only, set by `make admin-phone` (never from a file): the random secret that lets one phone reach the local admin. Fatal outside local. */
  GAMO_DEV_PHONE_TOKEN?: string;

  // Public site URLs (`PUBLIC_*`)
  [key: `PUBLIC_${string}`]: string | undefined;
}
