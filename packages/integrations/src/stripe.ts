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
 * - Supports one-time payments (Gamo Live event tickets) & recurring billing (Academy lessons).
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
     * Gamo Live ticket checkout (test mode only; no simulation here — local mocks live in the caller).
     * One line item per order item, `expires_at` (Stripe allows 30 min – 24 h after creation),
     * `metadata` + `client_reference_id` for reconciliation, and the idempotency key.
     */
    async createTicketCheckoutSession(options: TicketCheckoutOptions): Promise<TicketCheckoutResult> {
      assertStripeTestMode(secretKey);
      if (!isRealTestKey(secretKey)) throw new StripeNotConfiguredError();
      const params = new URLSearchParams();
      params.append('mode', 'payment');
      params.append('success_url', options.successUrl);
      params.append('cancel_url', options.cancelUrl);
      params.append('expires_at', String(Math.floor(options.expiresAt)));
      if (options.customerEmail) params.append('customer_email', options.customerEmail);
      if (options.clientReferenceId) params.append('client_reference_id', options.clientReferenceId);
      options.lineItems.forEach((item, i) => {
        params.append(`line_items[${i}][price_data][currency]`, options.currency);
        params.append(`line_items[${i}][price_data][product_data][name]`, item.name.slice(0, 250));
        params.append(`line_items[${i}][price_data][unit_amount]`, String(item.unitAmount));
        params.append(`line_items[${i}][quantity]`, String(item.quantity));
      });
      for (const [k, v] of Object.entries(options.metadata ?? {})) {
        params.append(`metadata[${k}]`, v);
        params.append(`payment_intent_data[metadata][${k}]`, v);
      }
      const data = await stripePost<{ id: string; url: string; expires_at?: number }>(
        secretKey,
        '/checkout/sessions',
        params,
        options.idempotencyKey,
        fetchImpl,
      );
      return { id: data.id, url: data.url, expiresAt: data.expires_at ?? options.expiresAt };
    },

    /** Reads a Checkout Session (payment status, amount, payment intent). */
    async retrieveCheckoutSession(sessionId: string): Promise<StripeCheckoutSessionObject> {
      assertStripeTestMode(secretKey);
      if (!isRealTestKey(secretKey)) throw new StripeNotConfiguredError();
      if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new StripeApiError(400, 'invalid_session_id');
      return stripePost<StripeCheckoutSessionObject>(
        secretKey,
        `/checkout/sessions/${sessionId}`,
        null,
        undefined,
        fetchImpl,
        'GET',
      );
    },

    /** Refunds part or all of a payment (test mode). The idempotency key makes a retry safe. */
    async createRefund(options: RefundOptions): Promise<StripeRefundObject> {
      assertStripeTestMode(secretKey);
      if (!isRealTestKey(secretKey)) throw new StripeNotConfiguredError();
      const params = new URLSearchParams();
      params.append('payment_intent', options.paymentIntentId);
      params.append('amount', String(options.amountMinorUnits));
      params.append('reason', options.reason ?? 'requested_by_customer');
      for (const [k, v] of Object.entries(options.metadata ?? {})) params.append(`metadata[${k}]`, v);
      return stripePost<StripeRefundObject>(secretKey, '/refunds', params, options.idempotencyKey, fetchImpl);
    },
  };
}

export interface TicketCheckoutOptions {
  lineItems: Array<{ name: string; unitAmount: number; quantity: number }>;
  currency: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  /** Epoch seconds; 30 minutes to 24 hours after creation. */
  expiresAt: number;
  metadata?: Record<string, string>;
  clientReferenceId?: string;
  idempotencyKey: string;
}

export interface TicketCheckoutResult {
  id: string;
  url: string;
  expiresAt: number;
}

export interface StripeCheckoutSessionObject {
  id: string;
  object?: 'checkout.session';
  status?: 'open' | 'complete' | 'expired';
  payment_status?: 'paid' | 'unpaid' | 'no_payment_required';
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  expires_at?: number;
  livemode?: boolean;
}

export interface RefundOptions {
  paymentIntentId: string;
  amountMinorUnits: number;
  idempotencyKey: string;
  reason?: 'requested_by_customer' | 'duplicate' | 'fraudulent';
  metadata?: Record<string, string>;
}

export interface StripeRefundObject {
  id: string;
  status?: string;
  amount?: number;
  payment_intent?: string | null;
}
