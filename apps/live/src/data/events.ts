/**
 * Gamo Live sample data (design-first phase).
 * Every record is fictional and flagged `sample: true`; UI must render a visible "Sample" label.
 * No event listed here is on sale, and no organizer here is verified.
 */
import type { PhotoKey } from '@studio-gamo/ui/lib/images';

export type EventCategory = 'concert' | 'worship' | 'bible' | 'conference' | 'youth';
export type Ticketing = 'free' | 'preview' | 'external';
export type EventStatus = 'scheduled' | 'rescheduled' | 'canceled';

export interface TicketTier { name: string; priceCents: number; note: string }

export interface LiveEvent {
  id: string;
  sample: true;
  title: string;
  tagline: string;
  category: EventCategory;
  date: string; // ISO date (local event date)
  time: string;
  city: string;
  state: string;
  venue: string;
  organizer: string; // organizer slug
  photo: PhotoKey;
  photoPosition?: string;
  ticketing: Ticketing;
  status: EventStatus;
  recurring?: string;
  featured?: boolean;
  tiers: TicketTier[];
  externalSource?: string;
  description: string;
}

export interface Organizer {
  slug: string;
  sample: true;
  name: string;
  kind: string;
  city: string;
  photo: PhotoKey;
  bio: string;
}

export const categoryLabels: Record<EventCategory, string> = {
  concert: 'Gospel concert',
  worship: 'Worship gathering',
  bible: 'Bible study',
  conference: 'Christian conference',
  youth: 'Youth & family',
};

export const organizers: Organizer[] = [
  { slug: 'riverside-fellowship', sample: true, name: 'Riverside Fellowship Choir', kind: 'Church choir', city: 'Atlanta, GA', photo: 'gospelVocalists', bio: 'A fictional church choir used to preview how organizer profiles present gospel concerts, rehearsals and seasonal services.' },
  { slug: 'cornerstone-youth', sample: true, name: 'Cornerstone Youth Ministry', kind: 'Youth ministry', city: 'Phoenix, AZ', photo: 'worshipBand', bio: 'A fictional youth ministry showing how family-friendly and youth events could appear on Gamo Live.' },
  { slug: 'new-hope-gatherings', sample: true, name: 'New Hope Gatherings', kind: 'Conference organizer', city: 'Denver, CO', photo: 'concertCrowdWide', bio: 'A fictional ministry network illustrating conferences, retreats and multi-day Christian gatherings.' },
  { slug: 'grace-chapel', sample: true, name: 'Grace Chapel Community', kind: 'Local church', city: 'Columbus, OH', photo: 'sanctuaryCongregation', bio: 'A fictional neighborhood church previewing recurring Bible studies and weekly worship listings.' },
];

const t = (name: string, priceCents: number, note: string): TicketTier => ({ name, priceCents, note });

export const events: LiveEvent[] = [
  { id: 'harvest-night-of-gospel', sample: true, featured: true, title: 'Harvest Night of Gospel', tagline: 'Choirs, testimony and a full band under one roof.', category: 'concert', date: '2026-11-14', time: '7:00 PM', city: 'Atlanta', state: 'GA', venue: 'Sample Fellowship Hall', organizer: 'riverside-fellowship', photo: 'gospelVocalists', ticketing: 'preview', status: 'scheduled', tiers: [t('General admission', 2500, 'Open seating'), t('Family pass', 6000, 'Up to 4 guests'), t('Student', 1000, 'Valid student ID')], description: 'An evening of choral gospel, congregational worship and testimony. This listing is a design sample showing how a ticketed concert would appear.' },
  { id: 'rise-leadership-conference', sample: true, featured: true, title: 'Rise Christian Leadership Conference', tagline: 'Two days of teaching, worship and ministry workshops.', category: 'conference', date: '2026-11-20', time: '9:00 AM', city: 'Denver', state: 'CO', venue: 'Sample Convention Center', organizer: 'new-hope-gatherings', photo: 'concertCrowdWide', ticketing: 'external', externalSource: 'Organizer website', status: 'scheduled', tiers: [t('Conference pass', 14900, 'Sold by the organizer')], description: 'A sample multi-day conference demonstrating how events ticketed through an organizer’s own site are clearly marked as external.' },
  { id: 'saturday-worship-gathering', sample: true, featured: true, title: 'Saturday Night Worship', tagline: 'An open, unhurried night of praise and prayer.', category: 'worship', date: '2026-11-07', time: '6:30 PM', city: 'Dallas', state: 'TX', venue: 'Sample Community Church', organizer: 'riverside-fellowship', photo: 'worshipNight', ticketing: 'free', status: 'scheduled', recurring: 'First Saturday monthly', tiers: [t('Free registration', 0, 'Helps hosts plan seating')], description: 'A recurring sample worship night. Free events can still collect optional registration so hosts can plan.' },
  { id: 'acoustic-praise-evening', sample: true, featured: true, title: 'Acoustic Praise Evening', tagline: 'Stripped-back hymns and new songs of worship.', category: 'concert', date: '2026-12-05', time: '7:30 PM', city: 'Seattle', state: 'WA', venue: 'Sample Chapel Stage', organizer: 'grace-chapel', photo: 'acousticLeader', ticketing: 'preview', status: 'rescheduled', tiers: [t('General admission', 1800, 'Open seating')], description: 'Sample of a rescheduled event: the new date is shown prominently and existing registrations would carry over.' },
  { id: 'psalms-bible-study', sample: true, title: 'Wednesday Bible Study: Psalms', tagline: 'Reading the Psalms together, week by week.', category: 'bible', date: '2026-11-11', time: '7:00 PM', city: 'Columbus', state: 'OH', venue: 'Sample Grace Chapel', organizer: 'grace-chapel', photo: 'sanctuaryCongregation', ticketing: 'free', status: 'scheduled', recurring: 'Every Wednesday', tiers: [t('Free — drop in', 0, 'No registration needed')], description: 'A sample recurring Bible study listing with a weekly schedule.' },
  { id: 'family-fall-festival', sample: true, title: 'Family Fall Festival & Praise', tagline: 'Games, food and a children’s worship set.', category: 'youth', date: '2026-10-31', time: '2:00 PM', city: 'Nashville', state: 'TN', venue: 'Sample Church Grounds', organizer: 'cornerstone-youth', photo: 'chapelSpring', ticketing: 'free', status: 'scheduled', tiers: [t('Free registration', 0, 'Family headcount')], description: 'A sample outdoor family event.' },
  { id: 'youth-worship-night', sample: true, title: 'Youth Worship Night', tagline: 'Student-led worship and a short message.', category: 'youth', date: '2026-11-21', time: '7:00 PM', city: 'Phoenix', state: 'AZ', venue: 'Sample Youth Center', organizer: 'cornerstone-youth', photo: 'worshipBand', ticketing: 'free', status: 'scheduled', recurring: 'Third Saturday monthly', tiers: [t('Free registration', 0, 'Parents may register students')], description: 'A sample youth gathering.' },
  { id: 'advent-choral-service', sample: true, title: 'Advent Choral Service', tagline: 'Lessons and carols for the season.', category: 'worship', date: '2026-12-13', time: '5:00 PM', city: 'Chicago', state: 'IL', venue: 'Sample Cathedral', organizer: 'riverside-fellowship', photo: 'churchGoldenHour', ticketing: 'free', status: 'scheduled', tiers: [t('Free — open to all', 0, 'Arrive early for seating')], description: 'A sample seasonal service.' },
  { id: 'gospel-brunch-testimony', sample: true, title: 'Gospel Brunch & Testimony', tagline: 'Live gospel set with shared stories.', category: 'concert', date: '2026-11-15', time: '11:00 AM', city: 'Charlotte', state: 'NC', venue: 'Sample Fellowship Hall', organizer: 'riverside-fellowship', photo: 'worshipLeaderGolden', ticketing: 'preview', status: 'canceled', tiers: [t('Brunch seat', 3000, 'Includes meal')], description: 'Sample of a canceled event: actions are disabled and the cancellation is stated plainly.' },
  { id: 'womens-bible-retreat', sample: true, title: 'Women’s Bible Retreat', tagline: 'A weekend of study, rest and fellowship.', category: 'conference', date: '2027-01-16', time: '10:00 AM', city: 'Minneapolis', state: 'MN', venue: 'Sample Retreat Center', organizer: 'new-hope-gatherings', photo: 'churchModernDay', ticketing: 'preview', status: 'scheduled', tiers: [t('Weekend pass', 8500, 'Meals included'), t('Day pass', 3500, 'Saturday only')], description: 'A sample retreat listing.' },
  { id: 'kids-music-showcase', sample: true, title: 'Kids Music Camp Showcase', tagline: 'Young musicians share what they learned.', category: 'youth', date: '2026-12-12', time: '3:00 PM', city: 'Los Angeles', state: 'CA', venue: 'Sample Community Church', organizer: 'cornerstone-youth', photo: 'youngPianist', ticketing: 'free', status: 'scheduled', tiers: [t('Free — open to families', 0, '')], description: 'A sample family showcase.' },
  { id: 'night-of-hymns', sample: true, title: 'A Night of Hymns', tagline: 'Timeless hymns with strings and choir.', category: 'worship', date: '2026-12-19', time: '7:00 PM', city: 'Philadelphia', state: 'PA', venue: 'Sample Historic Church', organizer: 'grace-chapel', photo: 'acousticLeaderAlt', ticketing: 'external', externalSource: 'Venue box office', status: 'scheduled', tiers: [t('Reserved seat', 2000, 'Sold by the venue')], description: 'A sample event ticketed by an external venue.' },
];

export const getEvent = (id: string) => events.find((e) => e.id === id);
export const getOrganizer = (slug: string) => organizers.find((o) => o.slug === slug)!;
export const eventsBy = (pred: (e: LiveEvent) => boolean) => events.filter(pred);
export const cities = [...new Set(events.map((e) => `${e.city}, ${e.state}`))];

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...o });
export const dateParts = (iso: string) => ({
  day: fmt(iso, { day: 'numeric' }),
  month: fmt(iso, { month: 'short' }),
  weekday: fmt(iso, { weekday: 'short' }),
  long: fmt(iso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
});
export const price = (cents: number) => (cents === 0 ? 'Free' : `$${(cents / 100).toFixed(2)}`);
export const fromPrice = (e: LiveEvent) => {
  const min = Math.min(...e.tiers.map((x) => x.priceCents));
  return e.ticketing === 'free' ? 'Free' : `From ${price(min)}`;
};
