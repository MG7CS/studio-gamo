/**
 * Runs one read against the Gamo Live catalog for a public page. A missing binding or a failed query is reported as
 * `{ ok: false }` so the page can say the list is unavailable instead of pretending it is empty.
 */
import { LiveCatalog, asSqlDatabase, getRuntimeEnv } from '@gamo/domain';

export type CatalogRead<T> = { ok: true; data: T } | { ok: false };

export async function readCatalog<T>(
  astro: { locals?: unknown },
  read: (catalog: LiveCatalog) => Promise<T>,
): Promise<CatalogRead<T>> {
  try {
    const env = await getRuntimeEnv(astro);
    return { ok: true, data: await read(new LiveCatalog(asSqlDatabase(env.LIVE_DB))) };
  } catch {
    return { ok: false };
  }
}
