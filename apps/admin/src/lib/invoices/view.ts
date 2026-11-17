/**
 * View-model helpers for the invoice screens: labels, masking, grouping and which actions a status
 * allows. Pure functions of service data; every amount stays integer cents until `formatUsd`.
 */
import {
  displayEpochDate,
  displayIsoDate,
  type Invoice,
  type InvoiceDetail,
  type InvoiceLineRecord,
  type InvoiceStatus,
  type PaymentMethod,
} from '@gamo/domain/invoices';

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  paid: 'Paid',
  void: 'Void',
};

/** Text for the chip; the colour is only reinforcement, the word is always shown. */
export const STATUS_HELP: Record<InvoiceStatus, string> = {
  draft: 'Not sent yet',
  open: 'Sent, waiting for payment',
  paid: 'Payment recorded',
  void: 'Cancelled',
};

export const LINE_KIND_LABEL = {
  musician_pay: 'Musician pay',
  lesson: 'Lesson',
  production: 'Production',
  other: 'Other',
  gamo_admin: 'Gamo administrative contribution',
} as const;

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  stripe: 'Card or bank transfer (Stripe)',
  check: 'Check',
  zelle: 'Zelle',
  ach: 'ACH transfer',
  cash: 'Cash',
  other: 'Other',
};

/** Stripe is test mode only; a key counts only when it is a real test-mode key (not a placeholder). */
export function stripeTestConfigured(env: { STRIPE_SECRET_KEY?: string }): boolean {
  const key = env.STRIPE_SECRET_KEY;
  return Boolean(
    key && (key.startsWith('sk_test_') || key.startsWith('rk_test_')) && !key.includes('placeholder'),
  );
}

/** `Stripe` when the invoice has a Stripe invoice, else `Manual`. */
export function invoiceMode(invoice: Pick<Invoice, 'stripeInvoiceId'>): 'Stripe' | 'Manual' {
  return invoice.stripeInvoiceId ? 'Stripe' : 'Manual';
}

/** What Send will do right now, for the explanation next to the button. */
export function sendModeNote(stripeTest: boolean): { mode: 'stripe' | 'manual'; text: string } {
  return stripeTest
    ? {
        mode: 'stripe',
        text: 'Stripe is in test mode — no real charges. Sending creates a Stripe test invoice and emails the hosted payment link.',
      }
    : {
        mode: 'manual',
        text: 'Stripe is not configured, so sending emails manual payment instructions. Record the payment with Mark paid.',
      };
}

/** `ana@diaspora.org` -> `a***@d***.org` (first letter of the name and domain, and the last domain label). */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '—';
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local.charAt(0)}***@${host.charAt(0)}***${tld}`;
}

export const shortDate = (isoDate: string | null): string => (isoDate ? displayIsoDate(isoDate) : '—');
export const epochDate = (seconds: number | null): string =>
  seconds === null ? '—' : displayEpochDate(seconds);

export interface LineGroup {
  key: 'musician_pay' | 'gamo_admin' | 'other';
  title: string;
  lines: InvoiceLineRecord[];
  subtotalCents: number;
}

/** Musician pay, Gamo administrative contribution and Other are always three separate groups with their own subtotals. */
export function lineGroups(invoice: Pick<InvoiceDetail, 'groups'>): LineGroup[] {
  const sum = (lines: InvoiceLineRecord[]) => lines.reduce((s, l) => s + l.amountCents, 0);
  const all: LineGroup[] = [
    {
      key: 'musician_pay',
      title: 'Musician pay',
      lines: invoice.groups.musicianPay,
      subtotalCents: sum(invoice.groups.musicianPay),
    },
    {
      key: 'gamo_admin',
      title: 'Gamo administrative contribution',
      lines: invoice.groups.gamoAdmin,
      subtotalCents: sum(invoice.groups.gamoAdmin),
    },
    { key: 'other', title: 'Other', lines: invoice.groups.other, subtotalCents: sum(invoice.groups.other) },
  ];
  return all.filter((g) => g.lines.length > 0);
}

export interface InvoiceActions {
  send: boolean;
  /** Re-send the email of an open invoice. */
  resend: boolean;
  markPaid: boolean;
  void: boolean;
  payouts: boolean;
}

export function invoiceActions(status: InvoiceStatus): InvoiceActions {
  return {
    send: status === 'draft',
    resend: status === 'open',
    markPaid: status === 'open',
    void: status === 'draft' || status === 'open',
    payouts: status === 'paid',
  };
}

export interface SourceLink {
  label: string;
  href: string | null;
}

/** Where the invoice came from: a link when the record has a screen, else a plain label. */
export function sourceLink(invoice: Pick<Invoice, 'sourceType' | 'sourceId'>): SourceLink {
  if (invoice.sourceType === 'service_request' && invoice.sourceId) {
    return { label: 'Service request', href: `/requests/${encodeURIComponent(invoice.sourceId)}` };
  }
  if (invoice.sourceType === 'academy_registration' && invoice.sourceId) {
    return { label: 'Academy registration', href: '/registrations' };
  }
  return { label: 'Manual invoice', href: null };
}

/** The invoice for JSON (OpenAPI `Invoice`): epoch seconds become ISO date-times, nothing else changes. */
export function invoiceDto(invoice: Invoice) {
  const iso = (s: number | null) => (s === null ? null : new Date(s * 1000).toISOString());
  return {
    id: invoice.id,
    number: invoice.number,
    sourceType: invoice.sourceType,
    sourceId: invoice.sourceId,
    billToName: invoice.billToName,
    billToEmail: invoice.billToEmail,
    status: invoice.status,
    currency: invoice.currency,
    totalCents: invoice.totalCents,
    dueDate: invoice.dueDate,
    stripeInvoiceId: invoice.stripeInvoiceId,
    hostedUrl: invoice.hostedUrl,
    paidAt: iso(invoice.paidAt),
    paidMethod: invoice.paidMethod,
    paidReference: invoice.paidReference,
    lines: invoice.lines.map((l) => ({
      id: l.id,
      kind: l.kind,
      description: l.description,
      quantity: l.quantity,
      unitAmountCents: l.unitAmountCents,
      amountCents: l.amountCents,
      payeeRosterMemberId: l.payeeRosterMemberId,
      payoutRecordedAt: iso(l.payoutRecordedAt),
    })),
    createdAt: new Date(invoice.createdAt * 1000).toISOString(),
  };
}
