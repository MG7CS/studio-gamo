/**
 * Invoice actions behind the API routes and the new-invoice page: plain async functions over
 * `InvoiceService` that return a `Response` (JSON for API clients, `303` + notice for form posts) or a
 * result the page renders. Routes authenticate first (`adminApi`), which includes the same-origin check on
 * every state-changing request; nothing here trusts the browser for authority.
 */
import type { GamoEnv } from '@gamo/config/env';
import { jsonResponse } from '@gamo/domain';
import { allRows } from '@gamo/domain/security';
import {
  INVOICE_STATUSES,
  InvoiceError,
  type Invoice,
  type InvoiceSourceType,
  type InvoiceStatus,
} from '@gamo/domain/invoices';
import { domainErrorResponse, noticeKeyForError } from '../domain-errors';
import { jsonOrSee, see, wantsJson } from '../admin-page';
import {
  applyLineAction,
  buildCreateInput,
  defaultDueDate,
  parseInvoiceForm,
  problemsFromServiceError,
  type CreateInput,
  type FieldProblem,
  type InvoiceFormValues,
} from './form';
import { invoiceNoticeKey } from './notices';
import { invoiceService, sqlOf } from './queries';
import { invoiceDto } from './view';

export interface ActionDeps {
  env: GamoEnv;
  /** The signed-in staff user (recorded as the creator / payout recorder). */
  staffId: string;
  /** Injected for tests (Stripe and Resend). */
  fetchImpl?: typeof fetch;
  /** Epoch seconds; defaults to the clock. */
  now?: () => number;
}

const svc = (deps: ActionDeps) =>
  invoiceService(deps.env, { fetchImpl: deps.fetchImpl, ...(deps.now ? { now: deps.now } : {}) });
const nowSeconds = (deps: ActionDeps) => deps.now?.() ?? Math.floor(Date.now() / 1000);
const approved = (deps: ActionDeps) => deps.env.GAMO_ADMIN_FEE_APPROVED === 'true';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** A failed action: JSON error for API clients, a redirect with a notice for forms. */
function failure(request: Request, err: unknown, location: string): Response {
  if (wantsJson(request)) return domainErrorResponse(err);
  const key = err instanceof InvoiceError ? invoiceNoticeKey(err) : noticeKeyForError(err);
  // Not an expected refusal (auth, unknown error): answer it as an error, never a redirect.
  return key === null ? domainErrorResponse(err) : see(location, key);
}

// ---- Create ----------------------------------------------------------------------------------------

export type NewInvoiceOutcome =
  | { kind: 'created'; invoice: Invoice }
  | { kind: 'rerender'; values: InvoiceFormValues }
  | { kind: 'problems'; values: InvoiceFormValues; problems: FieldProblem[]; rowIndexes: number[] };

/** The new-invoice page's POST: add/remove a line (re-render) or validate and create the draft. */
export async function processNewInvoiceForm(
  body: Record<string, unknown>,
  deps: ActionDeps,
): Promise<NewInvoiceOutcome> {
  const parsed = parseInvoiceForm(body);
  if (parsed.action.type !== 'create') {
    return { kind: 'rerender', values: applyLineAction(parsed.values, parsed.action) };
  }
  const built = buildCreateInput(parsed.values, { gamoAdminFeeApproved: approved(deps) });
  if (!built.ok) return { kind: 'problems', values: parsed.values, problems: built.problems, rowIndexes: [] };
  try {
    const invoice = await svc(deps).createDraft({ ...built.input, staffId: deps.staffId });
    return { kind: 'created', invoice };
  } catch (err) {
    if (
      err instanceof InvoiceError &&
      (err.code === 'INVOICE_INVALID' || err.code === 'GAMO_ADMIN_NOT_APPROVED')
    ) {
      return {
        kind: 'problems',
        values: parsed.values,
        problems: problemsFromServiceError(err, built.rowIndexes),
        rowIndexes: built.rowIndexes,
      };
    }
    throw err;
  }
}

const SOURCE_TYPES = ['service_request', 'academy_registration', 'manual'] as const;

/** JSON body -> service input. Lines are passed through untouched: the service is the validator. */
function inputFromJson(
  body: Record<string, unknown>,
  deps: ActionDeps,
): CreateInput & { lines?: CreateInput['lines'] } {
  const sourceType = (SOURCE_TYPES as readonly string[]).includes(str(body.sourceType))
    ? (str(body.sourceType) as InvoiceSourceType)
    : ('invalid' as InvoiceSourceType);
  const lines = Array.isArray(body.lines)
    ? (body.lines as Array<Record<string, unknown>>).map((l) => ({
        kind: str(l?.kind) as CreateInput['lines'][number]['kind'],
        description: str(l?.description),
        quantity: l?.quantity === undefined ? 1 : (l.quantity as number),
        unitAmountCents: l?.unitAmountCents as number,
        ...(l?.payeeRosterMemberId ? { payeeRosterMemberId: str(l.payeeRosterMemberId) } : {}),
      }))
    : undefined;
  return {
    source: sourceType === 'manual' ? { type: 'manual' } : { type: sourceType, id: str(body.sourceId) },
    billTo: { name: str(body.billToName), email: str(body.billToEmail) },
    dueDate: str(body.dueDate) || defaultDueDate(nowSeconds(deps)),
    lines: lines as CreateInput['lines'],
  };
}

/** POST /api/invoices */
export async function createInvoiceAction(
  request: Request,
  body: Record<string, unknown>,
  deps: ActionDeps,
): Promise<Response> {
  const json = wantsJson(request);
  try {
    if (Array.isArray(body.lines) || json) {
      const input = inputFromJson(body, deps);
      const invoice = await svc(deps).createDraft({ ...input, staffId: deps.staffId });
      return jsonOrSee(request, {
        data: invoiceDto(invoice),
        location: `/invoices/${invoice.id}`,
        notice: 'created',
      });
    }
    // Form post: the same fields as the page, prices in dollars.
    const parsed = parseInvoiceForm(body);
    if (parsed.values.sourceType === 'service_request' && !('line_count' in body)) {
      const invoice = await svc(deps).createDraft({
        source: { type: 'service_request', id: parsed.values.sourceId },
        billTo: { name: parsed.values.billToName, email: parsed.values.billToEmail },
        dueDate: parsed.values.dueDate || defaultDueDate(nowSeconds(deps)),
        staffId: deps.staffId,
      });
      return see(`/invoices/${invoice.id}`, 'created');
    }
    const built = buildCreateInput(parsed.values, { gamoAdminFeeApproved: approved(deps) });
    if (!built.ok) return see('/invoices/new', 'invalid');
    const invoice = await svc(deps).createDraft({ ...built.input, staffId: deps.staffId });
    return see(`/invoices/${invoice.id}`, 'created');
  } catch (err) {
    return failure(request, err, '/invoices/new');
  }
}

// ---- List ------------------------------------------------------------------------------------------

/** GET /api/invoices */
export async function listInvoicesAction(url: URL, deps: ActionDeps): Promise<Response> {
  try {
    const status = url.searchParams.get('status');
    if (status !== null && !(INVOICE_STATUSES as readonly string[]).includes(status)) {
      throw new InvoiceError('INVOICE_INVALID', 'Unknown status filter.');
    }
    const limitText = url.searchParams.get('limit');
    const limit = limitText === null ? undefined : Number(limitText);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      throw new InvoiceError('INVOICE_INVALID', 'limit must be a whole number from 1 to 100.');
    }
    const page = await svc(deps).list(
      { ...(status ? { status: status as InvoiceStatus } : {}), ...(limit ? { limit } : {}) },
      url.searchParams.get('cursor'),
    );
    return jsonResponse(page.items.map(invoiceDto), 200, { nextCursor: page.nextCursor });
  } catch (err) {
    return domainErrorResponse(err);
  }
}

// ---- Send / paid / void ----------------------------------------------------------------------------

/** POST /api/invoices/{id}/send */
export async function sendInvoiceAction(request: Request, id: string, deps: ActionDeps): Promise<Response> {
  const here = `/invoices/${encodeURIComponent(id)}`;
  try {
    const service = svc(deps);
    const before = await service.get(id);
    const result = await service.send(id, { siteOrigin: new URL(request.url).origin });
    return jsonOrSee(request, {
      data: {
        invoiceId: result.invoiceId,
        mode: result.mode,
        hostedUrl: result.hostedUrl,
        status: result.status,
      },
      location: here,
      notice:
        before.status === 'draft' ? (result.mode === 'stripe' ? 'sent-stripe' : 'sent-manual') : 'resent',
    });
  } catch (err) {
    return failure(request, err, here);
  }
}

/** POST /api/invoices/{id}/mark-paid */
export async function markPaidAction(
  request: Request,
  id: string,
  body: Record<string, unknown>,
  deps: ActionDeps,
): Promise<Response> {
  const here = `/invoices/${encodeURIComponent(id)}`;
  try {
    const reference = str(body.reference);
    const result = await svc(deps).markPaid(id, {
      method: str(body.method) as never,
      ...(reference ? { reference } : {}),
      staffId: deps.staffId,
    });
    return jsonOrSee(request, {
      data: invoiceDto(result.invoice),
      location: here,
      notice: result.applied ? 'paid' : 'already-paid',
    });
  } catch (err) {
    return failure(request, err, here);
  }
}

/** POST /api/invoices/{id}/void */
export async function voidInvoiceAction(request: Request, id: string, deps: ActionDeps): Promise<Response> {
  const here = `/invoices/${encodeURIComponent(id)}`;
  try {
    const service = svc(deps);
    const before = await service.get(id);
    const invoice = await service.void(id, deps.staffId);
    return jsonOrSee(request, {
      data: invoiceDto(invoice),
      location: here,
      notice: before.status === 'void' ? 'already-void' : 'voided',
    });
  } catch (err) {
    return failure(request, err, here);
  }
}

// ---- Payout ----------------------------------------------------------------------------------------

/** POST /api/invoice-lines/{id}/payout */
export async function recordPayoutAction(
  request: Request,
  lineId: string,
  body: Record<string, unknown>,
  deps: ActionDeps,
): Promise<Response> {
  let here = '/invoices';
  try {
    const rows = await allRows<{ invoice_id: string }>(sqlOf(deps.env), {
      sql: 'SELECT invoice_id FROM invoice_lines WHERE id = ?1',
      params: [lineId],
    });
    if (rows[0]) here = `/invoices/${encodeURIComponent(rows[0].invoice_id)}`;
    const reference = str(body.reference);
    const amount =
      typeof body.amountCents === 'string' && /^\d{1,12}$/.test(body.amountCents)
        ? Number(body.amountCents)
        : body.amountCents;
    const payout = await svc(deps).recordPayout(lineId, {
      method: str(body.method) as never,
      ...(reference ? { reference } : {}),
      ...(typeof amount === 'number' ? { amountCents: amount } : {}),
      staffId: deps.staffId,
    });
    return jsonOrSee(request, {
      data: {
        payoutId: payout.payoutId,
        invoiceLineId: payout.invoiceLineId,
        amountCents: payout.amountCents,
      },
      location: `${here}#payouts`,
      notice: 'payout-recorded',
    });
  } catch (err) {
    return failure(request, err, here === '/invoices' ? here : `${here}#payouts`);
  }
}
