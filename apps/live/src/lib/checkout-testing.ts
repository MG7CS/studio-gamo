/** Test fixtures for the checkout libraries (used by `checkout*.test.ts` only, never by pages). */
import { LiveCatalog } from '@gamo/domain';
import {
  PAID_ENV,
  PAID_NOW,
  paidTestDatabase,
  seedPaidEvent,
  type SeedPaidEventOptions,
} from '../../../../packages/domain/src/live/paid-testing.ts';
import type { CookieJar } from './checkout.ts';
import type { LiveContext } from './registration.ts';

/** An in-memory cookie jar that remembers the options of each cookie set. */
export function fakeCookies(): CookieJar & { store: Map<string, string>; options: Map<string, unknown> } {
  const store = new Map<string, string>();
  const options = new Map<string, unknown>();
  return {
    store,
    options,
    get: (name) => (store.has(name) ? { value: store.get(name)! } : undefined),
    set: (name, value, opts) => {
      store.set(name, value);
      options.set(name, opts);
    },
    delete: (name) => {
      store.delete(name);
    },
  };
}

/** A Live context on a fresh database with one seeded paid event (local environment, Stripe stand-in allowed). */
export async function liveFixture(
  options: SeedPaidEventOptions = { flow: 'organizer_account' },
  env: Record<string, unknown> = {},
  /** The catalog's clock (the stand-in reads the real clock, so end-to-end tests pass the real time). */
  now: number = PAID_NOW,
) {
  const { d1, db } = await paidTestDatabase();
  const seed = seedPaidEvent(d1, options);
  const live = {
    env: { ...PAID_ENV, ...env },
    db,
    catalog: new LiveCatalog(db, () => now),
  } as unknown as LiveContext;
  return { d1, db, seed, live, exec: (sql: string) => d1.sqlite.exec(sql) };
}

/** A form with the given fields (arrays become repeated fields). */
export function formOf(fields: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const one of [v].flat()) f.append(k, one);
  return f;
}
