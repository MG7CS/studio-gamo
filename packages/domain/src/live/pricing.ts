/**
 * Unit prices in force for paid ticket types (docs/LIVE_REQUIREMENTS.md §8.1 item 3, docs/LIVE_PAYMENTS.md §2 step 1):
 * the first price deadline still ahead applies (early bird), else the type's own price. Every price a buyer sees is
 * computed here on the server; nothing is read from a form.
 */
import { allRows, type SqlDatabase } from '../security/sql-database.ts';

export interface PriceDeadline {
  priceCents: number;
  endsAt: number;
}

/** The unit price at `now`: the deadline ending soonest that has not passed yet, else the type's price. */
export function unitPriceAt(
  typePriceCents: number,
  deadlines: readonly PriceDeadline[],
  now: number,
): number {
  let best: PriceDeadline | null = null;
  for (const d of deadlines) if (d.endsAt > now && (!best || d.endsAt < best.endsAt)) best = d;
  return best ? best.priceCents : typePriceCents;
}

/** When the price in force changes next (the deadline that applies now), or null. */
export function nextPriceChangeAt(deadlines: readonly PriceDeadline[], now: number): number | null {
  const ahead = deadlines.filter((d) => d.endsAt > now).map((d) => d.endsAt);
  return ahead.length ? Math.min(...ahead) : null;
}

/** Unit prices in force at `now` for every ticket type of an event, by type id. */
export async function unitPricesForEvent(
  db: SqlDatabase,
  eventId: string,
  now: number,
): Promise<Map<string, number>> {
  const rows = await allRows<{
    id: string;
    price_cents: number;
    deadline_price: number | null;
    ends_at: number | null;
  }>(db, {
    sql: `SELECT t.id, t.price_cents, d.price_cents AS deadline_price, d.ends_at
              FROM ticket_types t LEFT JOIN price_deadlines d ON d.ticket_type_id = t.id AND d.ends_at > ?2
             WHERE t.event_id = ?1`,
    params: [eventId, now],
  });
  const byType = new Map<string, { price: number; deadlines: PriceDeadline[] }>();
  for (const r of rows) {
    const entry = byType.get(r.id) ?? { price: r.price_cents, deadlines: [] };
    if (r.deadline_price != null && r.ends_at != null)
      entry.deadlines.push({ priceCents: r.deadline_price, endsAt: r.ends_at });
    byType.set(r.id, entry);
  }
  const out = new Map<string, number>();
  for (const [id, e] of byType) out.set(id, unitPriceAt(e.price, e.deadlines, now));
  return out;
}
