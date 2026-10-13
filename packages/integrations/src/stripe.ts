/**
 * Stripe Test-Mode Integration for Cloudflare Workers.
 *
 * ORGANIZATIONAL POLICY GATE:
 * Per docs/GAMO_NONPROFIT_MODEL.md and docs/NONPROFIT_TRANSITION_CHECKLIST.md,
 * live payment processing (donations, memberships, sponsorships) is strictly disabled
 * until legal 501(c)(3) formation prerequisites are authorized by the founder and board.
 *
 * Only test-mode keys (`sk_test_` / `pk_test_`) are permitted.
 * Live keys (`sk_live_`) are actively blocked by this integration.
 */

export interface StripeConfig {
  secretKey?: string;
  publishableKey?: string;
  webhookSecret?: string;
}

export interface CheckoutSessionOptions {
  customerEmail?: string;
  amountMinorUnits: number; // In cents / integer minor units
  currency?: string; // default 'usd'
  description: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CheckoutSessionResult {
  id: string;
  url?: string;
  mock?: boolean;
}

/**
 * Validates that the Stripe secret key is strictly in test mode.
 * Throws a fatal configuration error if a live key is attempted without authorization.
 */
export function assertStripeTestMode(secretKey?: string): void {
  if (!secretKey) return;

  if (secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_')) {
    throw new Error(
      '[Gamo Governance Gate] Live Stripe secret keys (sk_live_) are strictly prohibited. ' +
      'All transactions must remain in test mode until 501(c)(3) legal transition prerequisites are finalized.'
    );
  }

  if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('rk_test_') && !secretKey.startsWith('mock_')) {
    console.warn(
      '[Stripe Warning] Key does not start with standard test prefix "sk_test_". Verify configuration.'
    );
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
      return Boolean(secretKey && secretKey.startsWith('sk_test_'));
    },

    /**
     * Simulates or creates a test checkout session.
     */
    async createTestCheckoutSession(options: CheckoutSessionOptions): Promise<CheckoutSessionResult> {
      assertStripeTestMode(secretKey);

      // Safe mock simulation if test key is unconfigured or a mock placeholder
      if (!secretKey || secretKey.startsWith('mock_') || secretKey.includes('placeholder')) {
        const mockSessionId = `cs_test_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        console.log(
          `[Stripe Mock Checkout] Amount: $${(options.amountMinorUnits / 100).toFixed(2)} ${options.currency ?? 'usd'} | Description: "${options.description}" (Session: ${mockSessionId})`
        );
        return {
          id: mockSessionId,
          url: `${options.successUrl}?session_id=${mockSessionId}&test_mode=true`,
          mock: true,
        };
      }

      // Real Stripe Test Mode API call via Workers fetch
      const params = new URLSearchParams();
      params.append('payment_method_types[]', 'card');
      params.append('mode', 'payment');
      params.append('success_url', options.successUrl);
      params.append('cancel_url', options.cancelUrl);
      params.append('line_items[0][price_data][currency]', options.currency || 'usd');
      params.append('line_items[0][price_data][product_data][name]', options.description);
      params.append('line_items[0][price_data][unit_amount]', options.amountMinorUnits.toString());
      params.append('line_items[0][quantity]', '1');

      if (options.customerEmail) {
        params.append('customer_email', options.customerEmail);
      }

      if (options.metadata) {
        for (const [k, v] of Object.entries(options.metadata)) {
          params.append(`metadata[${k}]`, v);
        }
      }

      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
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
  };
}
