/**
 * The real Stripe client (docs/LIVE_PAYMENTS.md §1, docs/LIVE_REQUIREMENTS.md §8 item 32): `fetch` to
 * https://api.stripe.com/v1 with form-encoded bodies (nested keys such as `line_items[0][price_data][unit_amount]`),
 * `Authorization: Bearer`, `Stripe-Account` for connected accounts and `Idempotency-Key` on every create. 10 s timeout,
 * one retry on network errors, 429 and 5xx only when the request is idempotent (GET, DELETE or a request with an
 * idempotency key). Errors keep Stripe's status and code only (`StripeApiError`), never the body. Works with test keys
 * today and live keys once the owner approves production; which key is allowed where is decided in `resolve.ts`.
 *
 * Nothing here logs: the key, the request bodies and Stripe's answers may carry personal data.
 */
import { bytesToHex, randomBytes } from '../../security/crypto.ts';
import {
  StripeApiError,
  type AccountParams,
  type CheckoutSessionParams,
  type LocationParams,
  type PaymentIntentParams,
  type RefundParams,
  type RequestOptions,
  type StripeAccount,
  type StripeAccountLink,
  type StripeBalanceTransaction,
  type StripeCheckoutSession,
  type StripeGateway,
  type StripeLocation,
  type StripePaymentIntent,
  type StripeReader,
  type StripeRefund,
  type StripeTransfer,
  type TransferParams,
} from './types.ts';

export const STRIPE_API_BASE = 'https://api.stripe.com';
export const STRIPE_TIMEOUT_MS = 10_000;

/** A form value: scalars, nested objects (`a[b]`) and arrays (`a[0]`, or `a[]` for scalar lists). */
export type FormValue =
  string | number | boolean | null | undefined | FormValue[] | { [key: string]: FormValue };

/**
 * Stripe's form encoding. Objects nest as `a[b][c]`; arrays of objects as `a[0][b]`; arrays of scalars as `a[]`.
 * `null` and `undefined` are left out. Order follows the object, so the body is deterministic.
 */
export function encodeStripeForm(params: Record<string, FormValue>): string {
  const pairs: string[] = [];
  const add = (key: string, value: FormValue): void => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object') add(`${key}[${i}]`, item);
        else add(`${key}[]`, item);
      });
      return;
    }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) add(`${key}[${k}]`, v);
      return;
    }
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };
  for (const [k, v] of Object.entries(params)) add(k, v);
  return pairs.join('&');
}

// ── Parameter builders (Stripe's field names; shared with the tests) ───────────────────────────────────────────

export function checkoutSessionForm(p: CheckoutSessionParams): Record<string, FormValue> {
  const intentData: Record<string, FormValue> = { metadata: { ...p.metadata } };
  if (p.applicationFeeCents !== undefined && p.applicationFeeCents > 0)
    intentData.application_fee_amount = p.applicationFeeCents;
  if (p.transferGroup) intentData.transfer_group = p.transferGroup;
  return {
    mode: 'payment',
    line_items: p.lineItems.map((line) => ({
      price_data: {
        currency: p.currency,
        product_data: { name: line.name },
        unit_amount: line.unitAmountCents,
      },
      quantity: line.quantity,
    })),
    customer_email: p.customerEmail ?? undefined,
    client_reference_id: p.clientReferenceId,
    metadata: { ...p.metadata },
    payment_intent_data: intentData,
    expires_at: p.expiresAt,
    success_url: p.successUrl,
    cancel_url: p.cancelUrl,
  };
}

export function paymentIntentForm(p: PaymentIntentParams): Record<string, FormValue> {
  return {
    amount: p.amountCents,
    currency: p.currency,
    allowed_payment_method_types: p.cardPresent ? ['card_present'] : undefined,
    capture_method: 'automatic',
    application_fee_amount:
      p.applicationFeeCents !== undefined && p.applicationFeeCents > 0 ? p.applicationFeeCents : undefined,
    transfer_group: p.transferGroup,
    description: p.description,
    metadata: { ...p.metadata },
  };
}

export function refundForm(p: RefundParams): Record<string, FormValue> {
  return {
    payment_intent: p.paymentIntentId,
    amount: p.amountCents,
    refund_application_fee: p.refundApplicationFee ? true : undefined,
    reason: p.reason,
    metadata: { ...p.metadata },
  };
}

export function transferForm(p: TransferParams): Record<string, FormValue> {
  return {
    amount: p.amountCents,
    currency: p.currency,
    destination: p.destination,
    transfer_group: p.transferGroup,
    source_transaction: p.sourceTransaction,
    metadata: { ...p.metadata },
  };
}

/**
 * Connected accounts with controller properties (docs/LIVE_PAYMENTS.md §1). Mode A (`direct_charges`): the
 * organization pays Stripe's fees, Stripe carries payment losses, full Stripe Dashboard, card payments and transfers.
 * Mode B (`transfers_only`): Gamo pays the fees and carries losses, Stripe collects requirements, Express Dashboard,
 * transfers only.
 */
export function accountForm(p: AccountParams): Record<string, FormValue> {
  const direct = p.purpose === 'direct_charges';
  return {
    country: 'US',
    email: p.email ?? undefined,
    business_profile: { name: p.businessName },
    controller: direct
      ? { fees: { payer: 'account' }, losses: { payments: 'stripe' }, stripe_dashboard: { type: 'full' } }
      : {
          fees: { payer: 'application' },
          losses: { payments: 'application' },
          requirement_collection: 'stripe',
          stripe_dashboard: { type: 'express' },
        },
    capabilities: direct
      ? { card_payments: { requested: true }, transfers: { requested: true } }
      : { transfers: { requested: true } },
    metadata: { ...p.metadata },
  };
}

export function locationForm(p: LocationParams): Record<string, FormValue> {
  return {
    display_name: p.displayName,
    address: {
      line1: p.address.line1,
      city: p.address.city,
      state: p.address.state,
      postal_code: p.address.postalCode,
      country: p.address.country,
    },
    metadata: { ...p.metadata },
  };
}

// ── The client ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface StripeHttpConfig {
  secretKey: string;
  fetchImpl?: typeof fetch;
  /** Tests only. */
  apiBase?: string;
  timeoutMs?: number;
}

interface CallInput {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  form?: Record<string, FormValue>;
  query?: Record<string, FormValue>;
  opts?: RequestOptions;
  /** Creates always carry a key: the caller's, or a fresh random one (still safe to retry once). */
  create?: boolean;
}

const seg = (id: string): string => {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_]{1,255}$/.test(id))
    throw new StripeApiError(400, 'invalid_id');
  return encodeURIComponent(id);
};

function stripeCodeOf(body: unknown): string | null {
  const err = (body as { error?: { code?: unknown; type?: unknown } } | null)?.error;
  if (typeof err?.code === 'string' && /^[a-z0-9_]{1,80}$/.test(err.code)) return err.code;
  if (typeof err?.type === 'string' && /^[a-z0-9_]{1,80}$/.test(err.type)) return err.type;
  return null;
}

export function createStripeHttpGateway(config: StripeHttpConfig): StripeGateway {
  const key = config.secretKey.trim();
  if (!/^(sk|rk)_(test|live)_/.test(key)) throw new Error('createStripeHttpGateway: not a Stripe secret key');
  const livemode = /^(sk|rk)_live_/.test(key);
  const doFetch = config.fetchImpl ?? fetch;
  const base = config.apiBase ?? STRIPE_API_BASE;
  const timeoutMs = config.timeoutMs ?? STRIPE_TIMEOUT_MS;

  async function call<T>(input: CallInput): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
    if (input.opts?.account) headers['Stripe-Account'] = input.opts.account;
    let idempotencyKey = input.opts?.idempotencyKey;
    if (input.create && !idempotencyKey) idempotencyKey = `gamo_${bytesToHex(randomBytes(16))}`;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    let url = `${base}/v1${input.path}`;
    if (input.query) {
      const qs = encodeStripeForm(input.query);
      if (qs) url += `?${qs}`;
    }
    let body: string | undefined;
    if (input.method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = encodeStripeForm(input.form ?? {});
    }
    const retryable = input.method !== 'POST' || Boolean(idempotencyKey);
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await doFetch(url, {
          method: input.method,
          headers,
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        if (retryable && attempt === 0) continue;
        throw new StripeApiError(0, 'network_error');
      }
      if ((response.status === 429 || response.status >= 500) && retryable && attempt === 0) continue;
      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        parsed = null;
      }
      if (!response.ok) throw new StripeApiError(response.status, stripeCodeOf(parsed));
      if (parsed === null || typeof parsed !== 'object')
        throw new StripeApiError(response.status, 'invalid_response');
      return parsed as T;
    }
  }

  return {
    kind: 'stripe',
    livemode,

    createCheckoutSession: async (params, opts) =>
      call<StripeCheckoutSession>({
        method: 'POST',
        path: '/checkout/sessions',
        form: checkoutSessionForm(params),
        opts,
        create: true,
      }),
    retrieveCheckoutSession: async (id, opts) =>
      call({ method: 'GET', path: `/checkout/sessions/${seg(id)}`, opts }),
    expireCheckoutSession: async (id, opts) =>
      call({ method: 'POST', path: `/checkout/sessions/${seg(id)}/expire`, opts }),

    createPaymentIntent: async (params, opts) =>
      call<StripePaymentIntent>({
        method: 'POST',
        path: '/payment_intents',
        form: paymentIntentForm(params),
        opts,
        create: true,
      }),
    retrievePaymentIntent: async (id, opts) =>
      call({ method: 'GET', path: `/payment_intents/${seg(id)}`, opts }),
    cancelPaymentIntent: async (id, opts) =>
      call({ method: 'POST', path: `/payment_intents/${seg(id)}/cancel`, opts }),

    createRefund: async (params, opts) =>
      call<StripeRefund>({ method: 'POST', path: '/refunds', form: refundForm(params), opts, create: true }),
    createTransfer: async (params, opts) =>
      call<StripeTransfer>({
        method: 'POST',
        path: '/transfers',
        form: transferForm(params),
        opts,
        create: true,
      }),

    createAccount: async (params, opts) =>
      call<StripeAccount>({
        method: 'POST',
        path: '/accounts',
        form: accountForm(params),
        opts: { idempotencyKey: opts.idempotencyKey },
        create: true,
      }),
    retrieveAccount: async (id) => call<StripeAccount>({ method: 'GET', path: `/accounts/${seg(id)}` }),
    createAccountLink: async (input) =>
      call<StripeAccountLink>({
        method: 'POST',
        path: '/account_links',
        form: {
          account: input.account,
          refresh_url: input.refreshUrl,
          return_url: input.returnUrl,
          type: 'account_onboarding',
        },
      }),

    createLocation: async (params, opts) =>
      call<StripeLocation>({
        method: 'POST',
        path: '/terminal/locations',
        form: locationForm(params),
        opts,
        create: true,
      }),
    registerReader: async (input, opts) =>
      call<StripeReader>({
        method: 'POST',
        path: '/terminal/readers',
        form: { registration_code: input.registrationCode, location: input.location, label: input.label },
        opts,
        create: true,
      }),
    retrieveReader: async (id, opts) => call({ method: 'GET', path: `/terminal/readers/${seg(id)}`, opts }),
    processPaymentIntentOnReader: async (readerId, paymentIntentId, opts) =>
      call({
        method: 'POST',
        path: `/terminal/readers/${seg(readerId)}/process_payment_intent`,
        form: { payment_intent: paymentIntentId },
        opts,
      }),
    cancelReaderAction: async (readerId, opts) =>
      call({ method: 'POST', path: `/terminal/readers/${seg(readerId)}/cancel_action`, opts }),
    deleteReader: async (readerId, opts) => {
      await call({ method: 'DELETE', path: `/terminal/readers/${seg(readerId)}`, opts });
    },
    presentPaymentMethod: async (readerId, opts) => {
      if (livemode) throw new StripeApiError(400, 'test_helper_live_mode');
      return call<StripeReader>({
        method: 'POST',
        path: `/test_helpers/terminal/readers/${seg(readerId)}/present_payment_method`,
        opts,
      });
    },

    listBalanceTransactions: async (filter, opts) => {
      const list = await call<{ data?: StripeBalanceTransaction[] }>({
        method: 'GET',
        path: '/balance_transactions',
        query: { source: filter.source, payout: filter.payout, limit: filter.limit ?? 100 },
        opts,
      });
      return Array.isArray(list.data) ? list.data : [];
    },
  };
}
