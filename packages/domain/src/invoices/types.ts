/** Shared invoice vocabulary (pure; no DB, no Astro). */

/** Where an invoice came from. */
export const INVOICE_SOURCE_TYPES = ['service_request', 'academy_registration', 'manual'] as const;
export type InvoiceSourceType = (typeof INVOICE_SOURCE_TYPES)[number];

/** Our invoice lifecycle (Stripe's `uncollectible` is folded into `open`; see stripe-invoicing.ts). */
export const INVOICE_STATUSES = ['draft', 'open', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
