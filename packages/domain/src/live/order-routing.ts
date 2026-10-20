/**
 * The payment routing for an EXISTING order (docs/LIVE_PAYMENTS.md §1: "refunds, disputes and reader payments always
 * use the account the order was charged on"). Rebuilt from the order's snapshotted `funds_flow` and
 * `stripe_account_id`; the current platform default or organization override is never read for an existing order,
 * so a later change of mode cannot send a refund to the wrong account.
 */
import { allRows, type SqlDatabase } from '../security/sql-database.ts';
import type { FundsFlow, PaidEnv } from './paid-types.ts';
import { stripeGatewayFor } from './payments/index.ts';
import { createModeARouting } from './payments/mode-a.ts';
import { createModeBRouting } from './payments/mode-b.ts';
import type { PaymentRouting, StripeGateway } from './payments/types.ts';

export type OrderRoutingResult =
  | { available: true; routing: PaymentRouting }
  /** `no_stripe`: a cash, comp or free order; `stripe_not_configured`: no key and no stand-in here. */
  | { available: false; reason: 'not_found' | 'no_stripe' | 'stripe_not_configured' | 'account_missing' };

/** Pure: the routing for a snapshotted mode and account on a gateway. */
export function routingForSnapshot(
  gateway: StripeGateway,
  snapshot: { fundsFlow: FundsFlow; stripeAccountId: string | null; payoutAccountId: string | null },
): PaymentRouting | null {
  if (snapshot.fundsFlow === 'organizer_account')
    return snapshot.stripeAccountId ? createModeARouting(gateway, snapshot.stripeAccountId) : null;
  // Mode B charges were made on Gamo's own account; the payout account only matters for later transfers.
  return createModeBRouting(gateway, snapshot.payoutAccountId);
}

/** The routing an existing order's refunds and reader payments must use. */
export async function resolvePaymentRoutingForOrder(
  db: SqlDatabase,
  env: PaidEnv,
  orderId: string,
): Promise<OrderRoutingResult> {
  const row = (
    await allRows<{
      funds_flow: FundsFlow | null;
      stripe_account_id: string | null;
      payout_account: string | null;
    }>(db, {
      sql: `SELECT r.funds_flow, r.stripe_account_id, p.connected_account_id AS payout_account
              FROM orders r LEFT JOIN organization_payments p ON p.organization_id = r.organization_id
             WHERE r.id = ?1`,
      params: [orderId],
    })
  )[0];
  if (!row) return { available: false, reason: 'not_found' };
  if (!row.funds_flow) return { available: false, reason: 'no_stripe' };
  const gateway = stripeGatewayFor(db, env);
  if (!gateway) return { available: false, reason: 'stripe_not_configured' };
  const routing = routingForSnapshot(gateway, {
    fundsFlow: row.funds_flow,
    stripeAccountId: row.stripe_account_id,
    payoutAccountId: row.payout_account,
  });
  return routing ? { available: true, routing } : { available: false, reason: 'account_missing' };
}
