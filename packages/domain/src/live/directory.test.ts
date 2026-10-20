import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterVenuesByRegion, pickHomeEvents, venueEventPreview, venueRegionOptions } from './directory.ts';

const venue = (name: string, regionLabel: string) => ({ name, regionLabel });

test('region options are unique and alphabetical', () => {
  const venues = [venue('a', 'Phoenix, AZ'), venue('b', 'Dallas, TX'), venue('c', 'Phoenix, AZ')];
  assert.deepEqual(venueRegionOptions(venues), ['Dallas, TX', 'Phoenix, AZ']);
  assert.deepEqual(venueRegionOptions([]), []);
});

test('filtering by a region keeps only its venues; an unknown region means all', () => {
  const venues = [venue('a', 'Phoenix, AZ'), venue('b', 'Dallas, TX')];
  assert.deepEqual(filterVenuesByRegion(venues, 'Dallas, TX'), { venues: [venues[1]], region: 'Dallas, TX' });
  assert.deepEqual(filterVenuesByRegion(venues, 'Nowhere'), { venues, region: null });
  assert.deepEqual(filterVenuesByRegion(venues, ''), { venues, region: null });
  assert.deepEqual(filterVenuesByRegion(venues, null), { venues, region: null });
});

test('a venue card shows two events and counts the rest', () => {
  const ev = (n: number) => ({ slug: `e${n}`, title: `Event ${n}` }) as never;
  const many = { upcomingEvents: [ev(1), ev(2), ev(3), ev(4)], upcomingEventCount: 4 };
  const preview = venueEventPreview(many);
  assert.deepEqual(
    preview.events.map((e) => e.slug),
    ['e1', 'e2'],
  );
  assert.equal(preview.moreCount, 2);
  const one = venueEventPreview({ upcomingEvents: [ev(1)], upcomingEventCount: 1 });
  assert.equal(one.events.length, 1);
  assert.equal(one.moreCount, 0);
});

test('only an admin-featured upcoming event is featured, and it is not repeated in the list', () => {
  const e = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    isFeatured: false,
    isPast: false,
    status: 'approved' as const,
    ...extra,
  });
  const none = pickHomeEvents([e('a'), e('b')]);
  assert.equal(none.featured, null);
  assert.deepEqual(
    none.upcoming.map((x) => x.id),
    ['a', 'b'],
  );

  const featured = pickHomeEvents([e('a'), e('b', { isFeatured: true }), e('c')]);
  assert.equal(featured.featured?.id, 'b');
  assert.deepEqual(
    featured.upcoming.map((x) => x.id),
    ['a', 'c'],
  );

  const hidden = pickHomeEvents([e('a', { isFeatured: true, isPast: true }), e('b', { status: 'canceled' })]);
  assert.equal(hidden.featured, null);
  assert.deepEqual(hidden.upcoming, []);

  const capped = pickHomeEvents(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => e(id)));
  assert.equal(capped.upcoming.length, 4);
});
