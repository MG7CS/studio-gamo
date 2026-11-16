/**
 * Cloudflare Worker environment shared by all Gamo Studios apps: bindings from wrangler.toml
 * plus `[vars]` and secrets. Every value is optional at the type level because availability
 * differs per app and per environment; `validateEnv()` reports what each app requires.
 *
 * Bindings are typed `unknown` on purpose: consumers validate them at the boundary
 * (e.g. `getDb(env.DB)` checks for a D1 binding) instead of trusting an ambient type.
 */
export type RuntimeEnvironment = 'local' | 'preview' | 'production';

/** The R2 object metadata this codebase reads (subset of Cloudflare's `R2Object`). */
export interface R2ObjectLike {
  key: string;
  size: number;
  etag?: string;
  httpMetadata?: { contentType?: string; contentDisposition?: string; cacheControl?: string };
  customMetadata?: Record<string, string>;
}

/** A byte range for ranged reads (video seeking): from `offset`, or the last `suffix` bytes. */
export type R2RangeLike =
  { offset: number; length?: number } | { offset?: number; length: number } | { suffix: number };

/** An R2 object with its body (subset of Cloudflare's `R2ObjectBody`). */
export interface R2ObjectBodyLike extends R2ObjectLike {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** One uploaded part of an R2 multipart upload. */
export interface R2UploadedPartLike {
  partNumber: number;
  etag: string;
}

/** A resumable R2 multipart upload (subset of Cloudflare's `R2MultipartUpload`). */
export interface R2MultipartUploadLike {
  readonly key: string;
  readonly uploadId: string;
  uploadPart(
    partNumber: number,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
  ): Promise<R2UploadedPartLike>;
  abort(): Promise<void>;
  complete(uploadedParts: R2UploadedPartLike[]): Promise<R2ObjectLike>;
}

/**
 * The `MEDIA_BUCKET` R2 binding: the subset of Cloudflare's `R2Bucket` that the storage client
 * (`packages/integrations/src/storage.ts`, whose `R2BucketLike` this extends) and the form-upload
 * pipeline use. Real bindings and in-memory test fakes both satisfy it.
 */
export interface R2BucketBinding {
  get(key: string, options?: { range?: R2RangeLike }): Promise<R2ObjectBodyLike | null>;
  head(key: string): Promise<R2ObjectLike | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream | Blob | null,
    options?: { httpMetadata?: R2ObjectLike['httpMetadata']; customMetadata?: Record<string, string> },
  ): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
  createMultipartUpload(
    key: string,
    options?: { httpMetadata?: R2ObjectLike['httpMetadata']; customMetadata?: Record<string, string> },
  ): Promise<R2MultipartUploadLike>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUploadLike;
}

/** Output of the Cloudflare Images binding after `.output()`. */
export interface ImagesTransformationResultLike {
  response(): Response;
  contentType(): string;
  image(): ReadableStream<Uint8Array>;
}

/** The chainable handle returned by `IMAGES.input()`. */
export interface ImagesTransformerLike {
  transform(options: {
    width?: number;
    height?: number;
    fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  }): ImagesTransformerLike;
  output(options: {
    format: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
    quality?: number;
  }): Promise<ImagesTransformationResultLike>;
}

/**
 * The `IMAGES` binding (Cloudflare Images): the smallest shape the upload pipeline needs to
 * re-encode a photo, `input(stream).transform({ width, … }).output({ format })`. The Astro
 * Cloudflare adapter declares the binding by default; real bindings satisfy this interface.
 */
export interface ImagesBindingLike {
  input(stream: ReadableStream<Uint8Array>): ImagesTransformerLike;
}

export interface GamoEnv {
  // Bindings
  DB?: unknown;
  /** R2 bucket for form uploads (web, worship, production write; admin reads). */
  MEDIA_BUCKET?: R2BucketBinding;
  /** Cloudflare Images binding; re-encodes uploaded photos (web, worship, production). */
  IMAGES?: ImagesBindingLike;
  SESSION?: unknown;
  SESSION_KV?: unknown;

  // Core
  ENVIRONMENT?: RuntimeEnvironment | (string & {});
  SESSION_SECRET?: string;

  // Email
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;

  /** Staff notification inbox for new form submissions (web, worship, production, admin). Recommended. */
  INQUIRY_INBOX_EMAIL?: string;

  // Email delivery webhooks (Resend → /api/webhook/resend, Svix signature)
  RESEND_WEBHOOK_SECRET?: string;

  // Payments (Stripe test mode only; a live key is fatal outside local)
  /** Test-mode key: admin uses it for Stripe Invoicing, academy for test checkout. */
  STRIPE_SECRET_KEY?: string;
  /** Signing secret of the `invoice.*` webhook (`whsec_…`); web only (`/api/webhook/stripe`). */
  STRIPE_WEBHOOK_SECRET?: string;
  /** `true` opens the test-mode paid checkout path in local/preview only; fatal in production (design T-05). */
  STRIPE_TEST_CHECKOUT?: string;

  // Identity secrets (design §10; each ≥ 32 characters, never shared with SESSION_SECRET)
  /** HMAC key for customer manage/recovery link tokens. */
  CUSTOMER_LINK_SECRET?: string;
  /** HMAC key for hashed IPs and emails (consents, logs, rate limits, suppressions). */
  PII_HASH_SECRET?: string;
  /** HMAC key for form-upload session tokens (web, worship, production). */
  FORM_UPLOAD_SECRET?: string;

  // Invoices (admin)
  /** Text shown on manual (non-Stripe) invoice emails: how to pay Gamo. */
  INVOICE_PAYMENT_INSTRUCTIONS?: string;
  /** `true` only after the board approves a Gamo administrative fee; gates `gamo_admin` invoice lines. Default `false`. */
  GAMO_ADMIN_FEE_APPROVED?: 'true' | 'false' | (string & {});

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

  // Public site URLs and other public values (`PUBLIC_*`)
  [key: `PUBLIC_${string}`]: string | undefined;
}

/** Identity secrets that must be ≥ 32 characters when set (design §10). */
export const HMAC_SECRET_NAMES = ['CUSTOMER_LINK_SECRET', 'PII_HASH_SECRET', 'FORM_UPLOAD_SECRET'] as const;
