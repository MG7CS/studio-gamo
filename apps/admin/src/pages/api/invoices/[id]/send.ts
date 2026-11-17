import type { APIRoute } from 'astro';
import { sendInvoiceAction } from '../../../../lib/invoices/actions';
import { withStaff } from '../../../../lib/invoices/route';

export const prerender = false;

/** POST /api/invoices/{id}/send (sendInvoice): draft to open; Stripe test mode or manual instructions. */
export const POST: APIRoute = (context) =>
  withStaff(context, (deps) => sendInvoiceAction(context.request, context.params.id ?? '', deps));
