/**
 * Who may sell paid tickets (docs/LIVE_REQUIREMENTS.md §8.1 item 7, proposal): an organization can publish a paid
 * event only when it is verified (meeting held, admin verified), its payments are ready for its funds-flow mode, and
 * an owner accepted the current organizer terms. The checklist names exactly what is missing and where it is fixed;
 * screens decide how to show it. Cash- and comp-only selling still needs verification and the terms.
 */
import { allRows, type SqlDatabase } from '../security/sql-database.ts';
import { TERMS_REGISTRY } from '../terms/registry.ts';
import type { PaidEnv } from './paid-types.ts';
import { organizationPaymentsStatus } from './payments/resolve.ts';
import type { PaymentsUnavailableReason } from './payments/types.ts';

export interface ChecklistItem {
  ok: boolean;
  /** Where the organizer fixes it. */
  fixPath: string;
}

export interface SellingChecklist {
  verified: ChecklistItem;
  paymentsReady: ChecklistItem & { reason: PaymentsUnavailableReason | null };
  termsAccepted: ChecklistItem & { version: string };
  /** Every item is done: paid events can be published with card sales. */
  canPublishPaidEvent: boolean;
  /** Verified and terms accepted: cash and comp selling at the door is allowed even without card payments. */
  canSellWithoutCards: boolean;
}

export const CHECKLIST_PATHS = {
  verified: '/organizer/organization',
  paymentsReady: '/organizer/organization/payments',
  termsAccepted: '/organizer/terms',
} as const;

/** The "who may sell" checklist for an organization. */
export async function sellingChecklist(
  db: SqlDatabase,
  env: PaidEnv,
  organizationId: string,
): Promise<SellingChecklist> {
  const version = TERMS_REGISTRY['organizer-terms'].version;
  const [[org], payments] = await Promise.all([
    allRows<{ verified_at: number | null; status: string; terms: number }>(db, {
      sql: `SELECT g.verified_at, g.status,
                   EXISTS (SELECT 1 FROM memberships m JOIN terms_acceptances a ON a.organizer_id = m.organizer_id
                            WHERE m.organization_id = g.id AND m.role = 'owner'
                              AND a.document = 'organizer-terms' AND a.version = ?2) AS terms
              FROM organizations g WHERE g.id = ?1`,
      params: [organizationId, version],
    }),
    organizationPaymentsStatus(db, env, organizationId),
  ]);
  const active = org?.status === 'active';
  const verified = active && org?.verified_at != null;
  const termsAccepted = active && org?.terms === 1;
  const paymentsReady = active && payments.cardSalesAvailable;
  return {
    verified: { ok: verified, fixPath: CHECKLIST_PATHS.verified },
    paymentsReady: { ok: paymentsReady, fixPath: CHECKLIST_PATHS.paymentsReady, reason: payments.reason },
    termsAccepted: { ok: termsAccepted, fixPath: CHECKLIST_PATHS.termsAccepted, version },
    canPublishPaidEvent: verified && paymentsReady && termsAccepted,
    canSellWithoutCards: verified && termsAccepted,
  };
}

/** True when the organization may publish (or submit for review) a paid event. */
export async function canPublishPaidEvent(
  db: SqlDatabase,
  env: PaidEnv,
  organizationId: string,
): Promise<boolean> {
  return (await sellingChecklist(db, env, organizationId)).canPublishPaidEvent;
}

/** Whether a paid event's organization can take card payments right now (shown before a buyer chooses tickets). */
export async function eventCardSalesAvailable(
  db: SqlDatabase,
  env: PaidEnv,
  eventId: string,
): Promise<boolean> {
  const [row] = await allRows<{ organization_id: string | null }>(db, {
    sql: 'SELECT organization_id FROM events WHERE id = ?1',
    params: [eventId],
  });
  if (!row?.organization_id) return false;
  return (await organizationPaymentsStatus(db, env, row.organization_id)).cardSalesAvailable;
}
