import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createSqliteD1 } from '@gamo/db/testing';
import {
  adminEventHref,
  adminScheduleView,
  listAdminSchedule,
  type AdminScheduledDate,
} from './admin-schedule.ts';

const MIGRATIONS = new URL('../../../db/live/migrations/', import.meta.url);
const NOW = 1_900_000_000; // 2030-03-17 in UTC
const DAY = 86_400;

async function database() {
  const d1 = createSqliteD1();
  for (const name of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await d1.exec(readFileSync(new URL(name, MIGRATIONS), 'utf8'));
  return d1;
}

function seed(d1: Awaited<ReturnType<typeof database>>) {
  const sql = (s: string) => d1.sqlite.exec(s);
  sql(`INSERT INTO organizations (id, name, slug, kind) VALUES ('org_a', 'Grace Church', 'grace', 'church')`);
  sql(
    `INSERT INTO venues (id, name, city, state, timezone) VALUES ('ven_1', 'Hall', 'Phoenix', 'AZ', 'America/Phoenix')`,
  );
  const event = (
    id: string,
    origin: string,
    status: string,
    startsInDays: number,
    occStatus = 'scheduled',
  ) => {
    sql(
      `INSERT INTO events (id, organization_id, origin, slug, title, category, description, venue_id, timezone, admission, status)
       VALUES ('${id}', ${origin === 'catalog' ? 'NULL' : "'org_a'"}, '${origin}', '${id}', 'Title ${id}', 'concert', 'd', 'ven_1', 'America/Phoenix', 'free_open', '${status}')`,
    );
    sql(
      `INSERT INTO event_occurrences (id, event_id, starts_at, status) VALUES ('occ_${id}', '${id}', ${NOW + startsInDays * DAY}, '${occStatus}')`,
    );
  };
  event('e_pub', 'organizer', 'published', 10);
  event('e_pend', 'organizer', 'pending_review', 3);
  event('e_hid', 'organizer', 'hidden', 12);
  event('e_draft', 'organizer', 'draft', 5);
  event('e_rej', 'organizer', 'rejected', 5);
  event('e_chg', 'organizer', 'changes_requested', 5);
  event('e_old', 'organizer', 'published', -200);
  event('e_canc', 'organizer', 'published', 20, 'canceled');
  event('c_pub', 'catalog', 'published', 8);
  event('c_pend', 'catalog', 'pending_review', 9);
  event('c_fail', 'catalog', 'rejected', 9);
}

test('the overview reads published, waiting and hidden dates of both kinds; drafts, rejected and old ones stay out', async () => {
  const d1 = await database();
  seed(d1);
  const rows = await listAdminSchedule(d1 as never, { scope: 'all', now: NOW });
  const ids = rows.map((r) => r.eventId);
  assert.deepEqual(ids, ['e_pend', 'c_pub', 'c_pend', 'e_pub', 'e_hid', 'e_canc']);
  const pend = rows.find((r) => r.eventId === 'e_pend');
  assert.equal(pend?.organizationName, 'Grace Church');
  assert.equal(pend?.source, 'organizer');
  assert.equal(rows.find((r) => r.eventId === 'c_pub')?.source, 'catalog');
  assert.equal(rows.find((r) => r.eventId === 'c_pub')?.organizationName, null);
  assert.equal(rows.find((r) => r.eventId === 'e_canc')?.canceled, true);
});

test('the catalog scope is the catalog only and includes listings that failed the editorial rules', async () => {
  const d1 = await database();
  seed(d1);
  const rows = await listAdminSchedule(d1 as never, { scope: 'catalog', now: NOW });
  assert.deepEqual(
    rows.map((r) => r.eventId),
    ['c_pub', 'c_fail', 'c_pend'],
    'by date, then title',
  );
});

const date = (over: Partial<AdminScheduledDate>): AdminScheduledDate => ({
  id: 'occ',
  eventId: 'evt',
  title: 'Title',
  status: 'published',
  source: 'organizer',
  organizationName: 'Grace Church',
  timeZone: 'America/Phoenix',
  startsAt: NOW + 5 * DAY,
  endsAt: null,
  canceled: false,
  ...over,
});

test('links go to where Gamo decides', () => {
  assert.equal(
    adminEventHref({ source: 'catalog', status: 'published', eventId: 'c1' }),
    '/catalog#listing-c1',
  );
  assert.equal(
    adminEventHref({ source: 'organizer', status: 'pending_review', eventId: 'e1' }),
    '/events#event-e1',
  );
  assert.equal(
    adminEventHref({ source: 'organizer', status: 'published', eventId: 'e1' }),
    '/events?view=published#published-e1',
  );
  assert.equal(
    adminEventHref({ source: 'organizer', status: 'hidden', eventId: 'e1' }),
    '/events?view=published#published-e1',
  );
});

test('the view lists the chosen day and names what is waiting and starting within a week', () => {
  const dates = [
    date({
      id: 'a',
      eventId: 'e_soon',
      status: 'pending_review',
      startsAt: NOW + 2 * DAY,
      title: 'Soon event',
    }),
    date({
      id: 'b',
      eventId: 'e_soon',
      status: 'pending_review',
      startsAt: NOW + 3 * DAY,
      title: 'Soon event',
    }),
    date({ id: 'c', eventId: 'e_later', status: 'pending_review', startsAt: NOW + 20 * DAY }),
    date({ id: 'd', eventId: 'e_pub', status: 'published', startsAt: NOW + 2 * DAY }),
    date({
      id: 'e',
      eventId: 'c_soon',
      source: 'catalog',
      organizationName: null,
      status: 'pending_review',
      startsAt: NOW + 4 * DAY,
    }),
    date({ id: 'f', eventId: 'e_canc', status: 'pending_review', startsAt: NOW + 1 * DAY, canceled: true }),
  ];
  const view = adminScheduleView({ dates, now: NOW, params: new URLSearchParams(), anchor: '#schedule' });
  assert.deepEqual(
    view.soon.map((s) => s.eventId),
    ['e_soon', 'c_soon'],
    'one row per event, soonest first; later, published and canceled ones are not "soon"',
  );
  assert.equal(view.total, 6);
  assert.equal(view.upcoming, 5, 'the canceled date is not upcoming');
  const chosen = new URLSearchParams({ date: view.chosenDate ?? '' });
  assert.ok(view.chosenDate, 'opens on the next upcoming day');
  const same = adminScheduleView({ dates, now: NOW, params: chosen });
  assert.deepEqual(
    same.items.map((i) => i.id),
    view.items.map((i) => i.id),
  );
  const soonItem = view.items.find((i) => i.soon);
  assert.ok(soonItem === undefined || soonItem.statusLabel === 'Waiting for review');
});

test('an empty calendar is honest: no dates, nothing soon, nothing chosen', () => {
  const view = adminScheduleView({ dates: [], now: NOW, params: new URLSearchParams() });
  assert.equal(view.total, 0);
  assert.equal(view.upcoming, 0);
  assert.deepEqual(view.soon, []);
  assert.deepEqual(view.items, []);
});

test('a chosen day shows its items with source, organization and status', () => {
  const when = NOW + 5 * DAY;
  const dates = [
    date({ id: 'x', eventId: 'e1', startsAt: when, title: 'One' }),
    date({
      id: 'y',
      eventId: 'c1',
      source: 'catalog',
      organizationName: null,
      status: 'hidden',
      startsAt: when + 3600,
      title: 'Two',
    }),
  ];
  const day = new Date(when * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
  const view = adminScheduleView({ dates, now: NOW, params: new URLSearchParams({ date: day }) });
  assert.equal(view.chosenDate, day);
  assert.deepEqual(
    view.items.map((i) => [i.title, i.source, i.statusLabel, i.organizationName]),
    [
      ['One', 'organizer', 'Published', 'Grace Church'],
      ['Two', 'catalog', 'Hidden', null],
    ],
  );
});

test('verification meetings are on the overview calendar and link to the organization', async () => {
  const d1 = await database();
  seed(d1);
  d1.sqlite.exec(`
    INSERT INTO verification_meetings (id, subject_type, subject_id, starts_at, timezone, format, location, status)
      VALUES ('vmt_1', 'organization', 'org_a', ${NOW + 2 * DAY}, 'America/Phoenix', 'video', 'https://meet.example.org/x', 'scheduled'),
             ('vmt_2', 'organization', 'org_a', ${NOW + 4 * DAY}, 'America/Phoenix', 'video', 'https://meet.example.org/y', 'canceled');
  `);
  const all = await listAdminSchedule(d1 as never, { scope: 'all', now: NOW });
  const meeting = all.filter((r) => r.source === 'meeting');
  assert.deepEqual(
    meeting.map((m) => [m.id, m.title, m.status]),
    [['vmt_1', 'Verification meeting: Grace Church', 'meeting_scheduled']],
    'canceled meetings stay off',
  );
  assert.deepEqual(
    all.map((r) => r.startsAt),
    [...all.map((r) => r.startsAt)].sort((a, b) => a - b),
    'still in date order',
  );
  assert.equal(adminEventHref(meeting[0]), '/organizations/org_a#verification');
  const onlyCatalog = await listAdminSchedule(d1 as never, { scope: 'catalog', now: NOW });
  assert.equal(
    onlyCatalog.some((r) => r.source === 'meeting'),
    false,
  );
  const day = new Date((NOW + 2 * DAY) * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
  const view = adminScheduleView({ dates: all, now: NOW, params: new URLSearchParams({ date: day }) });
  const item = view.items.find((i) => i.id === 'vmt_1');
  assert.equal(item?.statusLabel, 'Verification meeting');
  assert.equal(item?.href, '/organizations/org_a#verification');
});
