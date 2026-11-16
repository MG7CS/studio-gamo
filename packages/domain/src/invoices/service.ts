/**
 * Invoice service (D1): drafts, send (Stripe test mode or manual instructions), mark paid, void,
 * musician payouts and listing. The pure logic lives beside it (`numbering`, `lines`,
 * `stripe-invoicing`); the Stripe decision record is the header of `stripe-invoicing.ts`.
 *
 *   const svc = new InvoiceService(db, env, { fetchImpl });
 *   const draft = await svc.createDraft({ source: { type: 'service_request', id }, billTo, dueDate, lines, staffId });
 *   await svc.send(draft.id, {});        // draft -> open (Stripe invoice + our email, or manual instructions)
 *   await svc.markPaid(draft.id, { method: 'check', reference: '1042', staffId });
 *
 * Rules
 * - Money is integer USD cents. Musician pay and Gamo administrative lines are always separate lines;
 *   a `gamo_admin` line needs `GAMO_ADMIN_FEE_APPROVED=true` (fees are proposals until approved). Nothing
 *   here deducts from musician pay.
 * - Numbers `GS-YYYY-NNNN` are allocated from `invoice_number_counters` by an upsert in the SAME D1 batch as
 *   the invoice insert, so a number is never skipped or reused and two staff cannot get the same one.
 * - Stripe is TEST MODE ONLY: the online path is used only when `isRealTestKey(STRIPE_SECRET_KEY)`; any other
 *   key (live, placeholder, none) takes the manual path. Stripe objects are created before the local row
 *   changes, so a Stripe failure leaves the invoice a plain draft (retrying replays the same idempotency keys).
 * - Once an invoice is open it is issued: an email failure keeps it open and throws `EMAIL_FAILED`; calling
 *   `send` again on the open invoice only retries the email (same outbox key, so a delivered email is never
 *   sent twice, and no new Stripe objects are created).
 * - Errors carry a code and a status and never contain keys, tokens or Stripe response bodies.
 */
import type { GamoEnv } from '@gamo/config/env';
import {
  createStripeTestClient,
  isRealTestKey,
  StripeApiError,
  StripeNotConfiguredError,
} from '@studio-gamo/integrations/stripe';
import { renderEmail, emailIdempotencyKey } from '../email/registry.ts';
import { newPrefixedId } from '../security/ids.ts';
import { isPlausibleEmail, normalizeEmail } from '../security/pii-hash.ts';
import {
  allRows,
  changesOf,
  runBatch,
  type SqlDatabase,
  type SqlStatementSpec,
} from '../security/sql-database.ts';
import { sendOutboxEmail, type OutboxStatus } from '../services/email-outbox.ts';
import { invoiceYear, isValidInvoiceNumber } from './numbering.ts';
import {
  computeTotals,
  prefillFromOffers,
  separateLines,
  validateLines,
  type InvoiceLineInput,
  type InvoiceLineKind,
  type SeparatedLines,
} from './lines.ts';
import { buildStripeInvoiceRequest } from './stripe-invoicing.ts';
import { INVOICE_SOURCE_TYPES, type InvoiceSourceType, type InvoiceStatus } from './types.ts';

/** The environment keys this service reads (the caller's full env is passed through to the email outbox). */
export interface InvoiceEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** `'true'` (exactly) approves `gamo_admin` lines. */
  GAMO_ADMIN_FEE_APPROVED?: string;
  INVOICE_PAYMENT_INSTRUCTIONS?: string;
}

export const PAYMENT_METHODS = ['stripe', 'check', 'zelle', 'ach', 'cash', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type InvoiceErrorCode =
  | 'INVOICE_NOT_FOUND'
  | 'LINE_NOT_FOUND'
  | 'SOURCE_NOT_FOUND'
  | 'INVOICE_INVALID'
  | 'INVOICE_STATE'
  | 'GAMO_ADMIN_NOT_APPROVED'
  | 'PAYMENT_NOT_CONFIGURED'
  | 'PAYOUT_EXISTS'
  | 'STRIPE_FAILED'
  | 'EMAIL_FAILED'
  | 'LIVEMODE_REFUSED';

const STATUS_FOR: Record<InvoiceErrorCode, 400 | 404 | 409 | 503> = {
  INVOICE_NOT_FOUND: 404,
  LINE_NOT_FOUND: 404,
  SOURCE_NOT_FOUND: 404,
  INVOICE_INVALID: 400,
  INVOICE_STATE: 409,
  GAMO_ADMIN_NOT_APPROVED: 400,
  PAYMENT_NOT_CONFIGURED: 503,
  PAYOUT_EXISTS: 409,
  STRIPE_FAILED: 503,
  EMAIL_FAILED: 503,
  LIVEMODE_REFUSED: 400,
};

export interface InvoiceFieldError {
  /** Line index, or null for the invoice as a whole. */
  index: number | null;
  code: string;
  message: string;
}

export class InvoiceError extends Error {
  readonly status: 400 | 404 | 409 | 503;
  constructor(
    readonly code: InvoiceErrorCode,
    message: string,
    readonly fieldErrors: InvoiceFieldError[] = [],
  ) {
    super(message);
    this.name = 'InvoiceError';
    this.status = STATUS_FOR[code];
  }
}

export interface InvoiceLineRecord {
  id: string;
  kind: InvoiceLineKind;
  description: string;
  quantity: number;
  unitAmountCents: number;
  amountCents: number;
  payeeRosterMemberId: string | null;
  /** Epoch seconds when the musician payout was recorded, else null. */
  payoutRecordedAt: number | null;
}

export interface Invoice {
  id: string;
  number: string;
  sourceType: InvoiceSourceType;
  sourceId: string | null;
  billToName: string;
  billToEmail: string;
  status: InvoiceStatus;
  currency: 'usd';
  totalCents: number;
  /** `YYYY-MM-DD`. */
  dueDate: string | null;
  stripeInvoiceId: string | null;
  hostedUrl: string | null;
  /** Epoch seconds. */
  paidAt: number | null;
  paidMethod: PaymentMethod | null;
  paidReference: string | null;
  createdAt: number;
  lines: InvoiceLineRecord[];
}

/** `get` returns the invoice plus its lines grouped so musician pay and the Gamo allocation never mix. */
export interface InvoiceDetail extends Invoice {
  groups: SeparatedLines<InvoiceLineRecord>;
  totalsByKind: Record<InvoiceLineKind, number>;
}

export interface InvoiceServiceOptions {
  /** Injected fetch for Stripe and the Resend outbox (tests). */
  fetchImpl?: typeof fetch;
  /** Epoch seconds; defaults to the wall clock. */
  now?: () => number;
}

export interface CreateDraftInput {
  source: { type: InvoiceSourceType; id?: string | null };
  billTo: { name: string; email: string };
  /** `YYYY-MM-DD`. */
  dueDate: string;
  /** Omit only for a `service_request` source: lines are prefilled from its accepted offers. */
  lines?: readonly InvoiceLineInput[];
  staffId: string;
  /** Epoch seconds. */
  now?: number;
}

export type InvoiceDraftPrefill = Pick<CreateDraftInput, 'source' | 'billTo'> & { lines: InvoiceLineInput[] };

export interface SendOptions {
  /** Accepted for caller symmetry (admin passes its origin); not used: the pay link comes from Stripe. */
  siteOrigin?: string;
  now?: number;
}

export interface SendResult {
  invoiceId: string;
  mode: 'stripe' | 'manual';
  hostedUrl: string | null;
  status: 'open';
}

export interface MarkPaidInput {
  method: PaymentMethod;
  reference?: string;
  staffId: string;
  now?: number;
}

export interface MarkPaidResult {
  invoice: Invoice;
  /** False when the invoice was already paid (nothing changed, no second receipt). */
  applied: boolean;
  receipt: OutboxStatus | 'skipped';
}

export interface RecordPayoutInput {
  /** Optional; when given it must equal the line amount (no partial payouts, no deductions). */
  amountCents?: number;
  method: PaymentMethod;
  reference?: string;
  staffId: string;
  now?: number;
}

export interface PayoutRecord {
  payoutId: string;
  invoiceLineId: string;
  rosterMemberId: string;
  amountCents: number;
}

export interface InvoiceListFilter {
  status?: InvoiceStatus;
  /** 1 to 100; default 25. */
  limit?: number;
}

export interface InvoiceListPage {
  items: Invoice[];
  nextCursor: string | null;
}

interface InvoiceRow {
  id: string;
  number: string;
  source_type: InvoiceSourceType;
  source_id: string | null;
  bill_to_name: string;
  bill_to_email_normalized: string;
  status: InvoiceStatus;
  currency: 'usd';
  total_cents: number;
  due_date: string | null;
  stripe_invoice_id: string | null;
  hosted_url: string | null;
  paid_at: number | null;
  paid_method: PaymentMethod | null;
  paid_reference: string | null;
  created_at: number;
}

interface LineRow {
  id: string;
  invoice_id: string;
  kind: InvoiceLineKind;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  amount_cents: number;
  payee_roster_member_id: string | null;
  payout_recorded_at: number | null;
}

const INVOICE_COLUMNS =
  'id, number, source_type, source_id, bill_to_name, bill_to_email_normalized, status, currency, total_cents, due_date, stripe_invoice_id, hosted_url, paid_at, paid_method, paid_reference, created_at';

const LINE_SELECT = `SELECT l.id, l.invoice_id, l.kind, l.description, l.quantity, l.unit_amount_cents, l.amount_cents,
  l.payee_roster_member_id, p.paid_at AS payout_recorded_at
  FROM invoice_lines l LEFT JOIN musician_payouts p ON p.invoice_line_id = l.id`;

const OK_EMAIL: readonly OutboxStatus[] = ['sent', 'delivered', 'delivery_delayed', 'queued'];
const MAX_REFERENCE = 200;
const MAX_LIST = 100;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDate(value: string): boolean {
  const m = DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return (
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3])
  );
}

const DISPLAY_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

/** `2026-03-22` -> `March 22, 2026` (a calendar date, no timezone shift). */
export function displayIsoDate(isoDate: string): string {
  const m = DATE.exec(isoDate);
  return m ? DISPLAY_DATE.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))) : isoDate;
}

/** Epoch seconds -> display date in UTC (decided once: invoices are dated in UTC). */
export function displayEpochDate(seconds: number): string {
  return DISPLAY_DATE.format(new Date(seconds * 1000));
}

const PAID_METHOD_LABEL: Record<PaymentMethod, string> = {
  stripe: 'Card or bank transfer (Stripe)',
  check: 'Check',
  zelle: 'Zelle',
  ach: 'ACH transfer',
  cash: 'Cash',
  other: 'Other',
};

function toLineRecord(row: LineRow): InvoiceLineRecord {
  return {
    id: row.id,
    kind: row.kind,
    description: row.description,
    quantity: Number(row.quantity),
    unitAmountCents: Number(row.unit_amount_cents),
    amountCents: Number(row.amount_cents),
    payeeRosterMemberId: row.payee_roster_member_id,
    payoutRecordedAt: row.payout_recorded_at === null ? null : Number(row.payout_recorded_at),
  };
}

function toInvoice(row: InvoiceRow, lines: InvoiceLineRecord[]): Invoice {
  return {
    id: row.id,
    number: row.number,
    sourceType: row.source_type,
    sourceId: row.source_id,
    billToName: row.bill_to_name,
    billToEmail: row.bill_to_email_normalized,
    status: row.status,
    currency: 'usd',
    totalCents: Number(row.total_cents),
    dueDate: row.due_date,
    stripeInvoiceId: row.stripe_invoice_id,
    hostedUrl: row.hosted_url,
    paidAt: row.paid_at === null ? null : Number(row.paid_at),
    paidMethod: row.paid_method,
    paidReference: row.paid_reference,
    createdAt: Number(row.created_at),
    lines,
  };
}

const emailLineKind = (kind: InvoiceLineKind): 'musician_pay' | 'gamo_admin' | 'other' =>
  kind === 'musician_pay' || kind === 'gamo_admin' ? kind : 'other';

export class InvoiceService {
  constructor(
    private readonly db: SqlDatabase,
    private readonly env: InvoiceEnv,
    private readonly options: InvoiceServiceOptions = {},
  ) {}

  private nowSeconds(explicit?: number): number {
    return explicit ?? this.options.now?.() ?? Math.floor(Date.now() / 1000);
  }

  private get gamoAdminApproved(): boolean {
    return this.env.GAMO_ADMIN_FEE_APPROVED === 'true';
  }

  // ---- Reading ---------------------------------------------------------------------------------

  private async linesFor(invoiceIds: string[]): Promise<Map<string, InvoiceLineRecord[]>> {
    const byInvoice = new Map<string, InvoiceLineRecord[]>();
    if (invoiceIds.length === 0) return byInvoice;
    const marks = invoiceIds.map((_, i) => `?${i + 1}`).join(', ');
    const rows = await allRows<LineRow>(this.db, {
      sql: `${LINE_SELECT} WHERE l.invoice_id IN (${marks}) ORDER BY l.invoice_id, l.rowid`,
      params: invoiceIds,
    });
    for (const row of rows) {
      const list = byInvoice.get(row.invoice_id) ?? [];
      list.push(toLineRecord(row));
      byInvoice.set(row.invoice_id, list);
    }
    return byInvoice;
  }

  private async findInvoice(id: string): Promise<Invoice | null> {
    const row = (await this.db
      .prepare(`SELECT ${INVOICE_COLUMNS} FROM invoices WHERE id = ?1`)
      .bind(id)
      .first()) as InvoiceRow | null;
    if (!row) return null;
    const lines = await this.linesFor([row.id]);
    return toInvoice(row, lines.get(row.id) ?? []);
  }

  private async requireInvoice(id: string): Promise<Invoice> {
    const invoice = await this.findInvoice(id);
    if (!invoice) throw new InvoiceError('INVOICE_NOT_FOUND', 'Invoice not found.');
    return invoice;
  }

  /** One invoice with its lines, grouped (musician pay, Gamo administrative, other) and subtotalled by kind. */
  async get(id: string): Promise<InvoiceDetail> {
    const invoice = await this.requireInvoice(id);
    const totals = computeTotals(invoice.lines);
    return { ...invoice, groups: separateLines(invoice.lines), totalsByKind: totals.byKind };
  }

  /** Newest first by (createdAt, id); `cursor` is the opaque `nextCursor` of the previous page. */
  async list(filter: InvoiceListFilter = {}, cursor?: string | null): Promise<InvoiceListPage> {
    const limit = Math.min(MAX_LIST, Math.max(1, Math.trunc(filter.limit ?? 25)));
    const params: Array<string | number> = [];
    const where: string[] = [];
    if (filter.status) {
      params.push(filter.status);
      where.push(`status = ?${params.length}`);
    }
    if (cursor) {
      const c = decodeCursor(cursor);
      params.push(c.createdAt, c.id);
      where.push(
        `(created_at < ?${params.length - 1} OR (created_at = ?${params.length - 1} AND id < ?${params.length}))`,
      );
    }
    params.push(limit + 1);
    const rows = await allRows<InvoiceRow>(this.db, {
      sql: `SELECT ${INVOICE_COLUMNS} FROM invoices ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY created_at DESC, id DESC LIMIT ?${params.length}`,
      params,
    });
    const page = rows.slice(0, limit);
    const lines = await this.linesFor(page.map((r) => r.id));
    const last = page[page.length - 1];
    return {
      items: page.map((r) => toInvoice(r, lines.get(r.id) ?? [])),
      nextCursor: rows.length > limit && last ? encodeCursor(Number(last.created_at), last.id) : null,
    };
  }

  // ---- Prefill -----------------------------------------------------------------------------------

  /** Church contact + one `musician_pay` line per accepted offer (offers paying 0 cents have no line). */
  async draftFromServiceRequest(requestId: string): Promise<InvoiceDraftPrefill> {
    const request = (await this.db
      .prepare(
        'SELECT id, church_name, contact_name, contact_email_normalized FROM service_requests WHERE id = ?1',
      )
      .bind(requestId)
      .first()) as {
      id: string;
      church_name: string;
      contact_name: string | null;
      contact_email_normalized: string;
    } | null;
    if (!request) throw new InvoiceError('SOURCE_NOT_FOUND', 'Service request not found.');
    const offers = await allRows<{
      id: string;
      roster_member_id: string;
      role: string;
      pay_cents: number;
      display_name: string;
    }>(this.db, {
      sql: `SELECT o.id, o.roster_member_id, o.role, o.pay_cents, m.display_name
              FROM offers o JOIN roster_members m ON m.id = o.roster_member_id
              WHERE o.request_id = ?1 AND o.status = 'accepted' AND o.pay_cents > 0
              ORDER BY o.sent_at, o.id`,
      params: [requestId],
    });
    return {
      source: { type: 'service_request', id: request.id },
      billTo: { name: request.church_name, email: request.contact_email_normalized },
      lines: prefillFromOffers(
        offers.map((o) => ({
          id: o.id,
          rosterMemberId: o.roster_member_id,
          musicianName: o.display_name,
          payCents: Number(o.pay_cents),
          role: o.role,
          status: 'accepted' as const,
        })),
      ),
    };
  }

  /** Guardian (or the customer for an adult student) + one `lesson` line for the registration amount. */
  async draftFromAcademyRegistration(registrationId: string): Promise<InvoiceDraftPrefill> {
    const reg = (await this.db
      .prepare(
        `SELECT r.id, r.program_slug, r.lesson_slug, r.amount_cents, r.guardian_name, r.guardian_email,
                c.email_normalized AS customer_email, c.display_name AS customer_name
         FROM academy_registrations r JOIN customer_profiles c ON c.id = r.customer_profile_id WHERE r.id = ?1`,
      )
      .bind(registrationId)
      .first()) as {
      id: string;
      program_slug: string;
      lesson_slug: string | null;
      amount_cents: number;
      guardian_name: string | null;
      guardian_email: string | null;
      customer_email: string;
      customer_name: string | null;
    } | null;
    if (!reg) throw new InvoiceError('SOURCE_NOT_FOUND', 'Academy registration not found.');
    const label = (reg.lesson_slug ?? reg.program_slug).replace(/[-_]+/g, ' ');
    const amount = Number(reg.amount_cents);
    return {
      source: { type: 'academy_registration', id: reg.id },
      billTo: {
        name: reg.guardian_name?.trim() || reg.customer_name?.trim() || 'Academy family',
        email: reg.guardian_email ?? reg.customer_email,
      },
      lines:
        amount > 0
          ? [
              {
                kind: 'lesson',
                description: `Academy lessons: ${label}`.slice(0, 200),
                quantity: 1,
                unitAmountCents: amount,
              },
            ]
          : [],
    };
  }

  // ---- Create ------------------------------------------------------------------------------------

  async createDraft(input: CreateDraftInput): Promise<Invoice> {
    const now = this.nowSeconds(input.now);
    const invalid = (message: string, fieldErrors: InvoiceFieldError[] = []) =>
      new InvoiceError('INVOICE_INVALID', message, fieldErrors);

    if (!(INVOICE_SOURCE_TYPES as readonly string[]).includes(input.source?.type)) {
      throw invalid('Unknown invoice source.');
    }
    const sourceType = input.source.type;
    const sourceId = sourceType === 'manual' ? null : (input.source.id ?? '').trim();
    if (sourceType !== 'manual' && !sourceId) throw invalid('A source id is required for this source type.');

    const billToName = typeof input.billTo?.name === 'string' ? input.billTo.name.trim() : '';
    if (billToName.length < 1 || billToName.length > 200)
      throw invalid('Bill-to name must be 1 to 200 characters.');
    const billToEmail = normalizeEmail(input.billTo?.email ?? '');
    if (!isPlausibleEmail(billToEmail)) throw invalid('Bill-to email is not a valid address.');
    if (!isRealDate(input.dueDate)) throw invalid('Due date must be a real date (YYYY-MM-DD).');
    if (!input.staffId) throw invalid('A staff id is required.');

    let lineInputs = input.lines;
    if (lineInputs === undefined && sourceType === 'service_request') {
      lineInputs = (await this.draftFromServiceRequest(sourceId as string)).lines;
    }
    const validated = validateLines(lineInputs ?? [], { gamoAdminFeeApproved: this.gamoAdminApproved });
    if (!validated.ok) {
      if (validated.errors.some((e) => e.code === 'gamo_admin_not_approved')) {
        throw new InvoiceError(
          'GAMO_ADMIN_NOT_APPROVED',
          'Gamo administrative lines are not approved yet.',
          validated.errors,
        );
      }
      throw invalid('The invoice lines are not valid.', validated.errors);
    }
    const lines = validated.lines;
    const noPayee = lines.findIndex((l) => l.kind === 'musician_pay' && !l.payeeRosterMemberId);
    if (noPayee >= 0) {
      throw invalid('A musician pay line needs a payee.', [
        { index: noPayee, code: 'payee_required', message: 'Choose the musician who is paid for this line.' },
      ]);
    }
    const payees = [...new Set(lines.flatMap((l) => (l.payeeRosterMemberId ? [l.payeeRosterMemberId] : [])))];
    if (payees.length > 0) {
      const found = await allRows<{ id: string }>(this.db, {
        sql: `SELECT id FROM roster_members WHERE id IN (${payees.map((_, i) => `?${i + 1}`).join(', ')})`,
        params: payees,
      });
      const known = new Set(found.map((r) => r.id));
      const missing = lines.findIndex((l) => l.payeeRosterMemberId && !known.has(l.payeeRosterMemberId));
      if (missing >= 0) {
        throw invalid('A payee is not on the roster.', [
          { index: missing, code: 'payee_unknown', message: 'That musician is not on the roster.' },
        ]);
      }
    }

    const id = newPrefixedId('inv');
    const year = invoiceYear(new Date(now * 1000));
    const total = computeTotals(lines).totalCents;
    const specs: SqlStatementSpec[] = [
      {
        // next_value is the NEXT number to hand out, so the number allocated here is next_value - 1.
        sql: `INSERT INTO invoice_number_counters (year, next_value) VALUES (?1, 2)
              ON CONFLICT(year) DO UPDATE SET next_value = next_value + 1 RETURNING next_value`,
        params: [year],
      },
      {
        sql: `INSERT INTO invoices (id, number, source_type, source_id, bill_to_name, bill_to_email_normalized, status,
                currency, total_cents, due_date, created_by_user_id, created_at)
              SELECT ?1, printf('GS-%d-%04d', year, next_value - 1), ?2, ?3, ?4, ?5, 'draft', 'usd', ?6, ?7, ?8, ?9
              FROM invoice_number_counters WHERE year = ?10`,
        params: [
          id,
          sourceType,
          sourceId,
          billToName,
          billToEmail,
          total,
          input.dueDate,
          input.staffId,
          now,
          year,
        ],
      },
      ...lines.map((l): SqlStatementSpec => ({
        sql: `INSERT INTO invoice_lines (id, invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, payee_roster_member_id)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        params: [
          newPrefixedId('inl'),
          id,
          l.kind,
          l.description,
          l.quantity,
          l.unitAmountCents,
          l.amountCents,
          l.kind === 'musician_pay' ? (l.payeeRosterMemberId ?? null) : null,
        ],
      })),
    ];
    await runBatch(this.db, specs);
    const created = await this.requireInvoice(id);
    if (!isValidInvoiceNumber(created.number)) throw new Error('invoice: allocated number is malformed');
    return created;
  }

  // ---- Send --------------------------------------------------------------------------------------

  private stripeClient() {
    return createStripeTestClient({
      secretKey: this.env.STRIPE_SECRET_KEY,
      fetchImpl: this.options.fetchImpl,
    });
  }

  private manualInstructions(): string | undefined {
    const text = this.env.INVOICE_PAYMENT_INSTRUCTIONS?.trim();
    return text ? text : undefined;
  }

  /** Sends (or retries) the invoice email through the outbox; throws EMAIL_FAILED unless it is sent or queued. */
  private async emailInvoice(invoice: Invoice, now: number): Promise<void> {
    const hostedUrl = invoice.hostedUrl ?? undefined;
    const manualInstructions = hostedUrl ? undefined : this.manualInstructions();
    if (!hostedUrl && !manualInstructions) {
      throw new InvoiceError(
        'PAYMENT_NOT_CONFIGURED',
        'No payment link or payment instructions are configured.',
      );
    }
    let status: OutboxStatus;
    try {
      const mail = renderEmail('invoice_sent', {
        billToName: invoice.billToName,
        number: invoice.number,
        dueDate: invoice.dueDate ? displayIsoDate(invoice.dueDate) : 'On receipt',
        lines: invoice.lines.map((l) => ({
          kind: emailLineKind(l.kind),
          description: l.description,
          quantity: l.quantity,
          unitAmountCents: l.unitAmountCents,
          amountCents: l.amountCents,
        })),
        totalCents: invoice.totalCents,
        ...(hostedUrl ? { hostedUrl } : { manualInstructions }),
      });
      const result = await sendOutboxEmail(
        this.db,
        this.env as unknown as GamoEnv,
        {
          kind: 'invoice_sent',
          idempotencyKey: emailIdempotencyKey('invoice_sent', invoice.id),
          to: invoice.billToEmail,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
          relatedType: 'invoice',
          relatedId: invoice.id,
          product: 'web',
          now,
        },
        { fetchImpl: this.options.fetchImpl },
      );
      status = result.status;
    } catch (err) {
      if (err instanceof InvoiceError) throw err;
      console.warn('[invoices] invoice_sent email could not be prepared or sent');
      throw new InvoiceError(
        'EMAIL_FAILED',
        'The invoice email could not be sent. The invoice stays open; try sending again.',
      );
    }
    if (!OK_EMAIL.includes(status)) {
      throw new InvoiceError(
        'EMAIL_FAILED',
        'The invoice email was not delivered. The invoice stays open; try sending again.',
      );
    }
  }

  /**
   * draft -> open. With a real Stripe test key: customer, draft invoice with items, finalize, then store the
   * Stripe id and hosted URL; otherwise the manual instructions are used. Re-sending an open invoice only
   * retries the email.
   */
  async send(invoiceId: string, options: SendOptions = {}): Promise<SendResult> {
    const now = this.nowSeconds(options.now);
    const invoice = await this.requireInvoice(invoiceId);
    if (invoice.status === 'paid' || invoice.status === 'void') {
      throw new InvoiceError('INVOICE_STATE', `A ${invoice.status} invoice cannot be sent.`);
    }
    if (invoice.status === 'open') return this.resend(invoice, now);

    const useStripe = isRealTestKey(this.env.STRIPE_SECRET_KEY);
    if (!useStripe && !this.manualInstructions()) {
      throw new InvoiceError(
        'PAYMENT_NOT_CONFIGURED',
        'Set Stripe test credentials or INVOICE_PAYMENT_INSTRUCTIONS before sending invoices.',
      );
    }
    let stripeInvoiceId: string | null = null;
    let hostedUrl: string | null = null;
    if (useStripe) {
      ({ stripeInvoiceId, hostedUrl } = await this.createStripeInvoice(invoice, now));
    }
    const updated = await this.db
      .prepare(
        `UPDATE invoices SET status = 'open', stripe_invoice_id = ?2, hosted_url = ?3 WHERE id = ?1 AND status = 'draft'`,
      )
      .bind(invoice.id, stripeInvoiceId, hostedUrl)
      .run();
    if (changesOf(updated) === 0) {
      // Another request sent it first; behave like a re-send of that open invoice.
      const current = await this.requireInvoice(invoice.id);
      if (current.status !== 'open')
        throw new InvoiceError('INVOICE_STATE', `A ${current.status} invoice cannot be sent.`);
      return this.resend(current, now);
    }
    await this.emailInvoice({ ...invoice, status: 'open', stripeInvoiceId, hostedUrl }, now);
    return { invoiceId: invoice.id, mode: useStripe ? 'stripe' : 'manual', hostedUrl, status: 'open' };
  }

  private async resend(invoice: Invoice, now: number): Promise<SendResult> {
    await this.emailInvoice(invoice, now);
    return {
      invoiceId: invoice.id,
      mode: invoice.stripeInvoiceId ? 'stripe' : 'manual',
      hostedUrl: invoice.hostedUrl,
      status: 'open',
    };
  }

  private async createStripeInvoice(
    invoice: Invoice,
    now: number,
  ): Promise<{ stripeInvoiceId: string; hostedUrl: string }> {
    const request = buildStripeInvoiceRequest(
      {
        id: invoice.id,
        number: invoice.number,
        sourceType: invoice.sourceType,
        billToName: invoice.billToName,
        billToEmail: invoice.billToEmail,
        dueDate: invoice.dueDate ?? new Date((now + 30 * 86_400) * 1000).toISOString().slice(0, 10),
      },
      invoice.lines.map((l) => ({
        kind: l.kind,
        description: l.description,
        quantity: l.quantity,
        unitAmountCents: l.unitAmountCents,
        amountCents: l.amountCents,
        payeeRosterMemberId: l.payeeRosterMemberId,
      })),
      new Date(now * 1000),
    );
    try {
      const client = this.stripeClient();
      const customer = await client.createCustomer(request.customer);
      const draft = await client.createInvoice({ ...request.invoice, customerId: customer.id });
      // Never finalize an invoice whose amount differs from ours.
      if (draft.amount_due !== invoice.totalCents) {
        console.error('[invoices] STRIPE_AMOUNT_MISMATCH: not finalizing');
        throw new InvoiceError('STRIPE_FAILED', 'Stripe reported a different amount than the invoice total.');
      }
      const finalized = await client.finalizeInvoice(draft.id);
      if (finalized.status !== 'open' || !finalized.hosted_invoice_url) {
        throw new InvoiceError('STRIPE_FAILED', 'Stripe did not return a payment link for the invoice.');
      }
      return { stripeInvoiceId: finalized.id, hostedUrl: finalized.hosted_invoice_url };
    } catch (err) {
      throw toStripeError(err);
    }
  }

  // ---- Paid --------------------------------------------------------------------------------------

  /** Sends the paid receipt once (outbox key `invoice_paid_receipt:{id}`); never throws. */
  async sendReceipt(invoice: Invoice, now: number): Promise<OutboxStatus | 'skipped'> {
    if (invoice.status !== 'paid' || invoice.paidAt === null) return 'skipped';
    try {
      const mail = renderEmail('invoice_paid_receipt', {
        billToName: invoice.billToName,
        number: invoice.number,
        paidDate: displayEpochDate(invoice.paidAt),
        totalCents: invoice.totalCents,
        ...(invoice.paidMethod ? { method: PAID_METHOD_LABEL[invoice.paidMethod] } : {}),
        ...(invoice.paidReference ? { reference: invoice.paidReference.slice(0, 120) } : {}),
      });
      const result = await sendOutboxEmail(
        this.db,
        this.env as unknown as GamoEnv,
        {
          kind: 'invoice_paid_receipt',
          idempotencyKey: emailIdempotencyKey('invoice_paid_receipt', invoice.id),
          to: invoice.billToEmail,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
          relatedType: 'invoice',
          relatedId: invoice.id,
          product: 'web',
          now,
        },
        { fetchImpl: this.options.fetchImpl },
      );
      return result.status;
    } catch {
      console.warn('[invoices] invoice_paid_receipt email could not be sent');
      return 'failed';
    }
  }

  /**
   * open -> paid (any method). Repeating it on a paid invoice changes nothing and sends no second receipt.
   * When the invoice has a live Stripe invoice and the money arrived another way, the Stripe invoice is
   * voided (best effort) so the church cannot pay it twice.
   */
  async markPaid(invoiceId: string, input: MarkPaidInput): Promise<MarkPaidResult> {
    const now = this.nowSeconds(input.now);
    if (!(PAYMENT_METHODS as readonly string[]).includes(input.method)) {
      throw new InvoiceError('INVOICE_INVALID', 'Unknown payment method.');
    }
    const reference = input.reference?.trim() || null;
    if (reference && reference.length > MAX_REFERENCE) {
      throw new InvoiceError('INVOICE_INVALID', `Reference must be at most ${MAX_REFERENCE} characters.`);
    }
    const before = await this.requireInvoice(invoiceId);
    if (before.status === 'paid') return { invoice: before, applied: false, receipt: 'skipped' };
    if (before.status !== 'open') {
      throw new InvoiceError('INVOICE_STATE', `A ${before.status} invoice cannot be marked paid.`);
    }
    const updated = await this.db
      .prepare(
        `UPDATE invoices SET status = 'paid', paid_at = ?2, paid_method = ?3, paid_reference = ?4 WHERE id = ?1 AND status = 'open'`,
      )
      .bind(invoiceId, now, input.method, reference)
      .run();
    const invoice = await this.requireInvoice(invoiceId);
    if (changesOf(updated) === 0) {
      if (invoice.status === 'paid') return { invoice, applied: false, receipt: 'skipped' };
      throw new InvoiceError('INVOICE_STATE', `A ${invoice.status} invoice cannot be marked paid.`);
    }
    if (before.stripeInvoiceId && input.method !== 'stripe' && isRealTestKey(this.env.STRIPE_SECRET_KEY)) {
      try {
        await this.stripeClient().voidInvoice(before.stripeInvoiceId);
      } catch {
        console.warn(
          '[invoices] STRIPE_VOID_AFTER_MANUAL_PAYMENT_FAILED: void the Stripe invoice in the Dashboard',
        );
      }
    }
    return { invoice, applied: true, receipt: await this.sendReceipt(invoice, now) };
  }

  // ---- Void --------------------------------------------------------------------------------------

  /** draft or open -> void. Voiding twice is a no-op. Paid invoices cannot be voided. */
  async void(invoiceId: string, _staffId: string): Promise<Invoice> {
    const invoice = await this.requireInvoice(invoiceId);
    if (invoice.status === 'void') return invoice;
    if (invoice.status === 'paid')
      throw new InvoiceError('INVOICE_STATE', 'A paid invoice cannot be voided.');
    if (invoice.status === 'open' && invoice.stripeInvoiceId) {
      try {
        await this.stripeClient().voidInvoice(invoice.stripeInvoiceId);
      } catch (err) {
        throw toStripeError(err);
      }
    }
    const updated = await this.db
      .prepare(`UPDATE invoices SET status = 'void' WHERE id = ?1 AND status IN ('draft', 'open')`)
      .bind(invoiceId)
      .run();
    const after = await this.requireInvoice(invoiceId);
    if (changesOf(updated) === 0 && after.status !== 'void') {
      throw new InvoiceError('INVOICE_STATE', `A ${after.status} invoice cannot be voided.`);
    }
    return after;
  }

  // ---- Payouts -----------------------------------------------------------------------------------

  /**
   * Records that Gamo paid a `musician_pay` line out. The invoice must be paid, the amount is the line
   * amount (never reduced), and a line has at most one payout.
   */
  async recordPayout(invoiceLineId: string, input: RecordPayoutInput): Promise<PayoutRecord> {
    const now = this.nowSeconds(input.now);
    if (!(PAYMENT_METHODS as readonly string[]).includes(input.method)) {
      throw new InvoiceError('INVOICE_INVALID', 'Unknown payment method.');
    }
    const reference = input.reference?.trim() || null;
    if (reference && reference.length > MAX_REFERENCE) {
      throw new InvoiceError('INVOICE_INVALID', `Reference must be at most ${MAX_REFERENCE} characters.`);
    }
    const line = (await this.db
      .prepare(
        `SELECT l.id, l.kind, l.amount_cents, l.payee_roster_member_id, i.status AS invoice_status
         FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id WHERE l.id = ?1`,
      )
      .bind(invoiceLineId)
      .first()) as {
      id: string;
      kind: InvoiceLineKind;
      amount_cents: number;
      payee_roster_member_id: string | null;
      invoice_status: InvoiceStatus;
    } | null;
    if (!line) throw new InvoiceError('LINE_NOT_FOUND', 'Invoice line not found.');
    if (line.kind !== 'musician_pay' || !line.payee_roster_member_id) {
      throw new InvoiceError('INVOICE_STATE', 'Only musician pay lines have a payout.');
    }
    const amount = Number(line.amount_cents);
    if (input.amountCents !== undefined && input.amountCents !== amount) {
      throw new InvoiceError(
        'INVOICE_INVALID',
        'A payout must equal the line amount; partial payouts are not supported.',
      );
    }
    if (line.invoice_status !== 'paid') {
      throw new InvoiceError('INVOICE_STATE', 'Record the payout after the invoice is paid.');
    }
    const payoutId = newPrefixedId('pay');
    const rows = await allRows<{ id: string }>(this.db, {
      sql: `INSERT INTO musician_payouts (id, invoice_line_id, roster_member_id, amount_cents, paid_at, method, reference, recorded_by_user_id)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(invoice_line_id) DO NOTHING RETURNING id`,
      params: [
        payoutId,
        line.id,
        line.payee_roster_member_id,
        amount,
        now,
        input.method,
        reference,
        input.staffId,
      ],
    });
    if (rows.length === 0)
      throw new InvoiceError('PAYOUT_EXISTS', 'A payout is already recorded for this line.');
    return {
      payoutId,
      invoiceLineId: line.id,
      rosterMemberId: line.payee_roster_member_id,
      amountCents: amount,
    };
  }
}

function toStripeError(err: unknown): InvoiceError {
  if (err instanceof InvoiceError) return err;
  if (err instanceof StripeNotConfiguredError) {
    return new InvoiceError('PAYMENT_NOT_CONFIGURED', 'Stripe test credentials are not configured.');
  }
  if (err instanceof StripeApiError) {
    console.warn(`[invoices] STRIPE_FAILED status=${err.status}${err.code ? ` code=${err.code}` : ''}`);
    return new InvoiceError(
      'STRIPE_FAILED',
      'Stripe could not complete the request. The invoice is unchanged; try again.',
    );
  }
  console.warn('[invoices] STRIPE_FAILED (no response)');
  return new InvoiceError(
    'STRIPE_FAILED',
    'Stripe could not be reached. The invoice is unchanged; try again.',
  );
}

function encodeCursor(createdAt: number, id: string): string {
  return btoa(JSON.stringify({ c: createdAt, i: id }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeCursor(cursor: string): { createdAt: number; id: string } {
  try {
    const parsed = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/'))) as {
      c?: unknown;
      i?: unknown;
    };
    if (typeof parsed.c === 'number' && Number.isSafeInteger(parsed.c) && typeof parsed.i === 'string') {
      return { createdAt: parsed.c, id: parsed.i };
    }
  } catch {
    /* fall through */
  }
  throw new InvoiceError('INVOICE_INVALID', 'The cursor is not valid.');
}
