/**
 * Read-only queries the roster and request screens need beside the domain functions. Parameterised SQL
 * only; no writes. The only ordering here is chronological (an offer history); people are never ordered
 * by anything but name, and that ordering lives in the domain.
 */
import { allRows, type Db, type OfferStatus } from '@gamo/domain/worship';

export interface MemberOffer {
  id: string;
  requestId: string;
  churchName: string;
  /** `YYYY-MM-DD`. */
  serviceDate: string;
  role: string;
  payCents: number;
  status: OfferStatus;
  sentAt: number;
  expiresAt: number;
  respondedAt: number | null;
}

const HISTORY_LIMIT = 100;

/** A roster member's offers, newest first. Never selects the token hash. */
export async function listMemberOffers(db: Db, rosterMemberId: string): Promise<MemberOffer[]> {
  const rows = await allRows<{
    id: string;
    request_id: string;
    church_name: string;
    service_date: string;
    role: string;
    pay_cents: number;
    status: OfferStatus;
    sent_at: number;
    expires_at: number;
    responded_at: number | null;
  }>(
    db,
    `SELECT o.id, o.request_id, r.church_name, r.service_date, o.role, o.pay_cents, o.status, o.sent_at,
            o.expires_at, o.responded_at
       FROM offers o JOIN service_requests r ON r.id = o.request_id
      WHERE o.roster_member_id = ?1
      ORDER BY o.sent_at DESC, o.id LIMIT ?2`,
    rosterMemberId,
    HISTORY_LIMIT,
  );
  return rows.map((r) => ({
    id: r.id,
    requestId: r.request_id,
    churchName: r.church_name,
    serviceDate: r.service_date,
    role: r.role,
    payCents: r.pay_cents,
    status: r.status,
    sentAt: r.sent_at,
    expiresAt: r.expires_at,
    respondedAt: r.responded_at,
  }));
}
