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
  assertStripeTestMode(secretKey);

  return {
    isConfigured(): boolean {
      return Boolean(secretKey && (secretKey.startsWith('sk_test_') || secretKey.startsWith('rk_test_')));
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

      // Safe mock simulation if test key is unconfigured or a mock placeholder
      if (!secretKey || secretKey.startsWith('mock_') || secretKey.includes('placeholder')) {
        const mockSessionId = `cs_test_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        console.warn(`[Stripe mock checkout] mode=${mode} session=${mockSessionId}`);
        return {
          id: mockSessionId,
          url: `${options.successUrl.replace('{CHECKOUT_SESSION_ID}', mockSessionId)}?session_id=${mockSessionId}&test_mode=true`,
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

      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Stripe Test API error (${res.status}): ${errText}`);
      }

      const data = (await res.json()) as { id: string; url: string };
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

      if (!secretKey || secretKey.startsWith('mock_') || secretKey.includes('placeholder')) {
        const mockPortalId = `bps_test_mock_${Date.now()}`;
        return {
          id: mockPortalId,
          url: `${options.returnUrl}?portal_mock=true`,
          mock: true,
        };
      }

      const params = new URLSearchParams();
      params.append('customer', options.customerId);
      params.append('return_url', options.returnUrl);

      const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Stripe Portal API error (${res.status}): ${errText}`);
      }

      const data = (await res.json()) as { id: string; url: string };
      return {
        id: data.id,
        url: data.url,
        mock: false,
      };
    },
  };
}
