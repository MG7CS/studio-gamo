import type { APIRoute } from 'astro';
import { markPaidAction } from '../../../../lib/invoices/actions';
import { withStaff } from '../../../../lib/invoices/route';

export const prerender = false;

/** POST /api/invoices/{id}/mark-paid (markInvoicePaid): open to paid with a method and reference. */
export const POST: APIRoute = (context) =>
  withStaff(context, (deps, body) => markPaidAction(context.request, context.params.id ?? '', body, deps), {
    body: true,
  });
