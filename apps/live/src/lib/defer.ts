/**
 * Runs work after the response has been sent (Cloudflare `waitUntil`), so answers that must look identical
 * do not differ in timing. Swap for `deferWork` from `@gamo/domain` when it exists (Agent A): one line.
 */
type Locals = {
  cfContext?: { waitUntil?: (p: Promise<unknown>) => void };
  runtime?: { ctx?: { waitUntil?: (p: Promise<unknown>) => void } };
};

export async function deferWork(locals: unknown, work: Promise<unknown>): Promise<void> {
  const l = (locals ?? {}) as Locals;
  let wait: ((p: Promise<unknown>) => void) | undefined;
  let owner: object | undefined;
  try {
    if (l.cfContext?.waitUntil) {
      wait = l.cfContext.waitUntil;
      owner = l.cfContext;
    } else if (l.runtime?.ctx?.waitUntil) {
      wait = l.runtime.ctx.waitUntil;
      owner = l.runtime.ctx;
    }
  } catch {
    // Astro's deprecated runtime getter throws on Workers: fall through to awaiting.
  }
  if (wait && owner)
    wait.call(
      owner,
      work.catch(() => undefined),
    );
  else await work;
}
