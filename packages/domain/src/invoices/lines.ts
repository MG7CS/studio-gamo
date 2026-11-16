/**
 * Invoice lines: validation, totals and the musician-pay / Gamo separation. Integer USD cents only.
 *
 * Mission rules (AGENTS.md): musician pay and any Gamo administrative allocation are always
 * separate line items, and a `gamo_admin` line is refused unless the founder has approved fees
 * (`GAMO_ADMIN_FEE_APPROVED=true`). Nothing here deducts from musician pay.
 */

export const INVOICE_LINE_KINDS = ['musician_pay', 'lesson', 'production', 'other', 'gamo_admin'] as const;
export type InvoiceLineKind = (typeof INVOICE_LINE_KINDS)[number];

export const MAX_INVOICE_LINES = 250;
export const MAX_LINE_DESCRIPTION_LENGTH = 200;

export interface InvoiceLineInput {
  kind: InvoiceLineKind;
  description: string;
  /** Integer >= 1; defaults to 1. */
  quantity?: number;
  /** Integer cents per unit, >= 1. */
  unitAmountCents: number;
  /** Roster member who is paid for a `musician_pay` line. */
  payeeRosterMemberId?: string | null;
}

/** A validated line: quantity filled in and the line total (`unit x quantity`) computed. */
export interface InvoiceLine extends InvoiceLineInput {
  quantity: number;
  amountCents: number;
}

export type InvoiceLineErrorCode =
  | 'no_lines'
  | 'too_many_lines'
  | 'invalid_kind'
  | 'gamo_admin_not_approved'
  | 'invalid_description'
  | 'invalid_quantity'
  | 'invalid_amount'
  | 'payee_not_allowed'
  | 'total_too_large';

export interface InvoiceLineError {
  /** Line index, or `null` for an error about the invoice as a whole. */
  index: number | null;
  code: InvoiceLineErrorCode;
  message: string;
}

export type ValidateLinesResult =
  { ok: true; lines: InvoiceLine[] } | { ok: false; errors: InvoiceLineError[] };

export interface ValidateLinesOptions {
  /** `GAMO_ADMIN_FEE_APPROVED === 'true'`; fees remain proposals until approved. */
  gamoAdminFeeApproved: boolean;
}

export function validateLines(
  lines: readonly InvoiceLineInput[],
  options: ValidateLinesOptions,
): ValidateLinesResult {
  const errors: InvoiceLineError[] = [];
  const add = (index: number | null, code: InvoiceLineErrorCode, message: string) =>
    errors.push({ index, code, message });

  if (lines.length === 0) add(null, 'no_lines', 'An invoice needs at least one line.');
  if (lines.length > MAX_INVOICE_LINES) {
    add(null, 'too_many_lines', `An invoice can have at most ${MAX_INVOICE_LINES} lines.`);
  }

  const valid: InvoiceLine[] = [];
  lines.forEach((line, index) => {
    const before = errors.length;
    if (!INVOICE_LINE_KINDS.includes(line.kind)) {
      add(index, 'invalid_kind', 'Unknown line kind.');
    } else if (line.kind === 'gamo_admin' && !options.gamoAdminFeeApproved) {
      add(index, 'gamo_admin_not_approved', 'Gamo administrative lines are not approved yet.');
    }
    if (line.kind !== 'musician_pay' && line.payeeRosterMemberId) {
      add(index, 'payee_not_allowed', 'Only musician pay lines can name a payee.');
    }
    const description = typeof line.description === 'string' ? line.description.trim() : '';
    if (description.length === 0 || description.length > MAX_LINE_DESCRIPTION_LENGTH) {
      add(
        index,
        'invalid_description',
        `Description must be 1 to ${MAX_LINE_DESCRIPTION_LENGTH} characters.`,
      );
    }
    const quantity = line.quantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      add(index, 'invalid_quantity', 'Quantity must be a whole number of at least 1.');
    }
    if (!Number.isSafeInteger(line.unitAmountCents) || line.unitAmountCents < 1) {
      add(index, 'invalid_amount', 'Amount must be a positive whole number of cents.');
    }
    if (errors.length === before) {
      const amountCents = line.unitAmountCents * quantity;
      if (Number.isSafeInteger(amountCents)) {
        valid.push({ ...line, description, quantity, amountCents });
      } else {
        add(index, 'invalid_amount', 'Line total is too large.');
      }
    }
  });

  if (errors.length === 0) {
    const total = valid.reduce((sum, l) => sum + l.amountCents, 0);
    if (!Number.isSafeInteger(total)) add(null, 'total_too_large', 'Invoice total is too large.');
  }
  return errors.length === 0 ? { ok: true, lines: valid } : { ok: false, errors };
}

export interface InvoiceTotals {
  /** Sum of line totals, integer cents. */
  totalCents: number;
  byKind: Record<InvoiceLineKind, number>;
}

/** Totals of validated lines (integer cents; per-kind subtotals for musician-pay vs Gamo reporting). */
export function computeTotals(lines: readonly InvoiceLine[]): InvoiceTotals {
  const byKind: Record<InvoiceLineKind, number> = {
    musician_pay: 0,
    lesson: 0,
    production: 0,
    other: 0,
    gamo_admin: 0,
  };
  let totalCents = 0;
  for (const line of lines) {
    byKind[line.kind] += line.amountCents;
    totalCents += line.amountCents;
  }
  return { totalCents, byKind };
}

export interface SeparatedLines<T extends { kind: InvoiceLineKind }> {
  musicianPay: T[];
  gamoAdmin: T[];
  /** lesson, production and other. */
  other: T[];
}

/** Splits lines so musician pay and the Gamo allocation are never mixed. Order is preserved per group. */
export function separateLines<T extends { kind: InvoiceLineKind }>(lines: readonly T[]): SeparatedLines<T> {
  const out: SeparatedLines<T> = { musicianPay: [], gamoAdmin: [], other: [] };
  for (const line of lines) {
    if (line.kind === 'musician_pay') out.musicianPay.push(line);
    else if (line.kind === 'gamo_admin') out.gamoAdmin.push(line);
    else out.other.push(line);
  }
  return out;
}

export interface AcceptedOffer {
  id: string;
  rosterMemberId: string;
  /** Name shown on the invoice line, e.g. "Sample Pianist". */
  musicianName: string;
  /** Pay the offer promised, integer cents; shown to the church as its own line. */
  payCents: number;
  role?: string;
  /** Only `accepted` offers become lines; omit to treat the offer as accepted. */
  status?: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
}

/**
 * One `musician_pay` line per accepted offer, payee set so a payout can be recorded per line.
 * Never adds a `gamo_admin` line: staff add that deliberately, and only once fees are approved.
 */
export function prefillFromOffers(offers: readonly AcceptedOffer[]): InvoiceLineInput[] {
  return offers
    .filter((offer) => offer.status === undefined || offer.status === 'accepted')
    .map((offer) => ({
      kind: 'musician_pay' as const,
      description: offer.role
        ? `Musician pay: ${offer.musicianName} (${offer.role})`
        : `Musician pay: ${offer.musicianName}`,
      quantity: 1,
      unitAmountCents: offer.payCents,
      payeeRosterMemberId: offer.rosterMemberId,
    }));
}
