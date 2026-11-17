import type { APIRoute } from 'astro';
import { createInvoiceAction, listInvoicesAction } from '../../../lib/invoices/actions';
import { withStaff } from '../../../lib/invoices/route';

export const prerender = false;

/** GET /api/invoices (listInvoices): newest first, filter by status, keyset paging. */
export const GET: APIRoute = (context) =>
  withStaff(context, (deps) => listInvoicesAction(new URL(context.request.url), deps));

/** POST /api/invoices (createInvoice): a draft with the next GS-YYYY-NNNN number. */
export const POST: APIRoute = (context) =>
  withStaff(context, (deps, body) => createInvoiceAction(context.request, body, deps), { body: true });
