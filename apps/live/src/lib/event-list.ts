import { type LiveEventFilters, type LiveEventWithDetails } from '@gamo/domain';
import { openLive } from './registration.ts';

/**
 * The events a public list page shows. A missing or failing database is reported as `unavailable` (the page says
 * so and answers 503), never as an empty list.
 */
export async function listEvents(
  astro: { locals: unknown },
  filters: LiveEventFilters,
): Promise<{ events: LiveEventWithDetails[]; unavailable: boolean }> {
  try {
    const { catalog } = await openLive(astro);
    return { events: await catalog.listDiscoverableEvents(filters), unavailable: false };
  } catch {
    return { events: [], unavailable: true };
  }
}
