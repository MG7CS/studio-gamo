import { readContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
export const prerender = false;
export const POST: APIRoute = async ({request}) => {
  try { await readContract(request, 'CheckoutInput'); }
  catch { return Response.json({error: 'Invalid checkout request.'}, {status: 400}); }
  return Response.json({error: 'Checkout is disabled pending inventory, authorization and fulfillment verification.'}, {status: 503});
};
