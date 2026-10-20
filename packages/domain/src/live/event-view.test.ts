import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LiveEventDetail, LiveEventWithDetails } from './catalog.ts';
import {
  descriptionParagraphs,
  eventDateRows,
  eventMetaDescription,
  eventPanel,
  mapsUrl,
  organizerLine,
  pickRelatedEvents,
  placeLine,
  registerHref,
  splitDates,
} from './event-view.ts';

const at = (iso: string) => new Date(iso);
const occ = (id: string, iso: string, extra: Partial<LiveEventDetail['occurrences'][number]> = {}) => ({
  id,
  startsAt: at(iso),
  endsAt: null,
  canceled: false,
  isPast: false,
  seatsTaken: 0,
  ...extra,
});

function event(extra: Partial<LiveEventDetail> = {}): LiveEventDetail {
  return {
    id: 'evt_1',
    slug: 'night-of-worship',
    title: 'Night of Worship',
    category: 'worship',
    venueName: 'Grace Hall',
    address: '12 Main St',
    city: 'Phoenix',
    state: 'AZ',
    metroSlug: 'phoenix-az',
    timezone: 'America/Phoenix',
    startsAt: at('2026-11-07T02:00:00Z'),
    admission: 'free_open',
    capacity: null,
    seatsTaken: 0,
    status: 'approved',
    isPast: false,
    externalUrl: null,
    externalTicketProvider: null,
    organizerName: 'Grace Church',
    organizerVerified: false,
    originalOrganizerName: null,
    listingType: 'organizer_submitted',
    occurrences: [occ('occ_1', '2026-11-07T02:00:00Z')],
    ...extra,
  } as unknown as LiveEventDetail;
}

test('panel: canceled and past events offer no action', () => {
  assert.deepEqual(eventPanel(event({ status: 'canceled' })), { kind: 'canceled' });
  assert.deepEqual(eventPanel(event({ isPast: true })), { kind: 'past' });
});

test('panel: when every remaining date is canceled, the event reads as canceled', () => {
  const e = event({ occurrences: [occ('a', '2026-11-07T02:00:00Z', { canceled: true })] });
  assert.deepEqual(eventPanel(e), { kind: 'canceled' });
});

test('panel: free open and external tickets', () => {
  assert.deepEqual(eventPanel(event()), { kind: 'free_open' });
  assert.deepEqual(
    eventPanel(
      event({
        admission: 'external_tickets',
        externalUrl: 'https://x.test/t',
        externalTicketProvider: 'Eventbrite',
      }),
    ),
    { kind: 'external', provider: 'Eventbrite', url: 'https://x.test/t' },
  );
});

test('panel: registration shows seats left, then Full', () => {
  const open = event({
    admission: 'free_registration',
    capacity: 10,
    occurrences: [occ('a', '2026-11-07T02:00:00Z', { seatsTaken: 7 })],
  });
  assert.deepEqual(eventPanel(open), {
    kind: 'register',
    full: false,
    seats: '3 seats left',
    href: '/events/night-of-worship/register',
  });
  const full = event({
    admission: 'free_registration',
    capacity: 10,
    occurrences: [occ('a', '2026-11-07T02:00:00Z', { seatsTaken: 10 })],
  });
  const panel = eventPanel(full);
  assert.equal(panel.kind === 'register' && panel.full, true);
});

test('panel: several dates are full only when every date is full; seats move to the rows', () => {
  const base = {
    admission: 'free_registration' as const,
    capacity: 5,
  };
  const oneOpen = event({
    ...base,
    occurrences: [
      occ('a', '2026-11-07T02:00:00Z', { seatsTaken: 5 }),
      occ('b', '2026-11-14T02:00:00Z', { seatsTaken: 1 }),
    ],
  });
  const p1 = eventPanel(oneOpen);
  assert.equal(p1.kind === 'register' && p1.full, false);
  assert.equal(p1.kind === 'register' && p1.seats, null);
  const allFull = event({
    ...base,
    occurrences: [
      occ('a', '2026-11-07T02:00:00Z', { seatsTaken: 5 }),
      occ('b', '2026-11-14T02:00:00Z', { seatsTaken: 5 }),
    ],
  });
  const p2 = eventPanel(allFull);
  assert.equal(p2.kind === 'register' && p2.full, true);
});

test('date rows: state per date and a register link only where it works', () => {
  const e = event({
    admission: 'free_registration',
    capacity: 5,
    occurrences: [
      occ('past', '2026-01-01T02:00:00Z', { isPast: true }),
      occ('full', '2026-11-07T02:00:00Z', { seatsTaken: 5 }),
      occ('off', '2026-11-14T02:00:00Z', { canceled: true }),
      occ('ok', '2026-11-21T02:00:00Z', { seatsTaken: 4 }),
    ],
  });
  const rows = eventDateRows(e);
  assert.deepEqual(
    rows.map((r) => [r.id, r.state, r.note, r.registerHref]),
    [
      ['past', 'past', null, null],
      ['full', 'full', 'Full', null],
      ['off', 'canceled', 'Canceled', null],
      ['ok', 'open', '1 seat left', '/events/night-of-worship/register?date=ok'],
    ],
  );
  const { upcoming, past } = splitDates(rows);
  assert.deepEqual(
    upcoming.map((r) => r.id),
    ['full', 'off', 'ok'],
  );
  assert.deepEqual(
    past.map((r) => r.id),
    ['past'],
  );
  assert.match(rows[1].label, /Nov 6, 2026|Nov 7, 2026/);
});

test('date rows: free open dates have no register links or seats', () => {
  const rows = eventDateRows(event({ occurrences: [occ('a', '2026-11-07T02:00:00Z')] }));
  assert.equal(rows[0].registerHref, null);
  assert.equal(rows[0].note, null);
});

test('register href encodes the occurrence id', () => {
  assert.equal(registerHref('a-b'), '/events/a-b/register');
  assert.equal(registerHref('a-b', 'occ 1'), '/events/a-b/register?date=occ%201');
});

test('description splits on blank lines and keeps text as plain strings', () => {
  assert.deepEqual(descriptionParagraphs('One\nstill one\n\n\nTwo <b>x</b>\r\n\r\n  '), [
    'One still one',
    'Two <b>x</b>',
  ]);
  assert.deepEqual(descriptionParagraphs(null), []);
});

test('maps url encodes the place', () => {
  const url = mapsUrl(event());
  assert.ok(url.startsWith('https://www.google.com/maps/search/?api=1&query='));
  assert.ok(url.includes('Grace%20Hall%2C%2012%20Main%20St%2C%20Phoenix%2C%20AZ'));
});

test('organizer is verified only when an admin verified an organizer-submitted event', () => {
  assert.deepEqual(organizerLine(event()), { name: 'Grace Church', verified: false });
  assert.equal(organizerLine(event({ organizerVerified: true })).verified, true);
  assert.deepEqual(
    organizerLine(
      event({
        listingType: 'external_discovery',
        organizerName: 'Gamo Live Listings',
        originalOrganizerName: 'CAIN',
        organizerVerified: true,
      }),
    ),
    { name: 'CAIN', verified: false },
  );
});

test('meta description is plain', () => {
  assert.equal(
    eventMetaDescription(event()),
    'Night of Worship at Grace Hall in Phoenix, AZ on Friday, November 6, 2026.',
  );
});

test('related events: same city or category only, upcoming only, best first, capped at 3', () => {
  const mk = (id: string, extra: Partial<LiveEventWithDetails> = {}) =>
    ({ ...event(), id, slug: id, ...extra }) as unknown as LiveEventWithDetails;
  const current = event();
  const list = [
    mk('self', { id: 'evt_1' }),
    mk('far-other', { city: 'Boise', state: 'ID', metroSlug: null, category: 'youth' }),
    mk('far-same-cat', { city: 'Boise', state: 'ID', metroSlug: null }),
    mk('city-other-cat', { category: 'youth' }),
    mk('city-same-cat'),
    mk('past', { isPast: true }),
    mk('canceled', { status: 'canceled' }),
    mk('extra', { category: 'youth' }),
  ];
  assert.deepEqual(
    pickRelatedEvents(current, list).map((x) => x.id),
    ['city-same-cat', 'city-other-cat', 'extra'],
  );
  assert.deepEqual(
    pickRelatedEvents(current, [
      mk('far-other', { city: 'Boise', state: 'ID', metroSlug: null, category: 'youth' }),
    ]),
    [],
  );
});

test('the place line does not repeat the city when the address already has it', () => {
  assert.equal(
    placeLine({ address: '620 Atlantic Ave, Brooklyn, NY 11217', city: 'Brooklyn', state: 'NY' }),
    '620 Atlantic Ave, Brooklyn, NY 11217',
  );
  assert.equal(
    placeLine({ address: '100 Main St', city: 'Phoenix', state: 'AZ' }),
    '100 Main St, Phoenix, AZ',
  );
  assert.equal(placeLine({ address: null, city: 'Phoenix', state: 'AZ' }), 'Phoenix, AZ');
});
