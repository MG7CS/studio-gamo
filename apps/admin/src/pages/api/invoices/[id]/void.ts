import type { APIRoute } from 'astro';
import { voidInvoiceAction } from '../../../../lib/invoices/actions';
import { withStaff } from '../../../../lib/invoices/route';

export const prerender = false;

/** POST /api/invoices/{id}/void (voidInvoice): draft or open to void. */
export const POST: APIRoute = (context) =>
  withStaff(context, (deps) => voidInvoiceAction(context.request, context.params.id ?? '', deps));
