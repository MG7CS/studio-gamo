/**
 * The admin's calendar data: every date of the organizer events and catalog listings, read from Gamo Live's database.
 * When it cannot be read the result is null and the page says so instead of drawing an empty calendar.
 */
import {
  adminScheduleView,
  listAdminSchedule,
  type AdminScheduleScope,
  type AdminScheduleView,
} from '@gamo/domain';
import { asSqlDatabase } from '@gamo/domain/security';
import type { AdminBindings } from './inbox';

export async function loadAdminSchedule(
  bindings: AdminBindings,
  scope: AdminScheduleScope,
  url: URL,
  now = Math.floor(Date.now() / 1000),
): Promise<AdminScheduleView | null> {
  try {
    const dates = await listAdminSchedule(asSqlDatabase(bindings.LIVE_DB), { scope, now });
    return adminScheduleView({ dates, now, params: url.searchParams, anchor: '#schedule' });
  } catch (error) {
    console.error(`[admin] schedule unavailable: ${error instanceof Error ? error.name : 'unknown'}`);
    return null;
  }
}
