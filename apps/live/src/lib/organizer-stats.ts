/**
 * Where each number on the organizer overview leads. There is no organization-wide registrations page (people
 * register per date, and each event row on the list shows its own count), so "People registered" and "Upcoming
 * dates" open the full events list, which is where those numbers are broken down per event.
 */
import { WAITING_FILTER } from '@gamo/domain';

export type OrganizerStatKey = 'published' | 'waiting' | 'upcoming' | 'registered';

export interface OrganizerStatLink {
  href: string;
  /** What the link opens, in words, for the accessible name. */
  opens: string;
}

export const ORGANIZER_STAT_LINKS: Record<OrganizerStatKey, OrganizerStatLink> = {
  published: { href: '/organizer/events?status=published', opens: 'your published events' },
  waiting: {
    href: `/organizer/events?status=${WAITING_FILTER}`,
    opens: 'your events in review or needing changes',
  },
  upcoming: { href: '/organizer/events', opens: 'your events and their dates' },
  registered: { href: '/organizer/events', opens: 'your events and how many people registered for each' },
};
