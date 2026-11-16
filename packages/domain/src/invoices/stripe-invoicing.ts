/**
 * Maps a Gamo invoice onto the Stripe Invoicing request (pure; the DB-bound send lives elsewhere).
 *
 * RESEARCH AND DECISION RECORD (AGENTS.md "Research first"; researched 2026-11-16)
 *
 * Sources (official Stripe docs, read 2026-11-16; current API version 2026-10-28.endive):
 * - https://docs.stripe.com/invoicing/integration (create customer, invoice, invoice items, finalize,
 *   send, hosted page, `invoice.paid` vs `invoice.payment_succeeded`, 250-item limit)
 * - https://docs.stripe.com/api/invoices/create (collection_method, days_until_due, auto_advance,
 *   pending_invoice_items_behavior default `exclude`, payment_settings.payment_method_types incl.
 *   `card` and `us_bank_account`, `number` max 26 chars, metadata)
 * - https://docs.stripe.com/api/invoiceitems/create (`invoice` attaches an item to a draft invoice;
 *   `quantity` + `unit_amount_decimal`; integer smallest-currency-unit amounts)
 * - https://docs.stripe.com/invoicing/overview (statuses draft/open/paid/void/uncollectible; only
 *   `open`/`uncollectible` can be voided, drafts are deleted; `invoice.paid` fires for card, ACH and
 *   out-of-band payments)
 * - https://docs.stripe.com/invoicing/send-email (the /send endpoint emails the customer; finalized
 *   invoice emails depend on a Dashboard setting; "disable Stripe invoice emails and send your own"
 *   keeps the webhooks)
 * - https://docs.stripe.com/api/idempotent_requests (every v1 POST accepts Idempotency-Key, up to 255
 *   chars, kept at least 24 h, same key + different parameters is an error, replays the saved result
 *   including 500s)
 * - https://docs.stripe.com/api/versioning (monthly non-breaking versions; `Stripe-Version` header per
 *   request; webhook events use the endpoint's version)
 * - https://stripe.com/pricing (Invoicing Starter: 0.4% per paid invoice; ACH Direct Debit: 0.8%
 *   capped at $5.00; card processing fees on top)
 *
 * Facts that shaped the design:
 * 1. `pending_invoice_items_behavior` now defaults to `exclude`, and an item only joins an invoice
 *    when `invoice=<id>` is passed. So we create the draft invoice first, attach each item to it,
 *    then finalize. The older "create items, then the invoice" order would leave customer-level
 *    pending items that any other invoice could sweep in if a step failed.
 * 2. `auto_advance=false` keeps Stripe from auto-finalizing and from sending its own emails or
 *    reminders; we finalize explicitly and send OUR email carrying `hosted_invoice_url`. We never
 *    call POST /invoices/{id}/send. Owner action: turn off "Send finalized invoices to customers"
 *    in the Stripe Dashboard so a customer never gets two emails. (I did not verify in the docs
 *    whether test-mode sandboxes email real addresses; not calling /send avoids depending on it.)
 * 3. ACH is `payment_settings.payment_method_types = [card, us_bank_account]`. The hosted invoice
 *    page cannot use microdeposit verification, so we leave `verification_method` unset (automatic).
 * 4. Idempotency: one key per Stripe POST, derived from our invoice id (`gamo-invoice-<id>`;
 *    `:invoice` and `:item:<n>` suffixes added by the integration). Retrying a failed send replays
 *    the same results. Because the same key with different parameters errors, a draft must not be
 *    edited between a failed send and its retry; keys expire after ~24 h, after which a retry
 *    creates a new Stripe invoice (harmless: the old one is an unfinalized draft).
 * 5. Webhooks: only `invoice.paid` (covers card, ACH and out-of-band) and `invoice.payment_failed`;
 *    the handler is idempotent on our side (`handleStripeInvoicePaid`, later wave). Webhook
 *    payloads carry our metadata {invoiceId, number, source}, so the handler needs no extra lookup.
 * 6. We pin `Stripe-Version: 2026-10-28.endive` on invoicing requests so response shapes cannot
 *    shift under us; the webhook endpoint in the Dashboard should be created on the same version.
 *    We read only stable fields (id, number, status, hosted_invoice_url, amount_due, amount_paid,
 *    metadata, status_transitions.paid_at).
 *
 * Compared with generating PDFs ourselves:
 * - Own PDFs: needs a Workers-compatible PDF library (new dependency, bundle size, fonts), R2 storage
 *   and signed access, our own pay page, ACH bank linking and verification, receipts and
 *   reconciliation. That is a large payments-adjacent surface to build and secure, with no benefit
 *   to the mission over Stripe's hosted page and PDF.
 * - Stripe Invoicing: hosted page, PDF (`invoice_pdf`), card + ACH collection, receipts and
 *   events are provided. Cost is Stripe's per-paid-invoice and processing fees, which are Gamo
 *   overhead; they are never deducted from musician pay (pay and the Gamo line stay separate).
 *
 * DECISION: use Stripe Invoicing for the online-payment path, TEST MODE ONLY (live keys are blocked
 * by assertStripeTestMode until the founder authorizes live processing). When no real test key is
 * configured, invoicing uses the manual path: our email lists the line items and
 * INVOICE_PAYMENT_INSTRUCTIONS, and staff mark it paid. No in-house PDF now; revisit if Stripe fees
 * or offline-only needs justify it. Voiding a draft means deleting it in Stripe (void is open-only).
 */

import type {
  CreateStripeInvoiceInput,
  StripeCustomerInput,
  StripeInvoiceStatus,
  InvoiceEventStatus,
} from '@studio-gamo/integrations/stripe';
import { separateLines, type InvoiceLine } from './lines.ts';
import type { InvoiceSourceType, InvoiceStatus } from './types.ts';

export interface InvoiceForStripe {
  /** Our invoice row id. */
  id: string;
  /** `GS-YYYY-NNNN`. */
  number: string;
  sourceType: InvoiceSourceType;
  billToName: string;
  /** Normalized (trimmed, lowercased) address. */
  billToEmail: string;
  /** `YYYY-MM-DD`. */
  dueDate: string;
}

export interface StripeInvoiceRequest {
  customer: StripeCustomerInput;
  /** Pass to `createInvoice` with `customerId` set once the customer exists. */
  invoice: Omit<CreateStripeInvoiceInput, 'customerId'>;
}

const DAY_MS = 86_400_000;

/** Whole days from `now` until `dueDate` (UTC midnight), at least 1, at most 365. */
export function daysUntilDue(dueDate: string, now: Date): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!match) throw new RangeError('dueDate must be YYYY-MM-DD.');
  const due = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(due)) throw new RangeError('dueDate must be a real date.');
  return Math.min(365, Math.max(1, Math.ceil((due - now.getTime()) / DAY_MS)));
}

/**
 * Builds the Stripe customer + invoice requests. Lines must already be validated (positive integer
 * cents). Output order keeps musician pay first and any Gamo line last, never merged.
 */
export function buildStripeInvoiceRequest(
  invoice: InvoiceForStripe,
  lines: readonly InvoiceLine[],
  now: Date = new Date(),
): StripeInvoiceRequest {
  if (lines.length === 0) throw new RangeError('An invoice needs at least one line.');
  const grouped = separateLines(lines);
  const ordered = [...grouped.musicianPay, ...grouped.other, ...grouped.gamoAdmin];
  const metadata = { invoiceId: invoice.id, number: invoice.number, source: invoice.sourceType };
  return {
    customer: {
      name: invoice.billToName,
      email: invoice.billToEmail,
      metadata: { source: 'gamo_studios' },
      idempotencyKey: `gamo-customer-${invoice.id}`,
    },
    invoice: {
      daysUntilDue: daysUntilDue(invoice.dueDate, now),
      lines: ordered.map((l) => ({
        description: l.description,
        amountCents: l.unitAmountCents,
        quantity: l.quantity,
      })),
      metadata,
      idempotencyKey: `gamo-invoice-${invoice.id}`,
      description: `Gamo Studios invoice ${invoice.number}`,
    },
  };
}

/**
 * Stripe status -> ours. `uncollectible` stays `open` (still owed until staff void or collect it);
 * unknown values return `null` so the caller never writes a guess.
 */
export function mapStripeStatusToInvoiceStatus(status: StripeInvoiceStatus | string): InvoiceStatus | null {
  switch (status) {
    case 'draft':
    case 'open':
    case 'paid':
    case 'void':
      return status;
    case 'uncollectible':
      return 'open';
    default:
      return null;
  }
}

/**
 * Our status after a webhook event: `paid` is terminal and idempotent (a replayed `invoice.paid`
 * changes nothing); `payment_failed` leaves the invoice as it is (still owed).
 */
export function nextStatusForInvoiceEvent(current: InvoiceStatus, event: InvoiceEventStatus): InvoiceStatus {
  if (event === 'paid') return current === 'void' ? current : 'paid';
  return current;
}
