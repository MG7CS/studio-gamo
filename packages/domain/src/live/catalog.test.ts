import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createSqliteD1 } from '@gamo/db/testing';
import {
  LiveCatalog,
  artistKey,
  categoryBadge,
  categoryLabel,
  localParts,
  normalizeCategory,
  regionForPlace,
  toArtistSlug,
} from './catalog.ts';
import { EVENT_CATEGORIES } from './events.ts';
import { importCatalog, setCatalogStatus } from './catalog-import.ts';
import type { SeedCatalogDocument } from '../services/live-external-discovery.ts';

const MIGRATIONS = new URL('../../../db/live/migrations/', import.meta.url);
const CATALOG = new URL('../../../../data/gamo_live_verified_events_2026-10-15.json', import.meta.url);
const NOW = Date.UTC(2026, 9, 16) / 1000;

async function database() {
  const d1 = createSqliteD1();
  for (const name of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await d1.exec(readFileSync(new URL(name, MIGRATIONS), 'utf8'));
  d1.sqlite.exec(`
    INSERT INTO organizations (id, name, slug, kind) VALUES ('org_1', 'Sample Church', 'sample-church', 'church');
    INSERT INTO venues (id, name, city, state, metro_slug, timezone) VALUES ('ven_1', 'Sample Hall', 'Phoenix', 'AZ', 'phoenix-az', 'America/Phoenix');`);
  const addEvent = (id: string, status: string, startsAt: number, extra = '') =>
    d1.sqlite.exec(`
      INSERT INTO events (id, organization_id, origin, slug, title, category, venue_id, timezone, admission, status ${extra ? ', ' + extra.split('=')[0] : ''})
      VALUES ('${id}', 'org_1', 'organizer', '${id}', 'Event ${id}', 'worship', 'ven_1', 'America/Phoenix', 'free_open', '${status}' ${extra ? ', ' + extra.split('=')[1] : ''});
      INSERT INTO event_occurrences (id, event_id, starts_at) VALUES ('occ_${id}', '${id}', ${startsAt});`);
  return { d1, db: d1 as never, addEvent };
}

test('only published and canceled events are public; drafts and suspended organizations are not', async () => {
  const { d1, db, addEvent } = await database();
  addEvent('evt_pub', 'published', NOW + 86400);
  addEvent('evt_draft', 'draft', NOW + 86400);
  addEvent('evt_review', 'pending_review', NOW + 86400);
  addEvent('evt_canceled', 'canceled', NOW + 2 * 86400, 'published_at=1');
  const catalog = new LiveCatalog(db, () => NOW);
  // A canceled event is never listed; it is only reachable by its own page.
  assert.deepEqual(
    (await catalog.listDiscoverableEvents()).map((e) => e.id),
    ['evt_pub'],
  );
  assert.equal(await catalog.getEvent('evt_draft'), null);
  assert.equal((await catalog.getEvent('evt_canceled'))?.status, 'canceled');
  // Canceling an event also cancels its dates; the event must still be found (so it can say it was canceled).
  d1.sqlite.exec("UPDATE event_occurrences SET status = 'canceled' WHERE event_id = 'evt_canceled'");
  const canceled = await catalog.getEvent('evt_canceled');
  assert.equal(canceled?.status, 'canceled');
  assert.equal(canceled?.isClosed, true);
  assert.equal(canceled?.registrationOpen, false);
  d1.sqlite.exec("UPDATE organizations SET status = 'suspended'");
  assert.deepEqual(await catalog.listDiscoverableEvents(), []);
});

test('upcoming events come first, soonest first, then past events; a past event is Past · Closed', async () => {
  const { db, addEvent } = await database();
  addEvent('evt_later', 'published', NOW + 5 * 86400);
  addEvent('evt_past', 'published', NOW - 5 * 86400);
  addEvent('evt_soon', 'published', NOW + 86400);
  const list = await new LiveCatalog(db, () => NOW).listDiscoverableEvents();
  assert.deepEqual(
    list.map((e) => e.id),
    ['evt_soon', 'evt_later', 'evt_past'],
  );
  const past = list[2];
  assert.equal(past.isPast, true);
  assert.equal(past.isClosed, true);
  assert.equal(past.lifecycleStatus, 'past');
  assert.equal(past.registrationOpen, false);
});

test('a recurring event shows its next occurrence and falls back to the latest past one', async () => {
  const { d1, db, addEvent } = await database();
  addEvent('evt_series', 'published', NOW - 7 * 86400);
  d1.sqlite.exec(
    `INSERT INTO event_occurrences (id, event_id, starts_at) VALUES ('occ_b', 'evt_series', ${NOW + 3 * 86400}), ('occ_c', 'evt_series', ${NOW + 10 * 86400})`,
  );
  const catalog = new LiveCatalog(db, () => NOW);
  const event = await catalog.getEvent('evt_series');
  assert.equal(event?.occurrenceId, 'occ_b');
  assert.equal(event?.occurrences.length, 3);
  assert.equal(event?.isPast, false);
  const later = new LiveCatalog(db, () => NOW + 20 * 86400);
  assert.equal((await later.getEvent('evt_series'))?.occurrenceId, 'occ_c');
  assert.equal((await later.getEvent('evt_series'))?.isPast, true);
});

test('search finds title, venue and performer; metro and category filter', async () => {
  const { d1, db, addEvent } = await database();
  addEvent('evt_one', 'published', NOW + 86400);
  d1.sqlite.exec(
    "INSERT INTO event_performers (event_id, position, name) VALUES ('evt_one', 0, 'Grace Choir')",
  );
  const catalog = new LiveCatalog(db, () => NOW);
  assert.equal((await catalog.listDiscoverableEvents({ q: 'grace choir' })).length, 1);
  assert.equal((await catalog.listDiscoverableEvents({ q: 'sample hall' })).length, 1);
  assert.equal((await catalog.listDiscoverableEvents({ q: 'nothing like this' })).length, 0);
  assert.equal((await catalog.listDiscoverableEvents({ metro: 'phoenix-az' })).length, 1);
  assert.equal((await catalog.listDiscoverableEvents({ metro: 'dallas-tx' })).length, 0);
  assert.equal((await catalog.listDiscoverableEvents({ category: 'concert' })).length, 0);
  assert.deepEqual(
    (await catalog.listArtists()).map((a) => a.stageName),
    ['Grace Choir'],
  );
  assert.equal((await catalog.listDiscoverableVenues())[0].upcomingEventCount, 1);
});

test('localParts renders the event time zone, not the server zone', () => {
  assert.deepEqual(localParts(Date.UTC(2026, 10, 8, 2, 0) / 1000, 'America/Phoenix'), {
    date: '2026-11-07',
    time: '19:00',
  });
});

test('the verified catalog imports once, queues for review unless published, and never touches an existing key', async () => {
  const { db } = await database();
  const doc = JSON.parse(readFileSync(CATALOG, 'utf8')) as SeedCatalogDocument;
  const options = { now: NOW, referenceNow: new Date('2026-10-15T00:00:00Z') };
  const first = await importCatalog(db, doc, options);
  assert.equal(first.filter((r) => r.result === 'imported').length, doc.events.length);
  assert.ok(
    first.every((r) => r.status !== 'published'),
    'nothing publishes without the admin',
  );
  const catalog = new LiveCatalog(db, () => NOW);
  assert.deepEqual(await catalog.listDiscoverableEvents(), []);
  const again = await importCatalog(db, doc, { ...options, publishApproved: true });
  assert.ok(again.every((r) => r.result === 'unchanged'));
  const target = first.find((r) => r.status === 'pending_review');
  assert.ok(target, 'at least one record waits for review');
});

test('the admin can publish and hide a catalog listing; organizer events are not touched by it', async () => {
  const { d1, db, addEvent } = await database();
  const doc = JSON.parse(readFileSync(CATALOG, 'utf8')) as SeedCatalogDocument;
  await importCatalog(db, doc, { now: NOW, referenceNow: new Date('2026-10-15T00:00:00Z') });
  const row = d1.sqlite
    .prepare("SELECT id FROM events WHERE origin = 'catalog' AND status = 'pending_review' LIMIT 1")
    .get() as { id: string };
  assert.equal(await setCatalogStatus(db, row.id, 'published', NOW), true);
  const catalog = new LiveCatalog(db, () => NOW);
  const shown = await catalog.getEvent(row.id);
  assert.equal(shown?.listingType, 'external_discovery');
  assert.equal(shown?.externalOnly, true);
  assert.ok(shown?.externalUrl?.startsWith('https://'));
  assert.equal(await setCatalogStatus(db, row.id, 'hidden', NOW), true);
  assert.equal(await catalog.getEvent(row.id), null);
  addEvent('evt_org', 'published', NOW + 86400);
  assert.equal(await setCatalogStatus(db, 'evt_org', 'hidden', NOW), false);
});

// --- Truthful public lists ---------------------------------------------------------------------------------------

const DAY = 86400;

test('canceled events and events whose dates are all canceled never appear in any discovery list', async () => {
  const { d1, db, addEvent } = await database();
  addEvent('evt_ok', 'published', NOW + DAY);
  addEvent('evt_canceled', 'canceled', NOW + 2 * DAY, 'published_at=1');
  addEvent('evt_all_dates_canceled', 'published', NOW + 3 * DAY);
  d1.sqlite.exec(
    "UPDATE event_occurrences SET status = 'canceled' WHERE event_id = 'evt_all_dates_canceled'",
  );
  for (const id of ['evt_ok', 'evt_canceled', 'evt_all_dates_canceled'])
    d1.sqlite.exec(
      `INSERT INTO event_performers (event_id, position, name) VALUES ('${id}', 0, 'Grace Choir')`,
    );
  const catalog = new LiveCatalog(db, () => NOW);
  const ids = (list: Array<{ id: string }>) => list.map((e) => e.id);
  assert.deepEqual(ids(await catalog.listDiscoverableEvents()), ['evt_ok']);
  assert.deepEqual(ids(await catalog.listDiscoverableEvents({ q: 'event evt_' })), ['evt_ok']);
  assert.deepEqual(ids(await catalog.listDiscoverableEvents({ city: 'Phoenix' })), ['evt_ok']);
  assert.deepEqual(ids(await catalog.listDiscoverableEvents({ metro: 'phoenix-az' })), ['evt_ok']);
  const venues = await catalog.listDiscoverableVenues();
  assert.deepEqual(
    venues.map((v) => v.upcomingEventCount),
    [1],
  );
  assert.equal((await catalog.listArtists())[0].upcomingEventCount, 1);
  const phoenix = (await catalog.getMetroSummaries()).find((m) => m.slug === 'phoenix-az');
  assert.equal(phoenix?.upcomingEventCount, 1);
  // The detail page still finds the canceled event so it can say so.
  assert.equal((await catalog.getEvent('evt_canceled'))?.status, 'canceled');
});

test('venues, artists and metros count upcoming events only and report the next date', async () => {
  const { d1, db, addEvent } = await database();
  addEvent('evt_past_1', 'published', NOW - 10 * DAY);
  addEvent('evt_past_2', 'published', NOW - 20 * DAY);
  addEvent('evt_next', 'published', NOW + 4 * DAY);
  addEvent('evt_later', 'published', NOW + 9 * DAY);
  d1.sqlite.exec(`
    INSERT INTO venues (id, name, city, state, metro_slug, timezone) VALUES ('ven_old', 'Closed Hall', 'Phoenix', 'AZ', 'phoenix-az', 'America/Phoenix');
    UPDATE events SET venue_id = 'ven_old' WHERE id = 'evt_past_2';`);
  for (const id of ['evt_past_1', 'evt_past_2', 'evt_next', 'evt_later'])
    d1.sqlite.exec(
      `INSERT INTO event_performers (event_id, position, name) VALUES ('${id}', 0, 'Grace Choir')`,
    );
  d1.sqlite.exec(
    "INSERT INTO event_performers (event_id, position, name) VALUES ('evt_past_1', 1, 'Past Only Band')",
  );
  const catalog = new LiveCatalog(db, () => NOW);
  const venues = await catalog.listDiscoverableVenues();
  // The venue whose only event is over is not listed; the other counts 2, not 3.
  assert.deepEqual(
    venues.map((v) => [v.venueName, v.upcomingEventCount]),
    [['Sample Hall', 2]],
  );
  assert.equal(venues[0].nextEventStartsAt?.getTime(), (NOW + 4 * DAY) * 1000);
  assert.equal(venues[0].nextEventDateLocal, localParts(NOW + 4 * DAY, 'America/Phoenix').date);
  assert.deepEqual(
    venues[0].upcomingEvents.map((e) => e.id),
    ['evt_next', 'evt_later'],
  );
  const artists = await catalog.listArtists();
  assert.deepEqual(
    artists.map((a) => [a.stageName, a.upcomingEventCount]),
    [['Grace Choir', 2]],
  );
  assert.equal(artists[0].nextEventDateLocal, localParts(NOW + 4 * DAY, 'America/Phoenix').date);
  const phoenix = (await catalog.getMetroSummaries()).find((m) => m.slug === 'phoenix-az');
  assert.equal(phoenix?.publishedEventCount, 2);
  assert.equal(phoenix?.nextEventTitle, 'Event evt_next');
  // upcomingOnly drops the past events from a plain list too.
  assert.deepEqual(
    (await catalog.listDiscoverableEvents({ upcomingOnly: true })).map((e) => e.id),
    ['evt_next', 'evt_later'],
  );
});

test('an event with several dates matches a date window by any of its dates', async () => {
  const { d1, db, addEvent } = await database();
  addEvent('evt_series', 'published', NOW + 2 * DAY);
  d1.sqlite.exec(
    `INSERT INTO event_occurrences (id, event_id, starts_at) VALUES ('occ_far', 'evt_series', ${NOW + 30 * DAY})`,
  );
  const catalog = new LiveCatalog(db, () => NOW);
  const far = await catalog.listDiscoverableEvents({ dateFrom: new Date((NOW + 20 * DAY) * 1000) });
  assert.deepEqual(
    far.map((e) => [e.id, e.occurrenceId]),
    [['evt_series', 'occ_far']],
  );
});

test('held seats from expired pending registrations are not counted', async () => {
  const { d1, db, addEvent } = await database();
  addEvent('evt_seats', 'published', NOW + DAY);
  d1.sqlite.exec(`
    UPDATE event_occurrences SET seats_taken = 5 WHERE id = 'occ_evt_seats';
    INSERT INTO registrations (id, occurrence_id, name, email, email_hash, party_size, status, terms_version, expires_at)
      VALUES ('reg_expired', 'occ_evt_seats', 'A', 'a@example.org', 'h1', 2, 'pending', 'v1', ${NOW - 60}),
             ('reg_live', 'occ_evt_seats', 'B', 'b@example.org', 'h2', 1, 'pending', 'v1', ${NOW + 600});`);
  const catalog = new LiveCatalog(db, () => NOW);
  assert.equal((await catalog.getEvent('evt_seats'))?.seatsTaken, 3);
  assert.equal((await catalog.listDiscoverableEvents())[0].seatsTaken, 3);
});

// --- Categories ---------------------------------------------------------------------------------------------------

test('every event category has its own label and badge, and none falls through to the raw value', () => {
  const labels = new Set<string>();
  for (const { value, label } of EVENT_CATEGORIES) {
    assert.equal(categoryLabel(value), label, value);
    assert.notEqual(categoryBadge(value), value, value);
    assert.ok(categoryBadge(value).length > 0);
    labels.add(categoryLabel(value));
  }
  assert.equal(labels.size, EVENT_CATEGORIES.length, 'labels are distinct');
  assert.equal(categoryBadge('worship'), 'Worship Night');
  assert.equal(categoryBadge('bible'), 'Bible Study');
  assert.equal(categoryLabel('worship_event'), 'Worship night');
  assert.equal(normalizeCategory('Worship_Event'), 'worship');
  assert.equal(categoryLabel('open_mic'), 'Open mic');
  assert.equal(categoryBadge(null), 'Event');
});

test('the category filter accepts the older worship_event spelling', async () => {
  const { db, addEvent } = await database();
  addEvent('evt_w', 'published', NOW + DAY);
  const catalog = new LiveCatalog(db, () => NOW);
  assert.equal((await catalog.listDiscoverableEvents({ category: 'worship_event' })).length, 1);
  assert.equal((await catalog.listDiscoverableEvents({ category: 'youth' })).length, 0);
});

// --- Artist slugs -------------------------------------------------------------------------------------------------

test('artist slugs: ASCII names are unchanged, other scripts get a stable hash, different names never collide', () => {
  assert.equal(toArtistSlug('Grace Choir'), 'grace-choir');
  assert.equal(toArtistSlug('  Tom & Jerry '), 'tom-and-jerry');
  assert.equal(toArtistSlug('José Álvarez'), 'jose-alvarez');
  const names = [
    '힐송 워십',
    '한국 찬양',
    'فرقة التسبيح',
    'हिंदी भजन',
    'Hillsong 힐송',
    'Hillsong 찬양',
    '!!!',
    '???',
  ];
  const slugs = names.map(toArtistSlug);
  assert.equal(new Set(slugs).size, names.length, `unique: ${slugs.join(', ')}`);
  for (const slug of slugs) assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, slug);
  assert.ok(slugs[4].startsWith('hillsong-'));
  assert.ok(slugs[6].startsWith('artist-'));
  // Deterministic, and independent of case and spacing.
  assert.equal(toArtistSlug('힐송 워십'), toArtistSlug(' 힐송  워십 '));
  assert.equal(artistKey('  Grace   CHOIR '), 'grace choir');
});

test('artists with non-Latin names are listed with distinct slugs and found again by slug', async () => {
  const { d1, db, addEvent } = await database();
  addEvent('evt_a', 'published', NOW + DAY);
  addEvent('evt_b', 'published', NOW + 2 * DAY);
  addEvent('evt_c', 'published', NOW + 3 * DAY);
  addEvent('evt_old', 'published', NOW - 2 * DAY);
  d1.sqlite.exec(`
    INSERT INTO event_performers (event_id, position, name) VALUES
      ('evt_a', 0, '힐송 워십'), ('evt_b', 0, 'فرقة التسبيح'), ('evt_b', 1, 'हिंदी भजन'),
      ('evt_c', 0, '힐송 워십'), ('evt_c', 1, 'Grace Choir'), ('evt_old', 0, '찬양팀');`);
  const catalog = new LiveCatalog(db, () => NOW);
  const artists = await catalog.listArtists();
  assert.deepEqual(
    artists.map((a) => a.stageName).sort(),
    ['Grace Choir', 'हिंदी भजन', '힐송 워십', 'فرقة التسبيح'].sort(),
  );
  assert.equal(new Set(artists.map((a) => a.slug)).size, 4);
  assert.ok(artists.every((a) => a.slug.length > 0 && /^[a-z0-9-]+$/.test(a.slug)));
  const korean = artists.find((a) => a.stageName === '힐송 워십');
  assert.equal(korean?.upcomingEventCount, 2);
  const profile = await catalog.getArtistBySlug(korean!.slug);
  assert.deepEqual(
    profile?.upcomingEvents.map((e) => e.id),
    ['evt_a', 'evt_c'],
  );
  const arabic = artists.find((a) => a.stageName === 'فرقة التسبيح');
  assert.deepEqual(
    (await catalog.getArtistBySlug(arabic!.slug))?.upcomingEvents.map((e) => e.id),
    ['evt_b'],
  );
  assert.equal(await catalog.getArtistBySlug('no-such-artist'), null);
  // An artist whose only event is over has no upcoming page.
  assert.equal(await catalog.getArtistBySlug(toArtistSlug('찬양팀')), null);
});

test('two ASCII names that reduce to the same slug are kept apart', async () => {
  const { d1, db, addEvent } = await database();
  addEvent('evt_x', 'published', NOW + DAY);
  d1.sqlite.exec(
    "INSERT INTO event_performers (event_id, position, name) VALUES ('evt_x', 0, 'A.B'), ('evt_x', 1, 'AB')",
  );
  const catalog = new LiveCatalog(db, () => NOW);
  const artists = await catalog.listArtists();
  assert.equal(artists.length, 2);
  assert.equal(new Set(artists.map((a) => a.slug)).size, 2);
  for (const a of artists) assert.equal((await catalog.getArtistBySlug(a.slug))?.stageName, a.stageName);
});

// --- Metro fallback -----------------------------------------------------------------------------------------------

test('regionForPlace: metro cities get their metro, other cities get no metro and a City, ST label', () => {
  assert.deepEqual(regionForPlace({ city: 'Glendale', state: 'AZ' }), {
    metro: 'phoenix-az',
    regionLabel: 'Phoenix, AZ',
  });
  assert.deepEqual(regionForPlace({ city: 'Tucson', state: 'az' }), {
    metro: null,
    regionLabel: 'Tucson, AZ',
  });
  assert.deepEqual(regionForPlace({ city: 'Boise', state: 'ID', metroSlug: 'not-a-metro' }), {
    metro: null,
    regionLabel: 'Boise, ID',
  });
  assert.equal(
    regionForPlace({ city: 'Somewhere', state: 'AZ', metroSlug: 'phoenix-az' }).metro,
    'phoenix-az',
  );
  assert.deepEqual(regionForPlace({ city: '', state: 'TX' }), { metro: null, regionLabel: 'TX' });
});

test('events and venues outside the nine metros have metro null and a regionLabel', async () => {
  const { d1, db, addEvent } = await database();
  d1.sqlite.exec(
    "INSERT INTO venues (id, name, city, state, timezone) VALUES ('ven_tuc', 'Tucson Chapel', 'Tucson', 'AZ', 'America/Phoenix')",
  );
  addEvent('evt_tuc', 'published', NOW + DAY);
  d1.sqlite.exec("UPDATE events SET venue_id = 'ven_tuc' WHERE id = 'evt_tuc'");
  addEvent('evt_phx', 'published', NOW + 2 * DAY);
  const catalog = new LiveCatalog(db, () => NOW);
  const [tucson, phoenix] = await catalog.listDiscoverableEvents();
  assert.equal(tucson.metro, null);
  assert.equal(tucson.metroSlug, null);
  assert.equal(tucson.regionLabel, 'Tucson, AZ');
  assert.equal(phoenix.metro, 'phoenix-az');
  const venues = await catalog.listDiscoverableVenues();
  assert.deepEqual(venues.map((v) => [v.venueName, v.metro, v.regionLabel]).sort(), [
    ['Sample Hall', 'phoenix-az', 'Phoenix, AZ'],
    ['Tucson Chapel', null, 'Tucson, AZ'],
  ]);
});
