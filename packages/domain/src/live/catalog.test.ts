import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSqliteD1 } from '@gamo/db/testing';
import { LiveCatalog, localParts } from './catalog.ts';
import { importCatalog, setCatalogStatus } from './catalog-import.ts';
import type { SeedCatalogDocument } from '../services/live-external-discovery.ts';

const MIGRATION = new URL('../../../db/live/migrations/0001_live_core.sql', import.meta.url);
const CATALOG = new URL('../../../../data/gamo_live_verified_events_2026-10-15.json', import.meta.url);
const NOW = Date.UTC(2026, 9, 16) / 1000;

async function database() {
  const d1 = createSqliteD1();
  await d1.exec(readFileSync(MIGRATION, 'utf8'));
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
  addEvent('evt_canceled', 'canceled', NOW + 2 * 86400);
  const catalog = new LiveCatalog(db, () => NOW);
  assert.deepEqual(
    (await catalog.listDiscoverableEvents()).map((e) => e.id),
    ['evt_pub', 'evt_canceled'],
  );
  assert.equal(await catalog.getEvent('evt_draft'), null);
  assert.equal((await catalog.getEvent('evt_canceled'))?.status, 'canceled');
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
