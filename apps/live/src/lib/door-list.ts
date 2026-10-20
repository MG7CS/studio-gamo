/**
 * The list behind a door-day number (organizers): one date's valid tickets filtered exactly as the number was counted
 * (`listDoorTickets` shares `doorTotals`' WHERE), so the count always equals this list's length.
 */
import {
  DOOR_TOTAL_FILTERS,
  listDoorTickets,
  parseDoorFilter,
  type DoorTicketFilter,
  type DoorTotalKey,
  type SqlDatabase,
} from '@gamo/domain';
import type { DoorAccess } from './door-access';
import { METHOD_LABEL } from './door-sell';
import { whenLabel } from './organizer-format';

export interface DoorListRow {
  reference: string;
  ticketType: string;
  holder: string | null;
  method: string;
  checkedIn: string | null;
  orderHref: string;
}

export interface DoorList {
  title: string;
  dateLabel: string;
  rows: DoorListRow[];
}

const TITLES: Record<DoorTotalKey, string> = {
  soldOnline: 'Sold online',
  doorCash: 'Sold at the door: cash',
  doorPhone: 'Sold at the door: buyer’s phone',
  doorReader: 'Sold at the door: card reader',
  doorComp: 'Comp at the door',
  checkedIn: 'Checked in',
  toArrive: 'Still to arrive',
};

const same = (a: DoorTicketFilter, b: DoorTicketFilter) =>
  a.channel === b.channel && a.method === b.method && a.arrival === b.arrival;

/** The title of a filter: the door-day number it belongs to, or a plain "Tickets". */
export function doorListTitle(filter: DoorTicketFilter): string {
  const key = (Object.keys(DOOR_TOTAL_FILTERS) as DoorTotalKey[]).find((k) =>
    same(DOOR_TOTAL_FILTERS[k] as DoorTicketFilter, filter),
  );
  return key ? TITLES[key] : 'Tickets';
}

export async function loadDoorList(
  db: SqlDatabase,
  access: DoorAccess,
  params: URLSearchParams,
): Promise<DoorList> {
  const filter = parseDoorFilter(params);
  const tz = access.occurrence.timezone;
  const rows = await listDoorTickets(db, {
    organizationId: access.actor.organizationId,
    occurrenceId: access.occurrence.occurrenceId,
    filter,
  });
  const eventHref = `/organizer/events/${encodeURIComponent(access.occurrence.eventId)}`;
  return {
    title: doorListTitle(filter),
    dateLabel: whenLabel(access.occurrence.startsAt, tz),
    rows: rows.map((r) => ({
      reference: r.reference,
      ticketType: r.ticketType,
      holder: r.holderName,
      method: r.channel === 'online' ? 'Online' : `Door · ${METHOD_LABEL[r.method]}`,
      checkedIn: r.checkedInAt ? whenLabel(r.checkedInAt, tz) : null,
      orderHref: `${eventHref}/orders/${encodeURIComponent(r.orderId)}`,
    })),
  };
}
