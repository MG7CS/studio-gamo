/**
 * What the Live app and the admin need around payments for one request (docs/LIVE_PAYMENTS.md §4 and §9): the
 * webhook handler map, the webhook receiver, the payment routing for an organization or an existing order, and, on
 * local development with the Stripe stand-in, delivering the stand-in's signed events to the same receiver before the
 * response is sent (a Worker may not run timers after it answers).
 */
import type { SqlDatabase } from '../security/sql-database.ts';
import { readerWebhookHandlers } from './readers.ts';
import { orderEventHandlers } from './order-events.ts';
import { resolvePaymentRoutingForOrder } from './order-routing.ts';
import type { PaidEnv, StripeEventHandlers } from './paid-types.ts';
import { accountUpdated } from './payment-settings.ts';
import { resolvePaymentRouting, stripeGatewayFor, stripeModeOf } from './payments/index.ts';
import { registerStandinDelivery, standinDeliverPending, type StandinDelivery } from './payments/standin.ts';
import type { ResolvedRouting, StripeGateway } from './payments/types.ts';
import { receiveStripeWebhook } from './webhooks.ts';

/** Every Stripe event type Gamo Live handles, mapped to its handler. Anything else is recorded as ignored. */
export const liveStripeHandlers: StripeEventHandlers = {
  ...orderEventHandlers,
  ...(readerWebhookHandlers as StripeEventHandlers),
  'account.updated': accountUpdated,
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

export interface PaymentsRuntime {
  /** Handles one webhook request body (the route passes the raw text and the `Stripe-Signature` header). */
  receive(
    rawBody: string | Uint8Array,
    signatureHeader: string | null,
    endpoint: 'platform' | 'connect',
  ): Promise<{
    status: number;
    body: string;
  }>;
  /** The routing for an organization's new card sale, or why card sales are unavailable. */
  routingForOrganization(organizationId: string): Promise<ResolvedRouting>;
  /** The routing an existing order was charged on (its snapshot, never the current settings). */
  routingForOrder(orderId: string): ReturnType<typeof resolvePaymentRoutingForOrder>;
  /** The gateway for this environment (null without Stripe and without the stand-in). */
  gateway(): StripeGateway | null;
  /** True with the local stand-in (pages show its "Test mode" wording and local links). */
  readonly standin: boolean;
  /** Delivers pending stand-in events now (no-op with real Stripe). Call before answering a request that paid,
   * refunded, canceled or changed anything at the stand-in. */
  flush(): Promise<void>;
}

/** The payments runtime for one request. */
export function paymentsRuntime(db: SqlDatabase, env: PaidEnv): PaymentsRuntime {
  const standin = stripeModeOf(env) === 'standin';
  const receive: PaymentsRuntime['receive'] = (rawBody, signatureHeader, endpoint) =>
    receiveStripeWebhook({
      db,
      env,
      rawBody,
      signatureHeader,
      endpoint,
      now: nowSeconds(),
      handlers: liveStripeHandlers,
    });
  const deliver: StandinDelivery = async (rawBody, signatureHeader, endpoint) => ({
    status: (await receive(rawBody, signatureHeader, endpoint)).status,
  });
  if (standin) registerStandinDelivery(deliver);
  return {
    receive,
    standin,
    routingForOrganization: (organizationId) => resolvePaymentRouting(db, env, organizationId, { deliver }),
    routingForOrder: (orderId) => resolvePaymentRoutingForOrder(db, env, orderId),
    gateway: () => stripeGatewayFor(db, env, { deliver }),
    async flush() {
      if (standin) await standinDeliverPending(db, env, nowSeconds());
    },
  };
}
