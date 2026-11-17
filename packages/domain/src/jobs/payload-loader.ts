/**
 * `PayloadLoader` for the daily email retry (design 2026-11-16, "Daily cron (approved)"; plan Task 4.2).
 *
 * The outbox stores no message bodies: a row keeps `kind` + `related_type` + `related_id`. When a send
 * failed, the retry job calls `load(kind, relatedId, relatedType)` to rebuild the payload from the CURRENT
 * database state and `createRetryRenderer` (email/registry.ts) validates and renders it. The recipient is
 * never decided here: the outbox re-sends to the address it stored.
 *
 * Returning `null` closes the outbox row as `not_renderable` (no more retries). That is the right answer when
 * the record is gone or its state no longer warrants the email (a voided invoice, a withdrawn offer, a
 * submission marked spam, a declined application that was reopened):
 *
 *   form_received / form_staff_notice   form_submissions + forms; null for a missing or spam submission.
 *                                       The staff notice links to `{admin}/submissions/{id}`.
 *   application_approved                form_submissions + roster_members (display name, program); null when
 *                                       the roster row is missing or `removed`.
 *   application_declined                submission must still be `declined`. The applicant-facing staff note is
 *                                       NOT re-sent: it is stored only as an internal note among other notes,
 *                                       and re-reading "the" note could leak an internal one.
 *   offer_sent                          ALWAYS null. The email carries the raw one-time token and only its
 *                                       SHA-256 is stored (worship/offers.ts), so the link cannot be rebuilt.
 *                                       Staff see `emailStatus` when sending and can withdraw and re-offer.
 *   offer_accepted_church/_staff,       offers + service_requests + roster_members; null unless the offer is
 *   offer_declined_staff                still `accepted` (church, staff) or `declined` (staff).
 *   invoice_sent                        invoices + invoice_lines (separated lines, oldest line first); only
 *                                       while `open`; null without a payment link or INVOICE_PAYMENT_INSTRUCTIONS.
 *   invoice_paid_receipt                invoices; only while `paid`.
 *
 * Wording of values mirrors the code that sends first (worship/offers.ts, worship/roster.ts,
 * invoices/service.ts) so a retried email reads like the original. Nothing here logs personal data.
 */
import type { PayloadLoader, EmailKind, EmailPayloads } from '../email/registry.ts';
import { displayEpochDate, displayIsoDate } from '../invoices/service.ts';
import {
  adminUrl,
  allRows,
  bindString,
  firstName,
  firstRow,
  formatServiceDate,
  parseBinds,
  type Db,
  type WorshipEnv,
} from '../worship/common.ts';

/** The environment the loader reads (all optional; a missing value only narrows what can be rendered). */
export type PayloadLoaderEnv = WorshipEnv;

/** Same text the first send uses when the arrival time is not known yet (worship/offers.ts). */
const ARRIVAL_TO_BE_CONFIRMED = 'To be confirmed by Gamo Studios';

/** Same labels as invoices/service.ts. */
const PAID_METHOD_LABEL: Record<string, string> = {
  stripe: 'Card or bank transfer (Stripe)',
  check: 'Check',
  zelle: 'Zelle',
  ach: 'ACH transfer',
  cash: 'Cash',
  other: 'Other',
};

const emailLineKind = (kind: string): 'musician_pay' | 'gamo_admin' | 'other' =>
  kind === 'musician_pay' || kind === 'gamo_admin' ? kind : 'other';

const present = (value: string | null | undefined): string | undefined => {
  const t = value?.trim();
  return t ? t : undefined;
};

interface SubmissionRow {
  id: string;
  status: string;
  reference: string;
  submitter_name: string | null;
  submitter_email_normalized: string | null;
  binds_json: string;
  form_title: string;
  form_program: string;
}

interface OfferRow {
  id: string;
  request_id: string;
  role: string;
  status: string;
  church_name: string;
  contact_name: string | null;
  service_date: string;
  program: string;
  display_name: string;
}

interface InvoiceRow {
  id: string;
  number: string;
  status: string;
  bill_to_name: string;
  total_cents: number;
  due_date: string | null;
  hosted_url: string | null;
  paid_at: number | null;
  paid_method: string | null;
  paid_reference: string | null;
}

export function createPayloadLoader(db: Db, env: PayloadLoaderEnv): PayloadLoader {
  const submission = (id: string) =>
    firstRow<SubmissionRow>(
      db,
      `SELECT s.id, s.status, s.reference, s.submitter_name, s.submitter_email_normalized, s.binds_json,
              f.title AS form_title, f.program AS form_program
         FROM form_submissions s JOIN forms f ON f.id = s.form_id WHERE s.id = ?`,
      id,
    );

  const offer = (id: string) =>
    firstRow<OfferRow>(
      db,
      `SELECT o.id, o.request_id, o.role, o.status, r.church_name, r.contact_name, r.service_date, r.program,
              m.display_name
         FROM offers o
         JOIN service_requests r ON r.id = o.request_id
         JOIN roster_members m ON m.id = o.roster_member_id
        WHERE o.id = ?`,
      id,
    );

  const invoice = (id: string) =>
    firstRow<InvoiceRow>(
      db,
      `SELECT id, number, status, bill_to_name, total_cents, due_date, hosted_url, paid_at, paid_method, paid_reference
         FROM invoices WHERE id = ?`,
      id,
    );

  async function formReceived(id: string): Promise<EmailPayloads['form_received'] | null> {
    const s = await submission(id);
    if (!s || s.status === 'spam') return null;
    return {
      reference: s.reference,
      formTitle: s.form_title,
      program: s.form_program,
      ...(present(s.submitter_name) ? { submitterName: present(s.submitter_name) } : {}),
    };
  }

  async function formStaffNotice(id: string): Promise<EmailPayloads['form_staff_notice'] | null> {
    const s = await submission(id);
    if (!s || s.status === 'spam') return null;
    const submitterEmail =
      present(s.submitter_email_normalized) ?? bindString(parseBinds(s.binds_json), 'contact.email', 254);
    if (!submitterEmail) return null;
    return {
      reference: s.reference,
      formTitle: s.form_title,
      program: s.form_program,
      adminUrl: adminUrl(env, `/submissions/${s.id}`),
      submitterEmail,
      ...(present(s.submitter_name) ? { submitterName: present(s.submitter_name) } : {}),
    };
  }

  async function applicationApproved(id: string): Promise<EmailPayloads['application_approved'] | null> {
    const s = await submission(id);
    if (!s) return null;
    const member = await firstRow<{ display_name: string; program: string; status: string }>(
      db,
      'SELECT display_name, program, status FROM roster_members WHERE submission_id = ?',
      id,
    );
    if (!member || member.status === 'removed') return null;
    return { program: member.program, recipientName: member.display_name, reference: s.reference };
  }

  async function applicationDeclined(id: string): Promise<EmailPayloads['application_declined'] | null> {
    const s = await submission(id);
    if (!s || s.status !== 'declined') return null;
    const name = present(s.submitter_name) ?? bindString(parseBinds(s.binds_json), 'contact.name', 120);
    return {
      program: s.form_program,
      ...(name ? { recipientName: name } : {}),
      reference: s.reference,
    };
  }

  async function offerAcceptedChurch(id: string): Promise<EmailPayloads['offer_accepted_church'] | null> {
    const o = await offer(id);
    if (!o || o.status !== 'accepted') return null;
    return {
      churchName: o.church_name,
      ...(present(o.contact_name) ? { contactName: present(o.contact_name) } : {}),
      musicianFirstName: firstName(o.display_name) || 'Your musician',
      role: o.role,
      serviceDate: formatServiceDate(o.service_date),
      arrivalTime: ARRIVAL_TO_BE_CONFIRMED,
      program: o.program,
    };
  }

  async function offerStaff(
    id: string,
    wanted: 'accepted' | 'declined',
  ): Promise<EmailPayloads['offer_accepted_staff'] | null> {
    const o = await offer(id);
    if (!o || o.status !== wanted) return null;
    return {
      musicianName: o.display_name,
      churchName: o.church_name,
      role: o.role,
      serviceDate: formatServiceDate(o.service_date),
      adminUrl: adminUrl(env, `/requests/${o.request_id}`),
    };
  }

  async function invoiceSent(id: string): Promise<EmailPayloads['invoice_sent'] | null> {
    const inv = await invoice(id);
    if (!inv || inv.status !== 'open') return null;
    const hostedUrl = present(inv.hosted_url);
    const manualInstructions = hostedUrl ? undefined : present(env.INVOICE_PAYMENT_INSTRUCTIONS);
    if (!hostedUrl && !manualInstructions) return null;
    const lines = await allRows<{
      kind: string;
      description: string;
      quantity: number;
      unit_amount_cents: number;
      amount_cents: number;
    }>(
      db,
      `SELECT kind, description, quantity, unit_amount_cents, amount_cents
         FROM invoice_lines WHERE invoice_id = ? ORDER BY rowid`,
      id,
    );
    if (lines.length === 0) return null;
    return {
      billToName: inv.bill_to_name,
      number: inv.number,
      dueDate: inv.due_date ? displayIsoDate(inv.due_date) : 'On receipt',
      lines: lines.map((l) => ({
        kind: emailLineKind(l.kind),
        description: l.description,
        quantity: Number(l.quantity),
        unitAmountCents: Number(l.unit_amount_cents),
        amountCents: Number(l.amount_cents),
      })),
      totalCents: Number(inv.total_cents),
      ...(hostedUrl ? { hostedUrl } : { manualInstructions }),
    };
  }

  async function invoicePaidReceipt(id: string): Promise<EmailPayloads['invoice_paid_receipt'] | null> {
    const inv = await invoice(id);
    if (!inv || inv.status !== 'paid' || inv.paid_at === null) return null;
    const reference = present(inv.paid_reference);
    return {
      billToName: inv.bill_to_name,
      number: inv.number,
      paidDate: displayEpochDate(Number(inv.paid_at)),
      totalCents: Number(inv.total_cents),
      ...(inv.paid_method ? { method: PAID_METHOD_LABEL[inv.paid_method] ?? 'Other' } : {}),
      ...(reference ? { reference: reference.slice(0, 120) } : {}),
    };
  }

  return {
    async load(kind: EmailKind, relatedId: string, _relatedType: string | null): Promise<unknown | null> {
      switch (kind) {
        case 'form_received':
          return formReceived(relatedId);
        case 'form_staff_notice':
          return formStaffNotice(relatedId);
        case 'application_approved':
          return applicationApproved(relatedId);
        case 'application_declined':
          return applicationDeclined(relatedId);
        case 'offer_sent':
          // The raw one-time token is not stored (only its hash), so the link cannot be rebuilt.
          return null;
        case 'offer_accepted_church':
          return offerAcceptedChurch(relatedId);
        case 'offer_accepted_staff':
          return offerStaff(relatedId, 'accepted');
        case 'offer_declined_staff':
          return offerStaff(relatedId, 'declined');
        case 'invoice_sent':
          return invoiceSent(relatedId);
        case 'invoice_paid_receipt':
          return invoicePaidReceipt(relatedId);
        default: {
          const unreachable: never = kind;
          void unreachable;
          return null;
        }
      }
    },
  };
}
