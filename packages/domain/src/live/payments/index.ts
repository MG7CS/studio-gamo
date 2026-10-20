/**
 * Picks the payment routing for an organization (docs/LIVE_PAYMENTS.md §1). Pages and orchestration call
 * `resolvePaymentRouting` and then only the `PaymentRouting` methods; they never branch on the mode.
 */
import type { SqlDatabase } from '../../security/sql-database.ts';
import type { PaidEnv } from '../paid-types.ts';
import { createModeARouting } from './mode-a.ts';
import { createModeBRouting } from './mode-b.ts';
import { organizationPaymentsStatus, stripeModeOf } from './resolve.ts';
import { createStandinGateway, type StandinDelivery } from './standin.ts';
import { createStripeHttpGateway } from './stripe-http.ts';
import type { ResolvedRouting, StripeGateway } from './types.ts';

export * from './types.ts';
export * from './resolve.ts';

export interface GatewayOptions {
  /** Stand-in only: where its signed events go (the app passes its webhook receiver). */
  deliver?: StandinDelivery;
}

/** The gateway for this environment, or null when Stripe is not reachable (no key and no stand-in). */
export function stripeGatewayFor(
  db: SqlDatabase,
  env: PaidEnv,
  options: GatewayOptions = {},
): StripeGateway | null {
  const mode = stripeModeOf(env);
  if (mode === 'stripe') return createStripeHttpGateway({ secretKey: String(env.STRIPE_SECRET_KEY).trim() });
  if (mode === 'standin') return createStandinGateway(db, env, options.deliver);
  return null;
}

/** The routing for an organization's card sales, or why they are unavailable. */
export async function resolvePaymentRouting(
  db: SqlDatabase,
  env: PaidEnv,
  organizationId: string,
  options: GatewayOptions = {},
): Promise<ResolvedRouting> {
  const status = await organizationPaymentsStatus(db, env, organizationId);
  const gateway = stripeGatewayFor(db, env, options);
  if (!status.cardSalesAvailable || !status.flow || !gateway || !status.org?.connectedAccountId)
    return { available: false, reason: status.reason ?? 'stripe_not_configured', flow: status.flow };
  const routing =
    status.flow === 'organizer_account'
      ? createModeARouting(gateway, status.org.connectedAccountId)
      : createModeBRouting(gateway, status.org.connectedAccountId);
  return { available: true, routing };
}
