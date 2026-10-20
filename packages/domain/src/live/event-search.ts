/**
 * The public events list: what the query string may ask for, how it becomes read-model filters, and how the
 * result is paged and described. Pure functions, so the page only parses, loads and renders.
 */
import { GAMO_LIVE_METROS, resolveMetroBySlug } from '../services/live-external-discovery.ts';
import { normalizeCategory, type LiveEventFilters } from './catalog.ts';
import { utcOffsetMinutes } from './seo.ts';

export const EVENT_DATE_PRESETS = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
] as const;
export type EventDatePreset = (typeof EVENT_DATE_PRESETS)[number]['value'];

/** Events shown per "page"; "Show more" adds this many. */
export const EVENTS_PAGE_SIZE = 24;
/** The most events the list reads at once (upcoming only). */
export const EVENTS_READ_LIMIT = 2000;
const MAX_PAGE = Math.ceil(EVENTS_READ_LIMIT / EVENTS_PAGE_SIZE);
const MAX_QUERY_LENGTH = 100;

export interface EventSearch {
  q: string;
  /** A metro slug from GAMO_LIVE_METROS, or '' for all U.S. cities. */
  metro: string;
  /** A category value from EVENT_CATEGORIES, or '' for all. */
  category: string;
  when: EventDatePreset;
  /** 1-based; page N shows the first N * EVENTS_PAGE_SIZE events. */
  page: number;
}

export const EMPTY_EVENT_SEARCH: EventSearch = { q: '', metro: '', category: '', when: 'any', page: 1 };

/** Reads `?q=`, `?metro=`, `?category=`, `?date=` and `?page=`; anything not on an allow-list is dropped. */
export function parseEventSearch(params: URLSearchParams): EventSearch {
  const q = (params.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
  const metro = resolveMetroBySlug(params.get('metro'))?.slug ?? '';
  const category = normalizeCategory(params.get('category')) ?? '';
  const dateParam = (params.get('date') ?? '').trim().toLowerCase();
  const when = EVENT_DATE_PRESETS.find((p) => p.value === dateParam)?.value ?? 'any';
  const pageParam = Number.parseInt(params.get('page') ?? '', 10);
  const page = Number.isFinite(pageParam) ? Math.min(Math.max(pageParam, 1), MAX_PAGE) : 1;
  return { q, metro, category, when, page };
}

/** True when the search narrows the list (the page number does not count). */
export function hasEventFilters(search: EventSearch): boolean {
  return Boolean(search.q || search.metro || search.category || search.when !== 'any');
}

/** The URL for a search: only non-default values are written. */
export function eventSearchHref(path: string, search: Partial<EventSearch>): string {
  const params = new URLSearchParams();
  if (search.q) params.set('q', search.q);
  if (search.metro) params.set('metro', search.metro);
  if (search.category) params.set('category', search.category);
  if (search.when && search.when !== 'any') params.set('date', search.when);
  if (search.page && search.page > 1) params.set('page', String(search.page));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

const addDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** Midnight at the start of a local `YYYY-MM-DD` in an IANA zone, as an instant. */
function startOfLocalDay(date: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - utcOffsetMinutes(new Date(guess), timeZone) * 60000;
  return new Date(guess - utcOffsetMinutes(new Date(first), timeZone) * 60000);
}

/**
 * "Today" is the date it still is somewhere in the contiguous U.S. (Pacific time), and a window covers that
 * date from its first midnight (Eastern) to its last (Pacific), so an event on that local date is never missed.
 */
const TODAY_ZONE = 'America/Los_Angeles';
const WINDOW_START_ZONE = 'America/New_York';

/** The first and last instants a preset covers, or null for "any time". */
export function eventDateWindow(when: EventDatePreset, now: Date): { from: Date; to: Date } | null {
  if (when === 'any') return null;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: TODAY_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m, d] = today.split('-').map(Number);
  let lastDay = today;
  if (when === 'week') lastDay = addDays(today, (7 - new Date(Date.UTC(y, m - 1, d)).getUTCDay()) % 7);
  if (when === 'month') lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return {
    from: startOfLocalDay(today, WINDOW_START_ZONE),
    to: new Date(startOfLocalDay(addDays(lastDay, 1), TODAY_ZONE).getTime() - 1000),
  };
}

/** Read-model filters for a search: upcoming events only, soonest first. */
export function eventSearchFilters(search: EventSearch, now: Date = new Date()): LiveEventFilters {
  const window = eventDateWindow(search.when, now);
  return {
    upcomingOnly: true,
    limit: EVENTS_READ_LIMIT,
    ...(search.q ? { q: search.q } : {}),
    ...(search.metro ? { metro: search.metro } : {}),
    ...(search.category ? { category: search.category } : {}),
    ...(window ? { dateFrom: window.from, dateTo: window.to } : {}),
  };
}

/** The events to show for `page`, split into runs of EVENTS_PAGE_SIZE so each "Show more" starts a new run. */
export function chunkEvents<T>(
  events: readonly T[],
  page: number,
): { chunks: T[][]; hasMore: boolean; nextPage: number } {
  const shown = events.slice(0, Math.max(1, page) * EVENTS_PAGE_SIZE);
  const chunks: T[][] = [];
  for (let i = 0; i < shown.length; i += EVENTS_PAGE_SIZE) chunks.push(shown.slice(i, i + EVENTS_PAGE_SIZE));
  return { chunks, hasMore: shown.length < events.length, nextPage: Math.max(1, page) + 1 };
}

/** "1 upcoming event" / "12 upcoming events", with the city when one is chosen; "2,000+" at the read limit. */
export function eventCountSummary(count: number, metroSlug = ''): string {
  const metro = GAMO_LIVE_METROS.find((m) => m.slug === metroSlug);
  const number = count >= EVENTS_READ_LIMIT ? `${EVENTS_READ_LIMIT.toLocaleString('en-US')}+` : String(count);
  const noun = count === 1 ? 'upcoming event' : 'upcoming events';
  return `${number} ${noun}${metro ? ` in ${metro.displayLabel}` : ' across the U.S.'}`;
}
