/**
 * The payment interface (docs/LIVE_PAYMENTS.md §1). Two layers:
 *
 * - `StripeGateway`: the low-level Stripe API Gamo uses, in Stripe's own object shapes (snake_case). Two
 *   implementations: the HTTP client (`stripe-http.ts`, `fetch` with form-encoded bodies and idempotency keys, test or
 *   live keys) and the local stand-in (`standin.ts`, only where ENVIRONMENT=local, or in the test harness).
 * - `PaymentRouting`: what pages and orchestration call. Mode A (`mode-a.ts`, the organization's own connected account,
 *   direct charges) and Mode B (`mode-b.ts`, Gamo's account, transfers later) both sit on a gateway. Callers never branch
 *   on the mode; `resolvePaymentRouting` (index.ts) picks it from the settings and the organization.
 */
import type { Currency, FundsFlow, Seller, StripeEvent } from '../paid-types.ts';

// ── Gateway: Stripe objects (only the fields Gamo reads) ───────────────────────────────────────────────────────

export interface RequestOptions {
  /** A connected account (`Stripe-Account` header); null or absent = Gamo's own account. */
  account?: string | null;
  idempotencyKey?: string;
}

export interface CheckoutLineItem {
  name: string;
  unitAmountCents: number;
  quantity: number;
}

export interface CheckoutSessionParams {
  lineItems: readonly CheckoutLineItem[];
  currency: Currency;
  customerEmail: string | null;
  clientReferenceId: string;
  /** Copied to the session and to the PaymentIntent (`payment_intent_data[metadata]`). */
  metadata: Readonly<Record<string, string>>;
  successUrl: string;
  cancelUrl: string;
  /** Epoch seconds, 30 minutes to 24 hours after creation. */
  expiresAt: number;
  /** Mode A only, when above 0. */
  applicationFeeCents?: number;
  /** Mode B: groups the charge with its later transfer. */
  transferGroup?: string;
}

export interface StripeCheckoutSession {
  id: string;
  object: 'checkout.session';
  url: string | null;
  status: 'open' | 'complete' | 'expired';
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  amount_total: number | null;
  currency: string | null;
  client_reference_id: string | null;
  payment_intent: string | null;
  expires_at: number;
  metadata: Record<string, string>;
  livemode: boolean;
}

export interface PaymentIntentParams {
  amountCents: number;
  currency: Currency;
  /** Card-present for readers (`allowed_payment_method_types[]=card_present`). */
  cardPresent: boolean;
  metadata: Readonly<Record<string, string>>;
  applicationFeeCents?: number;
  transferGroup?: string;
  description?: string;
}

export interface StripePaymentIntent {
  id: string;
  object: 'payment_intent';
  amount: number;
  amount_received: number;
  currency: string;
  status:
    | 'requires_payment_method'
    | 'requires_confirmation'
    | 'requires_action'
    | 'processing'
    | 'requires_capture'
    | 'canceled'
    | 'succeeded';
  latest_charge: string | null;
  metadata: Record<string, string>;
  livemode: boolean;
}

export interface RefundParams {
  paymentIntentId: string;
  amountCents: number;
  metadata: Readonly<Record<string, string>>;
  /** Mode A: give back the proportional application fee too. */
  refundApplicationFee?: boolean;
  reason?: 'requested_by_customer' | 'duplicate' | 'fraudulent';
}

export interface StripeRefund {
  id: string;
  object: 'refund';
  amount: number;
  currency: string;
  payment_intent: string | null;
  status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled';
  metadata: Record<string, string>;
}

export interface TransferParams {
  amountCents: number;
  currency: Currency;
  destination: string;
  transferGroup?: string;
  sourceTransaction?: string;
  metadata: Readonly<Record<string, string>>;
}

export interface StripeTransfer {
  id: string;
  object: 'transfer';
  amount: number;
  currency: string;
  destination: string;
}

export interface StripeAccount {
  id: string;
  object: 'account';
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: { currently_due: string[]; disabled_reason: string | null } | null;
}

export interface AccountParams {
  /** Mode A accounts take payments (`card_payments` + `transfers`); Mode B accounts only receive transfers. */
  purpose: 'direct_charges' | 'transfers_only';
  email: string | null;
  businessName: string;
  metadata: Readonly<Record<string, string>>;
}

export interface StripeAccountLink {
  object: 'account_link';
  url: string;
  expires_at: number;
}

export interface LocationParams {
  displayName: string;
  address: { line1: string; city: string; state: string; postalCode: string; country: 'US' };
  metadata: Readonly<Record<string, string>>;
}

export interface StripeLocation {
  id: string;
  object: 'terminal.location';
  display_name: string;
}

export interface StripeReader {
  id: string;
  object: 'terminal.reader';
  label: string;
  device_type: string;
  status: 'online' | 'offline' | null;
  location: string | null;
  action: {
    type: string;
    status: 'in_progress' | 'succeeded' | 'failed';
    failure_code: string | null;
    failure_message: string | null;
    process_payment_intent?: { payment_intent: string };
  } | null;
}

export interface StripeBalanceTransaction {
  id: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  type: string;
  source: string | null;
  created: number;
}

/** Stripe answered with an error. Only Stripe's status and code are kept, never the raw body. */
export class StripeApiError extends Error {
  readonly status: number;
  readonly stripeCode: string | null;
  constructor(status: number, stripeCode: string | null) {
    super(`stripe_api_error ${status} ${stripeCode ?? ''}`.trim());
    this.name = 'StripeApiError';
    this.status = status;
    this.stripeCode = stripeCode;
  }
  /** A definite refusal (4xx other than 409 and 429): retrying the same request will not help. */
  get definite(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 409 && this.status !== 429;
  }
}

/** The Stripe API calls Gamo makes. Every create call takes an idempotency key. */
export interface StripeGateway {
  readonly kind: 'stripe' | 'standin';
  /** False in test mode and for the stand-in. */
  readonly livemode: boolean;

  createCheckoutSession(params: CheckoutSessionParams, opts: RequestOptions): Promise<StripeCheckoutSession>;
  retrieveCheckoutSession(id: string, opts: RequestOptions): Promise<StripeCheckoutSession>;
  /** Only while the session is `open`. */
  expireCheckoutSession(id: string, opts: RequestOptions): Promise<StripeCheckoutSession>;

  createPaymentIntent(params: PaymentIntentParams, opts: RequestOptions): Promise<StripePaymentIntent>;
  retrievePaymentIntent(id: string, opts: RequestOptions): Promise<StripePaymentIntent>;
  cancelPaymentIntent(id: string, opts: RequestOptions): Promise<StripePaymentIntent>;

  createRefund(params: RefundParams, opts: RequestOptions): Promise<StripeRefund>;
  createTransfer(params: TransferParams, opts: RequestOptions): Promise<StripeTransfer>;

  createAccount(params: AccountParams, opts: RequestOptions): Promise<StripeAccount>;
  retrieveAccount(id: string): Promise<StripeAccount>;
  createAccountLink(input: {
    account: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<StripeAccountLink>;

  createLocation(params: LocationParams, opts: RequestOptions): Promise<StripeLocation>;
  registerReader(
    input: { registrationCode: string; label: string; location: string },
    opts: RequestOptions,
  ): Promise<StripeReader>;
  retrieveReader(id: string, opts: RequestOptions): Promise<StripeReader>;
  processPaymentIntentOnReader(
    readerId: string,
    paymentIntentId: string,
    opts: RequestOptions,
  ): Promise<StripeReader>;
  cancelReaderAction(readerId: string, opts: RequestOptions): Promise<StripeReader>;
  deleteReader(readerId: string, opts: RequestOptions): Promise<void>;
  /** Test mode and stand-in only: a simulated reader "taps" a test card. */
  presentPaymentMethod(readerId: string, opts: RequestOptions): Promise<StripeReader>;

  listBalanceTransactions(
    filter: { source?: string; payout?: string; limit?: number },
    opts: RequestOptions,
  ): Promise<StripeBalanceTransaction[]>;
}

// ── Routing: what pages and orchestration call ─────────────────────────────────────────────────────────────────

export interface OrderCheckoutInput {
  orderId: string;
  orderReference: string;
  eventTitle: string;
  lines: readonly CheckoutLineItem[];
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  expiresAt: number;
  /** The Gamo fee in cents (taken as an application fee in Mode A when above 0). */
  gamoFeeCents: number;
}

export interface CardPresentInput {
  orderId: string;
  orderReference: string;
  amountCents: number;
  gamoFeeCents: number;
  description: string;
}

export interface RoutingRefundInput {
  refundId: string;
  orderId: string;
  paymentIntentId: string;
  amountCents: number;
  /** True when the whole fee share should go back with it (Mode A application fee). */
  refundFee: boolean;
}

export interface AccountReadiness {
  /** The account can take payments for this mode (Mode A: charges_enabled; Mode B: payouts_enabled). */
  ready: boolean;
  connectedAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: number;
}

/** Payments for one organization in one funds-flow mode. */
export interface PaymentRouting {
  readonly flow: FundsFlow;
  readonly seller: Seller;
  /** The account charges go to (null = Gamo's own account). Snapshotted on the order. */
  readonly chargeAccountId: string | null;
  readonly gateway: StripeGateway;

  createCheckout(input: OrderCheckoutInput): Promise<StripeCheckoutSession>;
  expireCheckout(sessionId: string): Promise<void>;
  createCardPresentPayment(input: CardPresentInput): Promise<StripePaymentIntent>;
  refund(input: RoutingRefundInput): Promise<StripeRefund>;
}

/** Why card sales are unavailable for an organization right now (shown to the organizer and the admin). */
export type PaymentsUnavailableReason =
  | 'mode_not_chosen'
  | 'stripe_not_configured'
  | 'webhook_missing'
  | 'connect_webhook_missing'
  | 'account_missing'
  | 'account_not_ready';

export type ResolvedRouting =
  | { available: true; routing: PaymentRouting }
  | { available: false; reason: PaymentsUnavailableReason; flow: FundsFlow | null };

/** Verifies a webhook body against one or more signing secrets; returns the event or null. */
export type VerifyStripeSignature = (input: {
  rawBody: string;
  signatureHeader: string | null;
  secrets: readonly string[];
  now: number;
  toleranceSeconds?: number;
}) => Promise<StripeEvent | null>;
