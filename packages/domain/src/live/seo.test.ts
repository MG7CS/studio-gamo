import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventJsonLd, isoWithOffset, serializeJsonLd, utcOffsetMinutes, type SeoEvent } from './seo.ts';

const ORIGIN = 'https://live.example.test';

function event(overrides: Partial<SeoEvent> = {}): SeoEvent {
  return {
    slug: 'sample-night',
    title: 'Sample Night',
    description: 'An evening of worship.',
    startsAt: new Date('2026-11-08T02:00:00Z'), // 19:00 on 7 Nov in Phoenix
    endsAt: new Date('2026-11-08T04:00:00Z'),
    timezone: 'America/Phoenix',
    status: 'approved',
    isPast: false,
    admission: 'free_open',
    externalUrl: null,
    venueName: 'Sample Hall',
    address: '1 Main St',
    city: 'Phoenix',
    state: 'AZ',
    organizerName: 'Sample Church',
    artworkUrl: null,
    artworkRightsVerified: false,
    performers: [],
    ...overrides,
  };
}

test('offsets follow the event time zone, including daylight changes', () => {
  assert.equal(utcOffsetMinutes(new Date('2026-07-01T12:00:00Z'), 'America/Phoenix'), -420);
  assert.equal(utcOffsetMinutes(new Date('2026-07-01T12:00:00Z'), 'America/New_York'), -240);
  assert.equal(utcOffsetMinutes(new Date('2026-12-01T12:00:00Z'), 'America/New_York'), -300);
  assert.equal(
    isoWithOffset(new Date('2026-11-08T02:00:00Z'), 'America/Phoenix'),
    '2026-11-07T19:00:00-07:00',
  );
  // New York changes from daylight to standard time on 1 Nov 2026 at 2:00.
  assert.equal(
    isoWithOffset(new Date('2026-10-31T23:00:00Z'), 'America/New_York'),
    '2026-10-31T19:00:00-04:00',
  );
  assert.equal(
    isoWithOffset(new Date('2026-11-02T00:00:00Z'), 'America/New_York'),
    '2026-11-01T19:00:00-05:00',
  );
  // ... and back on 8 Mar 2026.
  assert.equal(
    isoWithOffset(new Date('2026-03-08T06:30:00Z'), 'America/New_York'),
    '2026-03-08T01:30:00-05:00',
  );
  assert.equal(
    isoWithOffset(new Date('2026-03-08T07:30:00Z'), 'America/New_York'),
    '2026-03-08T03:30:00-04:00',
  );
});

test('start and end dates carry the offset of the event zone, not a bare local time', () => {
  const phoenix = eventJsonLd(event(), ORIGIN);
  assert.equal(phoenix.startDate, '2026-11-07T19:00:00-07:00');
  assert.equal(phoenix.endDate, '2026-11-07T21:00:00-07:00');
  const newYork = eventJsonLd(
    event({
      timezone: 'America/New_York',
      startsAt: new Date('2026-11-01T23:30:00Z'), // 18:30 EST, the day daylight time ended
      endsAt: new Date('2026-11-02T01:00:00Z'),
    }),
    ORIGIN,
  );
  assert.equal(newYork.startDate, '2026-11-01T18:30:00-05:00');
  assert.equal(newYork.endDate, '2026-11-01T20:00:00-05:00');
  const noEnd = eventJsonLd(event({ endsAt: null }), ORIGIN);
  assert.ok(!('endDate' in noEnd));
});

test('status, attendance mode, place and organizer', () => {
  const data = eventJsonLd(event(), ORIGIN);
  assert.equal(data['@type'], 'Event');
  assert.equal(data.url, `${ORIGIN}/events/sample-night`);
  assert.equal(data.eventStatus, 'https://schema.org/EventScheduled');
  assert.equal(data.eventAttendanceMode, 'https://schema.org/OfflineEventAttendanceMode');
  assert.deepEqual(data.location, {
    '@type': 'Place',
    name: 'Sample Hall',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '1 Main St',
      addressLocality: 'Phoenix',
      addressRegion: 'AZ',
      addressCountry: 'US',
    },
  });
  assert.deepEqual(data.organizer, { '@type': 'Organization', name: 'Sample Church' });
  assert.equal(
    eventJsonLd(event({ status: 'canceled' }), ORIGIN).eventStatus,
    'https://schema.org/EventCancelled',
  );
});

test('offers appear only for free registration or external tickets, with no invented price', () => {
  assert.ok(!('offers' in eventJsonLd(event({ admission: 'free_open' }), ORIGIN)));
  assert.deepEqual(eventJsonLd(event({ admission: 'free_registration' }), ORIGIN).offers, {
    '@type': 'Offer',
    url: `${ORIGIN}/events/sample-night/register`,
    price: '0',
    priceCurrency: 'USD',
  });
  const external = eventJsonLd(
    event({ admission: 'external_tickets', externalUrl: 'https://tickets.example.test/e/1' }),
    ORIGIN,
  ).offers as Record<string, unknown>;
  assert.deepEqual(external, { '@type': 'Offer', url: 'https://tickets.example.test/e/1' });
  assert.ok(!('price' in external));
  // No offers once the event is canceled or over.
  assert.ok(
    !('offers' in eventJsonLd(event({ admission: 'free_registration', status: 'canceled' }), ORIGIN)),
  );
  assert.ok(!('offers' in eventJsonLd(event({ admission: 'free_registration', isPast: true }), ORIGIN)));
});

test('an image is emitted only when a real, cleared image exists', () => {
  assert.ok(!('image' in eventJsonLd(event(), ORIGIN)));
  assert.ok(
    !('image' in eventJsonLd(event({ artworkUrl: '/x.webp', artworkRightsVerified: false }), ORIGIN)),
  );
  assert.ok(!('image' in eventJsonLd(event({ artworkUrl: null, artworkRightsVerified: true }), ORIGIN)));
  assert.deepEqual(eventJsonLd(event({ artworkUrl: '/x.webp', artworkRightsVerified: true }), ORIGIN).image, [
    `${ORIGIN}/x.webp`,
  ]);
});

test('the data never claims verification or uses charity wording, and the script text is safe to embed', () => {
  const text = JSON.stringify(
    eventJsonLd(
      event({
        admission: 'free_registration',
        performers: [{ id: 'e:0', displayName: 'Grace Choir', billingOrder: 0, roleLabel: 'Performer' }],
      }),
      ORIGIN,
    ),
  );
  assert.doesNotMatch(text, /verified|nonprofit|non-profit|charit|donat|tax/i);
  const embedded = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
  assert.ok(!embedded.includes('<'));
  assert.equal(JSON.parse(embedded).name, '</script><script>alert(1)</script>');
});
