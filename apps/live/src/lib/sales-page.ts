/**
 * The sales summary of a paid event (docs/LIVE_SCREENS.md §I.3 O5; docs/LIVE_REQUIREMENTS.md §8.4 item 28): totals for
 * the event and per date, read from the ledger by `@gamo/domain`'s reports, and, for owners, the check of each card
 * order against the payment processor's records. Nothing here computes money; it only arranges the domain's numbers.
 */
import {
  PaidError,
  SecretNotConfiguredError,
  StripeApiError,
  paymentsRuntime,
  reconcileEvent,
  salesByDate,
  salesSummary,
  type PaidEnv,
  type ReconciliationLine,
  type SalesSummary,
  type SqlDatabase,
} from '@gamo/domain';
import { METHOD_LABELS } from './orders-page';

export interface SalesLine {
  label: string;
  cents: number;
  /** One short line on what the number is. */
  note?: string;
}

/** The summary as the lines of one card, in the order money moves (every amount from the ledger). */
export function salesLines(s: SalesSummary): SalesLine[] {
  const lines: SalesLine[] = [
    { label: 'Ticket prices', cents: s.grossCents, note: 'Before discounts' },
    { label: 'Discounts', cents: -s.discountCents },
    { label: 'Ticket sales', cents: s.ticketSalesCents, note: 'Online and at the door, cash included' },
  ];
  if (s.feeAbsorbedCents !== 0) lines.push({ label: 'Gamo fee you absorbed', cents: s.feeAbsorbedCents });
  if (s.giftsCents !== 0) lines.push({ label: 'Gifts to your organization', cents: s.giftsCents });
  if (s.refundsCents !== 0) lines.push({ label: 'Refunds', cents: s.refundsCents });
  if (s.disputesCents !== 0) lines.push({ label: 'Disputes', cents: s.disputesCents });
  if (s.processingCostCents !== 0)
    lines.push({
      label: 'Card processing',
      cents: s.processingCostCents,
      note: 'Recorded when checked against the processor',
    });
  return lines;
}

/** Door sales by method, in words. */
export function doorLines(s: SalesSummary): Array<{ label: string; orders: number; cents: number }> {
  return s.doorByMethod.map((d) => ({
    label: METHOD_LABELS[d.method],
    orders: d.orders,
    cents: d.amountCents,
  }));
}

export interface SalesPageView {
  total: SalesSummary;
  byDate: Array<SalesSummary & { startsAt: number }>;
}

export async function salesPageView(
  db: SqlDatabase,
  input: { organizationId: string; eventId: string },
): Promise<SalesPageView> {
  const [total, byDate] = await Promise.all([salesSummary(db, input), salesByDate(db, input)]);
  return { total, byDate };
}

export const RECONCILE_STATUS: Record<
  ReconciliationLine['status'],
  { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }
> = {
  matched: { label: 'Matches', tone: 'success' },
  mismatch: { label: 'Does not match', tone: 'danger' },
  missing_in_stripe: { label: 'Not found at the processor', tone: 'warning' },
  unavailable: { label: 'Could not be checked', tone: 'neutral' },
};

export type ReconcileResult =
  { kind: 'done'; lines: ReconciliationLine[]; recorded: number } | { kind: 'error'; notice: string };

/**
 * Owners only: each card order's ledger lines next to the processor's records; the processing cost found is written to
 * the ledger once (so the summary's net includes it).
 */
export async function runReconcile(input: {
  db: SqlDatabase;
  env: PaidEnv;
  organizationId: string;
  eventId: string;
  isOwner: boolean;
  now: number;
}): Promise<ReconcileResult> {
  if (!input.isOwner) return { kind: 'error', notice: 'Only an owner of the organization can do this.' };
  const runtime = paymentsRuntime(input.db, input.env);
  const gateway = runtime.gateway();
  if (!gateway)
    return {
      kind: 'error',
      notice: 'Card payments are not set up here, so there is nothing to check against yet.',
    };
  try {
    const r = await reconcileEvent(input.db, input.env, {
      organizationId: input.organizationId,
      eventId: input.eventId,
      now: input.now,
      record: true,
      gateway,
    });
    await runtime.flush();
    return { kind: 'done', lines: r.lines, recorded: r.recorded };
  } catch (error) {
    if (
      error instanceof PaidError ||
      error instanceof SecretNotConfiguredError ||
      error instanceof StripeApiError
    )
      return { kind: 'error', notice: 'The payment processor could not be reached. Please try again later.' };
    throw error;
  }
}
