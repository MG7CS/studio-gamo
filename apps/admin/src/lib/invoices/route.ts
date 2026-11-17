/**
 * Shared prologue of the invoice API routes: authenticate the staff user (`adminApi` also enforces the
 * same-origin rule on state-changing requests) and hand the action its dependencies. Auth is always the
 * first thing that happens; a failure becomes the response without running the action.
 */
import type { APIContext } from 'astro';
import { domainErrorResponse } from '../domain-errors';
import { adminApi, readBody } from '../admin-page';
import type { ActionDeps } from './actions';

const MAX_JSON_BYTES = 256 * 1024;

/**
 * The request body for the create endpoint. JSON is parsed here (not by `readBody`, which flattens nested
 * values) so the `lines` array of objects survives; anything else goes through `readBody`.
 */
export async function readInvoiceBody(request: Request): Promise<Record<string, unknown>> {
  const type = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('application/json')) return readBody(request);
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) {
    throw Response.json(
      { success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' } },
      { status: 413 },
    );
  }
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) {
    throw Response.json(
      { success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' } },
      { status: 413 },
    );
  }
  try {
    const parsed: unknown = text.trim() === '' ? {} : JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') out[k] = v;
    }
    return out;
  } catch {
    throw Response.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'The request body could not be read.' } },
      { status: 400 },
    );
  }
}

export async function withStaff(
  context: Pick<APIContext, 'request' | 'locals' | 'params'>,
  run: (deps: ActionDeps, body: Record<string, unknown>) => Promise<Response>,
  options: { body?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<Response> {
  let deps: ActionDeps;
  try {
    const session = await adminApi(context);
    deps = {
      env: session.env,
      staffId: session.staff.userId,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    };
  } catch (err) {
    return domainErrorResponse(err);
  }
  try {
    const body = options.body ? await readInvoiceBody(context.request) : {};
    return await run(deps, body);
  } catch (err) {
    return domainErrorResponse(err);
  }
}
