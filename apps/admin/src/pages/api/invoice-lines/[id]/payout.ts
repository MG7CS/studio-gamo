import type { APIRoute } from 'astro';
import { recordPayoutAction } from '../../../../lib/invoices/actions';
import { withStaff } from '../../../../lib/invoices/route';

export const prerender = false;

/** POST /api/invoice-lines/{id}/payout (recordInvoiceLinePayout): one payout per musician pay line. */
export const POST: APIRoute = (context) =>
  withStaff(
    context,
    (deps, body) => recordPayoutAction(context.request, context.params.id ?? '', body, deps),
    {
      body: true,
    },
  );
