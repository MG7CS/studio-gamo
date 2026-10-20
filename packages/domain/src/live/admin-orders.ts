/**
 * Orders across every organization, for the admin's Payments tab (docs/LIVE_SCREENS.md C6). Read-only.
 */
import { allRows, type SqlDatabase } from '../security/sql-database.ts';
import type { OrderStatus } from './paid-types.ts';

export interface AdminOrderFilter {
  q: string;
  /** An order status, or `disputed`. */
  status: OrderStatus | 'disputed' | null;
  /** Who sold it: the organization (Mode A) or Gamo (Mode B). */
  seller: 'organization' | 'gamo' | null;
}

export interface AdminOrderRow {
  id: string;
  reference: string;
  status: OrderStatus;
  seller: 'organization' | 'gamo';
  paymentMethod: string;
  channel: string;
  disputed: boolean;
  buyerName: string | null;
  buyerEmail: string | null;
  totalCents: number;
  amountRefundedCents: number;
  currency: string;
  createdAt: number;
  eventTitle: string;
  organizationId: string;
  organizationName: string;
}

export const ADMIN_ORDER_LIMIT = 200;

/**
 * Orders of every organization, newest first (preview orders never show). Read-only; the search matches the
 * reference (with or without its dash), the buyer's name or email, or the organization's name.
 */
export async function searchAdminOrders(db: SqlDatabase, filter: AdminOrderFilter): Promise<AdminOrderRow[]> {
  const params: string[] = [];
  const where = ['o.is_preview = 0'];
  if (filter.status === 'disputed') where.push('o.disputed = 1');
  else if (filter.status) {
    params.push(filter.status);
    where.push(`o.status = ?${params.length}`);
  }
  if (filter.seller) {
    params.push(filter.seller);
    where.push(`o.seller = ?${params.length}`);
  }
  const q = filter.q.trim();
  if (q) {
    const escape = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);
    params.push(`%${escape(q.toLowerCase())}%`, `%${escape(q.toUpperCase().replace(/[\s-]+/g, ''))}%`);
    const a = params.length - 1;
    where.push(
      `(lower(COALESCE(o.buyer_name, '')) LIKE ?${a} ESCAPE '\\' OR lower(COALESCE(o.buyer_email, '')) LIKE ?${a} ESCAPE '\\'` +
        ` OR lower(g.name) LIKE ?${a} ESCAPE '\\' OR replace(o.reference, '-', '') LIKE ?${a + 1} ESCAPE '\\')`,
    );
  }
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT o.id, o.reference, o.status, o.seller, o.payment_method, o.channel, o.disputed, o.buyer_name,
                 o.buyer_email, o.total_cents, o.amount_refunded_cents, o.currency, o.created_at, e.title,
                 g.id AS org_id, g.name AS org_name
            FROM orders o JOIN events e ON e.id = o.event_id JOIN organizations g ON g.id = o.organization_id
           WHERE ${where.join(' AND ')}
           ORDER BY o.created_at DESC, o.id LIMIT ${ADMIN_ORDER_LIMIT}`,
    params,
  });
  return rows.map((r) => ({
    id: String(r.id),
    reference: String(r.reference),
    status: r.status as OrderStatus,
    seller: r.seller as 'organization' | 'gamo',
    paymentMethod: String(r.payment_method),
    channel: String(r.channel),
    disputed: Number(r.disputed) === 1,
    buyerName: r.buyer_name == null ? null : String(r.buyer_name),
    buyerEmail: r.buyer_email == null ? null : String(r.buyer_email),
    totalCents: Number(r.total_cents),
    amountRefundedCents: Number(r.amount_refunded_cents),
    currency: String(r.currency),
    createdAt: Number(r.created_at),
    eventTitle: String(r.title),
    organizationId: String(r.org_id),
    organizationName: String(r.org_name),
  }));
}
