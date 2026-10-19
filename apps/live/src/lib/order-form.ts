/**
 * View model of the order form on `/events/[id]/register` (free RSVP and paid checkout share it).
 */
import {
  categoryAvailability,
  categoryBadge,
  formatMoney,
  quantityFieldName,
  ticketsLeft,
  unitPrice,
  type SaleContext,
} from '@gamo/domain';

export interface OrderFormOption {
  field: string;
  categoryId: string;
  sectionId: string | null;
  title: string;
  badge: string | null;
  description: string | null;
  priceLabel: string;
  priceCents: number;
  remaining: number;
  max: number;
  available: boolean;
  unavailableReason: string | null;
  notes: string[];
}

const REASONS: Record<string, string> = {
  hidden: 'Not available',
  closed: 'Sales closed',
  sold_out: 'Sold out',
  not_started: 'Not on sale yet',
  ended: 'Sales ended',
};

export function orderFormOptions(ctx: SaleContext, now: number): OrderFormOption[] {
  const out: OrderFormOption[] = [];
  for (const c of ctx.categories) {
    if (c.status === 'hidden') continue;
    const availability = categoryAvailability(c, now);
    const sections = ctx.sections.filter((s) => s.tier_id === c.id && s.status === 'active');
    const notes: string[] = [];
    if (c.kind === 'companion' && c.requires_companion_of) {
      const base = ctx.categories.find((x) => x.id === c.requires_companion_of);
      notes.push(`One per ${base?.name ?? 'accessible'} ticket in the same order.`);
    }
    if (c.valid_days_json) {
      try {
        const days = JSON.parse(c.valid_days_json) as string[];
        notes.push(`Valid on ${days.join(', ')}.`);
      } catch {
        /* ignore */
      }
    }
    if (c.sales_end_at) notes.push('Sales for this ticket end before the event.');
    const base = (s: (typeof sections)[number] | null): OrderFormOption => {
      const remaining = ticketsLeft(c, s);
      const price = unitPrice(c, s);
      const limit = Math.min(
        c.per_order_limit ?? ctx.policy.maxTicketsPerOrder,
        ctx.policy.maxTicketsPerOrder,
      );
      const available = availability.ok && remaining > 0;
      return {
        field: quantityFieldName(c.id, s?.id ?? null),
        categoryId: c.id,
        sectionId: s?.id ?? null,
        title: s ? `${c.name} — Section ${s.name}` : c.name,
        badge: categoryBadge({
          kind: c.kind,
          max_age: c.max_age,
          seats_per_ticket: Number(c.seats_per_ticket),
        }),
        description: c.description ?? c.note,
        priceLabel: price === 0 ? 'Free' : formatMoney(price, c.currency),
        priceCents: price,
        remaining,
        max: Math.max(0, Math.min(limit, remaining)),
        available,
        unavailableReason: available
          ? null
          : availability.ok
            ? 'Sold out'
            : (REASONS[availability.reason] ?? 'Not available'),
        notes: [
          ...notes,
          ...(s?.gate_label ? [`Gate ${s.gate_label}`] : []),
          ...(s?.accessible ? ['Accessible section'] : []),
        ],
      };
    };
    if (sections.length === 0) out.push(base(null));
    else for (const s of sections) out.push(base(s));
  }
  return out;
}
