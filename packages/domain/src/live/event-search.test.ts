import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENTS_PAGE_SIZE,
  chunkEvents,
  eventCountSummary,
  eventDateWindow,
  eventSearchFilters,
  eventSearchHref,
  hasEventFilters,
  parseEventSearch,
} from './event-search.ts';

const parse = (query: string) => parseEventSearch(new URLSearchParams(query));

test('the query string is allow-listed and clamped', () => {
  assert.deepEqual(parse(''), { q: '', metro: '', category: '', when: 'any', page: 1 });
  assert.deepEqual(
    parse('q=%20%20grace%20%20church&metro=Phoenix-AZ&category=worship_event&date=week&page=3'),
    {
      q: 'grace church',
      metro: 'phoenix-az',
      category: 'worship',
      when: 'week',
      page: 3,
    },
  );
  const bad = parse('metro=all&category=nope&date=weekend&page=-4');
  assert.equal(bad.metro, '');
  assert.equal(bad.category, '');
  assert.equal(bad.when, 'any');
  assert.equal(bad.page, 1);
  assert.equal(parse('page=999999').page, 84);
  assert.equal(parse('page=abc').page, 1);
  assert.equal(parse(`q=${'a'.repeat(500)}`).q.length, 100);
  assert.equal(hasEventFilters(parse('page=2')), false);
  assert.equal(hasEventFilters(parse('date=today')), true);
});

test('hrefs write only non-default values', () => {
  assert.equal(eventSearchHref('/events', {}), '/events');
  assert.equal(
    eventSearchHref('/events', { q: 'a b', metro: 'phoenix-az', when: 'month', page: 2 }),
    '/events?q=a+b&metro=phoenix-az&date=month&page=2',
  );
});

test('filters always ask for upcoming events only', () => {
  const now = new Date('2026-10-19T18:00:00Z');
  const none = eventSearchFilters(parse(''), now);
  assert.equal(none.upcomingOnly, true);
  assert.equal(none.dateFrom, undefined);
  const some = eventSearchFilters(parse('q=x&metro=atlanta-ga&category=youth&date=today'), now);
  assert.equal(some.q, 'x');
  assert.equal(some.metro, 'atlanta-ga');
  assert.equal(some.category, 'youth');
  assert.ok(some.dateFrom && some.dateTo);
});

test('date windows cover the local date across U.S. zones', () => {
  // Mon 2026-10-19 11:00 Pacific (EDT is UTC-4, PDT is UTC-7).
  const now = new Date('2026-10-19T18:00:00Z');
  const today = eventDateWindow('today', now)!;
  assert.equal(today.from.toISOString(), '2026-10-19T04:00:00.000Z');
  assert.equal(today.to.toISOString(), '2026-10-20T06:59:59.000Z');
  // The week ends Sunday 2026-10-25 (Pacific).
  assert.equal(eventDateWindow('week', now)!.to.toISOString(), '2026-10-26T06:59:59.000Z');
  // The month ends 2026-10-31; PDT ends 2026-11-01, so midnight Nov 1 is still UTC-7.
  assert.equal(eventDateWindow('month', now)!.to.toISOString(), '2026-11-01T06:59:59.000Z');
  assert.equal(eventDateWindow('any', now), null);
});

test('on a Sunday "this week" is only today; late evening Pacific is still today', () => {
  const sunday = new Date('2026-10-25T20:00:00Z');
  assert.equal(eventDateWindow('week', sunday)!.to.toISOString(), '2026-10-26T06:59:59.000Z');
  // 2026-10-20T03:30Z is still Monday 20:30 Pacific.
  const late = eventDateWindow('today', new Date('2026-10-20T03:30:00Z'))!;
  assert.equal(late.from.toISOString(), '2026-10-19T04:00:00.000Z');
});

test('paging adds runs of 24 and reports whether more remain', () => {
  const events = Array.from({ length: 50 }, (_, i) => i);
  const first = chunkEvents(events, 1);
  assert.equal(first.chunks.length, 1);
  assert.equal(first.chunks[0].length, EVENTS_PAGE_SIZE);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextPage, 2);
  const third = chunkEvents(events, 3);
  assert.deepEqual(
    third.chunks.map((c) => c.length),
    [24, 24, 2],
  );
  assert.equal(third.hasMore, false);
  assert.deepEqual(chunkEvents([], 1).chunks, []);
});

test('the count line is plain and exact', () => {
  assert.equal(eventCountSummary(0), '0 upcoming events across the U.S.');
  assert.equal(eventCountSummary(1), '1 upcoming event across the U.S.');
  assert.equal(eventCountSummary(12, 'phoenix-az'), '12 upcoming events in Phoenix, AZ');
  assert.equal(eventCountSummary(2000), '2,000+ upcoming events across the U.S.');
});
