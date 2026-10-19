/**
 * Run work after the response is sent, so the response time does not depend on whether an account or
 * ticket exists (timing oracle, D-119). On Cloudflare the execution context (`locals.runtime.ctx`) keeps the
 * Worker alive for the promise (`ctx.waitUntil`). Without a context (unit tests, plain Node) the work is
 * awaited instead, so tests can observe it. Errors never reach the caller: they are logged by name only and
 * the response is the same as for success.
 *
 *   await deferWork(context.locals, async () => { ... lookup, insert, send ... });
 *   return sameFixedResponse();
 */
type Ctx = { waitUntil?: (promise: Promise<unknown>) => void };

export function executionContext(locals: unknown): Ctx | null {
  const ctx = (locals as { runtime?: { ctx?: Ctx } } | null | undefined)?.runtime?.ctx;
  return ctx && typeof ctx.waitUntil === 'function' ? ctx : null;
}

export async function deferWork(
  locals: unknown,
  work: () => Promise<unknown>,
  options: { label?: string; forceAwait?: boolean } = {},
): Promise<void> {
  const label = options.label ?? 'deferred';
  const run = async () => {
    try {
      await work();
    } catch (err) {
      console.error(`[defer] ${label} failed: ${err instanceof Error ? err.name : 'unknown'}`);
    }
  };
  const ctx = options.forceAwait ? null : executionContext(locals);
  if (ctx) ctx.waitUntil!(run());
  else await run();
}
