/**
 * Render registry for the outbox. Message bodies are never stored (`email_log` keeps kind + related ids),
 * so the daily retry job rebuilds a message from `kind` + `relatedId` + a payload loader the caller
 * provides (the loader reads whatever tables the kind needs; this module never queries a database).
 *
 *   renderEmail('invoice_sent', payload)            // validate + render, throws EmailPayloadError
 *   retryDueOutboxEmails(db, env, { now, render: createRetryRenderer(loader) })
 *
 * The retry renderer returns `null` (the outbox then closes the row as `not_renderable`) for an unknown
 * kind, a missing `relatedId`, a loader that finds nothing, or a payload that no longer validates.
 */
import { z } from 'zod';
import type { DueOutboxRow, OutboxMessage } from '../services/email-outbox.ts';
import {
  renderApplicationApproved,
  renderApplicationDeclined,
  renderFormReceived,
  renderFormStaffNotice,
  renderInvoicePaidReceipt,
  renderInvoiceSent,
  renderOfferAcceptedChurch,
  renderOfferAcceptedStaff,
  renderOfferDeclinedStaff,
  renderOfferSent,
  type ApplicationApprovedPayload,
  type ApplicationDeclinedPayload,
  type FormReceivedPayload,
  type FormStaffNoticePayload,
  type InvoicePaidReceiptPayload,
  type InvoiceSentPayload,
  type OfferAcceptedChurchPayload,
  type OfferAcceptedStaffPayload,
  type OfferDeclinedStaffPayload,
  type OfferSentPayload,
  type RenderedEmail,
} from './templates.ts';

/** Outbox `kind` values owned by this module (each matches `[a-z0-9_]{1,64}`). */
export const EMAIL_KINDS = [
  'form_received',
  'form_staff_notice',
  'application_approved',
  'application_declined',
  'offer_sent',
  'offer_accepted_church',
  'offer_accepted_staff',
  'offer_declined_staff',
  'invoice_sent',
  'invoice_paid_receipt',
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export function isEmailKind(value: unknown): value is EmailKind {
  return typeof value === 'string' && (EMAIL_KINDS as readonly string[]).includes(value);
}

/** The one idempotency key shape: `{kind}:{relatedId}` (e.g. `form_received:sub_1`, `invoice_sent:inv_9`). */
export function emailIdempotencyKey(kind: EmailKind, relatedId: string): string {
  return `${kind}:${relatedId}`;
}

/** Domain events to the kind they send (`emailKindFor.formSubmitted.submitter`, ...). */
export const emailKindFor = {
  formSubmitted: { submitter: 'form_received', staff: 'form_staff_notice' },
  application: { approved: 'application_approved', declined: 'application_declined' },
  offer: {
    sent: 'offer_sent',
    acceptedChurch: 'offer_accepted_church',
    acceptedStaff: 'offer_accepted_staff',
    declinedStaff: 'offer_declined_staff',
  },
  invoice: { sent: 'invoice_sent', paid: 'invoice_paid_receipt' },
} as const satisfies Record<string, Record<string, EmailKind>>;

/** The payload each kind takes. */
export interface EmailPayloads {
  form_received: FormReceivedPayload;
  form_staff_notice: FormStaffNoticePayload;
  application_approved: ApplicationApprovedPayload;
  application_declined: ApplicationDeclinedPayload;
  offer_sent: OfferSentPayload;
  offer_accepted_church: OfferAcceptedChurchPayload;
  offer_accepted_staff: OfferAcceptedStaffPayload;
  offer_declined_staff: OfferDeclinedStaffPayload;
  invoice_sent: InvoiceSentPayload;
  invoice_paid_receipt: InvoicePaidReceiptPayload;
}

export class EmailPayloadError extends Error {
  readonly code = 'EMAIL_PAYLOAD_INVALID';
  constructor(
    readonly kind: string,
    detail: string,
  ) {
    super(`email ${kind}: ${detail}`);
    this.name = 'EmailPayloadError';
  }
}

const text = z.string().trim().min(1).max(500);
const optText = z.string().trim().max(500).optional();
const cents = z.number().int().safe();
const url = z.string().trim().min(1).max(2048);

const decision = z.object({
  program: text,
  recipientName: optText,
  reference: optText,
  staffNote: z.string().trim().max(600).optional(),
  contactEmail: optText,
});
const staffOffer = z.object({
  musicianName: text,
  churchName: text,
  role: text,
  serviceDate: text,
  adminUrl: url,
});

const SCHEMAS: { [K in EmailKind]: z.ZodType<EmailPayloads[K], z.ZodTypeDef, unknown> } = {
  form_received: z.object({
    reference: text,
    formTitle: text,
    program: text,
    submitterName: optText,
    contactEmail: optText,
  }),
  form_staff_notice: z.object({
    reference: text,
    formTitle: text,
    program: text,
    adminUrl: url,
    submitterEmail: text,
    submitterName: optText,
  }),
  application_approved: decision,
  application_declined: decision,
  offer_sent: z.object({
    musicianName: optText,
    churchName: text,
    city: text,
    role: text,
    serviceDate: text,
    startTime: text,
    arrivalTime: optText,
    payCents: cents,
    offerUrl: url,
    expiresAtText: optText,
    program: optText,
  }),
  offer_accepted_church: z.object({
    churchName: optText,
    contactName: optText,
    musicianFirstName: text,
    role: text,
    serviceDate: text,
    arrivalTime: text,
    program: optText,
  }),
  offer_accepted_staff: staffOffer,
  offer_declined_staff: staffOffer,
  invoice_sent: z.object({
    billToName: text,
    number: text,
    dueDate: text,
    lines: z
      .array(
        z.object({
          kind: z.enum(['musician_pay', 'gamo_admin', 'other']),
          description: z.string().trim().min(1).max(200),
          quantity: z.number().int().min(1),
          unitAmountCents: cents,
          amountCents: cents,
        }),
      )
      .min(1)
      .max(200),
    totalCents: cents,
    hostedUrl: url.optional(),
    manualInstructions: z.string().trim().max(1500).optional(),
    contactEmail: optText,
  }),
  invoice_paid_receipt: z.object({
    billToName: text,
    number: text,
    paidDate: text,
    totalCents: cents,
    method: optText,
    reference: optText,
    contactEmail: optText,
  }),
};

const RENDERERS: { [K in EmailKind]: (payload: EmailPayloads[K]) => RenderedEmail } = {
  form_received: renderFormReceived,
  form_staff_notice: renderFormStaffNotice,
  application_approved: renderApplicationApproved,
  application_declined: renderApplicationDeclined,
  offer_sent: renderOfferSent,
  offer_accepted_church: renderOfferAcceptedChurch,
  offer_accepted_staff: renderOfferAcceptedStaff,
  offer_declined_staff: renderOfferDeclinedStaff,
  invoice_sent: renderInvoiceSent,
  invoice_paid_receipt: renderInvoicePaidReceipt,
};

/**
 * Validates `payload` for `kind` and renders it. Throws `EmailPayloadError` (never leaks field values) for an
 * unknown kind, a malformed payload, or one a template rejects (bad URL, invoice total that does not match its lines).
 */
export function renderEmail<K extends EmailKind>(kind: K, payload: unknown): RenderedEmail {
  if (!isEmailKind(kind)) throw new EmailPayloadError(String(kind), 'unknown kind');
  const parsed = SCHEMAS[kind].safeParse(payload);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(payload)'))];
    throw new EmailPayloadError(kind, `invalid ${fields.join(', ')}`);
  }
  try {
    return RENDERERS[kind](parsed.data as never);
  } catch (err) {
    if (err instanceof RangeError) throw new EmailPayloadError(kind, 'rejected by template');
    throw err;
  }
}

/**
 * Loads the payload a kind needs from `relatedId` (and `relatedType`, as stored in `email_log`).
 * Return `null` when the record is gone or must not be re-sent (e.g. an offer withdrawn since).
 * The loader, not this module, owns database access.
 */
export interface PayloadLoader {
  load(kind: EmailKind, relatedId: string, relatedType: string | null): Promise<unknown | null>;
}

/** What `retryDueOutboxEmails`'s `render` callback returns. */
export type RetryRendered = Omit<OutboxMessage, 'kind' | 'idempotencyKey' | 'to' | 'now'>;

/** Builds the `render` callback for `retryDueOutboxEmails` from a payload loader. */
export function createRetryRenderer(
  loader: PayloadLoader,
): (row: DueOutboxRow) => Promise<RetryRendered | null> {
  return async (row) => {
    if (!isEmailKind(row.kind) || !row.relatedId) return null;
    let payload: unknown;
    try {
      payload = await loader.load(row.kind, row.relatedId, row.relatedType);
    } catch {
      console.warn(`[email-registry] ${row.kind}: payload loader failed`);
      return null;
    }
    if (payload === null || payload === undefined) return null;
    try {
      const mail = renderEmail(row.kind, payload);
      return {
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
        ...(row.relatedType ? { relatedType: row.relatedType } : {}),
        relatedId: row.relatedId,
      };
    } catch (err) {
      if (err instanceof EmailPayloadError) {
        console.warn(`[email-registry] ${row.kind}: ${err.code}`);
        return null;
      }
      throw err;
    }
  };
}
