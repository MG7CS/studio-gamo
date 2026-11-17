/**
 * The new-invoice form as plain data: parsing a posted body into values, validating it into a
 * `CreateDraftInput` shape (dollars to integer cents), and mapping errors back to field ids so the page
 * can show an error summary that links to each field. No Astro, no database: the service remains the
 * authority and re-validates everything.
 *
 * Posted field names (the same page works without JavaScript):
 *   sourceType, sourceId, billToName, billToEmail, dueDate, line_count,
 *   line_kind_{i}, line_description_{i}, line_quantity_{i}, line_price_{i}, line_payee_{i},
 *   action = create | add_line | remove_line_{i}
 */
import {
  INVOICE_LINE_KINDS,
  INVOICE_SOURCE_TYPES,
  MAX_LINE_DESCRIPTION_LENGTH,
  type InvoiceFieldError,
  type InvoiceLineInput,
  type InvoiceSourceType,
} from '@gamo/domain/invoices';
import { centsToDollarsInput, dollarsToCents } from './money';

/** The form shows at most this many lines (the API contract allows 50). */
export const MAX_FORM_LINES = 50;

export interface LineFormValue {
  kind: string;
  description: string;
  quantity: string;
  /** Dollars as typed, e.g. "125.50". */
  price: string;
  /** Roster member id for a musician pay line, else ''. */
  payee: string;
}

export interface InvoiceFormValues {
  sourceType: InvoiceSourceType;
  sourceId: string;
  billToName: string;
  billToEmail: string;
  dueDate: string;
  lines: LineFormValue[];
}

export type FormAction = { type: 'create' } | { type: 'add_line' } | { type: 'remove_line'; index: number };

export interface FieldProblem {
  /** The id of the control to focus (`bill-to-name`, `line-2-price`, ...), or `lines` for the whole editor. */
  fieldId: string;
  message: string;
}

export const blankLine = (): LineFormValue => ({
  kind: 'lesson',
  description: '',
  quantity: '1',
  price: '',
  payee: '',
});

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function fieldIdFor(index: number, field: 'kind' | 'description' | 'quantity' | 'price' | 'payee') {
  return `line-${index}-${field}`;
}

/** Reads a posted body (form or already-decoded object) into values and the requested action. */
export function parseInvoiceForm(body: Record<string, unknown>): {
  values: InvoiceFormValues;
  action: FormAction;
} {
  const declared = Number.parseInt(str(body.line_count), 10);
  const count = Number.isInteger(declared) ? Math.min(Math.max(declared, 0), MAX_FORM_LINES) : 0;
  const lines: LineFormValue[] = [];
  for (let i = 0; i < count; i++) {
    lines.push({
      kind: str(body[`line_kind_${i}`]),
      description: str(body[`line_description_${i}`]),
      quantity: str(body[`line_quantity_${i}`]),
      price: str(body[`line_price_${i}`]),
      payee: str(body[`line_payee_${i}`]),
    });
  }
  const sourceType = (INVOICE_SOURCE_TYPES as readonly string[]).includes(str(body.sourceType))
    ? (str(body.sourceType) as InvoiceSourceType)
    : 'manual';
  const act = str(body.action);
  const remove = /^remove_line_(\d{1,2})$/.exec(act);
  const action: FormAction = remove
    ? { type: 'remove_line', index: Number(remove[1]) }
    : act === 'add_line'
      ? { type: 'add_line' }
      : { type: 'create' };
  return {
    values: {
      sourceType,
      sourceId: sourceType === 'manual' ? '' : str(body.sourceId).trim(),
      billToName: str(body.billToName),
      billToEmail: str(body.billToEmail),
      dueDate: str(body.dueDate),
      lines,
    },
    action,
  };
}

/** Applies add/remove to the values (the page re-renders them; nothing is saved). */
export function applyLineAction(values: InvoiceFormValues, action: FormAction): InvoiceFormValues {
  if (action.type === 'add_line' && values.lines.length < MAX_FORM_LINES) {
    return { ...values, lines: [...values.lines, blankLine()] };
  }
  if (action.type === 'remove_line' && action.index >= 0 && action.index < values.lines.length) {
    const lines = values.lines.filter((_, i) => i !== action.index);
    return { ...values, lines: lines.length > 0 ? lines : [blankLine()] };
  }
  return values;
}

/** Lines from a prefill (service request or registration), as form text. At least one row is always shown. */
export function linesToForm(lines: readonly InvoiceLineInput[]): LineFormValue[] {
  const rows = lines.map((l) => ({
    kind: l.kind,
    description: l.description,
    quantity: String(l.quantity ?? 1),
    price: centsToDollarsInput(l.unitAmountCents),
    payee: l.payeeRosterMemberId ?? '',
  }));
  return rows.length > 0 ? rows : [blankLine()];
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isRealIsoDate(value: string): boolean {
  const m = DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return (
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3])
  );
}

/** `YYYY-MM-DD`, `days` after `nowSeconds` (UTC). */
export function defaultDueDate(nowSeconds: number, days = 30): string {
  return new Date((nowSeconds + days * 86_400) * 1000).toISOString().slice(0, 10);
}

const isBlankRow = (l: LineFormValue): boolean =>
  l.description.trim() === '' &&
  l.price.trim() === '' &&
  l.payee.trim() === '' &&
  (l.quantity.trim() === '' || l.quantity.trim() === '1');

export interface CreateInput {
  source: { type: InvoiceSourceType; id?: string };
  billTo: { name: string; email: string };
  dueDate: string;
  lines: InvoiceLineInput[];
}

export type BuildResult =
  | {
      ok: true;
      input: CreateInput;
      /** For each submitted line, the index of the row it came from (blank rows are dropped). */
      rowIndexes: number[];
    }
  | { ok: false; problems: FieldProblem[] };

export interface BuildOptions {
  gamoAdminFeeApproved: boolean;
}

/** Validates the form text and converts it to the service input. Dollars become integer cents here. */
export function buildCreateInput(values: InvoiceFormValues, options: BuildOptions): BuildResult {
  const problems: FieldProblem[] = [];
  const add = (fieldId: string, message: string) => problems.push({ fieldId, message });

  const name = values.billToName.trim();
  if (name.length < 1 || name.length > 200)
    add('bill-to-name', 'Enter the bill-to name (up to 200 characters).');
  const email = values.billToEmail.trim();
  if (!EMAIL.test(email)) add('bill-to-email', 'Enter a valid bill-to email address.');
  if (!isRealIsoDate(values.dueDate.trim()))
    add('due-date', 'Enter the due date as a real date (YYYY-MM-DD).');
  if (values.sourceType !== 'manual' && !values.sourceId) {
    add('bill-to-name', 'This invoice needs its source request or registration; start from that record.');
  }

  const lines: InvoiceLineInput[] = [];
  const rowIndexes: number[] = [];
  values.lines.forEach((row, i) => {
    if (isBlankRow(row)) return;
    const before = problems.length;
    if (!(INVOICE_LINE_KINDS as readonly string[]).includes(row.kind)) {
      add(fieldIdFor(i, 'kind'), `Line ${i + 1}: choose what the line is for.`);
    } else if (row.kind === 'gamo_admin' && !options.gamoAdminFeeApproved) {
      add(
        fieldIdFor(i, 'kind'),
        `Line ${i + 1}: Gamo administrative contributions are not approved yet, so this line cannot be used.`,
      );
    }
    const description = row.description.trim();
    if (description.length < 1 || description.length > MAX_LINE_DESCRIPTION_LENGTH) {
      add(
        fieldIdFor(i, 'description'),
        `Line ${i + 1}: describe the line in 1 to ${MAX_LINE_DESCRIPTION_LENGTH} characters.`,
      );
    }
    const qText = row.quantity.trim() === '' ? '1' : row.quantity.trim();
    const quantity = /^\d{1,6}$/.test(qText) ? Number(qText) : Number.NaN;
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      add(fieldIdFor(i, 'quantity'), `Line ${i + 1}: quantity must be a whole number of at least 1.`);
    }
    const cents = dollarsToCents(row.price);
    if (cents === null || cents < 1) {
      add(fieldIdFor(i, 'price'), `Line ${i + 1}: enter a price in dollars, like 125.00.`);
    }
    if (row.kind === 'musician_pay' && !row.payee) {
      add(fieldIdFor(i, 'payee'), `Line ${i + 1}: choose the musician who is paid for this line.`);
    }
    if (problems.length === before && cents !== null) {
      lines.push({
        kind: row.kind as InvoiceLineInput['kind'],
        description,
        quantity,
        unitAmountCents: cents,
        ...(row.kind === 'musician_pay' ? { payeeRosterMemberId: row.payee } : {}),
      });
      rowIndexes.push(i);
    }
  });
  if (rowIndexes.length === 0 && !problems.some((p) => p.fieldId.startsWith('line-'))) {
    add('lines', 'Add at least one line with a description and a price.');
  }
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    rowIndexes,
    input: {
      source:
        values.sourceType === 'manual'
          ? { type: 'manual' }
          : { type: values.sourceType, id: values.sourceId },
      billTo: { name, email },
      dueDate: values.dueDate.trim(),
      lines,
    },
  };
}

const LINE_FIELD_FOR_CODE: Record<string, 'kind' | 'description' | 'quantity' | 'price' | 'payee'> = {
  invalid_kind: 'kind',
  gamo_admin_not_approved: 'kind',
  invalid_description: 'description',
  invalid_quantity: 'quantity',
  invalid_amount: 'price',
  payee_not_allowed: 'payee',
  payee_required: 'payee',
  payee_unknown: 'payee',
};

/**
 * Maps the service's `fieldErrors` (and its message-only errors) to controls on the page.
 * `rowIndexes` translates service line indexes back to the form rows that were submitted.
 */
export function problemsFromServiceError(
  error: { message: string; fieldErrors?: readonly InvoiceFieldError[] },
  rowIndexes: readonly number[],
): FieldProblem[] {
  const out: FieldProblem[] = [];
  for (const fe of error.fieldErrors ?? []) {
    if (fe.index === null) {
      out.push({ fieldId: 'lines', message: fe.message });
      continue;
    }
    const row = rowIndexes[fe.index] ?? fe.index;
    const field = LINE_FIELD_FOR_CODE[fe.code] ?? 'description';
    out.push({ fieldId: fieldIdFor(row, field), message: `Line ${row + 1}: ${fe.message}` });
  }
  if (out.length > 0) return out;
  const m = error.message;
  const fieldId = /email/i.test(m)
    ? 'bill-to-email'
    : /due date/i.test(m)
      ? 'due-date'
      : /bill-to name/i.test(m)
        ? 'bill-to-name'
        : /line|payee/i.test(m)
          ? 'lines'
          : 'bill-to-name';
  return [{ fieldId, message: m }];
}

/** Last-resort lookup: problem list -> message by field id. */
export function problemsByField(problems: readonly FieldProblem[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of problems) out[p.fieldId] ??= p.message;
  return out;
}
