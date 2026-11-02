import type { GamoEnv } from '@gamo/config/env';

/**
 * Safely resolves the Cloudflare Worker runtime environment (`env`) across:
 * 1. Node.js contract/security test harnesses that pass `{ locals: { runtime: { env } } }` as a plain data property.
 * 2. Astro v6 on Cloudflare Workers (`workerd`), where `Astro.locals.runtime` is a deprecated throwing getter and bindings live in `cloudflare:workers`.
 */
export async function getRuntimeEnv(context?: { locals?: unknown }): Promise<GamoEnv> {
  const locals = context?.locals as { runtime?: { env?: unknown } } | undefined;
  if (locals && typeof locals === 'object') {
    try {
      const env = locals.runtime?.env;
      if (env && typeof env === 'object') {
        return env as GamoEnv;
      }
    } catch {
      // Astro v6 Cloudflare adapter throws on locals.runtime.env; fall through to cloudflare:workers
    }
  }
  try {
    const modName = 'cloudflare:workers';
    const cf = await import(/* @vite-ignore */ modName);
    if (cf && typeof cf.env === 'object' && cf.env !== null) {
      return cf.env as GamoEnv;
    }
  } catch {
    // Not running inside workerd/Cloudflare runtime
  }
  return {};
}
