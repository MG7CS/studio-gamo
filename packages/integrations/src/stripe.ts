/**
 * Stripe Test-Mode Integration for Cloudflare Workers.
 *
 * ORGANIZATIONAL POLICY GATE:
 * Per docs/GAMO_NONPROFIT_MODEL.md and docs/NONPROFIT_TRANSITION_CHECKLIST.md,
 * live payment processing (donations, memberships, sponsorships) is strictly disabled
 * until the legal formation prerequisites are authorized by the founder and board.
 *
 * Only test-mode keys (`sk_test_` / `rk_test_`) are permitted.
 * Live keys (`sk_live_` / `rk_live_`) are actively blocked by this integration.
 *
 * Stripe Best Practices Applied:
 * - Dynamic payment methods enabled by default (never hardcodes `payment_method_types`).
 * - Supports one-time payments & recurring billing (Academy lessons).
 * - Automatic tax calculation integration readiness.
 * - Cryptographic webhook signature verification via Web Crypto API (HMAC-SHA256).
 * - Webhook deduplication / idempotency management to prevent double-fulfillment.
 * - Customer Portal session creation for self-service billing management.
 */

export interface StripeConfig {
  secretKey?: string;
  publishableKey?: string;
  webhookSecret?: string;
  /**
   * Return simulated sessions when no real test key is configured. Only ever pass `true` for
   * ENVIRONMENT=local; everywhere else an unconfigured client throws StripeNotConfiguredError.
   */
  allowMock?: boolean;
  /** Injected fetch (tests); defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Thrown when a Stripe call is attempted without a real (test-mode) key and mocks are not allowed. */
export class StripeNotConfiguredError extends Error {
  constructor() {
    super('Stripe is not configured.');
    this.name = 'StripeNotConfiguredError';
  }
}

/** A real Stripe test-mode key (`sk_test_` / `rk_test_`, not a placeholder). */
export const isRealTestKey = (key?: string): key is string =>
  Boolean(key && (key.startsWith('sk_test_') || key.startsWith('rk_test_')) && !key.includes('placeholder'));

const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_TIMEOUT_MS = 10_000;

/** Thrown for a non-2xx Stripe response; carries Stripe's error code, never the raw body. */
export class StripeApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(`Stripe API error ${status}${code ? ` (${code})` : ''}`);
    this.name = 'StripeApiError';
  }
}

/**
 * POST to the Stripe API with a timeout. With an idempotency key, one retry is made on network
 * errors, 429 and 5xx (Stripe replays the original result for a repeated key).
 */
async function stripePost<T = { id: string; url: string }>(
  secretKey: string,
  path: string,
  params: URLSearchParams | null,
  idempotencyKey?: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  method: 'POST' | 'GET' = 'POST',
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  // GETs are safe to retry; POSTs only with an idempotency key (Stripe replays the original result).
  const attempts = idempotencyKey || method === 'GET' ? 2 : 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetchImpl(`${STRIPE_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          ...extraHeaders,
          ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        ...(method === 'POST' ? { body: (params ?? new URLSearchParams()).toString() } : {}),
        signal: AbortSignal.timeout(STRIPE_TIMEOUT_MS),
      });
      if (res.ok) return (await res.json()) as T;
      const body = (await res.json().catch(() => null)) as {
        error?: { code?: string; type?: string };
      } | null;
      lastError = new StripeApiError(res.status, body?.error?.code ?? body?.error?.type);
      if (res.status !== 429 && res.status < 500) break;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** Appends query parameters to a URL that may already have a query string. */
function withQuery(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export type CheckoutMode = 'payment' | 'subscription' | 'setup';

export interface CheckoutSessionOptions {
  mode?: CheckoutMode;
  customerEmail?: string;
  customerId?: string;
  amountMinorUnits?: number; // Integer minor currency units (e.g. 2500 for $25.00)
  currency?: string; // Default 'usd'
  description?: string;
  priceId?: string; // Existing Stripe Price ID (e.g. price_1...)
  successUrl: string;
  cancelUrl: string;
  automaticTax?: boolean;
  metadata?: Record<string, string>;
  subscriptionData?: {
    trialPeriodDays?: number;
    metadata?: Record<string, string>;
  };
  /** Sent as Stripe's Idempotency-Key; also enables one safe retry. */
  idempotencyKey?: string;
}

export interface CheckoutSessionResult {
  id: string;
  url?: string;
  mock?: boolean;
}

export interface CustomerPortalOptions {
  customerId: string;
  returnUrl: string;
}

export interface CustomerPortalResult {
  id: string;
  url: string;
  mock?: boolean;
}

export interface StripeWebhookEvent<T = unknown> {
  id: string;
  object: 'event';
  type: string;
  created: number;
  data: {
    object: T;
    previous_attributes?: Partial<T>;
  };
  livemode: boolean;
}

export interface IdempotencyStore {
  hasProcessed(eventId: string): Promise<boolean> | boolean;
  markProcessed(eventId: string, ttlSeconds?: number): Promise<void> | void;
}

/**
 * In-memory idempotency store for local development, tests, and ephemeral worker instances.
 */
export function createMemoryIdempotencyStore(): IdempotencyStore {
  const processed = new Map<string, number>();

  return {
    hasProcessed(eventId: string): boolean {
      const expiresAt = processed.get(eventId);
      if (!expiresAt) return false;
      if (Date.now() > expiresAt) {
        processed.delete(eventId);
        return false;
      }
      return true;
    },
    markProcessed(eventId: string, ttlSeconds = 86400): void {
      processed.set(eventId, Date.now() + ttlSeconds * 1000);
    },
  };
}

/**
 * Validates that the Stripe secret or restricted key is strictly in test mode.
 * Throws a fatal configuration error if a live key is attempted without authorization.
 */
export function assertStripeTestMode(secretKey?: string): void {
  if (!secretKey) return;

  if (secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_')) {
    throw new Error(
      '[Gamo Governance Gate] Live Stripe keys (sk_live_ / rk_live_) are strictly prohibited. ' +
        'All transactions must remain in test mode until the legal prerequisites in the transition checklist are finalized.',
    );
  }

  if (
    !secretKey.startsWith('sk_test_') &&
    !secretKey.startsWith('rk_test_') &&
    !secretKey.startsWith('mock_')
  ) {
    console.warn(
      '[Stripe Warning] Key does not start with standard test prefix "sk_test_" or "rk_test_". Verify configuration.',
    );
  }
}

/**
 * Helper to constant-time compare two hex strings to prevent timing attacks.
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifies a Stripe webhook signature using standard Web Crypto API (HMAC-SHA256).
 * Compatible with Cloudflare Workers, Node 18+, Deno, and Bun.
 */
export async function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  webhookSecret: string,
  toleranceSeconds = 300,
): Promise<{ valid: boolean; event?: StripeWebhookEvent; error?: string }> {
  if (!signatureHeader) {
    return { valid: false, error: 'Missing stripe-signature header' };
  }

  if (!webhookSecret) {
    return { valid: false, error: 'Webhook secret is not configured' };
  }

  // Parse stripe-signature header (t=timestamp,v1=signature,v1=signature2...)
  const items = signatureHeader.split(',');
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const item of items) {
    const [key, val] = item.split('=', 2);
    if (key === 't') {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed)) timestamp = parsed;
    } else if (key === 'v1') {
      signatures.push(val);
    }
  }

  if (timestamp === null || signatures.length === 0) {
    return { valid: false, error: 'Malformed stripe-signature header' };
  }

  // Verify timestamp tolerance against replay attacks
  const currentTimestamp = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTimestamp - timestamp) > toleranceSeconds) {
    return { valid: false, error: 'Webhook signature timestamp outside tolerance window' };
  }

  // Compute expected HMAC-SHA256 signature
  const payloadToSign = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadToSign));
    const computedHex = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Check if computed hex matches any of the v1 signatures using constant-time comparison
    const isValid = signatures.some((sig) => constantTimeCompare(computedHex, sig));
    if (!isValid) {
      return { valid: false, error: 'Webhook signature verification failed' };
    }

    const event = JSON.parse(rawBody) as StripeWebhookEvent;
    return { valid: true, event };
  } catch {
    return { valid: false, error: 'Webhook signature verification failed.' };
  }
}

/**
 * Stripe Invoicing (test mode only).
 *
 * Invoicing requests pin `Stripe-Version` (see the decision record in
 * packages/domain/src/invoices/stripe-invoicing.ts); webhook payloads use the version set on the
 * webhook endpoint, so `parseInvoiceEvent` only reads fields that are stable across versions.
 */
export const STRIPE_INVOICING_API_VERSION = '2026-10-28.endive';

export type StripeInvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
const STRIPE_INVOICE_STATUSES: readonly string[] = ['draft', 'open', 'paid', 'void', 'uncollectible'];

export interface StripeCustomerInput {
  name: string;
  email: string;
  metadata?: Record<string, string>;
  /** Required: sent as the Idempotency-Key header (POST /customers). */
  idempotencyKey: string;
}

export interface StripeCustomer {
  id: string;
}

export interface StripeInvoiceLineInput {
  description: string;
  /** Integer USD cents PER UNIT; the line total is `amountCents * quantity`. */
  amountCents: number;
  /** Integer >= 1; defaults to 1. */
  quantity?: number;
}

export interface CreateStripeInvoiceInput {
  customerId: string;
  /** Integer 1..365; with `collection_method=send_invoice` this is what lets Stripe mark it past due. */
  daysUntilDue: number;
  lines: StripeInvoiceLineInput[];
  metadata?: Record<string, string>;
  /** Required. Each Stripe POST of this call derives its own key from it (`<key>:invoice`, `<key>:item:<n>`). */
  idempotencyKey: string;
  description?: string;
}

export interface StripeInvoice {
  id: string;
  number?: string | null;
  status: StripeInvoiceStatus;
  hosted_invoice_url: string | null;
  /** Integer cents still due. */
  amount_due: number;
  /** Integer cents paid. */
  amount_paid: number;
  metadata: Record<string, string>;
  /** ISO timestamp; only set when Stripe reports `status_transitions.paid_at`. */
  paidAt?: string;
}

interface RawStripeInvoice {
  id?: unknown;
  number?: unknown;
  status?: unknown;
  hosted_invoice_url?: unknown;
  amount_due?: unknown;
  amount_paid?: unknown;
  metadata?: unknown;
  status_transitions?: { paid_at?: unknown } | null;
}

const isStringMap = (v: unknown): v is Record<string, string> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  Object.values(v).every((x) => typeof x === 'string');

const isoFromEpochSeconds = (v: unknown): string | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? new Date(v * 1000).toISOString() : undefined;

/** Normalizes a raw Stripe invoice object; throws without echoing the body if the shape is wrong. */
function toStripeInvoice(raw: RawStripeInvoice): StripeInvoice {
  if (
    typeof raw?.id !== 'string' ||
    typeof raw.status !== 'string' ||
    !STRIPE_INVOICE_STATUSES.includes(raw.status)
  ) {
    throw new Error('Unexpected Stripe invoice response shape.');
  }
  const paidAt = isoFromEpochSeconds(raw.status_transitions?.paid_at);
  return {
    id: raw.id,
    number: typeof raw.number === 'string' ? raw.number : null,
    status: raw.status as StripeInvoiceStatus,
    hosted_invoice_url: typeof raw.hosted_invoice_url === 'string' ? raw.hosted_invoice_url : null,
    amount_due: typeof raw.amount_due === 'number' ? raw.amount_due : 0,
    amount_paid: typeof raw.amount_paid === 'number' ? raw.amount_paid : 0,
    metadata: isStringMap(raw.metadata) ? raw.metadata : {},
    ...(paidAt ? { paidAt } : {}),
  };
}

const STRIPE_ID = /^[a-z]{2,4}_[A-Za-z0-9_]{1,80}$/;
function assertStripeId(prefix: 'cus' | 'in', id: string): void {
  if (!STRIPE_ID.test(id) || !id.startsWith(`${prefix}_`)) {
    throw new Error(`Invalid Stripe ${prefix} id.`);
  }
}

function assertIdempotencyKey(key: string): void {
  if (typeof key !== 'string' || key.length < 8 || key.length > 200) {
    throw new Error('An idempotency key of 8 to 200 characters is required.');
  }
}

function assertMetadata(metadata: Record<string, string> | undefined): void {
  if (!metadata) return;
  const entries = Object.entries(metadata);
  if (entries.length > 50) throw new Error('Stripe metadata allows at most 50 keys.');
  for (const [k, v] of entries) {
    if (k.length === 0 || k.length > 40 || typeof v !== 'string' || v.length > 500) {
      throw new Error('Stripe metadata keys are max 40 and values max 500 characters.');
    }
  }
}

function appendMetadata(params: URLSearchParams, metadata: Record<string, string> | undefined): void {
  for (const [k, v] of Object.entries(metadata ?? {})) params.append(`metadata[${k}]`, v);
}

function assertInvoiceInput(input: CreateStripeInvoiceInput): void {
  assertStripeId('cus', input.customerId);
  assertIdempotencyKey(input.idempotencyKey);
  if (!Number.isInteger(input.daysUntilDue) || input.daysUntilDue < 1 || input.daysUntilDue > 365) {
    throw new Error('daysUntilDue must be an integer from 1 to 365.');
  }
  if (input.lines.length < 1 || input.lines.length > 250) {
    throw new Error('An invoice needs 1 to 250 lines.');
  }
  for (const line of input.lines) {
    const quantity = line.quantity ?? 1;
    if (!Number.isSafeInteger(line.amountCents) || line.amountCents < 1) {
      throw new Error('Invoice line amounts must be positive integer cents.');
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new Error('Invoice line quantity must be an integer of at least 1.');
    }
    if (line.description.trim().length === 0 || line.description.length > 500) {
      throw new Error('Invoice line descriptions must be 1 to 500 characters.');
    }
  }
  assertMetadata(input.metadata);
}

export type InvoiceEventStatus = 'paid' | 'payment_failed';

export interface ParsedInvoiceEvent {
  stripeInvoiceId: string;
  status: InvoiceEventStatus;
  /** ISO timestamp (paid events only, when Stripe reports it). */
  paidAt?: string;
  /** Integer cents (paid events only). */
  amountPaid?: number;
  metadata: Record<string, string>;
}

/**
 * Reads an `invoice.paid` / `invoice.payment_failed` event (already signature-verified through
 * `verifyStripeWebhookSignature`). Returns `null` for any other event type or a malformed object, so
 * the webhook route can acknowledge-and-ignore it. `invoice.paid` covers card/ACH payments and
 * out-of-band payments alike, so it is the only success event we listen to.
 */
export function parseInvoiceEvent(event: StripeWebhookEvent<unknown>): ParsedInvoiceEvent | null {
  const status: InvoiceEventStatus | null =
    event.type === 'invoice.paid'
      ? 'paid'
      : event.type === 'invoice.payment_failed'
        ? 'payment_failed'
        : null;
  if (!status) return null;
  const obj = event.data?.object as RawStripeInvoice | undefined;
  if (!obj || typeof obj.id !== 'string' || !obj.id.startsWith('in_')) return null;
  const metadata = isStringMap(obj.metadata) ? obj.metadata : {};
  if (status === 'payment_failed') return { stripeInvoiceId: obj.id, status, metadata };
  const paidAt = isoFromEpochSeconds(obj.status_transitions?.paid_at);
  return {
    stripeInvoiceId: obj.id,
    status,
    ...(paidAt ? { paidAt } : {}),
    ...(typeof obj.amount_paid === 'number' ? { amountPaid: obj.amount_paid } : {}),
    metadata,
  };
}

/**
 * Creates a test-mode Stripe client suitable for Cloudflare Workers.
 */
export function createStripeTestClient(config?: StripeConfig) {
  const secretKey = config?.secretKey;
  const fetchImpl = config?.fetchImpl;
  const allowMock = config?.allowMock === true;
  assertStripeTestMode(secretKey);

  /** true → use the simulated path; throws when simulation is not allowed. */
  const useMock = (): boolean => {
    if (isRealTestKey(secretKey)) return false;
    if (!allowMock) throw new StripeNotConfiguredError();
    return true;
  };

  const INVOICING_HEADERS = { 'Stripe-Version': STRIPE_INVOICING_API_VERSION };

  /** Invoicing never simulates: a real test key is required (see createCustomer). */
  const invoicingKey = (): string => {
    assertStripeTestMode(secretKey);
    if (!isRealTestKey(secretKey)) throw new StripeNotConfiguredError();
    return secretKey;
  };

  const retrieveInvoice = async (invoiceId: string): Promise<StripeInvoice> => {
    const key = invoicingKey();
    assertStripeId('in', invoiceId);
    return toStripeInvoice(
      await stripePost<RawStripeInvoice>(
        key,
        `/invoices/${invoiceId}`,
        null,
        undefined,
        fetchImpl,
        'GET',
        INVOICING_HEADERS,
      ),
    );
  };

  return {
    /** A real test-mode key is present, or simulation is explicitly allowed (local only). */
    isConfigured(): boolean {
      return isRealTestKey(secretKey) || allowMock;
    },

    /**
     * Creates a test checkout session following modern Stripe best practices:
     * - Dynamic payment methods (no hardcoded payment_method_types)
     * - Supports one-time payments and recurring subscriptions
     * - Optional automatic tax calculation
     */
    async createTestCheckoutSession(options: CheckoutSessionOptions): Promise<CheckoutSessionResult> {
      assertStripeTestMode(secretKey);
      const mode = options.mode || 'payment';

      // Simulated session (local development only; see StripeConfig.allowMock).
      if (useMock()) {
        const mockSessionId = `cs_test_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        console.warn(`[Stripe mock checkout] mode=${mode} session=${mockSessionId}`);
        return {
          id: mockSessionId,
          url: withQuery(options.successUrl.replace('{CHECKOUT_SESSION_ID}', mockSessionId), {
            session_id: mockSessionId,
            test_mode: 'true',
          }),
          mock: true,
        };
      }

      // Real Stripe Test Mode API call via Workers native fetch
      const params = new URLSearchParams();
      params.append('mode', mode);
      params.append('success_url', options.successUrl);
      params.append('cancel_url', options.cancelUrl);

      // Line items configuration
      if (options.priceId) {
        params.append('line_items[0][price]', options.priceId);
        params.append('line_items[0][quantity]', '1');
      } else if (options.amountMinorUnits !== undefined) {
        params.append('line_items[0][price_data][currency]', options.currency || 'usd');
        params.append(
          'line_items[0][price_data][product_data][name]',
          options.description || 'Gamo Studios Program',
        );
        params.append('line_items[0][price_data][unit_amount]', options.amountMinorUnits.toString());
        params.append('line_items[0][quantity]', '1');

        if (mode === 'subscription') {
          params.append('line_items[0][price_data][recurring][interval]', 'month');
        }
      } else {
        throw new Error('Either amountMinorUnits or priceId must be provided for Checkout Session');
      }

      // Customer association
      if (options.customerId) {
        params.append('customer', options.customerId);
      } else if (options.customerEmail) {
        params.append('customer_email', options.customerEmail);
      }

      // Automatic Tax (Stripe Tax)
      if (options.automaticTax) {
        params.append('automatic_tax[enabled]', 'true');
      }

      // Subscription specifics
      if (mode === 'subscription' && options.subscriptionData?.trialPeriodDays) {
        params.append(
          'subscription_data[trial_period_days]',
          options.subscriptionData.trialPeriodDays.toString(),
        );
      }

      // Metadata
      if (options.metadata) {
        for (const [k, v] of Object.entries(options.metadata)) {
          params.append(`metadata[${k}]`, v);
        }
      }

      const data = await stripePost(
        secretKey!,
        '/checkout/sessions',
        params,
        options.idempotencyKey,
        fetchImpl,
      );
      return {
        id: data.id,
        url: data.url,
        mock: false,
      };
    },

    /**
     * Creates a Customer Portal session for self-service subscription and payment method management.
     */
    async createCustomerPortalSession(options: CustomerPortalOptions): Promise<CustomerPortalResult> {
      assertStripeTestMode(secretKey);

      if (useMock()) {
        const mockPortalId = `bps_test_mock_${Date.now()}`;
        return {
          id: mockPortalId,
          url: withQuery(options.returnUrl, { portal_mock: 'true' }),
          mock: true,
        };
      }

      const params = new URLSearchParams();
      params.append('customer', options.customerId);
      params.append('return_url', options.returnUrl);

      const data = await stripePost(secretKey!, '/billing_portal/sessions', params, undefined, fetchImpl);
      return {
        id: data.id,
        url: data.url,
        mock: false,
      };
    },

    /**
     * Invoicing (test mode). Unlike checkout there is no simulated path, not even locally: without a
     * real test key every invoicing call throws StripeNotConfiguredError and the caller falls back
     * to the manual invoice flow. Live keys already throw in createStripeTestClient.
     */
    async createCustomer(input: StripeCustomerInput): Promise<StripeCustomer> {
      const key = invoicingKey();
      assertIdempotencyKey(input.idempotencyKey);
      assertMetadata(input.metadata);
      const params = new URLSearchParams();
      params.append('name', input.name);
      params.append('email', input.email);
      appendMetadata(params, input.metadata);
      const data = await stripePost<{ id: string }>(
        key,
        '/customers',
        params,
        input.idempotencyKey,
        fetchImpl,
        'POST',
        INVOICING_HEADERS,
      );
      return { id: data.id };
    },

    /**
     * Creates a DRAFT send_invoice invoice (card + ACH) and attaches one invoice item per line.
     * Order matters: the invoice is created first and items are attached with `invoice=<id>`, so
     * nothing is ever left as a customer-level pending item that another invoice could sweep up.
     * Finalize separately with `finalizeInvoice`.
     */
    async createInvoice(input: CreateStripeInvoiceInput): Promise<StripeInvoice> {
      const key = invoicingKey();
      assertInvoiceInput(input);

      const invoiceParams = new URLSearchParams();
      invoiceParams.append('customer', input.customerId);
      invoiceParams.append('collection_method', 'send_invoice');
      invoiceParams.append('days_until_due', String(input.daysUntilDue));
      invoiceParams.append('currency', 'usd');
      invoiceParams.append('auto_advance', 'false');
      invoiceParams.append('pending_invoice_items_behavior', 'exclude');
      invoiceParams.append('payment_settings[payment_method_types][0]', 'card');
      invoiceParams.append('payment_settings[payment_method_types][1]', 'us_bank_account');
      if (input.description) invoiceParams.append('description', input.description);
      appendMetadata(invoiceParams, input.metadata);
      const draft = toStripeInvoice(
        await stripePost<RawStripeInvoice>(
          key,
          '/invoices',
          invoiceParams,
          `${input.idempotencyKey}:invoice`,
          fetchImpl,
          'POST',
          INVOICING_HEADERS,
        ),
      );

      for (const [i, line] of input.lines.entries()) {
        const itemParams = new URLSearchParams();
        itemParams.append('customer', input.customerId);
        itemParams.append('invoice', draft.id);
        itemParams.append('currency', 'usd');
        itemParams.append('description', line.description);
        itemParams.append('quantity', String(line.quantity ?? 1));
        itemParams.append('unit_amount_decimal', String(line.amountCents));
        await stripePost(
          key,
          '/invoiceitems',
          itemParams,
          `${input.idempotencyKey}:item:${i}`,
          fetchImpl,
          'POST',
          INVOICING_HEADERS,
        );
      }
      // Re-read so amount_due reflects the attached items.
      return retrieveInvoice(draft.id);
    },

    /** Finalizes a draft (draft -> open); the response carries `hosted_invoice_url`. Sends no email. */
    async finalizeInvoice(invoiceId: string): Promise<StripeInvoice> {
      const key = invoicingKey();
      assertStripeId('in', invoiceId);
      return toStripeInvoice(
        await stripePost<RawStripeInvoice>(
          key,
          `/invoices/${invoiceId}/finalize`,
          new URLSearchParams({ auto_advance: 'false' }),
          `gamo-finalize-${invoiceId}`,
          fetchImpl,
          'POST',
          INVOICING_HEADERS,
        ),
      );
    },

    retrieveInvoice,

    /** Voids an `open` (or uncollectible) invoice. A draft cannot be voided; Stripe rejects it (400). */
    async voidInvoice(invoiceId: string): Promise<StripeInvoice> {
      const key = invoicingKey();
      assertStripeId('in', invoiceId);
      return toStripeInvoice(
        await stripePost<RawStripeInvoice>(
          key,
          `/invoices/${invoiceId}/void`,
          null,
          `gamo-void-${invoiceId}`,
          fetchImpl,
          'POST',
          INVOICING_HEADERS,
        ),
      );
    },
  };
}
