/**
 * Gamo Live brand configuration for UI components. The configuration itself lives in
 * `@gamo/config/brand`; this module adds the request-time resolver used by layouts.
 */
import { getPlatformBrandConfig, type PlatformBrandConfig, type PlatformBrandEnv } from '@gamo/config/brand';

export * from '@gamo/config/brand';

export async function resolvePlatformBrandConfig(locals?: unknown): Promise<PlatformBrandConfig> {
  let runtimeEnv: PlatformBrandEnv = {};
  try {
    const cf = await import(/* @vite-ignore */ 'cloudflare:workers');
    if (cf && typeof cf.env === 'object' && cf.env !== null) {
      runtimeEnv = cf.env as PlatformBrandEnv;
    }
  } catch {
    try {
      const legacy = (locals as { runtime?: { env?: PlatformBrandEnv } } | undefined)?.runtime?.env;
      if (legacy && typeof legacy === 'object') {
        runtimeEnv = legacy;
      }
    } catch {
      // No legacy runtime env either; fall back to defaults below.
    }
  }
  return getPlatformBrandConfig(runtimeEnv);
}
